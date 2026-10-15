---
name: Francis Yambao, game developer
description: A fighting-game character select screen where every shipped game is a selectable fighter.
colors:
  cobalt: "#2430E6"
  cobalt-deep: "#1A21B8"
  cobalt-line: "#5560FF"
  ink: "#0E0C2B"
  ink-raise: "#1C1950"
  ink-dim: "#45436F"
  red: "#F23A2E"
  red-deep: "#D42A1F"
  yellow: "#FFC93C"
  cream: "#FFF6E0"
  cream-dim: "#D3D6FB"
typography:
  display:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "clamp(3.4rem, 6.6vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "clamp(2.6rem, 5.4vw, 4.75rem)"
    fontWeight: 900
    lineHeight: 0.92
  intro:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "clamp(2.2rem, 3.4vw, 3.1rem)"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "0.005em"
  title:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 900
    lineHeight: 1.05
  label:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 800
    lineHeight: 1.2
  button:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 800
    letterSpacing: "0.01em"
  stat:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 800
    lineHeight: 1.2
  lead:
    fontFamily: "Rubik, Segoe UI, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Rubik, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Rubik, Segoe UI, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 500
rounded:
  none: "0px"
spacing:
  pad: "clamp(1rem, 3.2vw, 2.5rem)"
  section: "clamp(4.5rem, 9vw, 7.5rem)"
  hud-h: "68px"
  hud-h-mobile: "60px"
  cut: "calc(100vw * 0.1405)"
  tile-gap: "0.6rem 0.2rem"
  stat-gap: "0.35rem"
  row-gap: "0.45rem"
components:
  button-red:
    backgroundColor: "{colors.red-deep}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 1.15rem"
    height: "44px"
  button-red-hover:
    backgroundColor: "#C42319"
    textColor: "{colors.cream}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 1.15rem"
    height: "44px"
  button-cream:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 1.15rem"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.cream}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 1.15rem"
    height: "44px"
  button-big:
    padding: "0 1.6rem"
    height: "56px"
  stage-arrow:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    size: "46px"
  stage-arrow-hover:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
  hud:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    height: "{spacing.hud-h}"
    padding: "0 {spacing.pad}"
  tile:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    padding: "5px"
  tile-current:
    backgroundColor: "{colors.red}"
    textColor: "{colors.cream}"
  tile-cursor:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.stat}"
    padding: "0.05rem 0.5rem"
  stat-slot:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    padding: "0.55rem 0.9rem 0.6rem"
  move-row:
    backgroundColor: "{colors.ink-raise}"
    textColor: "{colors.cream-dim}"
    padding: "1.15rem 2.4rem 1.25rem"
  career-row:
    backgroundColor: "{colors.cobalt-deep}"
    textColor: "{colors.cream}"
    padding: "1.6rem clamp(2rem, 4vw, 3.5rem) 1.75rem"
  chip-loadout:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.cream}"
    typography: "{typography.small}"
    padding: "0.3rem 0.85rem"
  chip-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    typography: "{typography.small}"
    padding: "0.2rem 0.7rem"
  dossier-dialog:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.cream}"
    width: "min(1320px, 100%)"
---

# Design System: Francis Yambao, game developer

## Overview

**Creative North Star: "The Character Select Screen"**

The whole site is a fighting-game roster screen that still scrolls and clicks like a normal page. Every shipped game is a fighter: a slanted tile on the roster, its footage on a slanted stage, its name in huge condensed caps. A flat, saturated cobalt field owns most of the page; deep ink is the stage and the HUD; P1 red marks what is selected and what to press; ready yellow marks focus, cursors, and the small labels that orient a skimmer. Cream carries the words.

One angle runs the system. Every vertical edge leans 8° forward (`skewX(-8deg)`), and every section boundary climbs 8° to the right (`100vw × tan 8°`). Panels, tiles, stats, chips, buttons, wipes, and the VS splash all share that lean, so the page reads as one cabinet rather than a collection of styled boxes. The density is arcade, not editorial: big blocks of flat color, short heavy type, tight gutters between tiles, and motion that happens as a single decisive sweep rather than a scatter of small effects.

Depth comes from color stacking (ink on cobalt, cobalt-deep behind the stage, red flooding the current tile), not from soft card shadows. Nothing is rounded.

