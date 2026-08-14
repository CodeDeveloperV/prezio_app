---
name: Prezio
description: Tu aliado en cada compra — collaborative grocery price-comparison app for Panama
colors:
  fresh-green: "#22C55E"
  fresh-green-press: "#16A34A"
  deep-slate: "#0F172A"
  muted-slate: "#64748B"
  soft-mist: "#F3F4F6"
  paper-white: "#FFFFFF"
  alert-red: "#EF4444"
  warm-amber: "#F59E0B"
typography:
  display:
    fontFamily: "Poppins-SemiBold"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: "40px"
  headline:
    fontFamily: "Poppins-SemiBold"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
  title:
    fontFamily: "Poppins-SemiBold"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "Poppins-Regular"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "22px"
  label:
    fontFamily: "Poppins-Regular"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  full: "999px"
spacing:
  "0": "0px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.fresh-green}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.4}"
    padding: "16px 24px"
    height: "56px"
  button-primary-press:
    backgroundColor: "{colors.fresh-green-press}"
  chip-selected:
    backgroundColor: "{colors.fresh-green}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
    height: "40px"
  chip-unselected:
    backgroundColor: "{colors.soft-mist}"
    textColor: "{colors.deep-slate}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.soft-mist}"
    rounded: "{rounded.4}"
    padding: "20px"
---

# Design System: Prezio

## Overview

**Creative North Star: "La Libreta Fresca" (The Fresh Ledger)**

Prezio reads as a shopping notebook that also keeps the books: every screen behaves like a page —
soft, layered cards holding one idea each — while a single vivid green carries the app's only
"good news" signal: money saved, an action completed, a purchase in progress. The mood is
optimistic and agile, never a cold financial dashboard and never a stark utilitarian grid. Poppins'
rounded geometry, generous corner radii, and unhurried 56px-tall primary actions make the app feel
warm and solid under the thumb rather than clinical.

The one place the system allows itself real drama is the scan action at the center of the tab
bar: a raised pill dock lifts the whole navigation off the bottom edge, and the primary button
glows inside a soft green halo. Everywhere else, depth stays quiet.

**Key Characteristics:**
- Vivid savings-green as the sole "good news" signal, used sparingly against a white/slate canvas
- Poppins SemiBold headings pair with Poppins Regular/Medium body for a warm, rounded voice
- Soft, layered elevation on every surface, with exactly one dramatic flourish: the scan button's halo
- Generous corner radii and 56px-tall primary actions make every tap feel solid and unhurried
- Rounded, low-opacity tinted icon badges carry semantic color without shouting

## Colors

A quiet neutral canvas (white, slate) that exists to make one green feel expensive every time it appears.

