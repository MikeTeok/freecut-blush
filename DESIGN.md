---
name: Freecut Blush
description: A browser-based, local-first, multi-track video editor for pro editors.
colors:
  background: "#232136"
  foreground: "#e0def4"
  surface: "#2a273f"
  panel-header: "#232136"
  popover: "#393552"
  timeline-bg: "#1e1d32"
  primary: "#eb6f92"
  primary-foreground: "#232136"
  secondary: "#393552"
  muted: "#2a273f"
  muted-foreground: "#6e6a86"
  accent: "#393552"
  destructive: "#eb6f92"
  border: "#393552"
  input: "#393552"
  ring: "#eb6f92"
  clip-video: "#3e8fb0"
  clip-audio: "#c4a7e7"
  clip-image: "#9ccfd8"
  clip-text: "#908caa"
  clip-shape: "#eb6f92"
  mark-in: "#9ccfd8"
  mark-out: "#eb6f92"
  marker: "#f6c177"
typography:
  headline:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  mono:
    fontFamily: "IBM Plex Mono, Consolas, Monaco, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.68 0.19 45 / 0.9)"
    textColor: "{colors.primary-foreground}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "oklch(0.98 0 0)"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
---

# Design System: Freecut Blush

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

Freecut Blush is a precision tool that recedes. The visual system behaves like a
well-machined instrument with a muted amethyst glow: rose-pine panels, restrained
pink chrome, no decoration that doesn't earn its pixels. The footage in the
preview is the brightest, most saturated thing on the screen, and everything else
is tuned to stay out of its way. This is a serious NLE for editors who came from
Premiere Pro and DaVinci Resolve and expect those workflows; the interface
projects expert confidence by being legible, predictable, and fast, never by
being loud.

The surface is built from the Rosé Pine Moon palette, dark by default and dark on
purpose: long sessions, color-critical grading, and scopes all need a near-black
surround. The base is a muted aubergine (`#232136`) that reads as a warm neutral
after a few minutes of use — darker than the old graphite for even less eye
strain. Depth is carried by tonal layering, not by drop shadows. Panels sit at
slightly different value steps (the timeline floor at `#1e1d32`, panels at
`#2a273f`, overlays at `#393552`) so the eye reads hierarchy from value alone.
A single vibrant pink (Love `#eb6f92`) is the one signal color: playback, active
state, focus, the playhead. A softer rose (`#ea9a97`) handles secondary active
states and hover highlights.

This system explicitly rejects the consumer-editor look (CapCut/iMovie playful
rounded candy, emoji, gamified flourishes), the flashy SaaS dashboard
(gradient heroes, glassmorphism, big-number metric cards), and the cramped
legacy-NLE chrome (beveled gray toolbars, illegible 10px labels). Density here is
high but always clean and scannable.

**Key Characteristics:**
- Dark-only, Rosé Pine Moon palette; muted aubergine base with pink signal
- Love pink (`#eb6f92`) for active/playback/focus, Rose (`#ea9a97`) for hover
- Tonal layering, not shadows, for depth
- IBM Plex Sans for UI, IBM Plex Mono for all technical/numeric data
- Density without noise: dense panels that stay legible at a glance

## 2. Colors

A muted aubergine ramp from `#1e1d32` to `#e0def4`, lit by a vibrant pink
signal (Love `#eb6f92`) and a soft rose accent (`#ea9a97`).

### Primary
- **Love Pink** (`#eb6f92`): The one accent. Playback state, the playhead,
  active controls, focus rings, the shape-clip color. Never decorative; it always
  means "this is live / active / where you are."

### Secondary
- **Rose** (`#ea9a97`): Secondary active states, join indicators, softer
  emphasis when Love would be too strong.
- **Overlay** (`#393552`): Secondary surfaces, secondary buttons, and hover
  backgrounds.

### Tertiary (clip + marker semantics)
These hues are functional, not decorative; each encodes a timeline item type or
edit landmark and must keep its meaning.
- **Pine Teal** (`#3e8fb0`): Video clips.
- **Iris Purple** (`#c4a7e7`): Audio clips.
- **Foam Blue** (`#9ccfd8`): Image clips, in-point markers.
- **Subtle Lavender** (`#908caa`): Text clips.
- **Gold** (`#f6c177`): Timeline markers.
- **Love Pink** (`#eb6f92`): Out-point markers, shape clips.

