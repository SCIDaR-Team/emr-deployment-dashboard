import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PAGE_GUIDES } from '@/content/pageGuides';
import { FilterBar } from '@/components/filters/FilterBar';
import { LoadError } from '@/components/ui';
import { useDataContext } from '@/state/dataContext';
import { useFilterStore } from '@/store/filterStore';
import { ExplainScope } from '@/modules/explain/context';
import { ScenarioSection } from './ScenarioSection';

/**
 * Scenarios — what a given amount of funding would make Ready.
 *
 * This was a section of the Investment Plan, the third of four. It is a page
 * of its own because it is a different kind of thing from its old neighbours:
 * they itemise a plan that is fixed by what the assessment found, and this is
 * a tool the reader drives — choose fixes, set a target, compare. Sat between
 * Costed interventions and Rollout waves, it made the plan page long and read
 * as one more table to scroll past; here it has the screen to itself.
 *
 * The builder is sized to that screen (see `ScenarioSection`), so the page is
 * one card and nothing else. Links into it from before the move —
 * `/investment?sv=…#scenarios` — are forwarded by the Investment Plan.
 */
export default function ScenariosPage() {
  const { facilities } = useDataContext();
  const selectedStates = useFilterStore((s) => s.states);

  const scopeName = selectedStates.length ? selectedStates.join(', ') : 'All 12 assessed states';

  /** Where the reader is, for "Explain". */
  const explainScope = useMemo(() => [`Area: ${scopeName}`], [scopeName]);

  /** The facilities the scenarios run over: the selected states, or all. */
  const scopedFacilities = useMemo(
    () =>
      selectedStates.length
        ? facilities.data.filter((f) => selectedStates.includes(f.state))
        : facilities.data,
    [facilities.data, selectedStates],
  );

  // The builder runs on the facilities alone; the states are only the filter's.
  if (facilities.error) {
    return (
      <LoadError what="the scenario data" error={facilities.error} onRetry={facilities.refetch} />
    );
  }

  return (
    <>
      <PageHeader title="Investment Scenario Planner" guide={PAGE_GUIDES.scenarios} subtitle={scopeName}>
        <FilterBar facilities={facilities.data} show={['state']} />
      </PageHeader>

      <ExplainScope value={explainScope}>
        <div className="p-4 sm:p-5">
          <ScenarioSection facilities={scopedFacilities} />
        </div>
      </ExplainScope>
    </>
  );
}
