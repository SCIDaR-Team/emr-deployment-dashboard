import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { BAND_CLASSES, BAND_LABEL } from '@/lib/bands';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { COVERAGE_THEMES, subDomainsFor } from '@/lib/themes';
import { BandBadge, BandCards } from '@/components/ui';
import type { AreaProfile, Band, CoverageMeasures, CoverageThemeId } from '@/lib/types';
import { bandUnderLens, countByBand, totalOf, type DomainLens, type Scope } from './coverageScope';

/**
 * The pane — everything the reader is told about whatever the map has selected.
 *
 * Two shapes, one component, because the difference between them is genuinely
 * only the scope:
 *
 *   national   counts. "12 states ready, 14 moderately, 11 not ready", the same
 *              three counts per domain, and the national figures beneath.
 *   state/LGA  bands. This area's own reading per domain, and its own figures.
 *              No counts of LGAs — a state's pane answers "how is this state",
 *              not "how are its parts", and the map already shows the parts.
 *
 * The domain lens narrows which blocks render. Under `overall` all three show
 * (overall, then a block per domain); under a domain, only that one.
 */

interface CoveragePaneProps {
  scope: Scope;
  lens: DomainLens;
  national: AreaProfile | null;
  states: AreaProfile[];
  /** The rows for the list at the bottom — states nationally, LGAs in a state. */
  listAreas: AreaProfile[];
  listLabel: string;
  selectedListId: string | null;
  onSelectListItem: (area: AreaProfile) => void;
}

export function CoveragePane({
  scope,
  lens,
  national,
  states,
  listAreas,
  listLabel,
  selectedListId,
  onSelectListItem,
}: CoveragePaneProps) {
  const area = scope.level === 'lga' ? scope.lga : scope.level === 'state' ? scope.state : national;
  const isNational = scope.level === 'national';

  if (!area) return null;

  const measures = area.coverage.measures;
  const themes = lens === 'overall' ? COVERAGE_THEMES : COVERAGE_THEMES.filter((t) => t.id === lens);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader scope={scope} lens={lens} national={national} />

      {/* The header stays put; everything under it scrolls as one column. The
          alternative — scrolling the list alone inside a fixed stats block —
          gives a reader on a laptop two scroll regions in 370px and neither one
          enough room. */}
      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Overall belongs to no domain, so a domain lens removes it. */}
        {lens === 'overall' && (
          <Block title="Overall readiness">
            {isNational ? (
              <CountRows counts={countByBand(states, 'overall')} unit="states" />
            ) : (
              <Reading band={area.coverage.band} />
            )}
          </Block>
        )}

        {themes.map((theme) => (
          <Block key={theme.id} title={theme.label}>
            {isNational ? (
              <CountRows counts={countByBand(states, theme.id)} unit="states" />
            ) : (
              <Reading band={area.coverage.themeBands[theme.id] ?? null} />
            )}
            <SubDomains themeId={theme.id} measures={measures} />
          </Block>
        ))}

        <AreaList
          label={listLabel}
          areas={listAreas}
          lens={lens}
          selectedId={selectedListId}
          onSelect={onSelectListItem}
        />
      </div>
    </div>
  );
}

/** Scope identity: what you are looking at, and at what level. */
function PaneHeader({
  scope,
  lens,
  national,
}: {
  scope: Scope;
  lens: DomainLens;
  national: AreaProfile | null;
}) {
  const area = scope.level === 'lga' ? scope.lga : scope.level === 'state' ? scope.state : national;
  const name = scope.level === 'national' ? 'Nigeria' : (area?.name ?? '');
  const level =
    scope.level === 'national'
      ? `${formatCount(37)} states & FCT`
      : scope.level === 'state'
        ? `State · ${formatCount(scope.state.lgaCount ?? 0)} LGAs`
        : `LGA · ${scope.state.name}`;

  return (
    <div className="shrink-0 border-b border-border px-4 py-3">
      <p className="eyebrow">{level}</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{name}</h2>
        {/* The national scope shows counts rather than a badge: a single band
            for the whole country would flatten 37 readings into one word. */}
        {scope.level !== 'national' && area && (
          <BandBadge band={bandUnderLens(area, lens)} size="sm" />
        )}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5">
      <h3 className="mono mb-2.5 text-[10px] font-bold uppercase tracking-[0.11em] text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The national shape: a count per band, best first, with the split above it.
 *
 * Read as "6 states · READY": the figure and what it counts are one phrase and
 * set together, and the band stands apart from them in its own colour. Running
 * them together as "6 states ready" makes the reader parse a sentence to find
 * two facts; this way the eye takes the number, then the classification, and
 * the row scans down the column with the others.
 */
function CountRows({ counts, unit }: { counts: Record<Band, number>; unit: string }) {
  const total = totalOf(counts);

  return (
    <div>
      <BandCards counts={counts} unit={unit} />
      <p className="mono mt-2.5 text-[10px] text-muted-foreground">
        {formatCount(total)} {unit} classified
      </p>
    </div>
  );
}

/** The state/LGA shape: one band, stated plainly. */
function Reading({ band }: { band: Band | null }) {
  if (!band) {
    return <p className="text-[13px] text-muted-foreground">Not assessed.</p>;
  }
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          'block h-3.5 w-7 shrink-0 rounded-[1px]',
          BAND_CLASSES[band].bg,
          BAND_CLASSES[band].texture,
        )}
      />
      <span className={cn('text-[17px] font-bold tracking-tight', BAND_CLASSES[band].text)}>
        {BAND_LABEL[band]}
      </span>
    </div>
  );
}

