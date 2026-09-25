/**
 * "Explain this chart" — the charts that can be explained, and what one
 * explanation is sent.
 *
 * Shared by the dashboard, which builds the snapshot from the figures a
 * section is showing, and by the endpoint, which checks it and hands it to
 * the model. How a chart is read lives here, not in the request: the page
 * says which chart it is, and the words describing it are ours.
 */

export const CHARTS = {
  'coverage-maturity': {
    page: 'National Coverage',
    howToRead:
      'State Maturity: how ready each state is, at state level, to adopt an EMR — Mature, Moderately mature or Not mature, from the state-level assessment. Nationally it counts the states in each band, with each band’s share of the states classified; states not yet assessed are counted apart. Inside a state it gives that state’s one band.',
  },
  'coverage-domain': {
    page: 'National Coverage',
    howToRead:
      'One domain of the State Maturity assessment and its figures. Technical infrastructure: electricity access and internet subscriptions, as rates per hundred people from national sources (internet subscriptions are counted per SIM, so they can pass 100%), and subscriptions by technology and operator. Leadership and governance: four commitments — governance structure, financial commitment, a digital health strategy, a data governance policy — answered Yes, Partial or No; nationally, how many states gave each answer. These figures carry no readiness band of their own.',
  },
  'assessment-facilities': {
    page: 'Assessed States',
    howToRead:
      'The PHC facilities assessed in this scope, split by readiness to deploy an EMR: Ready, Moderately ready, Not ready. A facility’s band comes from its Technical Infrastructure gaps alone (power, connectivity, devices and so on). Shares are of the facilities in scope.',
  },
  'assessment-severity': {
    page: 'Assessed States',
    howToRead:
      'For each assessment domain, the facilities in scope split by their worst gap in that domain: No gap, Minor, Moderate or Major. Every row counts all the facilities in scope, so the rows do not add up to anything together. Major and Moderate gaps must be closed before deployment; Minor before or during.',
  },
  'assessment-gaps': {
    page: 'Assessed States',
    howToRead:
      'Gaps and the interventions that close them, in total. Headline: gaps to close, interventions to close them, facilities with a gap, and what the interventions cost. The two counts need not match either way: one gap can call for more than one intervention, and some recorded gaps have no intervention recorded against them. By urgency, for the interventions: Major and Moderate are needed before deployment, Minor before or during, Long-term after; each card counts the interventions, the facilities that need at least one, and their cost. Urgency belongs to an intervention, not a gap. A cost excludes interventions the source does not price. Each domain below these figures has its own explanation.',
  },
  'assessment-gap-domain': {
    page: 'Assessed States',
    howToRead:
      'One assessment domain’s gaps and the interventions that close them, for the facilities in scope. Its gap areas, costliest first: the facilities carrying a gap in the area and the cost of closing it. Within each area, each gap the assessment records, with its facilities and cost. Then the interventions each gap calls for, most urgent first — Major and Moderate before deployment, Minor before or during, Long-term after — with the price of one unit. Facilities need different quantities, so a unit price does not multiply out by the facility count. A cost excludes interventions the source does not price. Some of these rows may be folded away on screen.',
  },
  'assessment-notes': {
    page: 'Assessed States',
    howToRead:
      'Themes raised in the free-text notes assessors wrote at each facility visit — access, security, the building, staffing, water, power and so on — as tagged by an AI model and checked by a person. For each theme, the facilities in scope whose note raises it as a problem or a need, and their share of the facilities with a note. A note can raise several themes, so the shares do not add up to 100%. These come from what assessors wrote, not from the structured survey questions.',
  },
  'investment-interventions': {
    page: 'Investment Plan',
    howToRead:
      'The costed plan, one line per action the assessment prescribes: the facilities that need it, and its total cost. Grouped by phase (before, during or after deployment), by urgency, or by domain, with each group’s subtotal and share of the plan — or as one list by cost. Unpriced lines are left out of the totals; lines costed at ₦0 are recorded work with no facility-level cost.',
  },
  'investment-cost-by-readiness': {
    page: 'Investment Plan',
    howToRead:
      'Where the plan’s money goes, by the readiness of the facilities it is spent on. For Ready, Moderately ready and Not ready: the cost, its share of the plan, the facilities, and the cost per facility. Then one row per group of the chosen breakdown (category, facility group, functionality, zone or state), each group’s cost split across the three bands, with its total.',
  },
  'scenario-single': {
    page: 'Investment Plan · Scenarios',
    howToRead:
      'One funding scenario. The chosen power and connectivity fixes are funded facility by facility, cheapest to make Ready first, up to a target: a budget, a number of facilities, or a share Ready. A facility becomes Ready only when every fix it needs is funded. Read as Ready before + Unlocked = Total Ready. How the money is spent: per fix, the facilities it goes to and its cost; the costs add up to the spend, and a facility needing two fixes counts under both. The spending queue lists every facility not yet Ready, grouped by the fixes it needs, cheapest first, with what one facility in the group costs and how many of the group this scenario funds — groups it funds none of are waiting, not bought.',
  },
  'scenario-compare': {
    page: 'Investment Plan · Scenarios',
    howToRead:
      'Up to four funding scenarios side by side, each with its own fixes, states and target. For each: Ready before + Unlocked = Total Ready, what it spends, and the cost per facility made Ready. Money goes to the facilities cheapest to make Ready first, and a facility becomes Ready only when every fix it needs is funded.',
  },
  'scenario-states': {
    page: 'Investment Plan · Scenarios',
    howToRead:
      'One funding scenario run in each state on its own, for where the same target does the most. Per state: Ready before + Unlocked = Total Ready, the spend, the cost per facility made Ready, and the share Ready after. A budget target is applied in full to each state separately; the first table runs it once across all the states together.',
  },
} as const satisfies Record<string, { page: string; howToRead: string }>;

