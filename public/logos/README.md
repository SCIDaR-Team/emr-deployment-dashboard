# Operator logos

Drop an operator's own artwork here and point `ProviderDef.logo` at it in
`src/lib/themes.ts` — for example:

```ts
{ id: 'smile', label: 'Smile', monogram: 'S', logo: '/logos/smile.svg' }
```

The chip in the National Coverage pane then draws the file instead of the
monogram tile. Until a `logo` is set, nothing requests a file: the fallback is
the monogram, not a broken image.

**What the file should be.** SVG for preference, otherwise PNG at 64px or
larger. It is drawn at 14px inside an 18px light tile, `object-contain`, so a
square or near-square mark reads best — a wide wordmark will shrink to
illegibility at that size. The tile stays light in dark mode, because most
brand artwork is dark ink on transparency.

**Licensing is a decision for this project, not a technical one.** These are
trademarks. Nothing is committed here by default; add a file only where the
project is entitled to redistribute it.

**No logo, but you know the colour?** Set `brand: { bg, fg }` instead and the
monogram tile takes the operator's colours. Check the pair clears 4.5:1 — Glo's
green needs an ink monogram rather than a white one for exactly this reason.
