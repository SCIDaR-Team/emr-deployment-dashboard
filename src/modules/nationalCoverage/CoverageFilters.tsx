import { RotateCcw } from 'lucide-react';
import { Field } from '@/components/layout/PageHeader';
import { Combobox } from '@/components/ui';
import { COVERAGE_THEMES } from '@/lib/themes';
import type { AreaProfile } from '@/lib/types';
import type { DomainLens } from './coverageScope';

/**
 * The filter row: State, LGA, Domain.
 *
 * State and LGA are *navigation*, not filtering — picking Kano here does
 * exactly what clicking Kano on the map does, because both write the same URL.
 * They are dropdowns rather than a search box because a reader who knows which
 * state they want should not have to find it on a map, and one who does not
 * should not have to type.
 *
 * Domain is the lens. It is deliberately not a multi-select: two domains at
 * once would need two colours on one polygon, and the page's whole grammar is
 * that a fill is a band.
 */

interface CoverageFiltersProps {
  states: AreaProfile[];
  lgas: AreaProfile[];
  stateId: string | null;
  lgaId: string | null;
  lens: DomainLens;
  onStateChange: (stateId: string | null) => void;
  onLgaChange: (lgaId: string | null) => void;
  onLensChange: (lens: DomainLens) => void;
  /** Back to the national view under the overall lens — scope and lens both. */
  onReset: () => void;
}

const ALL = '__all__';

export function CoverageFilters({
  states,
  lgas,
  stateId,
  lgaId,
  lens,
  onStateChange,
  onLgaChange,
  onLensChange,
  onReset,
}: CoverageFiltersProps) {
  // Reset clears scope *and* lens, because on this page they are one setting in
  // the reader's head: "what am I looking at". It sits immediately after the
  // last filter rather than pushed to the far edge — a control that undoes the
  // three controls beside it belongs with them, not across the page from them —
  // and appears only when there is something to undo.
  const active = Boolean(stateId || lgaId || lens !== 'overall');
  const stateOptions = [
    { value: ALL, label: 'All 37 states' },
    ...[...states]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name, hint: s.zone ?? undefined })),
  ];

  const stateLgas = stateId ? lgas.filter((l) => l.parentId === stateId) : [];
  const lgaOptions = [
    { value: ALL, label: stateId ? `All ${stateLgas.length} LGAs` : 'All LGAs' },
    ...[...stateLgas]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: l.id.split('.')[1] ?? l.id, label: l.name })),
  ];

  return (
    <>
      <Field label="State">
        <Combobox
          value={stateId ?? ALL}
          onChange={(value) => onStateChange(value === ALL ? null : value)}
          options={stateOptions}
          className="w-[190px]"
          searchPlaceholder="Search states…"
        />
      </Field>

      <Field label="LGA">
        <Combobox
          value={lgaId ?? ALL}
          onChange={(value) => onLgaChange(value === ALL ? null : value)}
          options={lgaOptions}
          // Nothing to choose between until a state is picked, and an LGA list
          // of all 774 would be a worse instrument than the map.
          disabled={!stateId}
          className="w-[190px]"
          searchPlaceholder="Search LGAs…"
        />
      </Field>

      <Field label="Domain">
        <Combobox
          value={lens}
          onChange={(value) => onLensChange(value as DomainLens)}
          options={[
            { value: 'overall', label: 'Overall readiness' },
            ...COVERAGE_THEMES.map((t) => ({ value: t.id, label: t.label })),
          ]}
          className="w-[210px]"
        />
      </Field>

      {active && (
        <button
          type="button"
          onClick={onReset}
          className="mono inline-flex items-center gap-1.5 self-end rounded border border-input px-2.5 py-[7px] text-[10px] uppercase tracking-[0.09em] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Reset
        </button>
      )}
    </>
  );
}
