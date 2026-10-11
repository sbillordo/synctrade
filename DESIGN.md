---
name: SyncTrade
description: A personal pullback screener where every setup shows its four conditions, measured against their thresholds, at a glance.
colors:
  ground: "#0B0E11"
  surface: "#12161B"
  surface-raised: "#191E25"
  surface-high: "#212833"
  hairline: "#222932"
  hairline-strong: "#2E3640"
  ink: "#E8EAED"
  ink-secondary: "#A0A8B2"
  ink-tertiary: "#7D8691"
  signal-up: "#22C98A"
  signal-up-soft: "rgba(34, 201, 138, .14)"
  signal-down: "#F25C66"
  signal-down-soft: "rgba(242, 92, 102, .14)"
  accent: "#7AA2FF"
  accent-ink: "#07112A"
  accent-soft: "rgba(122, 162, 255, .14)"
  warn: "#F2B84B"
  light-ground: "#F6F7F9"
  light-surface: "#FFFFFF"
  light-surface-raised: "#F0F2F5"
  light-surface-high: "#E6E9EE"
  light-hairline: "#E3E6EB"
  light-hairline-strong: "#D3D8DF"
  light-ink: "#0F1318"
  light-ink-secondary: "#4F5865"
  light-ink-tertiary: "#69727E"
  light-signal-up: "#0B9466"
  light-signal-down: "#D63445"
  light-accent: "#2A55E5"
  light-accent-ink: "#FFFFFF"
  light-warn: "#B7791F"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1, \"cv11\" 1"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1, \"cv11\" 1"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1, \"cv11\" 1"
  section:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\" 1, \"cv11\" 1"
  body-small:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  tag: "6px"
  sm: "8px"
  control-sm: "10px"
  md: "12px"
  row: "14px"
  lg: "18px"
  sheet: "22px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  card: "14px"
  gutter: "16px"
  section: "22px"
  gutter-desktop: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-high}"
  button-small:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control-sm}"
    padding: "0 12px"
    height: "36px"
  icon-button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "38px"
  segmented:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  setup-row-mobile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "14px"
  setup-row-desktop:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "9px 12px"
  setup-row-desktop-selected:
    backgroundColor: "{colors.accent-soft}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  gauge-track:
    backgroundColor: "{colors.surface-high}"
    rounded: "2px"
    height: "4px"
  tf-tag:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.tag}"
    padding: "2px 6px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
---

# Design System: SyncTrade

## Overview

**Creative North Star: "The Readout"**

SyncTrade is the category standard for a dark trading app, executed straight at the craft bar of TradingView mobile, Linear and Revolut / Trade Republic. It is an instrument panel, not a dashboard: a blue-black ground, one raised surface, hairlines for structure, and colour that only ever means something. Green is met or target, red is missing or stop, amber is the POC, and a single blue accent marks interaction and selection. Nothing is decorative; every coloured pixel answers "does this setup qualify?"

Density is high but calm. Inter with tabular numerals carries every figure so columns of prices, percentages and scores align without effort. The signature is the condition strip: four small gauges that show each condition's measured value against a visible threshold tick, reused identically in list rows, the detail summary and (as a reference) the filter sheet. A light theme mirrors the dark one token for token; it is a sibling, not an afterthought.

Depth is tonal. Surfaces step up in lightness rather than casting shadows; shadows are reserved for things that genuinely float (the filter sheet, the toast). Motion is one deliberate gesture: gauge fills grow in once, panels slide on a single long-tail ease, and reduced motion collapses everything.

**Key Characteristics:**
- Blue-black ground, one raised surface, 1px hairlines instead of nested boxes.
- Semantic colour only: up/down/warn carry meaning; the blue accent carries interaction.
- Inter everywhere, tabular numerals on by default.
- The condition strip: value vs threshold tick, four times per setup.
- Mobile cards (14px radius) become a flat hairline table on desktop.
- Dark and light themes are exact mirrors via the same token names.

## Colors

A near-black, slightly blue neutral ramp with three semantic signals and one cool interaction accent; the light theme swaps every value under the same role.