**Key Characteristics:**
- One angle everywhere: -8deg lean on verticals, +8° climb on section edges.
- Flat saturated grounds: cobalt, cobalt-deep, ink, red, in a fixed section sequence.
- Selection is flooded, not outlined: the current tile turns red and gets a yellow P1 cursor.
- Condensed heavy caps for names and headings; Rubik for anything read as a sentence.
- Slanted plates, upright text: the shape leans, the words stay straight.
- Motion is one diagonal red slab, used for stage swaps and the VS splash, and removed entirely under reduced motion.

## Colors

A loud two-hue arcade palette: blue grounds and red action, with yellow as the highlighter and cream as the type.

### Primary
- **Select-Screen Cobalt** (cobalt): The page ground. Owns the select screen, the career section, the dossier dialog, and loadout chips. It is the color a visitor remembers.
- **Stage-Shadow Cobalt** (cobalt-deep): The second ground. The slanted slab behind the stage, the whole player-profile section, and the career rows sitting on cobalt.
- **Cobalt Line** (cobalt-line): Declared in the root palette as the light cobalt for rules and strokes on blue grounds; not yet painted by any shipped rule. Reserve it for that job rather than as a new fill.

### Secondary
- **P1 Red** (red): Selection and finale. Floods the current roster tile and current dossier thumb, fills the HUD portrait plate and the player portrait frame, is the stage-wipe and VS slab, the dossier bullet marks, the scrollbar thumb, and the whole Continue? section ground.
- **Button Red** (red-deep): The red that carries cream text. Every red button uses it, because cream on P1 red falls under 4.5:1 at button sizes and cream on red-deep clears it.

### Tertiary
- **Ready Yellow** (yellow): Focus and orientation. The focus outline, the P1 cursor, stat labels, section titles on deep grounds (Player profile, Move list), small yellow label headings (Choose a game, Loadout, Build notes), the career subtitle line, the dossier counter, stage-arrow hover, text selection, and the caret.

### Neutral
- **Arcade Ink** (ink): The stage, the HUD, the footer, the Move list ground, tile frames, stat slots, tags, and stage arrows. Also the text color on red, yellow, and cream.
- **Raised Ink** (ink-raise): Move-list rows sitting on the ink ground; the one tonal step up from ink.
- **Dim Ink** (ink-dim): Declared as a muted ink for inactive states; not yet painted by any shipped rule.
- **Title Cream** (cream): All primary type on dark and blue grounds, the cream button, the ghost button stroke, and the large Continue? title on red.
- **Lavender Cream** (cream-dim): Secondary reading text on blue and ink grounds: intro paragraph, HUD subtitle and nav, player body copy, move descriptions, fact labels, footer. Hairline dividers use it at 25% alpha.

### Named Rules
**The Flooded Selection Rule.** The current thing is shown by flooding its surface red, never by a thin ring alone. A selected tile, a selected thumb, a primary button: red fills it.

**The Red Carries Ink Rule.** Text set directly on P1 red is ink, or cream only at display size (the Continue? title). Any red surface that holds button-size cream text uses red-deep instead.

**The Yellow Points Rule.** Yellow marks where you are and what to read next (focus, cursor, labels, section titles on deep grounds). It never fills a large surface.

## Typography

**Display Font:** Big Shoulders Display (with Arial Narrow, sans-serif), loaded at 600, 800, and 900
**Body Font:** Rubik (with Segoe UI, system-ui, sans-serif), loaded at 400, 500, 700 and 400 italic

**Character:** A tall, condensed, heavy display face reads as roster names and arcade marquee; Rubik's soft rounded geometry keeps sentences calm and fast to skim underneath it.