### Primary
- **Fresh Savings Green** (#22C55E): the app's single positive signal — primary CTAs ("Nueva compra", "Continuar compra"), the active-session accent, savings and price figures. It never decorates; it always means "go" or "saved."
- **Fresh Savings Green, Pressed** (#16A34A): the pressed/active state of every green surface — darker, not a different hue.

### Neutral
- **Deep Slate** (#0F172A): primary text color in light mode. Doubles as the base background in dark mode.
- **Muted Slate** (#64748B): secondary text — subtitles, helper copy, inactive nav labels.
- **Soft Mist Gray** (#F3F4F6): the default card/surface fill, chip backgrounds, hairline borders, and hover backgrounds.
- **Paper White** (#FFFFFF): base app background in light mode; primary text/foreground in dark mode.

### Semantic
- **Alert Red** (#EF4444): danger and destructive states only (sync errors, remove actions).
- **Warm Amber** (#F59E0B): warning/pending states only (offline queue pending, price-alert warnings).

### Named Rules
**The Dual-Duty Slate Rule.** Deep Slate (#0F172A) is both the light-mode ink and the dark-mode canvas — never introduce a separate near-black for dark backgrounds; Deep Slate already does that job.

**The One Signal Rule.** Fresh Savings Green is the only accent allowed to mean "positive" or "primary action." Red and amber are reserved strictly for danger/warning; neither doubles as decoration or a second brand accent.

## Typography

**Display/Heading Font:** Poppins-SemiBold
**Body Font:** Poppins-Regular (Poppins-Medium at the largest sizes)

**Character:** A rounded, geometric sans that reads warm and confident rather than corporate; SemiBold headings give hero numbers and CTAs weight without shouting in all-caps or heavy tracking.

### Hierarchy
- **Display** (600, 34px, 40px line-height): hero metrics — active-session progress, savings totals.
- **Headline** (600, 28px, 34px line-height): section-defining numbers on cards (e.g. items remaining).
- **Title** (600, 18–22px, 24–28px line-height): screen and card titles.
- **Body** (400, 16px, 22px line-height): descriptive copy, list item text, input values.
- **Label** (400–500, 12–14px, 16–20px line-height, no forced uppercase): tab labels, helper text, chip text, timestamps.

## Layout

Phone-first, single-column layout built from `ScreenContainer` (16px padding, 16px gap, scroll by
default) and stacks of `Card` blocks — the app does not compose a desktop or tablet grid today.
Spacing follows the project's numeric scale (4/8/12/16/20/24/32/40/48/64px), used consistently for
gaps between cards, internal card padding, and touch-target spacing. Screens dedicated to a guided
flow (scanning, disambiguation) use `FlowHeader` (a centered title/subtitle with a circular back
button) instead of the system navigation header.

## Elevation & Depth

Soft, layered elevation everywhere, with exactly one dramatic exception. Cards sit at elevation
1–3 with diffuse, low-opacity shadows that suggest paper stacked on paper rather than glass or
glossy plastic. The bottom tab bar breaks that quiet with a pronounced upward shadow (`elevation:
18`, `shadowOpacity: 0.12`, `shadowRadius: 24`) that lifts the whole dock off the screen edge, and
the scan action at its center sits inside its own green-tinted halo circle with a stronger,
color-matched shadow (`shadowColor: #16A34A`, `shadowOpacity: 0.34`).

### Shadow Vocabulary
- **Card, resting** (elevation 1–2): default surfaces — form cards, list rows.
- **Card, emphasized** (elevation 3): the active hero card and anything meant to read as "the current important thing."
- **Dock lift** (`0 -8px 24px rgba(15, 23, 42, 0.12)`, elevation 18): the tab bar shell only.
- **Halo glow** (`0 8px 14px rgba(22, 163, 74, 0.34)`): the primary scan button only.

### Named Rules
**The One Halo Rule.** Only the scan tab's floating action button earns a colored glow/halo treatment. No other button, card, or badge gets this treatment — its rarity is what makes it read as "the one thing to press."

## Shapes

Rounded and tactile throughout: icon badges, category pills, and the scan FAB are fully circular
(`radius: 999px`); cards and primary buttons use a generous 16px radius; the tab bar shell rounds
only its top corners at 30px, reading as a raised sheet/dock rather than a floating card. No sharp
or square corners appear on any tappable control.

## Components

### Buttons
- **Shape:** fully rounded corners (16px radius); category pills and the scan FAB go fully circular (999px).
- **Primary:** Fresh Savings Green background (#22C55E), white text, 56px minimum height, generous horizontal padding — sized for one confident thumb tap, not a compact control.
- **Pressed:** background shifts to Fresh Savings Green Press (#16A34A); no scale animation on standard buttons (reserved for the tab bar's primary action, see Components → Navigation).
- **Disabled:** dimmed opacity on the same green fill; never switches to gray (keeps the "this is the green action" identity even when unavailable).

### Chips (category pills)
- **Style:** fully rounded (999px), 1px border.
- **Selected:** Fresh Savings Green fill, white text, green border.
- **Unselected:** Soft Mist Gray fill, Deep Slate text, matching neutral border.

### Cards / Containers
- **Corner Style:** 16px radius (`rounded.4`).
- **Background:** Soft Mist Gray for standard cards; Deep Slate for the "active session" hero state; low-opacity tinted backgrounds (e.g. `rgba(34, 197, 94, 0.08)`) for confirmation/callout cards.
- **Shadow Strategy:** elevation 1–3 per Elevation & Depth above; never flat/borderless when it needs to read as a discrete surface.
- **Border:** 1px hairline in the neutral border token; the dark hero card uses a subtle white-alpha border (`rgba(255,255,255,0.08)`) instead.
- **Internal Padding:** 16–20px (`rounded.4`–`rounded.5` spacing), with 12–16px gaps between internal groups.

### Inputs / Fields
- **Style:** default Tamagui `Input` — Soft Mist Gray field, no custom border/radius override yet.
- **Icon Badges (signature companion):** a 40–52px fully rounded circle, filled with the relevant semantic color at 8–14% opacity, houses a Tabler outline icon (1.5–2px stroke) in the full-strength semantic color. This is the system's default way to give any status or callout its color without a loud fill.

### Navigation
- **Style:** a floating pill-shaped dock (30px top corners, dock-lift shadow) replaces the default tab bar chrome entirely (`tabBarStyle` height 0 — the custom `PrezioTabBar` owns all rendering).
- **Default tabs:** icon + label, Muted Slate when inactive, Fresh Savings Green when active; no background change, no pill highlight — color alone marks selection.
- **Primary action (scan):** breaks from the row — a circular Fresh Savings Green button (58px) sits inside a larger transparent green-tinted halo (80px, `rgba(34,197,94,0.12)`), floats above the dock's top edge, and scales to 0.96 on press. This is the one place motion and color combine for emphasis.

### Tinted Icon Badge (signature component)
A fully rounded circle (typically 40–52px), background = the relevant semantic/brand color at
8–14% opacity, containing a single centered Tabler outline icon at full-strength color and 1.5–2px
stroke. Used for status framing on cards (warning, success, cart) instead of a colored banner or
solid fill — it is the system's recurring way to introduce color at low volume.

## Do's and Don'ts

### Do:
- **Do** treat Fresh Savings Green as the one accent per screen — the primary action or the one positive number, never decoration.
- **Do** keep every primary button at 56px minimum height and full-width for confident, one-thumb reach.
- **Do** use a tinted rounded icon badge (8–14% opacity) whenever a card needs a status/category signal, instead of a solid-color banner.
- **Do** reserve the halo + color-matched shadow treatment for the scan tab's primary action only.

### Don't:
- **Don't** introduce a second bold brand accent alongside Fresh Savings Green — Alert Red and Warm Amber exist strictly for danger/warning, never for decoration or a second CTA color.
- **Don't** flatten the scan button's halo/shadow away in the name of consistency — it is the system's one intentional dramatic moment, not an inconsistency to fix.
- **Don't** use sharp or square corners on any tappable control — buttons, chips, badges, and the FAB all commit to full or generous rounding.
- **Don't** swap Deep Slate for a separate near-black when building dark-mode surfaces — it already is the dark-mode background by design.