export type ChartId = keyof typeof CHARTS;

export const isChartId = (id: unknown): id is ChartId =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(CHARTS, id);

/** A table of figures, as the section shows them — strings, already formatted. */
export interface ExplainTable {
  title?: string;
  columns: string[];
  rows: string[][];
}

/** One explanation's input: which chart, where the reader is, and the figures. */
export interface ChartSnapshot {
  chart: ChartId;
  /** The section's heading on screen. */
  title: string;
  /** Where the reader is and what is filtered — "Area: Kano", "Readiness: Not ready". */
  scope: string[];
  tables: ExplainTable[];
}

export const EXPLAIN_LIMITS = {
  bodyChars: 40_000,
  title: 120,
  scopeLines: 10,
  scopeChars: 240,
  tables: 6,
  columns: 10,
  rows: 80,
  cellChars: 240,
};

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;

/** The snapshot, checked field by field against `EXPLAIN_LIMITS`. */
export function parseSnapshot(body: unknown): ChartSnapshot | { error: string } {
  const b = body as Partial<Record<keyof ChartSnapshot, unknown>> | null;
  if (!b || !isChartId(b.chart)) return { error: 'Name a chart the dashboard explains.' };
  const L = EXPLAIN_LIMITS;
  const title = text(b.title, L.title);
  if (title === null) return { error: 'The chart title is missing or too long.' };

  if (!Array.isArray(b.scope) || b.scope.length > L.scopeLines)
    return { error: 'The scope is missing or too long.' };
  const scope: string[] = [];
  for (const line of b.scope) {
    const t = text(line, L.scopeChars);
    if (t === null) return { error: 'A scope line is too long.' };
    scope.push(t);
  }

  if (!Array.isArray(b.tables) || !b.tables.length || b.tables.length > L.tables)
    return { error: 'Send between one and six tables of figures.' };
  const tables: ExplainTable[] = [];
  for (const raw of b.tables as unknown[]) {
    const t = raw as Partial<Record<keyof ExplainTable, unknown>> | null;
    const columns = Array.isArray(t?.columns) ? t.columns : null;
    const rows = Array.isArray(t?.rows) ? t.rows : null;
    if (!columns || !columns.length || columns.length > L.columns || !rows || rows.length > L.rows)
      return { error: 'A table is the wrong shape or too large.' };
    const cells = (list: unknown[]) => {
      const out: string[] = [];
      for (const c of list) {
        const v = text(c, L.cellChars);
        if (v === null) return null;
        out.push(v);
      }
      return out;
    };
    const cols = cells(columns);
    const rowsOut: string[][] = [];
    for (const r of rows) {
      const cs = Array.isArray(r) && r.length === columns.length ? cells(r) : null;
      if (!cs) return { error: 'A table row is the wrong shape.' };
      rowsOut.push(cs);
    }
    if (!cols) return { error: 'A column heading is too long.' };
    const tableTitle = t?.title === undefined ? undefined : text(t.title, L.title);
    if (tableTitle === null) return { error: 'A table title is too long.' };
    tables.push({ ...(tableTitle ? { title: tableTitle } : {}), columns: cols, rows: rowsOut });
  }
  return { chart: b.chart, title, scope, tables };
}