### Primary
- **Signal Blue** (accent; light: Deep Signal Blue): focus rings, primary buttons, selected chips (as a 14% tint), the selected setup, link buttons, badges, the target fib line on charts, the RSI line, scan progress. Ink on a filled accent uses Accent Ink.

### Secondary
- **Market Green** (signal-up): a condition met, targets on the plan ladder, up candles and positive EWO bars, "4/4" scores, the live-scan dot. Its 14% tint (signal-up-soft) backs met-check discs and "done" pills.
- **Market Red** (signal-down): a condition missing, the stop, down candles and negative EWO bars, the RSI 30 band. Its tint backs missing-check discs.

### Tertiary
- **Amber** (warn): the POC line on the chart and legend, saved-star, "not connected" status dot. Never a third pass/fail state.

### Neutral
- **Blue-Black Ground** (ground): app background, sticky headers, the detail pane.
- **Panel** (surface): cards, mobile setup rows, chart background, desktop rail, sheet.
- **Raised Panel** (surface-raised): segmented-control troughs, secondary buttons, icon buttons, inputs, hover on rows.
- **High Panel** (surface-high): gauge tracks, timeframe tags, neutral pills, button hover.
- **Hairline** / **Strong Hairline**: row dividers and card borders / chip outlines, input borders, radio rings, grabber.
- **Ink**, **Secondary Ink**, **Tertiary Ink**: primary text and selected segment fill / labels, captions, gauge ticks / inactive tabs, placeholders, the "other fib" lines.

### Named Rules
**The Colour Means Something Rule.** Green, red and amber are reserved for market meaning (met/target, missing/stop, POC). Blue is reserved for interaction and selection. No colour appears for decoration.

**The Mirror Rule.** Every colour role exists in both themes under the same token name (`prefers-color-scheme` plus a `data-theme` override). A new role is not done until it has its light value.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto)
**Body Font:** Inter
**Label/Mono Font:** Inter with tabular numerals; no separate mono face.

**Character:** One neutral grotesque at four weights (400/500/600/700), tightened slightly at large sizes. Tabular figures (`tnum`) and the alternate `cv11` are set on the body, so every number in the app aligns.

### Hierarchy
- **Display** (700, 26px; 30px on the detail ticker, -0.02em): screen titles (Setups, Scan, Saved, Settings) and the detail ticker.
- **Headline** (700, 22px, -0.01em): the detail price.
- **Title** (700, 17px, -0.01em): ticker and score in setup rows (15px in the desktop table); sheet titles at 600.
- **Section** (600, 15px): card and section headings (Conditions, Trade plan).
- **Body** (400, 14px, 1.45): default text, plan rows, gauge values at 600.
- **Body small** (400, 13px): subtitles, condition rule text, segmented and chip labels at 500.
- **Label** (600, 11px, 0.04em): gauge names (FIB, POC, RSI, EWO), desktop column headers (uppercase), tab labels at 500, timeframe tags.

### Named Rules
**The Tabular Rule.** Every figure renders with tabular numerals and a true minus sign (−). Signs are explicit on changes (+2.4%, −1.3%).

## Layout

Mobile first, one screen at a time: 16px side gutters, sticky header (title, universe and scan freshness, quick-filter row that scrolls horizontally), a list with 8px between cards, and a four-item bottom tab bar (Setups, Scan, Saved, Settings) on a blurred, 88% ground. The detail page pushes in over the list from the right.

At **1024px and up** the shell becomes three columns: a 216px nav rail on Panel with a hairline right edge, a list pane (min 540px, 44%) and the detail pane (28px gutters) side by side. The tab bar hides; the list becomes a hairline table with a 128px setup column, a four-gauge strip column and a 52px score column, under uppercase column labels. Scan and Settings use a single 760px column with 32px gutters. Charts grow from 280px to 360px, indicator panes from 84px to 96px; conditions and plan sit in two equal columns.

Spacing rhythm: 4 / 8 / 12 / 14 / 16 / 22px. Cards pad 14px; stacks gap 12px; sections are 22px apart.

