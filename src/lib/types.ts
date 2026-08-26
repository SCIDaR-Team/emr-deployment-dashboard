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
 * What a gap does to its domain's band.
 *
 * `blocking` puts the domain in Not ready on its own; `partial` only pulls it
 * to Moderately ready. Read off the gap's urgency rather than declared — see
 * `Horizon`.
 */
export type GapSeverity = 'blocking' | 'partial';

/**
 * When an intervention is meant to happen — the source's own four levels.
 *
 * Not the three-level scale the synthetic model used. `critical` and `major`
 * are exactly what `FacilitySummary.deploymentBand` is computed from, so
 * collapsing them would destroy the distinction the deployment reading rests
 * on. Ordered worst-first: every sort of gaps or interventions on screen uses
 * this order, so "most urgent" means one thing everywhere.
 */
export type Horizon = 'critical' | 'major' | 'minor' | 'long_term';

/** One action against one gap. */
export interface GapIntervention {
  id: string;
  label: string;
  horizon: Horizon;
  /**
   * What the action costs, or `null` where the source does not price it.
   *
   * Null and zero are different claims and both occur. Zero is real — naming a
   * staff member to lead EMR work costs nothing but attention. Null means *not
   * yet priced*: 332 facilities carry a critical connectivity blocker whose fix
   * cannot be costed until someone establishes which connection reaches the
   * site. Nothing may collapse the second into the first, or a total presented
   * as sourced will quietly absorb a blocker it does not cover.
   */
  costNGN: number | null;
}

/** One line of a rolled-up plan: an intervention, its quantity and its cost. */
export interface DeploymentLine {
  id: string;
  label: string;
  domain: GapDomainId;
  horizon: Horizon;
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
  facilityCount: number;
}

/** What it takes to deploy into a population — the whole job, not only the
 *  priced part of it. */
export interface DeploymentPlan {
  facilityCount: number;
  /** Gap *instances*, not distinct gaps: one facility with four gaps is four. */
  gapCount: number;
  costNGN: number;
  /**
   * Actions in scope that the source does not price.
   *
   * Carried beside the cost rather than folded into it, so any total covering
   * one of them can say what it excludes. Zero almost everywhere; non-zero only
   * where one of the 332 unpriced connectivity blockers is in scope.
   */
  unpricedInterventions: number;
  byHorizon: Record<Horizon, number>;
  byDomain: Record<GapDomainId, number>;
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
export type CoverageThemeId = 'technical_infrastructure' | 'workforce_capacity';

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
 * **These carry no readiness band, and never will** — not in this synthetic
 * dataset and not in the real one. They are measurements: what share of a state
 * has MTN signal, what share is on the grid, how many staff there are. A band
 * is a judgement about readiness and it is made one level up, at the domain.
 *
 * That distinction is load-bearing for the UI. Band colour — the three
 * readiness hues — must never touch a number from this object, or the page
 * starts implying that 63% MTN coverage *is* a readiness finding. It is
 * context sitting beside one.
 *
 * Nor are the domain bands derived from these figures. They arrive already
 * computed, from a model outside this dashboard, so a state can be Ready with
 * unremarkable coverage and that is a fact about the source data, not a bug
 * here. Nothing in this codebase may recompute a band from a measure.
 *
 * `null` means not measured at this level — distinct from zero.
 */
export interface CoverageMeasures {
  /** Share of the area with MTN network coverage, 0–100. */
  networkMtnPct: number | null;
  /** Share of the area with Airtel network coverage, 0–100. */
  networkAirtelPct: number | null;
  /** Share of the area connected to the national grid, 0–100. */
  gridConnectionPct: number | null;
  /** Health workforce headcount. An absolute count, not a ratio. */
  staffCount: number | null;
}

/**
 * An area's precomputed readiness, at whatever level it sits.
 *
 * Everything here arrives already classified from a model outside this
 * dashboard — that is the whole point of the type. The facility-derived fields
 * on `AreaProfile` (`archetypeDistribution`, `themeDistribution`, and the
 * `band`/`themeBands` rolled up from them) are a *different* claim: they count
 * what a survey found in the clinics. This one describes the state itself.
 *
 * They are kept apart so no page can quietly show one and imply the other. A
 * state can be Ready here while its facilities skew Not ready, and both
 * readings can be correct — they are answers to different questions.
 */
export interface CoverageProfile {
  /** Overall readiness for the area. */
  band: Band | null;
  /** Readiness per coverage domain. Never derived from `measures`. */
  themeBands: Record<CoverageThemeId, Band | null>;
  /** The sub-domain figures. Unbanded, always — see `CoverageMeasures`. */
  measures: CoverageMeasures;
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
   * Null throughout the current dataset — the assessment did not record
   * coordinates. Nullable rather than faked: `projectFacilities` drops a
   * facility without a fix, so the LGA map draws its boundary and the pane
   * lists what is inside it, and the facility stays selectable from that list.
   * An invented position presented as a surveyed one is the one error this
   * dataset cannot afford.
   */
  lat: number | null;
  lon: number | null;
  functionalityLevel: FunctionalityLevel;
  isBHCPF: boolean;