### Hierarchy
- **Display** (900, clamp(3.4rem, 6.6vw, 6rem), 0.86): The selected game's name on the stage, uppercase, skewed -8deg, overlapping the bottom of the stage screen with a soft ink text shadow. The same voice sets the Continue? title (clamp(4rem, 11vw, 6rem), 0.85) and the VS splash name (clamp(3.5rem, 11vw, 6rem), 0.9).
- **Headline** (900, clamp(2.6rem, 5.4vw, 4.75rem), 0.92): Section titles (Player profile, Move list, Career mode), uppercase and skewed -8deg from the bottom-left. Yellow on cobalt-deep and ink grounds, cream on cobalt. The dossier title uses the same treatment at clamp(2.4rem, 5vw, 4rem).
- **Intro** (900, clamp(2.2rem, 3.4vw, 3.1rem), 0.98, 0.005em): The select-screen h1, uppercase, balanced wrapping, upright. It is the one large heading that does not lean, because it sits beside the leaning stage name.
- **Title** (900, 1.6rem, 1.05): Move names, uppercase. Career role titles step up to clamp(1.8rem, 3vw, 2.5rem) at line-height 1.
- **Label** (800, 1.35rem, 1.2): Short yellow headings that name a block (Choose a game, Loadout, Build notes, Project links), sentence case. Fact values in the player profile use the same size in cream.
- **Button** (800, 1.2rem, 0.01em): All button faces and HUD nav links; 1.45rem on big buttons.
- **Stat** (800, 0.95rem, 1.2): Stat-slot labels in yellow, the P1 cursor (900, 1.05rem), tile names (900, clamp(1.05rem, 1.35vw, 1.3rem), uppercase).
- **Lead** (500, 1.3rem, 1.5): The opening paragraph of the player profile and the Continue? pitch.
- **Body** (400, 1.0625rem desktop / 1rem under 760px, 1.6): All reading text. Paragraph measures are held between 34ch and 60ch.
- **Small** (500, 0.85–0.95rem): Chips, tags, fact labels, stat values, footer.

### Named Rules
**The Caps Are Names Rule.** Uppercase is for names and titles set in the display face (games, sections, moves, roles). Labels, buttons, and every Rubik line stay in sentence case.

**The Lean Is For Names Rule.** Display type that names something (the stage name, section titles, the dossier title, Continue?, tile names) is skewed -8deg from its bottom-left corner. Reading text never leans.

## Layout

The page is a single scroll of full-bleed sections, each a solid ground, with horizontal padding fixed at `pad` and vertical padding at `section`. A sticky ink HUD (`hud-h`, 68px; 60px under 760px) is always present, and anchor scrolling clears it via `scroll-padding-top: calc(hud-h + 1rem)`.

**Section sequence and grounds.** Select screen on cobalt (with a cobalt-deep slab behind the stage) → Player profile on cobalt-deep → Move list on ink → Career mode on cobalt → Continue? on red → footer on ink. The Move list, Career mode, and Continue? sections each project a right-angled triangle of their own ground upward into the previous section: height `cut` (`100vw × tan 8°` = `calc(100vw * 0.1405)`), clip-path `polygon(0 100%, 100% 0, 100% 100%)`, with `background: inherit`. The section above reserves room for it by adding `cut` to its bottom padding. The result is one continuous 8° climb at every boundary from Player profile downward.

**Select screen grid (desktop).** Two columns at 1.55fr / 1fr (about 61/39): the stage spans both rows on the left; the intro sits top-right, aligned to its bottom, and the roster fills below it. Minimum height fills the viewport under the HUD. The roster is a 2-column grid of six tiles with a 0.6rem row and 0.2rem column gap, so the parallelograms nest tightly.

**Under 1100px.** HUD nav hides; the select screen stacks intro → stage → roster in one column; the roster becomes three columns; move rows go single-column; the dossier stacks media over notes.

**Under 760px: display-contents reordering.** The stage and stage card switch to `display: contents`, so their children become direct grid items of the select screen and are re-placed in this order: intro → stage screen → stage name → roster → tagline → stats → Open button. The roster rises directly under the footage so the first phone viewport shows a game playing, its name, and the other fighters. The roster becomes a horizontal scroll-snap strip (each tile 42% wide, bleeding to the screen edges, scrollbar hidden) and auto-scrolls to keep the current tile visible. Stats drop to two columns; the player portrait moves below the copy; the HUD Contact button collapses to its icon with the label kept for assistive tech.

## Elevation & Depth

Depth is tonal and planar. Surfaces are flat blocks of color stacked on each other (ink plates on cobalt, cobalt-deep slab behind the stage, red flood behind the current tile), and z-order is shown by overlap: the stage name overruns the bottom of the stage screen, the stage card pulls up 2.1rem into it. Shadows are rare and soft, used only where something floats over moving content.