## Elevation & Depth

Flat and tonal. Depth comes from four surface steps (ground, surface, raised, high) and 1px hairlines. Only floating layers carry a shadow, and only one shadow token exists.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 40px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.3)`; light: `0 12px 40px rgba(15,19,24,.14), 0 2px 8px rgba(15,19,24,.06)`): the filter/universe sheet and the toast only.
- **Lift** (`box-shadow: 0 1px 3px rgba(0,0,0,.2)`): the selected tab in the detail timeframe switcher, a tray-style control.

### Named Rules
**The Tonal Depth Rule.** Rows, cards, charts and panes never cast shadows; they step up one surface tone and sit on a hairline. Shadow means "this floats above the page".

## Shapes

Rounded but disciplined. Pills (999px) for every toggle: segmented controls, chips, status pills, icon buttons (circles). Controls use 12px (buttons, inputs, cards, condition and plan panels), small buttons and steppers 10px, timeframe tags 6px. Mobile setup rows are 14px cards; the mobile sheet has 22px top corners, 18px when it becomes a floating panel on desktop. Gauge tracks are 4px bars with 2px ends; threshold ticks are 2px wide and overhang the track by 3px each side. Dashed borders appear only on "no setup / no plan" notices.

## Components

### Buttons
- **Shape:** gently rounded (12px), 44px tall; small variant 36px at 10px radius.
- **Primary:** Signal Blue fill, Accent Ink text, 600 weight, 15px, 0 18px; hover brightens 6%. Used for "Open in TradingView", "Analyze", "Run scan", "Show N setups".
- **Secondary:** Raised Panel fill, Ink text; hover to High Panel. The save star is a secondary button that turns Amber when pressed.
- **Icon buttons:** 38px circles on Raised Panel, 20px stroked SVG icons (1.75 stroke).
- **Link button:** Signal Blue text, 600 (sheet "Reset").
- **Focus:** 2px Signal Blue outline, 2px offset, on every interactive element.

### Chips
- **Style:** pill, 1px Strong Hairline outline, Secondary Ink, 13px/500.
- **State:** selected chips drop the outline and take the 14% blue tint with blue text. Chips are for **multi-select** (timeframes, fib levels).

### Segmented control
- **Style:** pill trough on Raised Panel with 3px inset; options in Secondary Ink.
- **State:** the selected option is a filled Ink pill with Ground text. Segments are for **exclusive** choice (minimum conditions, count / require / ignore, EWO mode, theme). A wide variant fills the row; a small variant (12px) sits inline in settings rows.

### Cards / Containers
- **Corner Style:** 12px (cards, condition list, plan), 14px (mobile setup rows).
- **Background:** Panel on Ground.
- **Shadow Strategy:** none (see Tonal Depth Rule).
- **Border:** 1px Hairline.
- **Internal Padding:** 14px.
- Lists inside a card are divided by hairline rows (condition rows, plan rows, key-value settings rows, schedule rows), never by nested cards.

### Inputs / Fields
- **Style:** 44px, 12px radius, Raised Panel fill, 1px Strong Hairline, 16px text (no iOS zoom), ticker input uppercases its value.
- **Focus:** border turns Signal Blue; caret is Signal Blue.
- **Stepper:** Raised Panel pill (10px) with − / value / + cells, value at 600.

### Navigation
- **Mobile:** bottom tab bar, four equal columns, 20px icon over an 11px/500 label; inactive Tertiary Ink, current Ink. Badges are Signal Blue 16px pills.
- **Desktop:** left rail on Panel, logo mark in Signal Blue, 14px items with 8px radius; hover and current both take Raised Panel, current text in Ink, badge inline at the right.

### Setup row
- **Mobile:** a 14px-radius Panel card: ticker (17/700) with timeframe tag and optional amber star, a subline (fib level, level price, last), score (17/700) with n/4 (green when 4/4), then the condition strip. Hover to Raised Panel, press scales to 0.99, selected takes a Signal Blue border.
- **Desktop:** a flat transparent table row on a bottom hairline, 9px 12px padding, no radius; gauge labels hide (the column header carries them), selected row takes the 14% blue tint.

### Condition strip (signature)
Four equal gauges (FIB, POC, RSI, EWO), 6px apart. Each shows the label, the measured value (14px/600, tabular) and a 4px track with a 2px Secondary-Ink threshold tick placed at the rule's threshold. The fill runs from the left; **passing the tick means the condition is met**. Met fills are Market Green; missing fills and their values are Market Red; a condition set to "ignore" in filters is dimmed to 35% opacity with a Tertiary Ink fill. The same strip appears in rows, the detail summary card and anywhere a setup is summarised.

### Detail page
Sticky bar (back, "n of N", prev/next, small TradingView button), ticker and price header, a summary card holding the strip, a 3-up timeframe tray (selected option lifts to Panel), then the chart block, Conditions (check/cross discs on soft signal tints, value right-aligned with a caption) and Trade plan (a risk/reward ladder and hairline plan rows with R:R).

### Charts
- Lightweight Charts on Panel, horizontal grid in Hairline only, Inter 11px axis text in Secondary Ink.
- Candles: Market Green up, Market Red down, no borders.
- **Tested fib level:** solid 2px Signal Blue; **other fibs:** 1px dashed Tertiary Ink.
- **POC:** solid 2px Amber. **Stop:** 1px dashed Market Red.
- Swing low/high markers in Ink with text.
- RSI pane: Signal Blue 2px line, dashed band lines at 30 (Market Red, labelled), 35 (Tertiary Ink) and 50 (Hairline).
- EWO pane: histogram, Market Green at or above zero, Market Red below.
- A legend row repeats the line conventions and carries the "Charts by TradingView" attribution.
- **Open, not solved:** on mobile the first time-axis label can clip at the left edge; tick-label fragments can show behind the price-line tags (a Lightweight Charts limitation). Neither is a convention to copy.

### Sheet and toast
The filter / universe sheet slides up from the bottom on mobile (22px top radius, grabber, scrim at 55%) and becomes a 400px floating panel at top right on desktop. The toast is an inverted pill (Ink on Ground) above the tab bar. Both use the Float shadow.

**Open, not solved:** the filter sheet's per-condition share bars ("n of N results meet it") reuse the gauge track but are proportion bars with no threshold tick, and their green fill can read as "met". They are not condition gauges; do not treat them as an instance of the strip.

### Motion
- `ease`: `cubic-bezier(.16, 1, .3, 1)`, the single easing for meaningful movement.
- Gauge fills grow once from zero (0.8s, staggered 40ms per gauge); this is the only keyframe animation.
- Detail push 0.38s, sheet 0.4s (desktop 0.3s with fade), toast 0.35s, segment fills 0.2s; row hover is a plain 0.15s colour fade.
- `prefers-reduced-motion: reduce` collapses all transitions and animations to near zero.

## Do's and Don'ts

### Do:
- **Do** show the measured value next to every pass/fail, with its threshold visible as a tick on the gauge.
- **Do** use filled Ink segments for exclusive choices and blue-tinted chips for multi-select; never swap them.
- **Do** separate items inside a container with 1px hairline rows.
- **Do** keep mobile setup rows as 14px cards and desktop rows as a flat hairline table.
- **Do** set tabular numerals and true minus signs on every figure.
- **Do** give every new colour role a light-theme value under the same token name.
- **Do** keep the chart line conventions: target fib solid accent, other fibs dashed, POC amber, stop dashed red.
- **Do** use the single `ease` curve for movement and respect reduced motion.

### Don't:
- **Don't** use green, red or amber for anything but met/target, missing/stop and POC.
- **Don't** use the blue accent as decoration or as a pass/fail colour.
- **Don't** nest cards inside cards; use hairline rows.
- **Don't** put shadows on rows, cards or charts; shadow is for floating layers only.
- **Don't** reduce a condition to a bare check or cross without its number.
- **Don't** present scores or plans as advice or attach performance claims.
