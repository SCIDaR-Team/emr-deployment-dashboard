/**
 * The gap dictionary — what can be wrong with a facility, and what fixing it costs.
 *
 * This is the program's subject matter, so it is a declared table rather than
 * anything derived. A readiness band is a symptom; a *gap* is a named, countable
 * condition with an intervention behind it and a price on the intervention. The
 * whole dashboard exists to answer two questions off this table: how many, and
 * how much.
 *
 * ## Four levels
 *
 *     domain          Technical infrastructure
 *       sub-domain    Power infrastructure
 *         indicator   National grid connection
 *           gap       not connected            -> Grid connection, ₦500,000
 *
 * Every gap belongs to exactly one indicator, every indicator to one
 * sub-domain, every sub-domain to one domain. The Domain filter selects at the
 * top of that tree and the Gap filter at the bottom of it, which is what makes
 * the two controls one instrument.
 *
 * ## Where these came from
 *
 * Technical infrastructure is lifted from `Gap & targeted interventions` and
 * `Cost Assumptions_updated` in the costing workbook, which has that domain
 * properly pulled out — 16 gaps across three sub-domains, each mapped to
 * interventions on a horizon and priced.
 *
 * Workforce, workflow and data use follow the newer gap sheets, which name the
 * gaps rather than restating the questions. Leadership & governance is from the
 * workbook.
 *
 * The costs are plausible, not quoted. Every figure below is a demonstration
 * number in a synthetic dataset — see the header of `generate-dummy-data.mjs`.
 *
 * ## Two domains carry no money
 *
 * Data use & reporting and leadership & governance have real gaps that are
 * tracked, reported and closed like any other. They cost ₦0, because what
 * closes them is policy and practice rather than procurement: a memo, a
 * standard, a review meeting that starts happening. That is why the second page
 * is a *deployment* plan and not only an investment plan — an investment plan
 * has no row for work that costs nothing, and this work still has to be done.
 *
 * ## Leadership is a state, not a facility
 *
 * Its gaps attach to a state and never descend. There is no facility instrument
 * behind them and no LGA reading: a state either has a digital health strategy
 * or it does not, and every facility in it inherits that fact rather than
 * carrying its own version of it.
 */

/** Horizons, worst-first, as the workbook phases them. */
export const HORIZONS = ['immediate', 'near_term', 'long_term'];

export const HORIZON_LABEL = {
  immediate: 'Immediate',
  near_term: 'Near-term',
  long_term: 'Long-term',
};

/**
 * What a quantity is counted in.
 *
 * The reason quantity is not always 1. A facility missing sockets at three
 * service points needs three sets of sockets; a facility needing devices needs
 * them against its service points and its staff. Costing per facility when the
 * unit is per service point understates the plan by whatever the mean service
 * point count happens to be, which for this population is about four.
 */
export const UNIT_BASIS = ['per_facility', 'per_service_point', 'per_staff', 'per_device'];

/**
 * The domains, in reading order, and how they behave.
 *
 * `costed` false is not "unimportant" — see the note at the top of the file.
 * `level` says what the gap attaches to.
 */
export const GAP_DOMAINS = [
  {
    id: 'technical_infrastructure',
    label: 'Technical Infrastructure',
    level: 'facility',
    costed: true,
  },
  { id: 'workforce_capacity', label: 'Workforce Capacity', level: 'facility', costed: true },
  { id: 'workflow_transition', label: 'Workflow & Transition', level: 'facility', costed: true },
  { id: 'data_use_reporting', label: 'Data Use & Reporting', level: 'facility', costed: false },
  { id: 'leadership_governance', label: 'Leadership & Governance', level: 'state', costed: false },
];

/**
 * Every gap the dataset can produce.
 *
 * `weight` is the share of facilities carrying the gap at a state of average
 * strength, 0–1, before the per-state and urban/rural tilts in the generator.
 *
 * These are fitted, not guessed. The relative prevalences come from the costing
 * workbook's 2,696 classified facilities — grid connection is the commonest
 * infrastructure gap at 49% of them, an unserviceable inverter the rarest at
 * 0.3% — and the absolute level is solved so that the bands this table produces
 * land on the real per-domain distribution: infrastructure 12.8% Not ready,
 * workforce 64.8% Ready, and so on for all four. So the invented facilities
 * fail in the proportions the real ones do.
 *
 * `severity` is what the gap does to its domain's band — `blocking` gaps put
 * the domain in Not ready on their own, `partial` ones only pull it down to
 * Moderately ready. That is the mechanism behind the promise the program makes:
 * close every gap in a domain and the domain is Ready, necessarily, because
 * there is nothing left to hold it down.
 *
 * Note which gaps are blocking and which are not. Missing grid connection is
 * *partial*, despite being the commonest gap of all: a facility running on a
 * working solar system is not stopped by the absence of a grid it never had.
 * What stops it is having no working power at all, no internet, or no device —
 * and the fitted weights say exactly that, because a blocking gap at 49%
 * prevalence would put four fifths of the country in Not ready and the real
 * figure is an eighth.
 */
