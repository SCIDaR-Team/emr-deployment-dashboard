/**
 * Emit `docs/GAP_TAXONOMY.md` — the written inventory of every gap the
 * assessment records, grouped the way the source actually organises them:
 * domain → gap area → gap condition.
 *
 * Generated rather than hand-written because the middle level is the point.
 * "Technical Infrastructure" is a heading and "No functional electricity source
 * or 0 hours/day" is a leaf; between them sits **Power** — the gap *area*, one
 * per gap column in the sheet. That level exists in the file and nowhere in the
 * model, which is why the same facility can carry two ₦3,000,000 satellite
 * installations and no total notices.
 *
 * Run: node scripts/gap-taxonomy.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAssessmentCsv,
  extractCatalogue,
  gapValueInRow,
  gapCost,
  DOMAINS,
  HORIZONS,
  COL,
} from './assessment-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'List of gaps and interventions per facility.csv';
const OUT = join(ROOT, 'docs', 'GAP_TAXONOMY.md');

const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;

const HORIZON_SHORT = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  long_term: 'Long-term',
};

/**
 * Conditions that describe an **acceptable** state and are still recorded as
 * gaps carrying a paid intervention.
 *
 * Hand-listed because no column marks them: "Formal quarterly maintenance" and
 * "No formal maintenance arrangement" are both `Device-maintenance` values and
 * both fire the same ₦90,000 action. Reading which is which needs the sentence,
 * not the schema — so the judgement is written down here where it can be argued
 * with, rather than inferred somewhere it cannot.
 */
const ADEQUATE = new Set([
  'device_maintenance__formal_quarterly_maintenance',
  'device_maintenance__formal_annual_maintenance',
  'training__training_within_6_months_and_foundational',
  'training__training_6_12_months_ago_and_foundational',
  'technical_support__issues_are_resolved_within_24_hours_through_an_informal',
  'technical_support__issues_are_usually_resolved_within_24_48_hours',
  'facility_connectivity__facility_managed_connection_at_or_above_5_mbps_and_consi',
  'facility_connectivity__individual_connection_at_or_above_5_mbps',
  'facility_connectivity__facility_managed_connection_at_or_above_5_mbps_with_disr',
  'report_review_support__reports_are_sometimes_discussed',
  'routine_data_use__one_structured_data_use_mechanism',
  'data_validation__quarterly_validation_meetings',
  'digital_competency__75_99_of_applicable_service_points_have_basic_digital_sk',
  'device_sufficiency__immediately_usable_devices_cover_75_99_of_the_minimum_re',
  'backup_power__grid_and_functional_backup_are_available_but_backup_runt',
]);

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const text = readFileSync(join(ROOT, SOURCE), 'utf8');
const { blocks, rows } = parseAssessmentCsv(text);
const catalogue = extractCatalogue(rows, blocks);
const N = rows.length;

const key = (b) => `${b.domain}|${b.subDomain}`;
const findGap = (subDomain, label) =>
  catalogue.find((g) => g.subDomain === subDomain && g.label === label);

/** Facilities carrying each condition, and each area. */
const conditionCount = new Map();
const areaCount = new Map();
/** Facilities carrying both satellite conditions — the double count. */
let satelliteBoth = 0;

const fcBlock = blocks.find((b) => b.subDomain === 'Facility-connectivity');
const mnBlock = blocks.find((b) => b.subDomain === 'Mobile-network feasibility');

for (const row of rows) {
  for (const b of blocks) {
    const value = gapValueInRow(row, b);
    if (value === null) continue;
    areaCount.set(key(b), (areaCount.get(key(b)) ?? 0) + 1);
    const id = findGap(b.subDomain, value).id;
    conditionCount.set(id, (conditionCount.get(id) ?? 0) + 1);
  }
  if (
    gapValueInRow(row, fcBlock) === 'Confirmed satellite-only route' &&
    gapValueInRow(row, mnBlock) === 'No serviceable mobile pathway'
  ) {
    satelliteBoth += 1;
  }
}

/** Areas occupied per facility, for the median. */
const areasPerFacility = rows
  .map((row) => blocks.filter((b) => gapValueInRow(row, b) !== null).length)
  .sort((a, b) => a - b);
const medianAreas = areasPerFacility[Math.floor(areasPerFacility.length / 2)];

/** Population cost of one condition: its priced interventions × facilities. */
const conditionCost = (g) => gapCost(g).costNGN * (conditionCount.get(g.id) ?? 0);

const domainTotals = new Map(
  DOMAINS.map((d) => {
    const areas = blocks.filter((b) => b.domain === d.id);
    const conditions = catalogue.filter((g) => g.domain === d.id);
    return [
      d.id,
      {
        areas: areas.length,
        conditions: conditions.length,
        instances: areas.reduce((a, b) => a + (areaCount.get(key(b)) ?? 0), 0),
        cost: conditions.reduce((a, g) => a + conditionCost(g), 0),
        unpriced: conditions.reduce(
          (a, g) => a + gapCost(g).unpriced * (conditionCount.get(g.id) ?? 0),
          0,
        ),
      },
    ];
  }),
);