### Shadow Vocabulary
- **HUD lift** (`box-shadow: 0 6px 18px rgba(8, 6, 32, 0.35)`): The sticky HUD over scrolling content.
- **Name lift** (`text-shadow: 0 6px 22px rgba(8, 6, 32, 0.45)`): The stage name, so it reads over bright footage.
- **Dialog lift** (`box-shadow: 0 24px 60px rgba(4, 3, 20, 0.55)`): The dossier dialog over its ink backdrop (`rgba(14, 12, 43, 0.88)`).
- **Ghost stroke** (`box-shadow: inset 0 0 0 2px cream`): The ghost button's outline, drawn inside the skewed plate.

### Named Rules
**The Flat Plates Rule.** Panels, rows, tiles, chips, and stats carry no shadow. Separation comes from a different ground color and the gap between slanted plates.

## Shapes

Every shape is a parallelogram leaning 8° forward, or a skewed plate; there are no rounded corners anywhere.

**Clipped parallelograms (fixed-ratio boxes).** For an element of known aspect ratio, the horizontal offset is `tan 8° × height / width`, written as `polygon(o 0, 100% 0, (100% − o) 100%, 0 100%)`. The stage screen at 16:9 uses `o = 0.1405 × 9/16 = 7.9%`; roster tiles at 16:10 use `o = 0.1405 × 10/16 = 8.8%`. Framed media repeats the polygon on both the frame and the image inside it, with the frame's padding (5px on tiles) showing as a colored border.

**Clipped parallelograms (fluid-height rows).** Rows whose height follows their content use a fixed inset instead: stat slots `0.9rem`, move rows `1.4rem`, career rows `1.75rem`, all tightening to `0.9rem` under 760px. Their inline padding is wide enough that text never enters the cut. These insets are approximations: at shipped content heights they lean somewhat steeper than 8° (roughly 10–15°). New fluid rows should size the inset as `0.1405 × typical row height`.

**Skewed plates.** Elements that hold text and must stay readable at any width (buttons, stage arrows, chips, tags, tile names, the P1 cursor, dossier bullet marks) use `transform: skewX(-8deg)` on the plate and, where the content must stand upright, `skewX(8deg)` on an inner face.

**Section edges.** The 8° climb between sections (see Layout) and the cobalt-deep slab behind the stage (`polygon(0 0, 100% 0, calc(100% − 14vh) 100%, 0 100%)`, roughly the same angle) are the only full-width diagonals.

## Components

### Buttons
Skewed plates with an upright face: the plate leans, the label and icon stand straight.
- **Shape:** The anchor or button is skewed -8deg; its inner face is skewed +8deg back. Square corners (0px). Minimum height 44px, inline padding 1.15rem; big variant 56px and 1.6rem with a 1.45rem label. Icon and label sit in the face with a 0.5rem gap.
- **Red (primary):** red-deep plate, cream text. Resume in the HUD and Open [game] on the stage.
- **Ink / Cream:** ink plate with cream text, or cream plate with ink text. Ink is the primary action on the red Continue? ground (Email me); cream is the secondary there and the Close button in dialogs.
- **Ghost:** transparent plate with a 2px inset cream stroke; hover fills it with cream at 12% alpha. HUD Contact.
- **Hover / Active:** the plate lifts 2px on hover and presses 1px on active, over 160ms on the ease-out curve. Red hover darkens to #C42319.
- **Focus:** 3px solid yellow outline, 3px offset (ink outline inside the red Continue? section).

### Stage
The signature component: the selected game's footage playing on a slanted 16:9 ink screen.
- **Screen:** ink, clipped to the 7.9% parallelogram, with muted looping footage and a poster. Footage plays only while on screen and never autoplays under reduced motion.
- **Arrows:** two 46px ink plates (40px on mobile) skewed -8deg with upright chevrons, bottom-right of the screen; hover turns them yellow with ink chevrons.
- **Card:** display name, tagline, the Open button, and a fixed four-slot stat strip (Status, Engine, Platform, Footage). Each stat is an ink parallelogram with a yellow label over a cream value; slots are a 0.35rem-gapped 4-column grid (2 columns on mobile). The dossier header reuses the strip with three slots.
- **Stage wipe:** on every stage change, a red slab skewed -8deg sweeps across the screen (440ms on the swap curve, holding full cover from 40% to 55%), and the new game is painted under cover at 170ms.

