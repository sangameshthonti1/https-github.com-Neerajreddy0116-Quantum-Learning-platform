import { lazy, Suspense } from 'react';
import AppShell from './app/AppShell';
import { useLocation } from './app/navigation';
import { workspaceExperiment } from './app/workspace';
import './app/design-system.css';

const CircuitLab = lazy(() => import('./lab/CircuitLab'));
const SuperpositionLesson = lazy(() => import('./lesson/SuperpositionLesson'));
const Dashboard = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Dashboard })));
const Curriculum = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Curriculum })));
const Progress = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Progress })));
const Upcoming = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Upcoming })));
const NotFound = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.NotFound })));
const CircuitTest = lazy(async () => {
  await import('./styles.css');
  return import('./CircuitTest');
});

export default function App() {
  const location = useLocation();
  const url = new URL(location, window.location.origin);
  let path = url.pathname.replace(/\/+$/, '') || '/';
  // Preserve existing lesson links/bookmarks at /?lesson=… without making / a Lab.
  if (path === '/' && url.searchParams.get('lesson') === 'superposition') path = '/lab';
  const fallback = <div className="q-loading" role="status"><span className="q-loading-mark">q</span><p>Opening your workspace…</p></div>;
  // This developer page keeps its original isolated styles and document navigation.
  if (path === '/circuit-test') return <Suspense fallback={fallback}><CircuitTest /></Suspense>;
  const experiment = workspaceExperiment(url.search);
  return <AppShell path={path}><Suspense fallback={fallback}>
    {path === '/' || path === '/dashboard' ? <Dashboard />
      : path === '/learn' ? <Curriculum />
        : path === '/learn/superposition' ? <SuperpositionLesson />
          : path === '/lab' || path === '/lab/states' ? <CircuitLab key={experiment ?? 'free'} experiment={experiment} initialExploring={path === '/lab/states'} />
            : path === '/progress' ? <Progress />
              : path === '/algorithms' || path === '/challenges' ? <Upcoming kind={path.slice(1) as 'algorithms' | 'challenges'} /> : <NotFound />}
  </Suspense></AppShell>;
}
