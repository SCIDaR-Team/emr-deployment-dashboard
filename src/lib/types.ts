/**
 * Domain model.
 *
 * This dashboard reports readiness as a **band and nothing else**. There is no
 * 1–5 score anywhere in the model, and no five-level maturity scale: a
 * geography or a facility is Not ready, Moderately ready or Ready, or it has
 * no reading at all (`null`).
 *
 * That is the one deliberate departure from the sibling assessment dashboard,
 * and it is load-bearing rather than cosmetic. A score invites arithmetic —
 * means, deltas, rankings by fractions of a point — and every one of those
 * operations claims a precision this dataset does not carry. Removing the
 * number removes the temptation at the type level: there is no `number` to
 * average, so nothing downstream can quietly invent one.
 *
 * Where the old model ranked by score, this one ranks by *counts* — how many
 * facilities sit in each band. Counts are the honest unit here.
 */

// ---------------------------------------------------------------------------
// Thematic hierarchy
// ---------------------------------------------------------------------------

/**
 * The four assessment domains.
 *
 * A and B are *core* — a gap in either cannot be offset by strength elsewhere.
 *
 * There is no Leadership & Governance domain. It is not assessed at facility
 * level and has no column in the source dataset, so the model does not carry
 * one. Everything here is a facility-level reading, which is why
 * `FacilityThemeId` is an alias rather than a subset: there is no longer a
 * domain to exclude.
 */
export type ThemeId =
  | 'technical_infrastructure' // A — core
  | 'workforce_capacity' // B — core
  | 'workflow_transition' // C — supporting
  | 'data_use_reporting'; // D — supporting

/** Domains carrying a band at facility level — all of them. */
export type FacilityThemeId = ThemeId;

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

/** A domain that gaps are counted under. */
export type GapDomainId = ThemeId;

/**
 * A gap area — the level between a domain and a gap.
 *
 * One per gap column in the source: `power`, `wiring`, `facility_connectivity`,
 * `device_sufficiency` and sixteen more. A facility holds **at most one
 * condition per area**, which is what makes the area the unit a filter can
 * offer and a rollup can count — counting areas counts facilities, where
 * counting conditions counts survey answers.
 *
 * A string alias rather than a union: the areas are extracted from the sheet by
 * `scripts/ingest-assessment.mjs`, so a hand-written union here would be a
 * second declaration of the same fact, free to drift from it. `GAP_AREA_BY_ID`
 * is the roster.
 */
export type GapAreaId = string;

/**
 * What a gap does to readiness.
 *
 * `blocking` gaps call for a Major or Moderate action — the two urgencies the
 * deployment band is computed from; `partial` gaps call only for Minor or
 * Long-term work. Read off the gap's urgency rather than declared — see
 * `Horizon`.
 */
export type GapSeverity = 'blocking' | 'partial';

/**
 * When an action is meant to happen — the source's four urgency levels, worst
 * first.
 *
 * `major` and `moderate` are exactly what `FacilitySummary.deploymentBand` is
 * computed from: any Major Technical Infrastructure action is Not ready, any
 * Moderate is Moderately ready. The sheet words Minor two ways — a gap to fix
 * before deployment and an action to complete during it — and both are Minor;
 * the difference is the action's `phase`, not a fifth urgency.
 */
export type Horizon = 'major' | 'moderate' | 'minor' | 'long_term';

/** When an action happens relative to go-live, from the sheet's own wording. */
export type ActionPhase = 'before' | 'during' | 'after';

/**
 * The six power and connectivity fixes the Investment Plan's scenarios fund.
 * Power and facility connectivity are the only areas whose actions decide
 * readiness, so these are the only fixes that can change it.
 */
export type ScenarioComponentId =
  | 'router'
  | 'fibrex'
  | 'solar_topup'
  | 'full_solar'
  | 'network_extension'
  | 'satellite';

/**
 * A domain's highest gap severity at one facility — the sheet's own column,
 * and the only per-domain reading it carries.
 *
 * Not a readiness band. The source classifies readiness once, overall; it
 * reports each domain as the worst gap in it. `none` is a domain with no gap.
 */
export type DomainSeverity = 'none' | 'minor' | 'moderate' | 'major';

