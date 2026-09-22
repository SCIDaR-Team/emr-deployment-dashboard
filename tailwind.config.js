/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens — every value resolves through a CSS variable in
        // src/styles/globals.css so light/dark swap in one place.
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        page: 'hsl(var(--page) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          sunk: 'hsl(var(--surface-sunk) / <alpha-value>)',
        },
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },

        // Brand — deep forest green, from the ERA Figma prototype.
        brand: {
          50: 'hsl(var(--brand-50) / <alpha-value>)',
          100: 'hsl(var(--brand-100) / <alpha-value>)',
          500: 'hsl(var(--brand-500) / <alpha-value>)',
          600: 'hsl(var(--brand-600) / <alpha-value>)',
          700: 'hsl(var(--brand-700) / <alpha-value>)',
          900: 'hsl(var(--brand-900) / <alpha-value>)',
        },

        // The navigation rail. Dark green in both schemes — see globals.css.
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar) / <alpha-value>)',
          foreground: 'hsl(var(--sidebar-foreground) / <alpha-value>)',
        },

        // Readiness bands. These three carry meaning across every surface —
        // donuts, badges, choropleth, checklists, roadmap. Never hand-pick a
        // status colour; go through BAND_CLASSES in src/lib/bands.ts.
        //
        // Three parts per band, and the split is load-bearing. DEFAULT is the
        // client's pastel and is for FLAT FILLS — a swatch, a bar segment, a
        // badge ground, anything sitting opaque on the page. `ink` is the same
        // band at a text weight and is what any label, figure, icon or border
        // uses. `text-ready` would put pale sage on near-white; `text-ready-ink`
        // is the one you want. `map` is the pastel's brighter twin, for marks
        // painted over a base map — see the note in globals.css.
        ready: {
          DEFAULT: 'hsl(var(--ready) / <alpha-value>)',
          ink: 'hsl(var(--ready-ink) / <alpha-value>)',
          wash: 'hsl(var(--ready-wash) / <alpha-value>)',
          map: 'hsl(var(--ready-map) / <alpha-value>)',
        },
        moderate: {
          DEFAULT: 'hsl(var(--moderate) / <alpha-value>)',
          ink: 'hsl(var(--moderate-ink) / <alpha-value>)',
          wash: 'hsl(var(--moderate-wash) / <alpha-value>)',
          map: 'hsl(var(--moderate-map) / <alpha-value>)',
        },
        notready: {
          DEFAULT: 'hsl(var(--not-ready) / <alpha-value>)',
          ink: 'hsl(var(--not-ready-ink) / <alpha-value>)',
          wash: 'hsl(var(--not-ready-wash) / <alpha-value>)',
          map: 'hsl(var(--not-ready-map) / <alpha-value>)',
        },
        // Urgency, not readiness — see the note in globals.css. Ink only: these
        // four never fill a shape, they colour a word or a glyph beside one.
        urgency: {
          critical: 'hsl(var(--urgency-critical) / <alpha-value>)',
          major: 'hsl(var(--urgency-major) / <alpha-value>)',
          minor: 'hsl(var(--urgency-minor) / <alpha-value>)',
          longterm: 'hsl(var(--urgency-longterm) / <alpha-value>)',
        },
        nodata: 'hsl(var(--no-data) / <alpha-value>)',

        // Ink for text that sits on top of a band fill — the readiness cards.
        // Fixed in both schemes, because the fill under it is.
        onband: {
          DEFAULT: 'hsl(var(--on-band) / <alpha-value>)',
          muted: 'hsl(var(--on-band-muted) / <alpha-value>)',
        },

        // The score ramp: one hue, light -> dark. Magnitude only — a 1–5
        // score, a share, a maturity step. Never identity, never status.
        // Reach it through the ordinal helpers in src/lib/bands.ts rather
        // than naming a step at a call site.
        score: {
          1: 'hsl(var(--s1) / <alpha-value>)',
          2: 'hsl(var(--s2) / <alpha-value>)',
          3: 'hsl(var(--s3) / <alpha-value>)',
          4: 'hsl(var(--s4) / <alpha-value>)',
          5: 'hsl(var(--s5) / <alpha-value>)',
        },

        // The five-level maturity ramp (Nascent → Optimized). A finer scale
        // than the three readiness bands above, for the surfaces that report a
        // maturity level. Reach it through MATURITY_CLASSES / maturityColor()
        // in src/lib/bands.ts rather than naming a step directly.
        maturity: {
          nascent: 'hsl(var(--maturity-nascent) / <alpha-value>)',
          'nascent-wash': 'hsl(var(--maturity-nascent-wash) / <alpha-value>)',
          emerging: 'hsl(var(--maturity-emerging) / <alpha-value>)',
          'emerging-wash': 'hsl(var(--maturity-emerging-wash) / <alpha-value>)',
          developing: 'hsl(var(--maturity-developing) / <alpha-value>)',
          'developing-wash': 'hsl(var(--maturity-developing-wash) / <alpha-value>)',
          institutionalized: 'hsl(var(--maturity-institutionalized) / <alpha-value>)',
          'institutionalized-wash':
            'hsl(var(--maturity-institutionalized-wash) / <alpha-value>)',
          optimized: 'hsl(var(--maturity-optimized) / <alpha-value>)',
          'optimized-wash': 'hsl(var(--maturity-optimized-wash) / <alpha-value>)',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 6px)',
        // Bare `rounded` is 48 of the ~90 radius call sites in the app — chips,
        // swatches, small controls. Tailwind's DEFAULT is a hard 0.25rem and is
        // not reached by `--radius`, so without this line the token moves the
        // named steps and leaves the majority of the app square.
        DEFAULT: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Deliberately none: hierarchy is hairlines and vertical rhythm. Kept
        // as a token rather than deleted so the existing `shadow-card` call
        // sites keep resolving while they are ported.
        card: 'none',
        sheet: '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        // Anything that floats above the page: popovers, dialogs, drawers, toasts.
        pop: '0 4px 12px -2px rgb(0 0 0 / 0.10), 0 12px 32px -8px rgb(0 0 0 / 0.18)',
      },
      fontFamily: {
        // One voice: Nunito, loaded in index.html. The `mono` token is kept —
        // and kept pointed at the same family — so the label, tick, figure and
        // code call sites keep resolving; what still sets a reading apart from
        // prose is the tracking, the case and `tabular-nums`, not the family.
        sans: ['Nunito', 'Segoe UI', 'Roboto', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Nunito', 'Segoe UI', 'Roboto', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Overlay entrances. Kept in CSS rather than a motion library: these are
      // the only animations in the app, and the reduced-motion rule in
      // globals.css already neutralises them for anyone who has asked.
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(2rem) scale(0.95)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 140ms ease-out',
        'dialog-in': 'dialog-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-left': 'slide-in-left 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        'toast-in': 'toast-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
