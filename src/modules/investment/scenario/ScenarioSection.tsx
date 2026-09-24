import { useMemo } from 'react';
import { Columns3, CopyPlus, MapPin, Square } from 'lucide-react';
import { SectionCard } from '@/components/ui';
import { facilityPaths } from '@/lib/scenarios';
import type { FacilitySummary } from '@/lib/types';
import { ASSISTANT_ENABLED } from '@/store/assistantStore';
import { ExplainFigures } from '@/modules/explain/explain';
import { CompareView } from './CompareView';
import { DescribeScenario } from './DescribeScenario';
import { scenarioExplainTables } from './explainTables';
import { Segmented } from './controls';
import { SingleView } from './SingleView';
import { StatesView } from './StatesView';
import { MAX_COMPARE, type ScenarioView } from './scenarioState';
import { useScenarioUrl } from './useScenarioUrl';

/**
 * Scenarios — choose the power and connectivity fixes to fund and a target,
 * and see which facilities it makes Ready. Read three ways:
 *
 *   Single    one scenario in full: the curve, the spending queue, where the
 *             newly Ready land, where the money sits in the whole plan
 *   Compare   up to four side by side, each with its own fixes, states and
 *             target
 *   By state  one scenario run in each state on its own, ranked — "with
 *             ₦20m, where do I get the most Ready?"
 *
 * Sized to the screen on a laptop: the body takes the height left under the
 * page header, and each view scrolls inside its own panels, so the section is
 * read whole without scrolling the page. Kept in the link (see
 * `useScenarioUrl`). Follows the State filter.
 */

const VIEWS: { id: ScenarioView; label: string; icon: React.ReactNode }[] = [
  { id: 'single', label: 'Single', icon: <Square className="h-3 w-3" aria-hidden /> },
  { id: 'compare', label: 'Compare', icon: <Columns3 className="h-3 w-3" aria-hidden /> },
  { id: 'states', label: 'By state', icon: <MapPin className="h-3 w-3" aria-hidden /> },
];

export function ScenarioSection({ facilities }: { facilities: FacilitySummary[] }) {
  const s = useScenarioUrl();
  const paths = useMemo(() => facilityPaths(facilities), [facilities]);
  const compareFull = s.compare.length >= MAX_COMPARE;

  return (
    <SectionCard
      id="scenarios"
      title="Scenarios"
      subtitle="Choose the fixes to fund and a target — money, facilities or a share Ready — and see who it makes Ready"
      bodyClassName="p-0"
      explain={`scenario-${s.view}`}
      action={
        <div className="flex items-center gap-2">
          {ASSISTANT_ENABLED && (
            <DescribeScenario
              current={{ view: s.view, single: s.single, compare: s.compare }}
              onApply={s.replaceAll}
            />
          )}
          {s.view === 'single' && (
            <button
              type="button"
              onClick={() => s.addToCompare({ ...s.single, name: s.single.name || 'Scenario' })}
              title={
                compareFull
                  ? 'Compare holds four; this replaces the oldest'
                  : 'Copy this scenario into Compare'
              }
              className="mono inline-flex items-center gap-1.5 rounded-[4px] border border-border px-2 py-1 text-tick uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <CopyPlus className="h-3 w-3" aria-hidden />
              Add to compare
            </button>
          )}
          <Segmented value={s.view} onChange={s.setView} options={VIEWS} />
        </div>
      }
    >
      <ExplainFigures
        id="scenario"
        build={() => scenarioExplainTables(s.view, paths, s.single, s.compare)}
      />
      {!facilities.length ? (
        <p className="px-4 py-6 text-prose italic text-muted-foreground">No facilities in scope.</p>
      ) : (
        <div className="lg:h-[calc(100dvh-var(--page-header-h,52px)-78px)] lg:min-h-[380px] lg:max-h-[760px]">
          {s.view === 'single' && (
            <SingleView paths={paths} spec={s.single} onChange={s.setSingle} />
          )}
          {s.view === 'compare' && (
            <CompareView
              paths={paths}
              specs={s.compare}
              onChange={s.setCompare}
              onOpen={s.openSingle}
            />
          )}
          {s.view === 'states' && (
            <StatesView
              paths={paths}
              spec={s.single}
              onChange={s.setSingle}
              onCompare={s.addToCompare}
              compareFull={compareFull}
            />
          )}
        </div>
      )}
    </SectionCard>
  );
}