/** One line of a rolled-up plan: an action type, how many, and what it costs. */
export interface DeploymentLine {
  id: string;
  label: string;
  domain: GapDomainId;
  horizon: Horizon;
  phase: ActionPhase;
  /** What one unit is — "tablet", "desk" — or null where the action is one per
   *  facility, in which case `quantity` equals `facilityCount`. */
  unit: string | null;
  unitCostNGN: number | null;
  quantity: number;
  facilityCount: number;
  totalCostNGN: number;
  /** False where the source carries no price for this action. `totalCostNGN` is
   *  then zero because nothing could be added to it — not because the work is
   *  free. */
  priced: boolean;
}

/** One gap, and how much of the population carries it. */
export interface GapTally {
  id: string;
  domain: GapDomainId;
  /** The sub-domain the gap sits under, e.g. "Power". The source has no level
   *  between this and the gap itself. */
  subDomain: string;
  label: string;
  severity: GapSeverity;
  /** False for an area's "No gap recorded" condition — costed, not counted. */
  recorded: boolean;
  facilityCount: number;
}

/** What it takes to deploy into a population — the whole job, not only the
 *  priced part of it. */
export interface DeploymentPlan {
  facilityCount: number;
  /** Recorded gap *instances*, not distinct gaps: one facility with four gaps
   *  is four. */
  gapCount: number;
  costNGN: number;
  /**
   * Actions in scope that the source does not price.
   *
   * Carried beside the cost rather than folded into it, so any total covering
   * one of them can say what it excludes: routine device maintenance, naming
   * an EMR focal person, and the lockable-door checks the sheet leaves
   * "before costing".
   */
  unpricedInterventions: number;
  /**
   * What the plan costs, split by urgency and by domain. **Naira, not counts.**
   *
   * Named for the unit because the earlier `byHorizon`/`byDomain` were not, and
   * a bare `number` beside `gapCount` — which *is* a count — reads as one too.
   * Both split the same `costNGN` above, so either one sums to it.
   */
  costByHorizon: Record<Horizon, number>;
  costByPhase: Record<ActionPhase, number>;
  costByDomain: Record<GapDomainId, number>;
  gaps: GapTally[];
  lines: DeploymentLine[];
}

/**
 * The two domains National Coverage reports on.
 *
 * The core pair, and the page is deliberately limited to them: a gap in
 * infrastructure or workforce cannot be offset by strength elsewhere, so they
 * are the two that decide whether a state can deploy at all. Workflow and Data
 * Use describe how well a facility runs once it has, which is a question for a
 * different page.
 */
export type CoverageThemeId =
  | 'technical_infrastructure'
  | 'workforce_capacity'
  | 'leadership_governance';

/**
 * Leadership & Governance — the one coverage domain that is *not* a facility
 * domain.
 *
 * It is deliberately absent from `ThemeId`. The facility survey has no
 * leadership column and never will: a clinic cannot be asked whether its state
 * has a digital health strategy. This is a state-level judgement from a
 * state-level source, which is exactly why it belongs on National Coverage and
 * nowhere on Assessed States.
 *
 * That asymmetry is the reason `CoverageThemeId` is no longer a subset of
 * `ThemeId`, and the reason the shared Domain filter now carries `DomainId`
 * below rather than `ThemeId`.
 */
export type LeadershipThemeId = 'leadership_governance';

/**
 * Every id the Domain control can hold — the four facility domains plus
 * Leadership.
 *
 * The control is shared between Assessed States and National Coverage, and the
 * two pages have readings for overlapping but different sets. Rather than give
 * them separate controls (and separate URLs, and a selection that vanishes when
 * you move between them), the *store* holds the union and each page narrows to
 * what it can actually paint: `coverageLens` on one side, `facilityLens` on the
 * other. Anything a page has no reading for drops out at its own boundary
 * rather than arriving at a map as an unknown key.
 */
export type DomainId = ThemeId | LeadershipThemeId;

// ---------------------------------------------------------------------------
// Readiness bands
// ---------------------------------------------------------------------------

/**
 * The three readiness bands — the only measure in the model.
 *
 * `null` is a fourth state and must stay visually distinct from `not_ready`
 * everywhere: "we did not measure this" is not "this failed".
 */
export type Band = 'not_ready' | 'moderately_ready' | 'ready';

/** Counts of facilities per band. Sums to the facilities carrying a band —
 *  which is at most `facilityCount`, never more. */
export type BandDistribution = Record<Band, number>;

// ---------------------------------------------------------------------------
// Sub-domain measures
// ---------------------------------------------------------------------------

