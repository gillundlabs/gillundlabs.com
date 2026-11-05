# Style guide: Victorian laboratory

## Two registers
1. **Apparatus** (the game screen): a polished instrument on a workbench.
   - Dark stained **wood** base.
   - Lacquered **brass** for walls, rails, plaques and buttons.
   - **Blued-steel** cheese-head screws roughly every 75 px along brass.
   - Text is **engraved** into brass in an old-style serif. Gold italic Georgia is used on wood.
   - The vacuum is near-black blue (`#0d1117` → `#030405`).
2. **Notebook** (explanations, help, physics notes): a scientist's bound lab book.
   - Pages: aged ruled parchment (`--vls-paper #f1e3c2`), blue-grey rules, a red margin line, foxing, at most one faint coffee ring per page, and the page number top-right.
   - Text: the date in the left margin, body text in **handwriting** (Caveat), titles in **copperplate** (Pinyon Script).
   - Illustrations are **hand-sketched** with `VLS.notebook.pen`:
     - sepia ink (`#704214`) with wobble, double-stroked lines, hatching for shading, and hand-lettered labels;
     - no fills brighter than the paper, no gradients;
     - red ink (`#8e2a1c`) only for emphasis.

## Labelled boxes (the honesty rules)
- **Analogy**: a pasted-in slip with tape (`.vls-analogy`). Every analogy must sit in one of these slips, or be explicitly tagged "Analogy". Never present an analogy as a fact.
- **Simplification**: a marginal note with a red double rule (`.vls-simplification`). Use it for every place the software departs from reality. Apps may rename the label to fit their voice; Maxwell's Demon uses "How the game cheats".
- **cf.**: every factual page ends with a handwritten `cf.` footnote naming a reputable source (an encyclopaedia, NIST, a textbook or a paper).

## B&W theme
- Apparatus: pure #000 / #fff with no grey fills. Walls are white bars, atoms are white line art, and the adsorbed state is a dotted ring.
- Notebook: black ink on white, light-grey rules, no ageing, boxes as plain black outlines. Handwriting stays (or turns plain with the toggle).

## Accessibility
- Handwriting sizes:
  - body ≥ 20 px on phones (21 px default);
  - notes ≥ 19 px;
  - footnotes ≥ 17 px.
- Always offer the **plain-text toggle** (`.vls-plain`, Georgia). It also removes the slips' rotation.
- Touch targets ≥ 44 px. Scroll containers use `-webkit-overflow-scrolling: touch` and `overscroll-behavior: contain`.
- Respect `prefers-reduced-motion`: no page-turn animation, and sketches are static.
- Colour is never the only carrier of meaning: boxes always show their text label.

## Tone
Friendly, plain words, a little dry wit. Short paragraphs. Explain one idea per page.