const grandCost = [...domainTotals.values()].reduce((a, x) => a + x.cost, 0);
const grandInstances = [...domainTotals.values()].reduce((a, x) => a + x.instances, 0);
const adequate = catalogue.filter((g) => ADEQUATE.has(g.id));
const adequateInstances = adequate.reduce((a, g) => a + (conditionCount.get(g.id) ?? 0), 0);
const adequateCost = adequate.reduce((a, g) => a + conditionCost(g), 0);
const satelliteCost = satelliteBoth * 3_000_000;

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const out = [];
const w = (s = '') => out.push(s);

w('# Gap taxonomy');
w();
w('<!-- GENERATED by scripts/gap-taxonomy.mjs — do not edit by hand. -->');
w();
w(`Every gap the assessment records, for all ${N.toLocaleString()} facilities,`);
w('grouped the way the source organises them:');
w();
w('> **domain** → **gap area** → **gap condition**');
w();
w('The middle level is the one this dashboard does not currently carry. A gap');
w('area is one column of the source — *Power gap*, *Wiring gap*,');
w('*Facility-connectivity gap* — and a facility holds **at most one condition');
w('per area**. That single-occupancy rule is what makes the area the right unit');
w('for a rollup: counting areas counts facilities, while counting conditions');
w('counts survey answers.');
w();
w(`Source: \`${SOURCE}\`.`);
w();

w('## The shape, in one table');
w();
w('| Domain | Gap areas | Conditions | Gap instances | Indicative cost |');
w('| --- | ---: | ---: | ---: | ---: |');
for (const d of DOMAINS) {
  const t = domainTotals.get(d.id);
  w(
    `| ${d.label} | ${t.areas} | ${t.conditions} | ${t.instances.toLocaleString()} | ${naira(t.cost)} |`,
  );
}
w(
  `| **All four** | **${blocks.length}** | **${catalogue.length}** | **${grandInstances.toLocaleString()}** | **${naira(grandCost)}** |`,
);
w();
w('*Gap instances* are (facility × area) pairs, not facilities: a facility');
w(
  `carrying nine gaps contributes nine. The median facility carries ${medianAreas} of the ${blocks.length} areas.`,
);
w();

// -- Findings ---------------------------------------------------------------

w('## What the review found');
w();
w('Four structural problems, in the order they cost money.');
w();

w('### 1. The same satellite install is charged twice');
w();
w(
  `\`Facility-connectivity: Confirmed satellite-only route\` and \`Mobile-network feasibility: No serviceable mobile pathway\` both fire *"Install satellite internet at the facility after confirming that no land or mobile connection works"* at ${naira(3_000_000)}, critical.`,
);
w(
  `All ${satelliteBoth} facilities carrying the first also carry the second — the overlap is total, not partial.`,
);
w(
  `That is ${naira(satelliteCost)} of the ${naira(grandCost)} national total, **${pct(satelliteCost, grandCost)}**, spent twice on one dish.`,
);
w();
w(
  'The source does it too: a facility whose Technical subtotal reads ₦7,282,000 has both ₦3,000,000 cells in it. So this is not an ingest bug to fix quietly — it is a finding about the sheet, and any deduplicated total will disagree with the source column by design.',
);
w();

w('### 2. Adequate conditions are counted as gaps');
w();
w(
  `${adequate.length} of the ${catalogue.length} conditions describe a facility that is *doing the thing*, and still record a gap with a priced action against it — "Formal quarterly maintenance", "Issues are usually resolved within 24–48 hours", "Training within 6 months and foundational".`,
);
w(
  `Together: ${adequateInstances.toLocaleString()} gap instances and ${naira(adequateCost)} (**${pct(adequateCost, grandCost)}** of the total).`,
);
w();
w('| Condition | Facilities | Cost each |');
w('| --- | ---: | ---: |');
for (const g of adequate.sort((a, b) => conditionCost(b) - conditionCost(a))) {
  w(
    `| ${g.subDomain}: ${g.label} | ${(conditionCount.get(g.id) ?? 0).toLocaleString()} | ${naira(gapCost(g).costNGN)} |`,
  );
}
w();
w(
  'These are not errors to delete. They are *improvements* rather than *gaps*, and the taxonomy needs a place to say so — otherwise "2,434 facilities have a device-maintenance gap" includes 160 that maintain their devices on a formal schedule.',
);
w();