/**
 * The figures reported beneath the two coverage domains.
 *
 * **These carry no readiness band, and never will.** They are measurements:
 * what share of a state's population has power, how many subscriptions it holds
 * per head. A band is a judgement about readiness and it is made one level up,
 * at the domain.
 *
 * That distinction is load-bearing for the UI. Band colour — the three
 * readiness hues — must never touch a number from this object, or the page
 * starts implying that a 45% electricity rate *is* a readiness finding. It is
 * context sitting beside one.
 *
 * Nor are the domain bands derived from these figures. They arrive already
 * computed, from a model outside this dashboard, so a state can be Ready with
 * unremarkable coverage and that is a fact about the source data, not a bug
 * here. Nothing in this codebase may recompute a band from a measure.
 *
 * MTN, Airtel and grid connection used to sit here, from the facility survey.
 * Airtel and grid were blank in every row of that source, and MTN
 * serviceability is a clinic-level finding on 12 states rather than a statement
 * about the state itself — the wrong claim for this page. All three are gone;
 * the per-facility `mtnServiceability` they were rolled up from is untouched
 * and still reported on Assessed States.
 *
 * The two national rates come from a second source entirely — the coverage
 * workbook, which reports published statistics per state rather than anything
 * observed in a clinic. They are set on all 37 states and on the national
 * profile, and stay null below the state, because the workbook has no LGA rows.
 *
 * Neither national figure is an average of the states, and that is deliberate.
 * `internetSubscriptionPct` is subscriptions over population at both levels —
 * summed, not averaged, which needs no weighting decision and lands 1.6 points
 * away from a plain mean. `electricityAccessPct` is the survey's own published
 * national rate: only the rate is given per state, never a numerator, so
 * nothing can be rebuilt from the column, and re-aggregating it would
 * contradict the source by nearly seven points. See `build-coverage.mjs`.
 */
export interface CoverageMeasures {
  /** Health workforce headcount. An absolute count, not a ratio. */
  staffCount: number | null;
  /** Share of the state's population with access to electricity, 0–100. */
  electricityAccessPct: number | null;
  /**
   * Active internet subscriptions as a share of population, 0–100.
   *
   * **Legitimately exceeds 100.** Subscriptions are counted per SIM and people
   * hold more than one, so Ogun reads 120.5%. Anything rendering this must not
   * clamp it to a 0–100 bar or treat it as a share of people online.
   */
  internetSubscriptionPct: number | null;
}

/**
 * An area's precomputed readiness, at whatever level it sits.
 *
 * Everything here arrives already classified from a model outside this
 * dashboard — that is the whole point of the type. The facility-derived fields
 * on `AreaProfile` (`deploymentDistribution`, `severityDistribution`, and the
 * `deploymentBand` rolled up from them) are a *different* claim: they count
 * what a survey found in the clinics. This one describes the state itself.
 *
 * They are kept apart so no page can quietly show one and imply the other. A
 * state can be Ready here while its facilities skew Not ready, and both
 * readings can be correct — they are answers to different questions.
 */
export interface CoverageProfile {
  /**
   * The state's maturity, from the State Maturity sheet — Mature / Moderately
   * mature / Not mature written as ready / moderately_ready / not_ready, and
   * labelled with `MATURITY_LABEL` wherever it is shown. Null on the six
   * states the sheet has not assessed, on every LGA and on the nation.
   */
  band: Band | null;
  /** Readiness per coverage domain. Never derived from `measures`. */
  themeBands: Record<CoverageThemeId, Band | null>;
  /** The sub-domain figures. Unbanded, always — see `CoverageMeasures`. */
  measures: CoverageMeasures;
  /** The subscription counts behind `internetSubscriptionPct`, where the source
   *  has them. Null on every area it does not — see `InternetSubscriptions`. */
  internet: InternetSubscriptions | null;
  /** A band per leadership sub-domain. Null wherever the maturity band is
   *  null — see `LeadershipBands`. */
  leadership: LeadershipBands | null;
}

// ---------------------------------------------------------------------------
// Leadership & Governance
// ---------------------------------------------------------------------------

/** The four governance items the State Maturity sheet scores a state on. */
export type LeadershipSubDomainId =
  | 'governance_structure'
  | 'data_governance_policy'
  | 'digital_health_strategy'
  | 'financial_commitment';