### Roster Tile
A selectable fighter.
- **Rest:** 16:10 ink frame with 5px padding, clipped to the 8.8% parallelogram; the art inside is clipped to match and dimmed (`saturate(0.85) brightness(0.88)`). The name sits on a skewed ink plate at the lower left in uppercase display.
- **Hover / Focus:** art returns to full color and scales to 1.04. On fine pointers, hover previews the game on the stage after 110ms; keyboard focus does the same, and arrow keys move through the grid.
- **Current:** the frame floods red, a red multiply layer at 70% sits over grayscale art, the name grows, and a yellow **P1** cursor plate scales in at the top right.
- **Focus outline:** because clip-path would cut a normal outline, a focused tile replaces it with four 3px yellow `drop-shadow` filters (up, down, left, right), which trace the parallelogram exactly.

### Chips
- **Loadout chips:** cobalt plates on the ink Move list ground, 500-weight 0.95rem Rubik, skewed -8deg, 0.45rem gap.
- **Tags:** ink plates on the cobalt dossier, 0.85rem, skewed -8deg.

### Cards / Containers
- **Corner Style:** none; containers are parallelogram rows, never rounded cards.
- **Move rows:** raised-ink parallelograms in a 2-column grid on ink, uppercase title column beside a cream-dim description.
- **Career rows:** cobalt-deep parallelograms stacked on cobalt, role title and yellow subtitle beside a cream description.
- **Portrait and resume frames:** red (portrait) or ink (resume) frames with 8–10px padding, clipped to a parallelogram on both frame and image. New framed media should take its inset from the 8° formula in Shapes.

### Navigation
- **HUD:** sticky ink bar, 68px. Left: a red parallelogram plate holding the portrait (also clipped) and the name in uppercase display with a cream-dim subtitle; it opens the profile photo. Center-right: section links in 800-weight display, cream-dim, turning yellow on hover. Right: Resume (red) and Contact (ghost). Under 1100px the links hide; under 760px the subtitle hides and Contact becomes icon-only.

### Dossier
- **Dialog:** a cobalt panel up to 1320px wide over an 88% ink backdrop, with a sticky header (skewed title, three stat slots, cream Close). Media sits on an ink 16:9 field with ink stage arrows at its sides, a yellow tabular counter, and a strip of 118px parallelogram thumbs (current thumb floods red; focused thumb fills yellow). The side column holds the summary, yellow label headings, build notes marked by small skewed red bars, and tags.
- **VS splash:** opening a game first plays a full-screen red slab skewed -8deg that sweeps in, holds from 36% to 62%, and sweeps out over 900ms, while the game's name slides in from the right, holds, and exits left. The dossier is revealed under cover at 380ms.

### Motion
- **Easing:** `ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) for hovers and state changes at 160–300ms; `ease-swap` (`cubic-bezier(0.7, 0, 0.3, 1)`) for the stage wipe and VS splash.
- **Reduced motion:** all animations and transitions collapse to 0.01ms, smooth scrolling turns off, the stage swaps instantly with no wipe, the VS splash is skipped and the dossier opens directly, and no footage autoplays.

## Do's and Don'ts

### Do:
- **Do** lean every new panel, tile, chip, and button at the one angle: `skewX(-8deg)` for plates, `tan 8° × height / width` for clipped parallelograms of known ratio.
- **Do** keep text upright inside a skewed plate by counter-skewing the face (`skewX(8deg)`).
- **Do** show the current item by flooding it red (`red`) and marking it with the yellow P1 cursor, not by an outline alone.
- **Do** use `red-deep` for any red surface that carries button-size cream text.
- **Do** draw focus on clipped elements with yellow `drop-shadow` filters so the ring follows the parallelogram; use the 3px yellow outline everywhere else.
- **Do** join a new section to the one above with the `cut` triangle in its own ground, and add `cut` to the previous section's bottom padding.
- **Do** keep reading text in Rubik at 34–60ch and names and headings in Big Shoulders Display.
- **Do** make any new motion a single diagonal red sweep on the swap curve, and give it an instant path under reduced motion.

### Don't:
- **Don't** round any corner; the system has no radius.
- **Don't** introduce a second deliberate angle; slants, wipes, and section edges are all designed to 8°.
- **Don't** set cream body-size text directly on P1 red.
- **Don't** put soft shadows on panels, rows, tiles, or chips; separation is by ground color and gap.
- **Don't** skew reading text or set Rubik in uppercase.
- **Don't** fill large areas with yellow; it marks focus and labels only.
