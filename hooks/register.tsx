import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'week-usage-bars', key: 'limits' } as const, [] as Limit[])

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: '$',
}

// Gaps cut across the bar in the band's grey: 5h is split into hours (4 lines), 7d into days (6 lines).
const TICKS: Record<string, number> = { five_hour: 4, seven_day: 6 }

// Window lengths, for the "now" marker (how far through the window the clock is).
const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 60 * 60 * 1000,
  seven_day: 7 * 24 * 60 * 60 * 1000,
}

const NBSP = ' '

// Bar size in CSS pixels.
const TICK_MS = 60_000

// Only the 7d bar is shown: 7 days across the bar, each day cut into twelve 2-hour steps.
const BAR_W = 504
const widthFor = (_row: Limit) => BAR_W
// The end lines sit this far outside the bar, so the canvas is this much wider on each side.
const OUT = 1
const BAR_H = 16
// Extra canvas above and below the bar, so the day lines can stand taller than it.
// Usage bar thickness, drawn from y=2 inside the bar's box.
const BAR_T = 13
const EXTRA = 4
const SVG_H = BAR_H + EXTRA * 2

const COLORS = { green: '#257de0', yellow: '#d9a400', red: '#d03a2f' }
// Darker shades of the same colours, for the "now" marker.
const DARK = { green: '#134f9a', yellow: '#876600', red: '#8c1f16' }
const colorNameFor = (used: number) => (used >= 95 ? 'red' : used >= 90 ? 'yellow' : 'green')

const markerFraction = (row: Limit, now: number) => {
  const resetsAt = row.resetsAt ? Date.parse(row.resetsAt) : NaN
  const windowMs = WINDOW_MS[row.kind]

  if (Number.isNaN(resetsAt) || !windowMs) return -1

  return Math.min(1, Math.max(0, (windowMs - (resetsAt - now)) / windowMs))
}

// The bar as an SVG: solid fill, the elapsed-time tint, and the dividers.
const barSvg = (row: Limit, now: number) => {
  const used = Math.max(0, Math.min(100, row.percentUsed))
  const W = widthFor(row)
  const fillW = (used / 100) * W
  const fill = COLORS[colorNameFor(used)]
  const dark = DARK[colorNameFor(used)]
  const marker = markerFraction(row, now)
  const markerX = Math.min(W - 1, Math.max(1, marker * W))
  const count = TICKS[row.kind] ?? 0
  const ticks = Array.from({ length: count }, (_, i) =>
    `<line x1="${Math.round(((i + 1) * W) / (count + 1)) + 0.5}" y1="0" x2="${Math.round(((i + 1) * W) / (count + 1)) + 0.5}" y2="${SVG_H}" stroke="${fill}" stroke-width="1"/>`,
  ).join('')
  // The same full-height line at the very start and end of the bar.
  const ends = [-0.5, W + 0.5]
    .map(x => `<line x1="${x}" y1="0" x2="${x}" y2="${SVG_H}" stroke="${fill}" stroke-width="1"/>`)
    .join('')
  // 2-hour scale inside each day (the day edges themselves are the gaps above).
  const minor =
    row.kind === 'seven_day'
      ? Array.from({ length: 7 * 12 }, (_, i) => i)
          .filter(i => i % 12 !== 0)
          .map(i => `<line x1="${Math.round((i * W) / 84) + 0.5}" y1="2" x2="${Math.round((i * W) / 84) + 0.5}" y2="${2 + BAR_T}" stroke="${dark}" stroke-width="1" stroke-dasharray="1 1"/>`)
          .join('')
      : ''

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W + OUT * 2}" height="${SVG_H}" viewBox="0 0 ${W + OUT * 2} ${SVG_H}">`,
    `<g transform="translate(${OUT},0)">`,
    `<g transform="translate(0,${EXTRA})">`,
    `<rect x="0" y="2" width="${W}" height="${BAR_T}" fill="#ffffff"/>`,
    marker >= 0 ? `<rect x="0" y="2" width="${Math.round(markerX)}" height="${BAR_T}" fill="${fill}" fill-opacity="0.3"/>` : '',
    `<rect x="0" y="2" width="${fillW.toFixed(1)}" height="${BAR_T}" fill="${fill}"/>`,
    minor,
    marker >= 0
      ? `<circle cx="${Math.min(W - 3, Math.max(3, markerX)).toFixed(1)}" cy="${2 + BAR_T / 2}" r="3" fill="${markerX <= fillW ? '#ffffff' : dark}"><animate attributeName="opacity" values="1;0.15;1" dur="1.6s" repeatCount="indefinite"/></circle>`
      : '',
    '</g>',
    ticks,
    ends,
    '</g>',
    '</svg>',
  ].join('')
}

// "リセットまで 2日05時間": whole days, then hours padded to two digits.
const resetIn = (row: Limit, now: number) => {
  const resetsAt = row.resetsAt ? Date.parse(row.resetsAt) : NaN

  if (Number.isNaN(resetsAt)) return ''

  const hours = Math.max(0, Math.floor((resetsAt - now) / 3_600_000))

  return `リセットまで${NBSP}${Math.floor(hours / 24)}日${String(hours % 24).padStart(2, '0')}時間`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    if (usage.rateLimits.length > 0) await update($, limits, () => usage.rateLimits)
    $.clock.every(TICK_MS, async () => {
      // Keep the last numbers when a refresh comes back empty, so the bar stays up while idle.
      const fresh = await $.session.usage()
      if (fresh.rateLimits.length > 0) await update($, limits, () => fresh.rateLimits)
      $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) await update($, limits, () => e.rateLimits)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    const all = await read($, limits)
    const week = all.find(row => row.kind === 'seven_day')
    const five = all.find(row => row.kind === 'five_hour')

    if (e.props.hasSurvey || !week) {
      return theirs
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const colorOf = (row: Limit) => COLORS[colorNameFor(row.percentUsed)]

    const mine = (
      <Box key="week-usage-bars" flexDirection="row" alignItems="center">
        <Svg
          source={barSvg(week, now)}
          alt={`7d usage ${week.percentUsed.toFixed(1)}%`}
          width={widthFor(week) + OUT * 2}
          height={SVG_H}
          isInteractive
        />
        <Text color={colorOf(week)} size="footnote">
          {NBSP.repeat(4)}7d : {week.percentUsed.toFixed(1)}%
        </Text>
        {five ? (
          <Text size="footnote">
            {NBSP.repeat(4)}/{NBSP.repeat(4)}
            <Text color={colorOf(five)}>5h : {five.percentUsed.toFixed(1)}%</Text>
          </Text>
        ) : null}
      </Box>
    )

    return theirs ? <Box flexDirection="column">{mine}{theirs}</Box> : mine
  })
}