/**
 * The figures beneath a domain.
 *
 * Set in plain ink with no band colour anywhere near them, and that is a rule
 * rather than a style choice: sub-domains carry no readiness level, in this
 * dataset or the real one, so tinting 63% with a readiness hue would invent a
 * judgement the data does not make. Colour on this page means band, and only
 * the blocks above have one.
 */
function SubDomains({
  themeId,
  measures,
}: {
  themeId: CoverageThemeId;
  measures: CoverageMeasures;
}) {
  const subs = subDomainsFor(themeId);
  if (!subs.length) return null;

  return (
    <div className="mt-3.5 space-y-3 border-t border-border pt-3">
      {subs.map((sub) => (
        <div key={sub.id}>
          <p className="text-[12px] font-medium text-foreground">{sub.label}</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{sub.note}</p>
          <dl className="mt-2.5 space-y-2.5">
            {sub.measures.map((measure) => {
              const value = measures[measure.key];
              return (
                <div key={measure.key} className="flex items-center gap-3">
                  <dt className="mono w-16 shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {measure.label}
                  </dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-2.5">
                    {measure.format === 'percent' ? (
                      <>
                        {/* Neutral ink, and the bar is a magnitude, not a
                            judgement — no threshold, no colour change. */}
                        <span className="h-2 min-w-0 flex-1 rounded-[1px] bg-surface-sunk">
                          <span
                            className="block h-full rounded-[1px] bg-foreground/60"
                            style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
                          />
                        </span>
                        {/* The figures are the reason this pane exists — they
                            are set to be read across the room, not squinted at.
                            Weight and size only: still no band colour, because
                            a measure carries no band. */}
                        <span className="mono w-[52px] shrink-0 text-right text-[17px] font-semibold leading-none tracking-tight text-foreground">
                          {value == null ? '—' : `${value}%`}
                        </span>
                      </>
                    ) : (
                      <span className="mono text-[19px] font-semibold leading-none tracking-tight text-foreground">
                        {value == null ? '—' : formatCount(value)}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

/**
 * The searchable list at the foot of the pane.
 *
 * The map is the better instrument for "how does the country look" and a
 * hopeless one for "where is Ebonyi". This is the other way in, and it is the
 * same selection — clicking a row does exactly what clicking a polygon does.
 */
function AreaList({
  label,
  areas,
  lens,
  selectedId,
  onSelect,
}: {
  label: string;
  areas: AreaProfile[];
  lens: DomainLens;
  selectedId: string | null;
  onSelect: (area: AreaProfile) => void;
}) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? areas.filter((a) => a.name.toLowerCase().includes(q)) : areas;
    // Worst first: the reader is looking for where the problem is, and an
    // alphabetical list buries that under Abia.
    const rank: Record<Band, number> = { not_ready: 0, moderately_ready: 1, ready: 2 };
    return [...matched].sort((a, b) => {
      const ba = bandUnderLens(a, lens);
      const bb = bandUnderLens(b, lens);
      const ra = ba ? rank[ba] : 3;
      const rb = bb ? rank[bb] : 3;
      return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
    });
  }, [areas, query, lens]);

  if (!areas.length) return null;

  return (
    <section className="px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="mono text-[10px] font-bold uppercase tracking-[0.11em] text-foreground">
          {label}
        </h3>
        <span className="mono text-[10px] text-muted-foreground">{formatCount(rows.length)}</span>
      </div>

      <label className="relative mb-2 block">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find a ${label.toLowerCase().replace(/s$/, '')}`}
          className="w-full rounded border border-input bg-surface py-1.5 pl-7 pr-2 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </label>

      <ul>
        {rows.map((area) => {
          const band = bandUnderLens(area, lens);
          const selected = area.id === selectedId;
          return (
            <li key={area.id}>
              <button
                type="button"
                onClick={() => onSelect(area)}
                className={cn(
                  'flex w-full items-center gap-2.5 border-b border-border px-1 py-1.5 text-left transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  selected && 'bg-surface-sunk',
                )}
                aria-current={selected ? 'true' : undefined}
              >
                <span
                  aria-hidden
                  className={cn(
                    'block h-2.5 w-2.5 shrink-0 rounded-[1px]',
                    band ? cn(BAND_CLASSES[band].bg, BAND_CLASSES[band].texture) : 'bg-nodata',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                  {area.name}
                </span>
                <span
                  className={cn(
                    'mono shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.08em]',
                    band ? BAND_CLASSES[band].text : 'text-muted-foreground',
                  )}
                >
                  {band ? BAND_LABEL[band] : '—'}
                </span>
              </button>
            </li>
          );
        })}
        {!rows.length && (
          <li className="py-3 text-[12.5px] text-muted-foreground">Nothing matches “{query}”.</li>
        )}
      </ul>
    </section>
  );
}