/**
 * A readiness band per leadership sub-domain — **the one place in this model
 * where a sub-domain carries a band**, and the exception is the source's own.
 *
 * ## Why this is not the violation it looks like
 *
 * `CoverageMeasures` states the rule these break: a sub-domain reports figures,
 * a band is a judgement made one level up, and band colour must never touch a
 * measure. That rule holds for electricity access and staff headcount, which
 * are *measurements* — 45% is a quantity, and calling it Not ready would be
 * inventing a threshold the source never set.
 *
 * These are not measurements. The State Maturity sheet scores each answer Yes
 * 5 / Partial 3 / No 1 and bands a state by cutting the mean of its six items
 * at >= 4 and >= 3 — on that same 1-5 scale. So a single answer put through the
 * sheet's own cut points lands exactly on a band name:
 *
 *     Yes -> 5 -> Ready     Partial -> 3 -> Moderately ready     No -> 1 -> Not ready
 *
 * The band is therefore the source's own classification of that sub-domain, not
 * a reading this codebase has invented, and `build-maturity.mjs` derives it
 * by calling the sheet's banding function rather than by writing a table. The
 * Yes/Partial/No wording is dropped entirely: carrying both would leave the
 * reader wondering which is authoritative, and the page can now speak one
 * vocabulary from the map down to the last row.
 *
 * ## The four do not roll up to the state's band
 *
 * The state's maturity band is the *average* of these four and the two access
 * scores, which is neither of this codebase's rollup rules: Rivers is Mature
 * with a No on its data governance policy. That is a finding, not a
 * contradiction — a state can be mature overall and still be missing the
 * policy that governs the record. Nothing may rebuild the state band from
 * these.
 *
 * ## Still no score
 *
 * The mean the workbook bands is checked in the build script and dropped there.
 * "Bands, not scores" is a type-level invariant — there is no `number` in
 * `AreaProfile` to average — so nothing downstream can rank states by 2.67
 * against 2.33, a distance six answers cannot support.
 *
 * Null on every area with no reading: the six unscored states, every LGA, and
 * the nation. Null is *not measured*, which is not Not ready.
 */
export type LeadershipBands = Record<LeadershipSubDomainId, Band>;

/**
 * The eleven operators the coverage workbook counts subscriptions for, grouped
 * by access technology.
 *
 * `mobile` carries 99.8% of all subscriptions in the current data; `fixed`
 * (0.02%) and `wifi` (0.15%) are rounding error beside it. Both are kept
 * anyway, because "fixed broadband is almost nonexistent" is a finding about
 * deploying an EMR, not noise to tidy away.
 */
export type InternetProviderGroup = 'mobile' | 'fixed' | 'wifi';

export type InternetProviderId =
  | 'mtn'
  | 'glo'
  | 'airtel'
  | 'emts'
  | 'ipnx'
  | 'mtnFixed'
  | 'inq'
  | 'century21'
  | 'smile'
  | 'ntel'
  | 'isp';

/**
 * The arithmetic behind an area's internet subscription rate.
 *
 * `total / population` *is* `internetSubscriptionPct`, and the ingest checks
 * that in every row — which is what lets the national figure be the same
 * division done on the totals rather than an average of 37 rates.
 *
 * Set on the 37 states and on the national profile, and null everywhere else:
 * the workbook has no rows below a state, and a null here means the counts are
 * unknown, not that nobody subscribes.
 *
 * **A null in `byProvider` is "not measured", never zero.** Four of the eleven
 * operators are blank in every row of the source, and printing 0 for ipNX would
 * assert something the sheet does not say. Anything rendering these must keep
 * the two apart.
 */
export interface InternetSubscriptions {
  /** NBS 2025 population projection — the rate's denominator. */
  population: number;
  /** Active subscriptions, all operators. Sums `byProvider`, treating null as
   *  absent rather than as zero. */
  total: number;
  byProvider: Record<InternetProviderId, number | null>;
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export type GeoLevel = 'national' | 'state' | 'lga';

/**
 * Whether a geography's findings rest on primary facility assessment or on
 * secondary desk review. 12 states were physically visited; the remaining 24
 * plus the FCT were reviewed from secondary sources. The two must never render
 * in the same visual language — a desk-reviewed state carries a state-level
 * band and no facility counts behind it.
 */
export type EvidenceGrade = 'primary' | 'secondary';

export type FunctionalityLevel =
  | 'Functional L1'
  | 'Functional L2'
  | 'Partially Functional';

// ---------------------------------------------------------------------------
// Facility
// ---------------------------------------------------------------------------

/**
 * One facility row. There is no fuller `Facility` record in this dashboard —
 * no facility scorecard page exists, so nothing needs service points,
 * indicators or per-question responses.
 */
export interface FacilitySummary {
  uuid: string;
  name: string;
  state: string;
  stateId: string;
  lga: string;
  lgaId: string;
  zone: string;
  /**
   * The surveyed position, where there is one.
   *
   * Present for 2,804 of 2,806, from the ERA workbook — the survey took a GPS
   * fix at every facility, and the earlier export simply lost the latitude
   * column. The two without one are the facilities that could not be matched to
   * that workbook at all.
   *
   * Nullable rather than faked: `projectFacilities` drops a facility without a
   * fix, so the LGA map draws its boundary and the pane lists what is inside
   * it, and the facility stays selectable from that list. An invented position
   * presented as a surveyed one is the one error this dataset cannot afford.
   */
  lat: number | null;
  lon: number | null;
  functionalityLevel: FunctionalityLevel;
  isBHCPF: boolean;
  /**
   * Rural or urban, from the raw ODK export rather than the gaps CSV.
   *
   * Null where the facility could not be matched to that export. Nullable
   * rather than defaulted, because "rural" is the overwhelming majority here
   * (2,205 of 2,806) and a default would be invisible: every unmatched facility
   * would read as the common case and nothing on screen would say otherwise.
   */
  geography: 'rural' | 'urban' | null;

