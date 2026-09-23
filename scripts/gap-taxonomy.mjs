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
  conditionInRow,
  gapAreaId,
  gapValueInRow,
  interventionsCost,
  interventionsInRow,
  DOMAINS,
} from './assessment-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'List of gaps and interventions per facility.csv';
const OUT = join(ROOT, 'docs', 'GAP_TAXONOMY.md');

const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;

const HORIZON_SHORT = {
  major: 'Major',
  moderate: 'Moderate',
  minor: 'Minor',
  long_term: 'Long-term',
};

const PHASE_SHORT = { before: 'before', during: 'during', after: 'after' };

/**
 * Conditions that describe an **acceptable** state and are still recorded as
 * gaps carrying a paid intervention.
 *
 * Hand-listed because no column marks them: "Formal quarterly maintenance" and
 * "No formal maintenance arrangement" are both `Device-maintenance` values and
 * both carry a Minor urgency. Reading which is which needs the sentence,
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
const { gaps: catalogue, actions: actionTypes } = extractCatalogue(rows, blocks);
const actionById = new Map(actionTypes.map((a) => [a.id, a]));
const N = rows.length;

/**
 * A gap area's key, from either side.
 *
 * Blocks name their area with the sheet's column header; catalogue entries
 * carry the slug. Keying on the slug lets the two meet — which they did not
 * before: this generator still addressed the catalogue by `subDomain`, a field
 * renamed to `area` when the areas became addressable, and had been throwing
 * ever since.
 */
const key = (b) => `${b.domain}|${gapAreaId(b.subDomain)}`;
const gapKey = (g) => `${g.domain}|${g.area}`;
/** Facilities under each condition (unrecorded ones included), and facilities
 *  with a recorded gap in each area. */
const conditionCount = new Map();
const areaCount = new Map();
/**
 * Money, accumulated per facility rather than derived from the catalogue.
 *
 * Facilities buy different quantities — two tablets here, five there — so
 * `count × price` is not defined. Everything below sums what the rows actually
 * ask for, including the work costed under "No gap recorded", which is what
 * makes these totals agree with the dashboard's and the sheet's.
 */
const conditionCost = new Map();
const conditionUnpriced = new Map();
/** Facilities carrying both satellite conditions — see finding 1. */
let satelliteBoth = 0;

const fcBlock = blocks.find((b) => b.subDomain === 'Facility-connectivity');
const mnBlock = blocks.find((b) => b.subDomain === 'Mobile-network feasibility');

