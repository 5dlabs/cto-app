# Morgan setup motion language

This is the reusable interaction direction for CTO/Morgan setup and should carry forward into the rest of the app.

## Aesthetic

Use **Linear restraint + Raycast physicality + Runway ambience**:

- dark glass surfaces, subtle blue/cyan/violet bloom;
- motion communicates state, not decoration;
- selected items glow in place when paired with a modal; non-selected items recede through opacity/scale;
- hover gives a small “alive” pulse without flicker or constant distraction.

## Selection depth

For icon/card choice groups:

- Parent enables perspective around `900px–1600px`.
- Selected card without a modal: `translateY(-6px to -10px) scale(1.02–1.05)`, brighter, more saturated, larger shadow/glow.
- Selected card with a modal open: keep it anchored (`translateY(0)`) and use a smaller `scale(1.01–1.02)` plus border/glow. Do not combine a raised parent card with a modal.
- Unselected cards: `scale(0.95–0.98)`, lower opacity, lower brightness/saturation; avoid pushing them down when the modal is already creating depth.
- Hover: `translateY(-3px to -4px) scale(1.005–1.015)` plus a brief glassy bloom.
- Avoid large jumps; it should feel premium/desktop-native, not arcade-like.

## Trippy/pulse treatment

Use slow aurora drift on the selected card only:

- ambient gradient overlay duration `6s–14s`;
- opacity around `0.15–0.45` for cards, up to `~1` only when heavily blurred and clipped;
- blur `16px–80px` depending on element size;
- no fast repeating pulses under `2s`.

## Accessibility

- Selection must remain visible through border/contrast, not only movement.
- Keyboard focus remains explicit.
- `prefers-reduced-motion: reduce` disables transform travel and looping aurora, preserving state through border/opacity.
- Avoid flicker/pulsing in the 3–30Hz range.

## Current implementation anchor

The Source screen uses this language for:

- top-level GitHub / GitLab / 5D Origin icon cards, which stay anchored while the modal carries the depth;
- in-modal 5D Origin path and destination cards.

CSS anchor classes:

- `.local-bootstrap__auth-grid--icons-only`
- `.local-bootstrap__auth-choice--icon-first`
- `.local-bootstrap__origin-engine`
- `@keyframes local-bootstrap-aurora-drift`