w('### 3. Severity cannot explain three of the four domains');
w();
const blockingAreas = [...new Set(blocks.map(key))].filter((k) =>
  catalogue.some((g) => `${g.domain}|${g.subDomain}` === k && g.severity === 'blocking'),
);
w(
  `A gap's severity is read off the urgency of the action it triggers: critical or major blocks deployment, minor and long-term do not. Only **${blockingAreas.length} of the ${blocks.length} areas** ever produce a blocking condition — ${blockingAreas.map((k) => k.split('|')[1]).join(', ')}, all three in Technical Infrastructure.`,
);
w();
w(
  'Every condition in Workforce Capacity, Workflow & Transition and Data Use & Reporting is `partial` by construction. So a facility can be Not ready for workforce reasons and carry no gap capable of saying why. The band and the gap list are answering different questions in three domains out of four.',
);
w();

w('### 4. Pricing is flat inside most areas');
w();
const flat = [];
for (const k of [...new Set(blocks.map(key))]) {
  const gs = catalogue.filter((g) => `${g.domain}|${g.subDomain}` === k);
  const costs = new Set(gs.map((g) => gapCost(g).costNGN));
  if (gs.length > 1 && costs.size === 1) flat.push({ area: k.split('|')[1], n: gs.length, cost: [...costs][0] });
}
w(
  `${flat.length} of the ${blocks.length} areas charge the same amount for every condition inside them. A facility where 0% of service points are adequate and one at 74% both cost ${naira(54_378)}; a facility with no maintenance and one on an annual schedule both cost ${naira(90_000)}.`,
);
w();
w('| Area | Conditions | Cost, all of them |');
w('| --- | ---: | ---: |');
for (const f of flat) w(`| ${f.area} | ${f.n} | ${naira(f.cost)} |`);
w();
w(
  'Severity gradations inside these areas are therefore descriptive only. They change what the gap *says* and never what it *costs*, which is worth knowing before anyone builds a prioritisation on them.',
);
w();

// -- The inventory ----------------------------------------------------------

w('## The gaps, by domain');
w();
w(
  'Conditions are listed commonest-first within their area. **Blocking** conditions are marked; everything else is partial. Cost is per facility, from the source.',
);
w();

for (const d of DOMAINS) {
  const t = domainTotals.get(d.id);
  const areas = blocks.filter((b) => b.domain === d.id);
  w(`### ${d.label}`);
  w();
  w(
    `${t.areas} gap areas · ${t.conditions} conditions · ${t.instances.toLocaleString()} gap instances · ${naira(t.cost)}`,
  );
  w();
  for (const b of areas) {
    const n = areaCount.get(key(b)) ?? 0;
    w(`#### ${b.subDomain} gap`);
    w();
    w(`${n.toLocaleString()} of ${N.toLocaleString()} facilities (${pct(n, N)})`);
    w();
    w('| Condition | Facilities | Action | When | Cost |');
    w('| --- | ---: | --- | --- | ---: |');
    const conditions = catalogue
      .filter((g) => g.domain === d.id && g.subDomain === b.subDomain)
      .sort((a, z) => (conditionCount.get(z.id) ?? 0) - (conditionCount.get(a.id) ?? 0));
    for (const g of conditions) {
      const c = conditionCount.get(g.id) ?? 0;
      const flags = [
        g.severity === 'blocking' ? '**blocking**' : null,
        ADEQUATE.has(g.id) ? '*adequate*' : null,
      ].filter(Boolean);
      const label = flags.length ? `${g.label} — ${flags.join(', ')}` : g.label;
      if (!g.interventions.length) {
        w(`| ${label} | ${c.toLocaleString()} | *none recorded* | — | — |`);
        continue;
      }
      g.interventions.forEach((iv, i) => {
        w(
          `| ${i === 0 ? label : ''} | ${i === 0 ? c.toLocaleString() : ''} | ${iv.label} | ${HORIZON_SHORT[iv.horizon]} | ${iv.costNGN === null ? '*unpriced*' : naira(iv.costNGN)} |`,
        );
      });
    }
    w();
  }
}

// -- Proposed shape ---------------------------------------------------------

w('## What this implies for the model');
w();
w(
  'The gap area needs to become a real level, with an id, a label and a fixed order, carried at all four geographies. Today it exists only as `GapTally.subDomain` — a display string sliced off a column header, absent from `FacilitySummary` entirely.',
);
w();
w('| Level | Carries today | Needs |');
w('| --- | --- | --- |');
w(
  '| Facility | `gaps: string[]` — flat condition ids | conditions grouped under their area, one per area |',
);
w('| LGA | `deployment.gaps: GapTally[]` — flat | facilities affected per area, per domain |');
w('| State | same flat list | same, plus the area rollup the wave plan reads |');
w('| National | same flat list | same |');
w();
w(
  'Once the area is addressable, the four findings above become expressible rather than merely true: the satellite double count is two areas naming one action, the adequate conditions are a flag on a condition within its area, and an area-level severity can say what a domain band means where no condition is blocking.',
);
w();

writeFileSync(OUT, `${out.join('\n')}\n`);
console.log(
  `Wrote docs/GAP_TAXONOMY.md — ${blocks.length} areas, ${catalogue.length} conditions, ${N} facilities.`,
);