for (const row of rows) {
  for (const b of blocks) {
    const condition = conditionInRow(row, b);
    if (condition === null) continue;
    if (condition.recorded) areaCount.set(key(b), (areaCount.get(key(b)) ?? 0) + 1);
    const id = condition.id;
    conditionCount.set(id, (conditionCount.get(id) ?? 0) + 1);

    const { costNGN, unpriced } = interventionsCost(interventionsInRow(row, b));
    conditionCost.set(id, (conditionCost.get(id) ?? 0) + costNGN);
    conditionUnpriced.set(id, (conditionUnpriced.get(id) ?? 0) + unpriced);
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

const costOf = (g) => conditionCost.get(g.id) ?? 0;

const domainTotals = new Map(
  DOMAINS.map((d) => {
    const areas = blocks.filter((b) => b.domain === d.id);
    const conditions = catalogue.filter((g) => g.domain === d.id);
    return [
      d.id,
      {
        areas: areas.length,
        conditions: conditions.filter((g) => g.recorded).length,
        instances: areas.reduce((a, b) => a + (areaCount.get(key(b)) ?? 0), 0),
        cost: conditions.reduce((a, g) => a + costOf(g), 0),
        unpriced: conditions.reduce((a, g) => a + (conditionUnpriced.get(g.id) ?? 0), 0),
      },
    ];
  }),
);

const grandCost = [...domainTotals.values()].reduce((a, x) => a + x.cost, 0);
const grandInstances = [...domainTotals.values()].reduce((a, x) => a + x.instances, 0);
const grandUnpriced = [...domainTotals.values()].reduce((a, x) => a + x.unpriced, 0);
const recorded = catalogue.filter((g) => g.recorded);
const adequate = catalogue.filter((g) => ADEQUATE.has(g.id));
const adequateInstances = adequate.reduce((a, g) => a + (conditionCount.get(g.id) ?? 0), 0);
const adequateCost = adequate.reduce((a, g) => a + costOf(g), 0);

/** Areas that fund nothing at all. */
const unfundedAreas = [...new Set(blocks.map(key))].filter(
  (k) =>
    catalogue
      .filter((g) => gapKey(g) === k)
      .every((g) => costOf(g) === 0 && (conditionUnpriced.get(g.id) ?? 0) === 0),
);

/** Action types bought by the unit, with how many units and facilities. */
const unitTotals = new Map();
for (const row of rows) {
  for (const b of blocks) {
    for (const iv of interventionsInRow(row, b)) {
      if (!iv.unit) continue;
      const t = unitTotals.get(iv.id) ?? { units: 0, facilities: 0 };
      t.units += iv.quantity;
      t.facilities += 1;
      unitTotals.set(iv.id, t);
    }
  }
}

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
w('The middle level is the one that makes the list usable. A gap area is one');
w('column of the source — *Power gap*, *Wiring gap*, *Facility-connectivity');
w('gap* — and a facility holds **at most one condition per area**. That');
w('single-occupancy rule is what makes the area the right unit for a rollup:');
w('counting areas counts facilities, while counting conditions counts survey');
w('answers.');
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
  `| **All four** | **${blocks.length}** | **${recorded.length}** | **${grandInstances.toLocaleString()}** | **${naira(grandCost)}** |`,
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
w('Six things worth knowing, in the order they matter to a plan.');
w();

const areaLabelOf = (k) =>
  blocks.find((b) => key(b) === k)?.subDomain ?? k.split('|')[1];

w(`### 1. ${unfundedAreas.length} of the ${blocks.length} areas now fund nothing`);
w();
w(
  `The revised costing model prices ${blocks.length - unfundedAreas.length} of the ${blocks.length} gap areas and leaves ${unfundedAreas.length} recording a gap with no money against it — ${unfundedAreas.map(areaLabelOf).join(', ')}.`,
);
w();
w(
  `Three whole domains fall to zero this way: every condition in Workforce Capacity, Workflow & Transition and Data Use & Reporting that fires an action fires one priced ₦0 or left unpriced. The gaps are real and counted; closing them is not costed here — as shared programme work rather than a facility line, which is also what removed the satellite double count described below. All ${naira(grandCost)} is Technical Infrastructure.`,
);
w();

w('### 2. The satellite double count is gone');
w();
w(
  `\`Facility-connectivity: Confirmed satellite-only route\` and \`Mobile-network feasibility: No serviceable mobile pathway\` used to fire the same ₦3,000,000 satellite install, at the ${satelliteBoth.toLocaleString()} facilities that carry both — the overlap was total, and the money was counted twice.`,
);
w();
w(
  `Mobile-network feasibility now fires no intervention at all, so the pair costs what one dish costs. The ${satelliteBoth.toLocaleString()} facilities still carry both gaps; only the duplicate charge has gone.`,
);
w();

w('### 3. Adequate conditions are still counted as gaps');
w();
w(
  `${adequate.length} of the ${recorded.length} conditions describe a facility that is *doing the thing* and still record a gap — "Formal quarterly maintenance", "Issues are usually resolved within 24–48 hours", "Training within 6 months and foundational".`,
);
w(
  `Together: ${adequateInstances.toLocaleString()} gap instances and ${naira(adequateCost)}${grandCost ? ` (**${pct(adequateCost, grandCost)}** of the total)` : ''}.`,
);
w();
w('| Condition | Facilities | Cost |');
w('| --- | ---: | ---: |');
for (const g of adequate.sort((a, b) => costOf(b) - costOf(a))) {
  w(
    `| ${g.label} | ${(conditionCount.get(g.id) ?? 0).toLocaleString()} | ${naira(costOf(g))} |`,
  );
}
w();
w(
  'The pricing takes most of the money off these, which is the right move and not quite the whole one: they are *improvements* rather than *gaps*, and the taxonomy still has no place to say so — so a count of facilities with a device-maintenance gap includes the ones that maintain their devices on a formal schedule.',
);
w();

w('### 4. Severity reaches every domain; readiness reads one');
w();
const blockingAreas = [...new Set(blocks.map(key))].filter((k) =>
  catalogue.some((g) => gapKey(g) === k && g.recorded && g.severity === 'blocking'),
);
const techBlocking = blockingAreas.filter((k) => k.startsWith('technical_infrastructure|'));
w(
  `A gap's severity is read off the urgency of the action it triggers: Major or Moderate blocks, Minor and Long-term do not. **${blockingAreas.length} of the ${blocks.length} areas** produce a blocking condition — ${blockingAreas.map(areaLabelOf).join(', ')} — and they now span all four domains.`,
);
w();
w(
  `Readiness does not follow them. The sheet decides it from Technical Infrastructure alone, so only ${techBlocking.map(areaLabelOf).join(' and ')} can move a facility's band. A Major workforce, workflow or data-use gap is reported as that domain's highest severity and leaves readiness where it is — see data query E.`,
);
w();

w('### 5. Some actions are bought by the unit');
w();
w(
  'One cell can buy five tablets, or two desks and a fan, for one cost. The ingest splits each into unit actions — a type, a quantity and a unit price — and checks the split adds back to the cell. These are the unit-priced action types, across the dataset:',
);
w();
w('| Action | Unit | Unit cost | Units | Facilities |');
w('| --- | --- | ---: | ---: | ---: |');
for (const [id, t] of [...unitTotals.entries()].sort((a, b) => b[1].units - a[1].units)) {
  const a = actionById.get(id);
  w(
    `| ${a.label} | ${a.unit} | ${a.unitCostNGN === null ? '*unpriced*' : naira(a.unitCostNGN)} | ${t.units.toLocaleString()} | ${t.facilities.toLocaleString()} |`,
  );
}
w();
w(
  'This is why a facility is costed from its own quantities (`FacilitySummary.actions`) rather than from the catalogue. Costing a population by multiplying a count of facilities by a price would be wrong by construction.',
);
w();

w('### 6. Pricing is flat inside most areas');
w();
const flat = [];
for (const k of [...new Set(blocks.map(key))]) {
  const gs = catalogue.filter((g) => gapKey(g) === k && g.recorded);
  // What a condition's actions cost per unit, as one signature. Quantities are
  // the facility's, so a flat area is one whose conditions buy the same
  // things at the same prices.
  const signature = (g) =>
    g.actions
      .map((id) => actionById.get(id))
      .map((a) => `${a.label}@${a.unitCostNGN}`)
      .sort()
      .join('|');
  const sigs = new Set(gs.map(signature));
  const priced = gs[0]?.actions.some((id) => (actionById.get(id).unitCostNGN ?? 0) > 0);
  if (gs.length > 1 && sigs.size === 1 && priced) {
    const unit = gs[0].actions
      .map((id) => actionById.get(id))
      .reduce((sum, a) => sum + (a.unitCostNGN ?? 0), 0);
    flat.push({ area: areaLabelOf(k), n: gs.length, cost: unit });
  }
}
w(
  `${flat.length} of the ${blocks.length} areas buy the same things at the same unit prices for every condition inside them. Where quantities are per unit, what differs between two facilities is how many they need, not which condition they carry.`,
);
w();
w('| Area | Conditions | Unit prices, summed |');
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
  'Conditions are listed commonest-first within their area. **Blocking** conditions are marked; everything else is partial. Every action a condition can call for is listed with its urgency, its phase and its unit price — a facility takes the ones its own row asks for, in its own quantities, so the rows are not a sum. "No gap recorded" is the work the sheet costs where the gap column reads No gap; it is not counted as a gap.',
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
    w('| Condition | Facilities | Action | Urgency | Unit cost |');
    w('| --- | ---: | --- | --- | ---: |');
    const conditions = catalogue
      .filter((g) => g.domain === d.id && g.area === gapAreaId(b.subDomain))
      .sort((a, z) => (conditionCount.get(z.id) ?? 0) - (conditionCount.get(a.id) ?? 0));
    for (const g of conditions) {
      const c = conditionCount.get(g.id) ?? 0;
      const flags = [
        g.severity === 'blocking' ? '**blocking**' : null,
        ADEQUATE.has(g.id) ? '*adequate*' : null,
      ].filter(Boolean);
      const label = flags.length ? `${g.label} — ${flags.join(', ')}` : g.label;
      /** Every action type the condition calls for anywhere. Listed, never
       *  added — each facility takes its own. */
      const actions = g.actions.map((id) => actionById.get(id));
      if (!actions.length) {
        w(`| ${label} | ${c.toLocaleString()} | *none recorded* | — | — |`);
        continue;
      }
      actions.forEach((iv, i) => {
        w(
          `| ${i === 0 ? label : ''} | ${i === 0 ? c.toLocaleString() : ''} | ${iv.label} | ${HORIZON_SHORT[iv.horizon]}, ${PHASE_SHORT[iv.phase]} | ${iv.unitCostNGN === null ? '*unpriced*' : `${naira(iv.unitCostNGN)}${iv.unit ? ` / ${iv.unit}` : ''}`} |`,
        );
      });
    }
    w();
  }
}

// -- What is still missing --------------------------------------------------

w('## What this still implies for the model');
w();
w(
  `The gap area is now a real level — an id, a label and a fixed order, carried at all four geographies, which is what lets a reader ask *which facilities have a power problem* rather than picking through ${recorded.length} conditions. Two things below it are still unsaid.`,
);
w();
w('| | Today | Needs |');
w('| --- | --- | --- |');
w(
  '| Adequate conditions | counted as gaps, priced at ₦0 | a flag on the condition, so a facility doing the thing is not filed as a problem |',
);
w(
  '| Readiness outside infrastructure | Major gaps in three domains never move a band | a decision on whether they should (data query E) |',
);
w();

writeFileSync(OUT, `${out.join('\n')}\n`);
console.log(
  `Wrote docs/GAP_TAXONOMY.md — ${blocks.length} areas, ${recorded.length} conditions, ${N} facilities.`,
);
