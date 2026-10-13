/**
 * The landing page's backdrop: what sits on the mint ground, behind the cards.
 *
 * A fine dot grid over two soft glows, all in the frame's green and none in a
 * band colour — green, amber and red are status on this page, and a backdrop
 * that used them would be a chart nobody can read.
 *
 * The glows give the flat ground some depth: a brighter mint at the top left,
 * behind the headline, and a deeper green at the bottom right, under the
 * cards. The dots are strongest behind the headline and gone before the lower
 * cards, so they texture the open ground without running under the figures.
 *
 * Chosen over a faint map of the states and a set of topographic lines, both
 * tried in place: the dots were the quietest of the three, and the page's
 * subject is carried by its figures, not its wallpaper.
 *
 * All of it is `aria-hidden` and `pointer-events-none`: decoration, never
 * content.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-[10%] -top-[25%] h-[75%] w-[60%] rounded-full bg-[radial-gradient(closest-side,hsl(146_70%_99%/0.9),transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,hsl(var(--chrome-ink)/0.10),transparent)]" />
      <div className="absolute -bottom-[30%] -right-[10%] h-[80%] w-[55%] rounded-full bg-[radial-gradient(closest-side,hsl(150_45%_82%/0.55),transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,hsl(var(--chrome-ink)/0.08),transparent)]" />
      {/* A 22px grid, strongest at the top left and gone by the lower third. */}
      <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--chrome-ink)/0.22)_1.1px,transparent_1.4px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_90%_75%_at_30%_0%,black_30%,transparent_80%)]" />
    </div>
  );
}