  /**
   * The facility's overall readiness — whether anything blocks putting an EMR
   * in, and the only overall reading this dataset carries.
   *
   * An earlier revision reported every facility twice, adding readiness to
   * *run* an EMR beside readiness to deploy one, and the dashboard showed the
   * pair because the distance between them was the finding. The revised costing
   * model withdrew that column and brought this one onto the same definition as
   * the technical infrastructure reading, so there is one number here now.
   *
   * It is a function of the Technical Infrastructure actions, exactly: any
   * Major is Not ready, any Moderate Moderately ready, neither is Ready. Gaps
   * in the other three domains do not enter it. The ingest checks that against
   * the sheet in all 2,806 rows.
   */
  deploymentBand: Band | null;
  /** Each domain's highest gap severity. Not a band — see `DomainSeverity`. */
  domainSeverity: Record<FacilityThemeId, DomainSeverity>;

  /**
   * The gap ids this facility carries. **The reason the bands above are what
   * they are** — not a separate finding beside them.
   *
   * Every gap is in `GAP_BY_ID`, and the catalogue carries the action types
   * it can call for — so the ids, with `actions` beside them, are enough to
   * render the facility's whole gap list. Includes an area's "No gap recorded"
   * condition where the sheet costs work without a gap; see `GapDef.recorded`.
   */
  gaps: string[];
  /**
   * Action type id → how many this facility needs.
   *
   * Quantities differ facility to facility — two tablets here, five there, three
   * desks and a fan somewhere else — so they live on the facility and the unit
   * prices live in the catalogue. `facilityGapActions` joins the two; use it
   * wherever the subject is a facility.
   */
  actions: Record<string, number>;
  /** Recorded gaps — the "No gap recorded" conditions are not counted. */
  gapCount: number;
  /** What closing them costs: the sum of `actions`, so the figure and the list
   *  beneath it cannot disagree. */
  costNGN: number;
  /** The same total, split by domain. Matches the source's own subtotals. */
  costByDomain: Record<GapDomainId, number>;
  /** Actions this facility needs that the source does not price. */
  unpricedInterventions: number;

  /** Banded, as the source collects it: `<10`, `11-30`, `31-50`, `>50`. */
  dailyClientLoad: string | null;

