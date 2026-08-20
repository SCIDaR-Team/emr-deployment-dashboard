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
