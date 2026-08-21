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
 * The five assessment domains. Unchanged from the assessment instrument.
 *
 * A, B and E are *core* — a gap in any of them cannot be offset by strength
 * elsewhere. E (Leadership & Governance) is assessed at state level only: it
 * has no section in the facility instrument, so it never appears in
 * `FacilitySummary.themeBands`.
 */
export type ThemeId =
  | 'technical_infrastructure' // A — core
  | 'workforce_capacity' // B — core
  | 'workflow_transition' // C — supporting
  | 'data_use_reporting' // D — supporting
  | 'leadership_governance'; // E — core, state level only

/** Domains carrying a band at facility level (E is excluded). */
export type FacilityThemeId = Exclude<ThemeId, 'leadership_governance'>;

/**
 * The two domains National Coverage reports on.
 *
 * The core pair, and the page is deliberately limited to them: a gap in
 * infrastructure or workforce cannot be offset by strength elsewhere, so they
 * are the two that decide whether a state can deploy at all. Workflow, Data Use
 * and Leadership describe how well a facility runs once it has, which is a
 * question for a different page.
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
  geography: 'rural' | 'urban';
  lat: number;
  lon: number;
  functionalityLevel: FunctionalityLevel;
  isBHCPF: boolean;
  /** Overall readiness band for the facility. */
  archetype: Band | null;
  /** Band per facility-level domain. */
  themeBands: Record<FacilityThemeId, Band | null>;
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

export interface DeploymentPhase {
  wave: WaveId;
  /** Programme quarter this wave opens in, e.g. "Q1 2026". */
  startQuarter: string;
  facilityCount: number;
  costNGN: number | null;
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

  /** How this area's facilities split across the three bands. All zeroes for a
   *  desk-reviewed state, which has no facility rows behind it. */
  archetypeDistribution: BandDistribution;
  /** Band per domain, including Leadership & Governance at state level. */
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
  /** The area's own overall readiness band. */
  band: Band | null;

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
  deployment: DeploymentPhase | null;
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
  archetypes: Band[];
  bandByTheme: Partial<Record<ThemeId, Band[]>>;
  /**
   * Which domain the Gap filter is asking about.
   *
   * `overall` is not a domain — it is the absence of one, and under it Gap
   * reads the facility's overall band (`archetypes`). Under a domain, Gap reads
   * that domain's band instead (`bandByTheme`). One domain at a time, because
   * two would be two questions: "facilities weak in infrastructure" and
   * "facilities weak in workforce" are different lists, and their intersection
   * is a third thing nobody asked for.
   */
  domain: FacilityThemeId | 'overall';
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