### Neutral
- **Base** (`#232136`): App background.
- **Timeline Floor** (`#1e1d32`): The darkest surface; the timeline well.
- **Panel Header** (`#232136`): Panel header bars, same as base.
- **Surface** (`#2a273f`): Default panel/card background, popover backgrounds.
- **Overlay** (`#393552`): Muted fills, borders, inputs.
- **Muted** (`#6e6a86`): Secondary/disabled text and placeholders.
- **Subtle** (`#908caa`): Muted labels, text clip color.
- **Text** (`#e0def4`): Primary text.

### Named Rules
**The Pink Signal Rule.** Love pink means active. Reserve `#eb6f92` for playback,
the playhead, focus, and active/selected state. It should occupy a small fraction
of any screen; the moment it decorates a static element it stops reading as a
signal. Rose (`#ea9a97`) is a softer echo for hover and secondary active states.

**The Value-Hierarchy Rule.** Depth comes from lightness steps in the base ramp
(timeline floor `#1e1d32` → base `#232136` → surface `#2a273f` → overlay
`#393552`), not from borders or shadows. When two surfaces must read as distinct,
separate them by value before reaching for a border.

**The Meaning-Bearing Hue Rule.** Clip and marker colors are part of the data, not
the styling. Never repurpose Pine Teal or Gold for decoration, and never rely on
these hues alone to convey state (pair with icon/label/position).

## 3. Typography

**Display / UI Font:** IBM Plex Sans (with `-apple-system`, `Segoe UI`, sans-serif)
**Mono / Data Font:** IBM Plex Mono (with `Consolas`, `Monaco`, monospace)

**Character:** One humanist-sans family doing all interface work, paired with its
own monospace sibling for every number, timecode, frame count, and technical
value. The pairing reads as engineered and trustworthy without being cold; Plex
was drawn for exactly this kind of dense technical UI. Hierarchy comes from weight
and size, not from a second display face.

### Hierarchy
- **Headline** (600, 1.25rem, 1.3): Dialog titles, major section headers. Slight
  negative tracking (`-0.01em`).
- **Title** (600, 1rem, 1.4): Panel titles, card headers, primary labels.
- **Body** (400, 0.875rem / 14px, 1.5): Default UI text, descriptions, menu items.
- **Label** (500, 0.75rem / 12px, 1.4): Control labels, badges, secondary captions.
- **Mono** (400, 0.75rem, 1.4): Timecode, frame numbers, FPS, durations, dimensions,
  any value an editor reads precisely.

### Named Rules
**The Mono-For-Data Rule.** Every number an editor must read or compare (timecode,
frame, FPS, resolution, dB) is set in IBM Plex Mono so digits align and don't jump
width. Prose and labels stay in Plex Sans.

**The No-Caps-Body Rule.** Uppercase is for short badges and ≤4-word labels only.
Never set sentences or menu items in all-caps; at 12-14px on dark it becomes
unreadable.

## 4. Elevation

This system is **flat by tonal layering**. There is essentially no drop-shadow
vocabulary in the working UI; surfaces are distinguished by stepping lightness in
the neutral ramp (timeline floor darkest, panels lighter, popovers between).
Shadows appear only on detached, floating layers (menus, dialogs) and as an
optional accent glow, never as a default card lift.

### Shadow Vocabulary (sparing)
- **Floating layer** (`box-shadow: 0 4px 24px rgba(0 0 0 / 0.5)`): Popovers,
  dropdowns, dialogs lifting off the panel plane.
- **Signal glow** (`box-shadow: 0 0 12px color-mix(in srgb, #eb6f92 30%, transparent)`, utility
  `.glow-primary`): Reserved for active/playing elements; a soft pink halo, not
  a neutral lift.

### Named Rules
**The Flat-By-Default Rule.** Panels and cards are flat at rest. If a surface needs
to feel raised, raise its lightness one step before adding a shadow. Shadows are
for things that genuinely float (menus, modals) and for the pink signal glow on
active elements, nothing else.

## 5. Components

Components are **refined and restrained**: quiet surfaces, subtle borders, gentle
hover tints. Affordance comes from a small color/value shift, not from heavy
shadows or bevels. Corners are softly rounded (`6px` default), never pill-shaped,
never sharp.

### Buttons
- **Shape:** Softly rounded (`6px`, `{rounded.md}`); default height `36px`, compact
  `32px`, large `40px`. Icon buttons are square (`36×36`).
