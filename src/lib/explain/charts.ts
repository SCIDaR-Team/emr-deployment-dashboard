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
      'One domain of the State Maturity assessment and its figures. Technical infrastructure: electricity access and internet subscriptions, as rates per hundred people from national sources (internet subscriptions are counted per SIM, so they can pass 100%), and subscriptions by technology and operator. Workforce capacity: health workforce figures. Leadership and governance: four commitments — governance structure, financial commitment, a digital health strategy, a data governance policy — answered Yes, Partial or No; nationally, how many states gave each answer. These figures carry no readiness band of their own.',
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
      'Gaps and the interventions that close them. Headline: gaps to close, interventions to close them (one gap can call for more than one), facilities with a gap, and what the interventions cost. By urgency: Major and Moderate are needed before deployment, Minor before or during, Long-term after. Then by domain and gap area: the facilities carrying the gap, and the cost of closing it, costliest first. A cost excludes interventions the source does not price.',
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
      'One funding scenario. The chosen power and connectivity fixes are funded facility by facility, cheapest to make Ready first, up to a target: a budget, a number of facilities, or a share Ready. A facility becomes Ready only when every fix it needs is funded. Read as Ready before + Unlocked = Total Ready. The spending queue groups the facilities not yet Ready by the fixes they need, cheapest first, with what one facility in the group costs.',
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
  cellChars: 160,
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