export const GAPS = [
  // -- Technical infrastructure ---------------------------------------------
  {
    id: 'grid_not_connected',
    domain: 'technical_infrastructure',
    subDomain: 'Power infrastructure',
    indicator: 'National grid connection',
    label: 'No national grid connection',
    severity: 'partial',
    weight: 0.2,
    interventions: [
      {
        id: 'grid_connection',
        label: 'Grid connection',
        horizon: 'long_term',
        unitCostNGN: 500_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'backup_partial_solar',
    domain: 'technical_infrastructure',
    subDomain: 'Power infrastructure',
    indicator: 'Backup functionality',
    label: 'Solar backup only partially functional',
    severity: 'partial',
    weight: 0.028,
    interventions: [
      {
        id: 'solar_top_up',
        label: 'Solar/battery top-up',
        horizon: 'near_term',
        unitCostNGN: 1_200_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'backup_partial_generator',
    domain: 'technical_infrastructure',
    subDomain: 'Power infrastructure',
    indicator: 'Backup functionality',
    label: 'Generator backup only partially functional',
    severity: 'partial',
    weight: 0.015,
    interventions: [
      {
        id: 'generator_repair',
        label: 'Generator repair',
        horizon: 'near_term',
        unitCostNGN: 250_000,
        unitBasis: 'per_facility',
      },
      {
        id: 'solar_pv_system',
        label: 'Solar PV battery systems',
        horizon: 'long_term',
        unitCostNGN: 3_000_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'backup_partial_inverter',
    domain: 'technical_infrastructure',
    subDomain: 'Power infrastructure',
    indicator: 'Backup functionality',
    label: 'Inverter backup only partially functional',
    severity: 'partial',
    weight: 0.001,
    interventions: [
      {
        id: 'inverter_repair',
        label: 'Inverter repair',
        horizon: 'near_term',
        unitCostNGN: 650_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'backup_none',
    domain: 'technical_infrastructure',
    subDomain: 'Power infrastructure',
    indicator: 'Backup functionality',
    label: 'No functioning backup power',
    severity: 'blocking',
    weight: 0.047,
    interventions: [
      {
        id: 'power_tank',
        label: 'Power tank',
        horizon: 'near_term',
        unitCostNGN: 380_000,
        unitBasis: 'per_facility',
      },
      {
        id: 'solar_pv_system',
        label: 'Solar PV battery systems',
        horizon: 'long_term',
        unitCostNGN: 3_000_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'wiring_inadequate',
    domain: 'technical_infrastructure',
    subDomain: 'Power infrastructure',
    indicator: 'Electrical wiring status',
    label: 'Electrical wiring absent or partially functional',
    severity: 'partial',
    weight: 0.15,
    interventions: [
      {
        id: 'basic_wiring',
        label: 'Basic wiring and sockets',
        horizon: 'immediate',
        unitCostNGN: 388_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'no_internet',
    domain: 'technical_infrastructure',
    subDomain: 'Networking and connectivity',
    indicator: 'Internet connectivity method',
    label: 'No internet connection at the facility',
    severity: 'blocking',
    weight: 0.027,
    interventions: [
      {
        id: 'local_server',
        label: 'Deploy local server within facility',
        horizon: 'immediate',
        unitCostNGN: 650_000,
        unitBasis: 'per_facility',
      },
      {
        id: 'nigcomsat',
        label: 'Nigcomsat',
        horizon: 'long_term',
        unitCostNGN: 3_000_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'internet_personal_device',
    domain: 'technical_infrastructure',
    subDomain: 'Networking and connectivity',
    indicator: 'Internet connectivity method',
    label: 'Internet only via personal hotspot or USB modem',
    severity: 'partial',
    weight: 0.274,
    interventions: [
      {
        id: 'emr_sim',
        label: 'Dedicated EMR SIM card',
        horizon: 'immediate',
        unitCostNGN: 1_000,
        unitBasis: 'per_facility',
      },
      {
        id: 'router',
        label: 'Router',
        horizon: 'long_term',
        unitCostNGN: 40_000,
        unitBasis: 'per_device',
      },
    ],
  },
  {
    id: 'internet_slow',
    domain: 'technical_infrastructure',
    subDomain: 'Networking and connectivity',
    indicator: 'Internet speed',
    label: 'Internet speed below 5 Mbps',
    severity: 'partial',
    weight: 0.114,
    interventions: [
      {
        id: 'local_server',
        label: 'Deploy local server within facility',
        horizon: 'immediate',
        unitCostNGN: 650_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'devices_none',
    domain: 'technical_infrastructure',
    subDomain: 'Digital devices',
    indicator: 'Computing devices',
    label: 'No computing device at the facility',
    severity: 'blocking',
    weight: 0.06,
    interventions: [
      {
        id: 'tablets_minimum',
        label: 'Minimum of 3 devices (tablets)',
        horizon: 'near_term',
        unitCostNGN: 700_000,
        unitBasis: 'per_facility',
      },
      {
        id: 'device_contract',
        label: 'National contract to close the device-service point gap',
        horizon: 'long_term',
        unitCostNGN: 600_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'devices_below_service_points',
    domain: 'technical_infrastructure',
    subDomain: 'Digital devices',
    indicator: 'Computing devices',
    label: 'Fewer devices than documenting service points',
    severity: 'partial',
    weight: 0.342,
    // Priced against the shortfall, not the facility — this is the gap the
    // workbook computes from service points and staff, and the one place a
    // quantity is genuinely a per-facility number rather than 1.
    interventions: [
      {
        id: 'device_contract',
        label: 'National contract to close the device-service point gap',
        horizon: 'near_term',
        unitCostNGN: 600_000,
        unitBasis: 'per_device',
      },
    ],
  },

  // -- Workforce capacity ---------------------------------------------------
  {
    id: 'digital_competency',
    domain: 'workforce_capacity',
    subDomain: 'Core workforce',
    indicator: 'Digital competency',
    label: 'Staff lack basic digital competency',
    severity: 'blocking',
    weight: 0.166,
    interventions: [
      {
        id: 'digital_literacy',
        label: 'Foundational digital literacy training through PFMOs',
        horizon: 'immediate',
        unitCostNGN: 30_000,
        unitBasis: 'per_staff',
      },
    ],
  },
  {
    id: 'focal_person',
    domain: 'workforce_capacity',
    subDomain: 'Core workforce',
    indicator: 'EMR/Data focal person',
    label: 'No EMR or data focal person',
    severity: 'partial',
    weight: 0.07,
    interventions: [
      {
        id: 'designate_focal_person',
        label: 'Designate an EMR focal person (OIC where no Health Records Officer exists)',
        horizon: 'immediate',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
      {
        id: 'recruit_hro',
        label: 'Work with the SMOH to recruit full-time health records officers',
        horizon: 'long_term',
        unitCostNGN: 1_800_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'emr_training',
    domain: 'workforce_capacity',
    subDomain: 'Workforce support',
    indicator: 'Training',
    label: 'Staff not trained on the EMR',
    severity: 'partial',
    weight: 0.109,
    interventions: [
      {
        id: 'emr_training',
        label: 'EMR training of a facility staff to be cascaded to other staff',
        horizon: 'near_term',
        unitCostNGN: 30_000,
        unitBasis: 'per_staff',
      },
      {
        id: 'refresher_modules',
        label: 'Develop EMR refresher modules via the NPHCDA e-learning platform',
        horizon: 'long_term',
        unitCostNGN: 100_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'technical_support',
    domain: 'workforce_capacity',
    subDomain: 'Workforce support',
    indicator: 'Technical support',
    label: 'No technical support route for the facility',
    severity: 'partial',
    weight: 0.062,
    interventions: [
      {
        id: 'support_desk',
        label: 'Attach the facility to the LGA technical support desk',
        horizon: 'near_term',
        unitCostNGN: 95_000,
        unitBasis: 'per_facility',
      },
    ],
  },

  // -- Workflow & transition ------------------------------------------------
  {
    id: 'duplicate_entry',
    domain: 'workflow_transition',
    subDomain: 'Workflow and service points',
    indicator: 'Duplicate entry',
    label: 'The same record is written more than once',
    severity: 'partial',
    weight: 0.421,
    interventions: [
      {
        id: 'workflow_sops',
        label: 'Develop standardized workflow SOPs',
        horizon: 'immediate',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
      {
        id: 'configure_workflows',
        label: 'Configure EMR workflows to reflect documented service point configurations',
        horizon: 'near_term',
        unitCostNGN: 120_000,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'workflow_bottleneck',
    domain: 'workflow_transition',
    subDomain: 'Workflow and service points',
    indicator: 'Workflow bottleneck',
    label: 'A service point holds up the rest of the flow',
    severity: 'partial',
    weight: 0.297,
    interventions: [
      {
        id: 'documentation_responsibilities',
        label: 'Define documentation responsibilities and configure user accounts',
        horizon: 'near_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'physical_service_point',
    domain: 'workflow_transition',
    subDomain: 'Workflow and service points',
    indicator: 'Physical service point',
    label: 'Service points lack the furniture and power to document at',
    severity: 'blocking',
    weight: 0.216,
    // The per-service-point gap. Everything here is bought per point, which is
    // why the generator has to know how many a facility has before it can cost
    // a single one of these lines.
    interventions: [
      {
        id: 'procure_desks',
        label: 'Procure desks',
        horizon: 'near_term',
        unitCostNGN: 35_000,
        unitBasis: 'per_service_point',
      },
      {
        id: 'procure_chairs',
        label: 'Procure chairs',
        horizon: 'near_term',
        unitCostNGN: 25_892,
        unitBasis: 'per_service_point',
      },
      {
        id: 'procure_sockets',
        label: 'Procure electric sockets',
        horizon: 'immediate',
        unitCostNGN: 15_000,
        unitBasis: 'per_service_point',
      },
      {
        id: 'procure_fan',
        label: 'Procure electric fan',
        horizon: 'near_term',
        unitCostNGN: 96_000,
        unitBasis: 'per_service_point',
      },
      {
        id: 'procure_lockable_door',
        label: 'Procure lockable door',
        horizon: 'long_term',
        unitCostNGN: 100_000,
        unitBasis: 'per_service_point',
      },
    ],
  },
  {
    id: 'staff_willingness',
    domain: 'workflow_transition',
    subDomain: 'Transition support',
    indicator: 'Staff willingness',
    label: 'Staff need support to move off paper',
    severity: 'partial',
    weight: 0.277,
    interventions: [
      {
        id: 'change_champions',
        label: 'Establish facility-level change champions and routine feedback',
        horizon: 'near_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'records_digitisation',
    // PROVISIONAL. The second Transition support column is cut off in the
    // source screenshot at "R…"; this is a placeholder for it, named and
    // weighted to sit sensibly beside staff willingness. Rename here and the
    // whole dataset follows.
    domain: 'workflow_transition',
    subDomain: 'Transition support',
    indicator: 'Records digitisation',
    label: 'Historical paper records still to be digitised',
    severity: 'partial',
    weight: 0.497,
    interventions: [
      {
        id: 'transition_support',
        label: 'Provide transition support including digitisation of historical records',
        horizon: 'long_term',
        unitCostNGN: 240_000,
        unitBasis: 'per_facility',
      },
    ],
  },

  // -- Data use & reporting (tracked, ₦0) -----------------------------------
  {
    id: 'routine_data_use',
    domain: 'data_use_reporting',
    subDomain: 'Data-use core',
    indicator: 'Routine data use',
    label: 'Service data is not used in routine decisions',
    severity: 'blocking',
    weight: 0.675,
    interventions: [
      {
        id: 'shared_template',
        label: 'Establish shared spreadsheet or basic template',
        horizon: 'immediate',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'data_validation',
    domain: 'data_use_reporting',
    subDomain: 'Data-use core',
    indicator: 'Data validation',
    label: 'No validation step before figures are reported',
    severity: 'partial',
    weight: 0.43,
    interventions: [
      {
        id: 'quality_checklist',
        label: 'Issue a minimum data-quality checklist',
        horizon: 'immediate',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'report_review',
    domain: 'data_use_reporting',
    subDomain: 'Reporting support',
    indicator: 'Report review',
    label: 'Reports are submitted but never discussed',
    severity: 'partial',
    weight: 0.287,
    interventions: [
      {
        id: 'report_discussion',
        label: 'Use the existing report-discussion routine as the entry point for EMR reports',
        horizon: 'near_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },

  // -- Leadership & governance (state level, ₦0) ----------------------------
  {
    id: 'no_budget_line',
    domain: 'leadership_governance',
    subDomain: 'Institutional readiness',
    indicator: 'Financing and budget commitment',
    label: 'No dedicated budget line for digital health',
    severity: 'blocking',
    weight: 0.58,
    interventions: [
      {
        id: 'budget_memo',
        label: 'Issue a memo urging states to allocate a digital health budget line',
        horizon: 'immediate',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'no_emr_oversight',
    domain: 'leadership_governance',
    subDomain: 'Institutional readiness',
    indicator: 'EMR oversight',
    label: 'No governance body with EMR oversight',
    severity: 'partial',
    weight: 0.75,
    interventions: [
      {
        id: 'expand_twg',
        label: 'Expand the mandate of existing M&E and Digital Health TWGs to include EMR',
        horizon: 'immediate',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'no_digital_strategy',
    domain: 'leadership_governance',
    subDomain: 'Digital health use',
    indicator: 'Digital health strategy',
    label: 'No digital health strategy',
    severity: 'blocking',
    weight: 0.42,
    interventions: [
      {
        id: 'digital_strategy',
        label: 'Develop a digital health strategy',
        horizon: 'near_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'no_state_engagement',
    domain: 'leadership_governance',
    subDomain: 'Digital health use',
    indicator: 'Stakeholder engagement',
    label: 'State not engaged as a co-decision-maker in EMR planning',
    severity: 'partial',
    weight: 0.67,
    interventions: [
      {
        id: 'engage_states',
        label: 'Engage states as co-decision-makers and provide backend access',
        horizon: 'near_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'no_interoperability',
    domain: 'leadership_governance',
    subDomain: 'Sustainability and scale',
    indicator: 'Interoperability',
    label: 'Existing systems are not interoperable with the EMR',
    severity: 'partial',
    weight: 0.5,
    interventions: [
      {
        id: 'interoperable_emr',
        label: 'Ensure EMRs are interoperable with other digital health systems',
        horizon: 'long_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
  {
    id: 'no_continuous_training',
    domain: 'leadership_governance',
    subDomain: 'Sustainability and scale',
    indicator: 'Capacity building',
    label: 'No route to continuous EMR training',
    severity: 'partial',
    weight: 0.83,
    interventions: [
      {
        id: 'elearning_platform',
        label: 'Leverage the national e-learning platform for continuous training',
        horizon: 'long_term',
        unitCostNGN: 0,
        unitBasis: 'per_facility',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived indexes
// ---------------------------------------------------------------------------

export const GAPS_BY_DOMAIN = Object.fromEntries(
  GAP_DOMAINS.map((d) => [d.id, GAPS.filter((g) => g.domain === d.id)]),
);

export const FACILITY_GAPS = GAPS.filter(
  (g) => GAP_DOMAINS.find((d) => d.id === g.domain).level === 'facility',
);

export const STATE_GAPS = GAPS.filter(
  (g) => GAP_DOMAINS.find((d) => d.id === g.domain).level === 'state',
);

/**
 * How many units of an intervention a facility needs.
 *
 * The whole reason `servicePoints`, `staffCount` and `deviceShortfall` are
 * generated at all. A per-facility line is one; everything else is counted
 * against something the facility actually has, and a plan that assumed 1 would
 * understate the furniture bill by a factor of about four.
 */
export function quantityFor(basis, facility) {
  switch (basis) {
    case 'per_service_point':
      return facility.servicePoints;
    case 'per_staff':
      return facility.staffCount;
    case 'per_device':
      return Math.max(1, facility.deviceShortfall);
    default:
      return 1;
  }
}

/**
 * A domain's band, from the gaps a facility carries in it.
 *
 * This is the inversion the program asked for. The old generator drew a band
 * and invented interventions to match it, which made "close these gaps and the
 * facility turns Ready" an assertion nobody could check. Here the gaps come
 * first and the band is read off them, so the claim is true by construction:
 * no gaps left means nothing left to hold the domain down.
 */
export function bandFromGaps(gaps) {
  if (!gaps.length) return 'ready';
  return gaps.some((g) => g.severity === 'blocking') ? 'not_ready' : 'moderately_ready';
}

/**
 * A facility's overall band from its domain bands. **The rule.**
 *
 * Derived from the costing workbook's 2,695 classified facilities and confirmed
 * against every one of them — see `scripts/__tests__` and the note in
 * `src/lib/archetype.ts`. Two core domains gate: either at Not ready sinks the
 * facility whatever else is true. Both at Ready lift it, unless workflow is at
 * Not ready, which vetoes.
 *
 * Data use & reporting is deliberately absent. It carries gaps and it is
 * reported, but it does not vote — including it changed nothing except to hold
 * 203 facilities out of Ready that had no funded work left to do, which is a
 * promise the program cannot keep and should not print.
 */
export function classifyFacility(themeBands) {
  const rank = { not_ready: 1, moderately_ready: 2, ready: 3 };
  const infra = rank[themeBands.technical_infrastructure];
  const workforce = rank[themeBands.workforce_capacity];
  const workflow = rank[themeBands.workflow_transition];

  if (infra === 1 || workforce === 1) return 'not_ready';
  if (infra === 3 && workforce === 3 && workflow > 1) return 'ready';
  return 'moderately_ready';
}
