# week-usage-bars

A Claude Code mod that shows your **7-day plan usage** as one long bar above the prompt, with the **5-hour usage** next to it as a number.

![preview](assets/preview.svg)

## How to read it

- **The bar** is the 7-day window. Left edge is when the window started, right edge is when it resets.
- **Solid colour** is how much of the limit you have used. Blue, then yellow from 90%, red from 95%.
- **Light tint** behind it is how much of the window's time has passed, so you can see whether your usage is ahead of or behind an even pace.
- **The blinking dot** marks the current time inside the window. It turns white while it sits over the solid colour, and dark otherwise, so it stays visible. A soft white ripple spreads out from it in time with the blink (it shows over the solid colour, not over the white background).
- **Solid vertical lines** are the day boundaries (7 days). **Dotted lines** inside each day are 2-hour steps.
- **`7d : 38.0%  /  5h : 39.7%`** on the right are the exact figures (one decimal place). The 5-hour figure has no bar.

Usage is read from what Claude Code already knows about your plan, so the mod makes no network requests and uses no tokens. Figures appear after the first response of a session, on plans that report usage (Pro and Max). The numbers refresh about once a minute.

## Install

In a terminal session of Claude Code:

```
/plugin install week-usage-bars --marketplace torchright/week-usage-bars
```

or from a shell:

```bash
claude plugin install week-usage-bars --marketplace torchright/week-usage-bars
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `torchright/week-usage-bars`, then **Add plugin**.

Start a new session after installing. The bar is drawn as an image, so it needs the desktop app (or another surface that can draw SVG).

## Change it

Everything is in `hooks/register.tsx`. The constants near the top set the bar width, the colour thresholds and the colours. After editing, run:

```bash
claude plugin validate .
```

## Notes

Written with Claude Code. Early-access mod API: it may need changes as Claude Code updates.