  /**
   * Mobile-network measurement.
   *
   * Measurements, not judgements — band colour must never touch them. Airtel
   * carries only a distance: its serviceability and site-name columns are empty
   * in every row of the source, so the feasibility reading behind 731 satellite
   * interventions rests on MTN alone.
   */
  mtnBaseStation: string | null;
  mtnDistanceKm: number | null;
  mtnServiceability: string | null;
  mtn4gSignal: string | null;
  airtelDistanceM: number | null;
}

// ---------------------------------------------------------------------------
// Deployment and investment
// ---------------------------------------------------------------------------

export type InvestmentCategory =
  | 'infrastructure'
  | 'workforce'
  | 'workflow'
  | 'data_use';

export interface InvestmentItem {
  id: string;
  /** Action-phrased, e.g. "Install inverter or solar backup power system". */
  label: string;
  themeId: ThemeId;
  category: InvestmentCategory;
  /**
   * How urgent the source says the action is — the sheet's four levels, carried
   * through rather than reduced. Major and Moderate are the two the deployment
   * band is computed from.
   */
  horizon: Horizon;
  /** Before, during or after go-live, from the same cell's wording. */
  phase: ActionPhase;
  /** Units required across the geography this item belongs to — tablets,
   *  desks, socket points — or facilities where `unit` is null. */
  quantity: number;
  /** What one unit is, or null where the action is one per facility. */
  unit: string | null;
  unitCostNGN: number | null;
  totalCostNGN: number | null;
  /** Facilities in scope that need this action. */
  facilityCount: number;
}

/** Which rollout wave a geography falls into. Waves are ordered; wave 1 goes
 *  first. */
export type WaveId = 1 | 2 | 3;

export interface DeploymentPhase extends DeploymentPlan {
  wave: WaveId;
  /** Programme quarter this wave opens in, e.g. "Q1 2026". */
  startQuarter: string;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export interface AreaProfile {
  id: string;
  level: GeoLevel;
  name: string;
  parentId: string | null;
  /**
   * Geopolitical zone. Set on every state, assessed or not — National Coverage
   * filters all 37 by zone. Null at LGA and national level, which have no zone
   * of their own.
   */
  zone?: string | null;
  evidenceGrade: EvidenceGrade;

  facilityCount: number;
  lgaCount?: number;
  /** LGAs the survey actually reached, of `lgaCount` that exist. The two differ
   *  wherever an assessed state has LGAs with no surveyed facility in them. */
  assessedLgaCount?: number;

  /**
   * How this area's facilities split across the three bands.
   *
   * All zeroes for a desk-reviewed state, which has no facility rows behind it.
   */
  deploymentDistribution: BandDistribution;
  /**
   * How this area's facilities split across each domain's highest gap
   * severity. A count per severity, never rolled up into a band — the source
   * reports domains as severities and classifies readiness only overall. All
   * zeroes for a desk-reviewed state.
   */
  severityDistribution: Record<ThemeId, Record<DomainSeverity, number>>;
  /** The area's own overall readiness — the dominant band of the distribution
   *  above. */
  deploymentBand: Band | null;

  /**
   * The precomputed readiness layer — National Coverage reads this and nothing
   * else on this interface.
   *
   * Held apart from the facility-derived fields above rather than merged into
   * them, because the two are different claims arrived at different ways and
   * merging them would let a page show one while implying the other. See
   * `CoverageProfile`.
   */
  coverage: CoverageProfile;

  investments: InvestmentItem[];
  /**
   * What deploying into this area takes. Present at every level now — an LGA
   * and the nation carry a plan the same way a state does; only a state adds a
   * wave, a start quarter and its own governance gaps.
   */
  deployment: (DeploymentPlan & Partial<DeploymentPhase>) | null;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface FilterState {
  states: string[];
  lgas: string[];
  zones: string[];
  geography: ('rural' | 'urban')[];
  funding: ('BHCPF' | 'non-BHCPF')[];
  functionalityLevels: FunctionalityLevel[];
  /**
   * Readiness bands the Readiness control has ticked — always the facility's
   * overall band, the only readiness reading the source carries. See
   * `facilityBandUnder`.
   */
  archetypes: Band[];
  /** The Domain control's selection. Holds `DomainId`, not `ThemeId`: the
   *  control is shared with National Coverage, which offers Leadership &
   *  Governance. Each page narrows this to what it can read — see `DomainId`. */
  domains: DomainId[];
  /**
   * Gap area ids the Gap area control has ticked.
   *
   * OR within the control, like every other multi-select here: a facility
   * matches if it carries a gap in any of them. Which areas are on *offer* is
   * decided by `domains` — the same relationship State has with LGA, and what
   * makes Domain and Gap area one instrument rather than two.
   *
   * Areas rather than the 73 individual conditions, which is what this used to
   * hold. A planner asks "which facilities have a power problem", not "which
   * facilities recorded *best usable source provides 5–8 hours/day*"; the flat
   * list of conditions could only answer the second, and answered it three
   * ways at once because Power has three of them.
   */
  gapAreas: string[];
  search: string;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface SnapshotMeta {
  /** ISO timestamp of the run that produced public/data. */
  builtAt: string;
  /** The dataset behind the figures — see scripts/ingest-assessment.mjs. */
  source: string;
  /** The published sheet the ingest read, where it read one. */
  sourceUrl?: string | null;
  /**
   * Hash of the source CSV the figures were built from.
   *
   * What makes a screenshot checkable a year later: two dashboards showing
   * different numbers are either different data or a different build, and this
   * says which.
   */
  contentHash?: string;
  facilityCount: number;
  /** LGAs the survey reached — not the number that exist. */
  lgaCount: number;
  statesPrimary: number;
  statesSecondary: number;
}
