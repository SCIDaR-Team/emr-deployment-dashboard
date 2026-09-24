import { BAND_LABEL, MATURITY_LABEL, MATURITY_NO_DATA } from '../bands';
import { formatCount, formatNaira, formatShare } from '../format';
import { GAP_AREA_BY_ID, GAP_BY_ID, GAP_DOMAIN_LABEL } from '../gapCatalogue';
import { facilityPaths, planComposition, planForTarget } from '../scenarios';
import type { AreaProfile, Band, FacilitySummary, ScenarioComponentId } from '../types';

/**
 * Everything a state brief may say in figures, computed from the dashboard's
 * data with the pages' own arithmetic.
 *
 * One function feeds both ends of a brief: the drafting script hands these
 * facts to the model to write around, and the brief page shows them as its
 * key figures and checks the narrative against them. So a reviewed brief and
 * the dashboard cannot drift apart silently — when the data changes, the
 * facts change, `version` changes with them, and the brief is flagged stale.
 *
 * Every figure is carried pre-formatted, exactly as the page writes it, so
 * the narrative quotes rather than computes.
 */

/** The six fixes a scenario can fund, in the Scenarios section's order. */
const FIXES: { id: ScenarioComponentId; label: string }[] = [
  { id: 'full_solar', label: 'Full solar' },
  { id: 'solar_topup', label: 'Solar top-up' },
  { id: 'router', label: 'Router' },
  { id: 'fibrex', label: 'FibreX' },
  { id: 'network_extension', label: 'Network extension' },
  { id: 'satellite', label: 'Satellite' },
];
const ALL_FIXES = FIXES.map((f) => f.id);
const label = (id: ScenarioComponentId) => FIXES.find((f) => f.id === id)!.label;

/** Four combinations: each group of fixes on its own, the pair most facilities
 *  need together, and everything. */
const COMBINATIONS: { label: string; fixes: ScenarioComponentId[] }[] = [
  { label: 'All power', fixes: ['full_solar', 'solar_topup'] },
  { label: 'All connectivity', fixes: ['router', 'fibrex', 'network_extension', 'satellite'] },
  { label: 'Full solar and routers', fixes: ['full_solar', 'router'] },
  { label: 'All six fixes', fixes: ALL_FIXES },
];
const BANDS: Band[] = ['ready', 'moderately_ready', 'not_ready'];
const naira = (n: number) => formatNaira(n, true);

export interface BriefFacts {
  state: string;
  stateId: string;
  zone: string | null;
  facilities: string;
  lgas: string;
  readiness: Record<Band, { label: string; facilities: string; share: string }>;
  /** Where the state stands among the twelve on its share Ready. */
  readyRank: string;
  nationalReadyShare: string;
  topGaps: { gap: string; facilities: string; share: string }[];
  majorGapsByDomain: { domain: string; facilities: string; share: string }[];
  lgasMostNotReady: { lga: string; notReady: string }[];
  plan: {
    total: string;
    beforeDeployment: string;
    duringDeployment: string;
    afterDeployment: string;
    perFacility: string;
    nationalPerFacility: string;
    byReadiness: Record<Band, { cost: string; perFacility: string | null }>;
  };
  unlocks: {
    readyBefore: string;
    /** Each fix funded alone, as far as it goes with no budget limit. */
    fixes: UnlockRow[];
    /** The four combinations, likewise. */
    combinations: (UnlockRow & { fixes: string })[];
    allFixes: { unlocked: string; spend: string; totalReady: string; share: string };
    budgets: { budget: string; unlocked: string; totalReady: string }[];
  };
  maturity: {
    band: string;
    leadership: { item: string; level: string }[];
    electricityAccessPct: string | null;
    internetSubscriptionPct: string | null;
  };
  /** A fingerprint of every figure above. A brief records the version it was
   *  written against; a different version now means the data moved. */
  version: string;
}

/** What funding a set of fixes does: Ready before + Unlocked = Total Ready. */
export interface UnlockRow {
  label: string;
  spend: string;
  unlocked: string;
  totalReady: string;
}

function readyShare(fs: readonly FacilitySummary[]): number {
  return fs.length ? fs.filter((f) => f.deploymentBand === 'ready').length / fs.length : 0;
}