- **Primary:** Love Pink fill (`{colors.primary}`) with base text
  (`{colors.primary-foreground}`), `8px 16px` padding, a faint default shadow.
- **Hover / Focus:** Primary drops to 85% opacity on hover;
  focus shows a 1px pink ring (`{colors.ring}`). Transitions are color-only,
  ~150ms.
- **Secondary:** Overlay fill (`{colors.secondary}`), ink text, hover to 80%.
- **Outline:** Transparent over background with a 1px input border; hover fills with
  Overlay (`{colors.accent}`).
- **Ghost:** No fill at rest; hover fills with Overlay. The default for
  toolbar and icon actions.
- **Destructive:** Love Pink fill (`{colors.destructive}`) for delete/irreversible.
- **Link:** Love Pink text, underline on hover.

### Cards / Containers
- **Corner Style:** `8px` (`{rounded.lg}`) for cards, `6px` for inner controls.
- **Background:** Panel Surface (`#2a273f`); headers drop to Panel Header
  (`#232136`).
- **Shadow Strategy:** Flat (see Elevation). Distinguish by value, not shadow.
- **Border:** Optional 1px Border (`#393552`) when two same-value surfaces
  meet. Never a colored side-stripe.
- **Internal Padding:** `12–16px` (`{spacing.md}`–`{spacing.lg}`).

### Inputs / Fields
- **Style:** Transparent fill, 1px input border (`{colors.input}`), `6px` radius,
  `36px` height, `4px 12px` padding.
- **Focus:** Border/ring shifts to a 1px pink ring (`{colors.ring}`); outline is
  removed in favor of the ring.
- **Placeholder:** Muted (`#6e6a86`) — verify it clears 4.5:1; bump
  toward ink if not.
- **Disabled:** 50% opacity, `not-allowed` cursor.

### Navigation / Panels
- Panels use header bars at Panel Header value with a Title-weight label, body
  content on Panel Surface. Active tab/panel is marked with the pink signal
  (underline or text), hover with an Overlay tint. Keyboard focus is always
  visible via the pink ring.

### Signature: Timeline Clips
The timeline is the signature surface. Clips sit on the Timeline Floor
(`#1e1d32`) and are colored by type via the meaning-bearing hues, each with
a matching subtle top-to-bottom gradient (`.bg-video-gradient`, `.bg-audio-gradient`,
etc.). The playhead is the Love Pink line. Selection and snap use pink
inset/box shadows. Scrollbars are slim and overlay-tone. This surface is allowed more
density and more color than the rest of the app because the color is data.

## 6. Do's and Don'ts

### Do:
- **Do** keep Love Pink (`#eb6f92`) for active/playback/focus only; treat
  it as a signal, not a brand splash. Use Rose (`#ea9a97`) for secondary active states.
- **Do** separate surfaces by stepping the base ramp's lightness before reaching
  for a border or shadow.
- **Do** set every timecode, frame count, FPS, and dimension in IBM Plex Mono.
- **Do** verify body and placeholder text clears 4.5:1 on its panel; `muted-foreground`
  (`#6e6a86`) is borderline — bump toward ink where it fails.
- **Do** keep components flat and quiet; affordance via a small color/value shift.
- **Do** let the preview/footage be the brightest, most saturated thing on screen.

### Don't:
- **Don't** make it look like a consumer editor (CapCut/iMovie): no playful candy
  buttons, no emoji, no gamified flourishes, no pill-shaped buttons.
- **Don't** drift toward a flashy SaaS dashboard: no gradient hero text, no
  glassmorphism as default, no big-number metric cards inside the working UI.
- **Don't** reproduce cramped legacy-NLE chrome: no beveled gray toolbars, no
  illegible sub-12px labels, no noise-level density.
- **Don't** use a `border-left`/`border-right` greater than 1px as a colored accent
  stripe on cards, list items, or callouts.
- **Don't** use `background-clip: text` gradient text anywhere; emphasis is by weight
  and size.
- **Don't** repurpose the clip/marker hues for decoration, or rely on color alone to
  signal state.
- **Don't** stack opacity on already-muted text (`text-muted-foreground/40–70`).
  `muted-foreground` already sits near the AA floor (~4.8:1); an alpha modifier drops
  readable text to ~2.5–3.5:1. De-emphasize with size/weight, not sub-AA alpha. (Opacity
  is fine on genuinely decorative markers or disabled controls, which AA exempts.)
- **Don't** add a light theme; contrast work happens within the dark ramp.
