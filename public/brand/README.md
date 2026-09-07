# Institutional artwork

```
public/brand/nphcda-logo.webp        ← served: NPHCDA crest, 128×128, lossless, alpha
docs/brand/nphcda-logo-480.webp      ← master: the 480×480 original, not deployed
```

**Why two files.** The crest is drawn at 38px, so 128px covers a 3× display with
a pixel to spare — the 480px original was 168KB of first-paint weight to render
9KB of pixels, and downscaling took it to 21KB. The master stays in `docs/`
rather than here so it is version-controlled and re-derivable without being
copied into every deploy. Regenerate the served file from it with:

```python
from PIL import Image
im = Image.open('docs/brand/nphcda-logo-480.webp').convert('RGBA')
im.resize((128, 128), Image.LANCZOS).save(
    'public/brand/nphcda-logo.webp', 'WEBP', lossless=True, method=6
)
```

Lossless, not quality-95: the mark is flat colour and hard edges, which is what
lossless WebP compresses well and what lossy WebP fringes.

`INSTITUTION.logo` in `src/lib/constants.ts` names this path, and it is the only
reference to the file. Replacing the artwork is a file copy plus, if the type
changes, one line there.

**Not `dist/`.** `dist/` is build output: it is gitignored, it is rebuilt from
this directory by `npm run build`, and anything dropped into it is deleted by
the next build and absent from every deploy. `public/` is the source of truth —
Vite copies it to `dist/` verbatim, so `public/brand/x.webp` is served at
`/brand/x.webp`.

**What the file should be.** SVG for preference, otherwise PNG or WebP at 128px
or larger, trimmed of surrounding whitespace so the mark fills its own canvas.
It is drawn `object-contain` inside a 38px white tile on the landing page, so a
square or near-square crest reads best. The tile is white in both light and dark
mode, because the crest is coloured ink meant for a light ground.

**If the file goes missing, nothing is broken.** The landing mark draws the `ER`
monogram tile instead, on the image's own `error` event — so the page is correct
with or without the artwork, and no code change sits between the two states.

**Licensing.** This is an institutional mark. Keep a file here only where the
project is entitled to use and redistribute it.