/** A short, stable fingerprint (FNV-1a) — not security, just "did it change". */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function briefFacts(state: AreaProfile, all: readonly FacilitySummary[]): BriefFacts | null {
  const fs = all.filter((f) => f.state === state.name);
  if (!fs.length) return null;
  const n = fs.length;

  const counts: Record<Band, number> = { ready: 0, moderately_ready: 0, not_ready: 0 };
  for (const f of fs) if (f.deploymentBand) counts[f.deploymentBand] += 1;

  // Rank among the assessed states on share Ready, 1 = highest.
  const byState = new Map<string, FacilitySummary[]>();
  for (const f of all) byState.set(f.state, [...(byState.get(f.state) ?? []), f]);
  const shares = [...byState.values()].map(readyShare).sort((a, b) => b - a);
  const rank = shares.indexOf(readyShare(fs)) + 1;

  // Gaps by the number of facilities that have them, recorded gaps only.
  const areaCount = new Map<string, number>();
  for (const f of fs) {
    const areas = new Set(
      f.gaps
        .map((g) => GAP_BY_ID[g])
        .filter((g) => g?.recorded)
        .map((g) => g!.area),
    );
    for (const a of areas) areaCount.set(a, (areaCount.get(a) ?? 0) + 1);
  }
  const topGaps = [...areaCount]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, c]) => ({
      gap: `${GAP_AREA_BY_ID[area]?.label ?? area} gap`,
      facilities: formatCount(c),
      share: formatShare(c, n),
    }));

  const majorGapsByDomain = Object.entries(GAP_DOMAIN_LABEL).map(([id, label]) => {
    const c = fs.filter(
      (f) => f.domainSeverity[id as keyof typeof f.domainSeverity] === 'major',
    ).length;
    return { domain: label, facilities: formatCount(c), share: formatShare(c, n) };
  });

  const notReadyByLga = new Map<string, number>();
  for (const f of fs) {
    if (f.deploymentBand === 'not_ready')
      notReadyByLga.set(f.lga, (notReadyByLga.get(f.lga) ?? 0) + 1);
  }
  const lgasMostNotReady = [...notReadyByLga]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([lga, c]) => ({ lga, notReady: formatCount(c) }));

  const comp = planComposition(fs);
  const national = planComposition(all);
  const byReadiness = Object.fromEntries(
    BANDS.map((b) => {
      const inBand = fs.filter((f) => f.deploymentBand === b);
      const cost = inBand.reduce((s, f) => s + f.costNGN, 0);
      return [
        b,
        { cost: naira(cost), perFacility: inBand.length ? naira(cost / inBand.length) : null },
      ];
    }),
  ) as BriefFacts['plan']['byReadiness'];

  const paths = facilityPaths(fs);
  const unlock = (lbl: string, ids: readonly ScenarioComponentId[]): UnlockRow => {
    const p = planForTarget(paths, new Set(ids), { kind: 'budget', ngn: null });
    return {
      label: lbl,
      spend: naira(p.spendNGN),
      unlocked: formatCount(p.newlyReady),
      totalReady: formatCount(p.readyBefore + p.newlyReady),
    };
  };
  const everything = planForTarget(paths, new Set(ALL_FIXES), { kind: 'budget', ngn: null });
  const budgets = [20_000_000, 100_000_000].map((ngn) => {
    const p = planForTarget(paths, new Set(ALL_FIXES), { kind: 'budget', ngn });
    return {
      budget: naira(ngn),
      unlocked: formatCount(p.newlyReady),
      totalReady: formatCount(p.readyBefore + p.newlyReady),
    };
  });

  const c = state.coverage;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v}%`);

  const facts: Omit<BriefFacts, 'version'> = {
    state: state.name,
    stateId: state.id,
    zone: state.zone ?? null,
    facilities: formatCount(n),
    lgas: formatCount(new Set(fs.map((f) => f.lga)).size),
    readiness: Object.fromEntries(
      BANDS.map((b) => [
        b,
        {
          label: BAND_LABEL[b],
          facilities: formatCount(counts[b]),
          share: formatShare(counts[b], n),
        },
      ]),
    ) as BriefFacts['readiness'],
    readyRank: `${rank} of ${byState.size}`,
    nationalReadyShare: formatShare(
      all.filter((f) => f.deploymentBand === 'ready').length,
      all.length,
    ),
    topGaps,
    majorGapsByDomain,
    lgasMostNotReady,
    plan: {
      total: naira(comp.totalNGN),
      beforeDeployment: naira(comp.readinessFixesNGN + comp.otherBeforeNGN),
      duringDeployment: naira(comp.duringNGN),
      afterDeployment: naira(comp.afterNGN),
      perFacility: naira(comp.totalNGN / n),
      nationalPerFacility: naira(national.totalNGN / all.length),
      byReadiness,
    },
    unlocks: {
      readyBefore: formatCount(everything.readyBefore),
      fixes: FIXES.map((f) => unlock(f.label, [f.id])),
      combinations: COMBINATIONS.map((c) => ({
        ...unlock(c.label, c.fixes),
        fixes: c.fixes.map(label).join(' + '),
      })),
      allFixes: {
        unlocked: formatCount(everything.newlyReady),
        spend: naira(everything.spendNGN),
        totalReady: formatCount(everything.readyBefore + everything.newlyReady),
        share: formatShare(everything.readyBefore + everything.newlyReady, n),
      },
      budgets,
    },
    maturity: {
      band: c?.band ? MATURITY_LABEL[c.band] : MATURITY_NO_DATA,
      leadership: Object.entries(c?.leadership ?? {}).map(([k, v]) => ({
        item: k.replace(/_/g, ' '),
        level: v ? MATURITY_LABEL[v as Band] : MATURITY_NO_DATA,
      })),
      electricityAccessPct: pct(c?.measures?.electricityAccessPct),
      internetSubscriptionPct: pct(c?.measures?.internetSubscriptionPct),
    },
  };
  return { ...facts, version: fingerprint(JSON.stringify(facts)) };
}
