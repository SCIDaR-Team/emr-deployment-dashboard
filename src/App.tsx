import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { DataProvider } from '@/state/DataProvider';
import { applyColorScheme, useThemeStore } from '@/store/themeStore';

const LandingPage = lazy(() => import('@/modules/landing/LandingPage'));
const NationalCoveragePage = lazy(
  () => import('@/modules/nationalCoverage/NationalCoveragePage'),
);
const AssessedStatesPage = lazy(
  () => import('@/modules/assessedStates/AssessedStatesPage'),
);
const InvestmentPlanPage = lazy(
  () => import('@/modules/investment/InvestmentPlanPage'),
);

function page(node: React.ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;
}

export default function App() {
  const scheme = useThemeStore((s) => s.scheme);

  useEffect(() => {
    applyColorScheme(scheme);
  }, [scheme]);

  return (
    <ErrorBoundary>
      {/* DataProvider sits *inside* the router so it can read the current
          location — see the note there. */}
      <BrowserRouter>
        <DataProvider>
          <Routes>
            {/*
              The landing page is deliberately outside AppShell: it is the front
              door, with no navigation rail and no filter bar. Everything past it
              lives under the shell, and National Coverage — the first stop on
              the rail — is the hinge between the two. Both directions are one
              click: the hero CTA in, the sidebar wordmark out.
            */}
            <Route path="/" element={page(<LandingPage />)} />
            <Route element={<AppShell />}>
              {/* Three levels, one page: national → state → LGA. The path is
                  the scope, so a link to any level is a link to what the reader
                  was looking at. */}
              <Route path="/states" element={page(<NationalCoveragePage />)} />
              <Route path="/states/:stateId" element={page(<NationalCoveragePage />)} />
              <Route
                path="/states/:stateId/:lgaId"
                element={page(<NationalCoveragePage />)}
              />
              <Route path="/assessment" element={page(<AssessedStatesPage />)} />
              <Route path="/assessment/:stateId" element={page(<AssessedStatesPage />)} />
              <Route
                path="/assessment/:stateId/:lgaId"
                element={page(<AssessedStatesPage />)}
              />
              <Route path="/investment" element={page(<InvestmentPlanPage />)} />
              {/* The sibling dashboard's routes, so a shared link from it lands
                  somewhere rather than nowhere. */}
              <Route path="/dashboard" element={<Navigate to="/states" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </DataProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