  /**
   * The two overall readings, both carried.
   *
   * `useBand` is how ready the facility is to *run* an EMR; `deploymentBand` is
   * whether anything blocks putting one in. They are different questions and
   * they disagree for 553 facilities — always in the same direction, since
   * deployment is never the worse of the two.
   *
   * Both are shown together wherever a readiness reading appears, rather than
   * one being chosen and the other hidden: the interesting fact about this
   * dataset is the *distance* between them, and distance is only visible when
   * both are on screen. 624 facilities are clear to deploy into; 71 are in
   * shape to actually run an EMR.
   */
  useBand: Band | null;
  deploymentBand: Band | null;
  /** Band per domain. All four are `readiness for EMR use` — there is no
   *  per-domain deployment reading anywhere in the source. */
  themeBands: Record<FacilityThemeId, Band | null>;

  /**
   * The gap ids this facility carries. **The reason the bands above are what
   * they are** — not a separate finding beside them.
   *
   * Every gap is in `GAP_BY_ID`, and the catalogue carries its interventions,
   * urgencies and prices — so the ids alone are enough to render the facility's
   * whole gap list. Nothing is quantity-scaled, so a gap costs the same here as
   * anywhere else it appears.
   */
  gaps: string[];
  gapCount: number;
  /** What closing them costs: the sum of `gaps`, so the figure and the list
   *  beneath it cannot disagree. */
  costNGN: number;
  /** The same total, split by domain. Matches the source's own subtotals. */
  costByDomain: Record<GapDomainId, number>;
  /** Actions this facility needs that the source does not price. Non-zero for
   *  332 facilities, all of them a critical connectivity blocker. */
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

export type InvestmentPriority = 'high' | 'medium' | 'low';

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
  priority: InvestmentPriority;
  /** Units required across the geography this item belongs to. */
  quantity: number;
  unitCostNGN: number | null;
  totalCostNGN: number | null;
  /** Facilities in scope that contributed to this line's quantity. */
  facilityCount?: number;
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
   * How this area's facilities split across the three bands, under each of the
   * two readings.
   *
   * Both, for the same reason `FacilitySummary` carries both bands: the pane
   * shows the pair rather than switching between them. All zeroes for a
   * desk-reviewed state, which has no facility rows behind it.
   *
   * The Not-ready column is identical between them — not merely equal in count
   * but the same facilities, since a critical gap sinks both readings. The
   * entire divergence sits in the other two columns.
   */
  useDistribution: BandDistribution;
  deploymentDistribution: BandDistribution;
  /** Band per domain. All four are EMR-use readings. */
  themeBands: Record<ThemeId, Band | null>;
  /**
   * How this area's facilities split across the bands *within* each domain.
   *
   * Carried alongside `themeBands` rather than derived from it, because the
   * dominant band alone flattens the finding: nationally every domain resolves
   * to Moderately ready, and five identical rows say nothing about
   * infrastructure failing three times as often as workforce. The split is what
   * separates them. All zeroes for a desk-reviewed state, which has a
   * state-level reading and no facilities under it.
   */
  themeDistribution: Record<ThemeId, BandDistribution>;
  /** The area's own overall readiness, under each reading — the dominant band
   *  of the matching distribution above. */
  useBand: Band | null;
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
  funding: ('BHCPF' | 'non-BHCPF')[];
  functionalityLevels: FunctionalityLevel[];
  /**
   * Readiness bands the Readiness control has ticked.
   *
   * Selects on the EMR-use band when no domain is ticked, and on the ticked
   * domain's band otherwise — see `facilityBandUnder`, which is the one place
   * that decision is made. There is no ambiguity at the bottom of the scale:
   * the Not-ready facilities are the same 1,340 under either overall reading.
   */
  archetypes: Band[];
  bandByTheme: Partial<Record<ThemeId, Band[]>>;
  /**
   * Which domains the Gap filter is asking about.
   *
   * Empty is the absence of a domain rather than a domain of its own, and under
   * it Gap reads the facility's overall band (`archetypes`). Name one or more
   * and Gap reads those domains' bands instead (`bandByTheme`), as one OR
   * group: two ticked domains ask for facilities carrying the gap in *either*,
   * the same way two ticked functionality levels do. See `filterFacilities`,
   * which is where that grouping is applied.
   */
  domains: FacilityThemeId[];
  /**
   * Gap ids the Gap control has ticked.
   *
   * OR within the control, like every other multi-select here: a facility
   * matches if it carries any of them. Which gaps are on *offer* is decided by
   * `domains` — that is what makes Domain and Gap one instrument rather than
   * two, the first selecting a branch of the catalogue and the second a leaf.
   */
  gaps: string[];
  search: string;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface SnapshotMeta {
  /** ISO timestamp of the run that produced public/data. */
  builtAt: string;
  /** Always "synthetic" here — see scripts/generate-dummy-data.mjs. */
  source: string;
  facilityCount: number;
  lgaCount: number;
  statesPrimary: number;
  statesSecondary: number;
}
