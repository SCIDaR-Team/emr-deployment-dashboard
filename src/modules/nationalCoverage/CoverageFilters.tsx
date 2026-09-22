import { RotateCcw } from 'lucide-react';
import { Field } from '@/components/layout/PageHeader';
import { Combobox } from '@/components/ui';
import type { AreaProfile } from '@/lib/types';

/**
 * The filter row: State, and a way back out of it.
 *
 * State is *navigation*, not filtering — picking Kano here does exactly what
 * clicking Kano on the map does, because both write the same URL. It is a
 * dropdown rather than a search box because a reader who knows which state they
 * want should not have to find it on a map, and one who does not should not have
 * to type.
 *
 * ## Two controls have come out
 *
 * There were three. LGA was the same navigation one level down, and Domain was
 * a lens that re-read every band on the page under one or more coverage
 * domains. Both are gone at the client's direction.
 *
 * Neither leaves a hole, and the LGA one has since stopped being a question at
 * all: the level itself is gone from this page, so there is nothing for a
 * dropdown to select — see `coverageScope`. The lens went further than its
 * control: with nothing able to set it, every band on this page is now the
 * area's own overall reading, which is what `bandOf` says and what the map has
 * always opened on.
 */

interface CoverageFiltersProps {
  states: AreaProfile[];
  stateId: string | null;
  onStateChange: (stateId: string | null) => void;
  /** Back to the national view — the only thing left to undo. */
  onReset: () => void;
}

const ALL = '__all__';

export function CoverageFilters({
  states,
  stateId,
  onStateChange,
  onReset,
}: CoverageFiltersProps) {
  // Reset sits immediately after the control it undoes rather than pushed to
  // the far edge, and appears only when there is something to undo. It clears
  // the path, which is the whole of this page's state.
  const active = Boolean(stateId);
  const stateOptions = [
    { value: ALL, label: 'All 37 states' },
    ...[...states]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name, hint: s.zone ?? undefined })),
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

      {active && (
        <button
          type="button"
          onClick={onReset}
          className="mono inline-flex items-center gap-1.5 self-end rounded border border-input px-2.5 py-[7px] text-tick uppercase tracking-[0.09em] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Reset
        </button>
      )}
    </>
  );
}
