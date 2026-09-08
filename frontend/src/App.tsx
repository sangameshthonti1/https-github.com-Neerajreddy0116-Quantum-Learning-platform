import { lazy, Suspense } from 'react';
import AppShell from './app/AppShell';
import { useLocation } from './app/navigation';
import { workspaceExperiment } from './app/workspace';
import { isFoundationId } from './lesson/foundations/content';
import './app/design-system.css';
import { TutorProvider } from './tutor/TutorProvider';
import { algorithmWorkspace } from './algorithms/workspace';
import { variationalWorkspace } from './variational/workspace';
import { ActionLink } from './app/ui';

const CircuitLab = lazy(() => import('./lab/CircuitLab'));
const Challenges = lazy(() => import('./challenges/Challenges'));
const Algorithms = lazy(() => import('./algorithms/Algorithms'));
const SuperpositionLesson = lazy(() => import('./lesson/SuperpositionLesson'));
const FoundationLesson = lazy(() => import('./lesson/foundations/FoundationLesson'));
const Dashboard = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Dashboard })));
const Curriculum = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Curriculum })));
const Progress = lazy(() => import('./app/Pages').then((pages) => ({ default: pages.Progress })));
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
  const algorithm = (path === '/lab' || path === '/lab/states') ? algorithmWorkspace(url.search) ?? variationalWorkspace(url.search) : null;
  const lessonId = path.startsWith('/learn/') ? path.slice('/learn/'.length) : '';
  return <TutorProvider path={path}><AppShell path={path}><Suspense fallback={fallback}>
    {path === '/' || path === '/dashboard' ? <Dashboard />
      : path === '/learn' ? <Curriculum />
        : path === '/learn/superposition' ? <SuperpositionLesson />
          : isFoundationId(lessonId) ? <FoundationLesson key={lessonId} id={lessonId} />
          : path === '/lab' || path === '/lab/states' ? url.searchParams.has('algorithm') && !algorithm
            ? <main className="q-page"><h1>Algorithm copy unavailable</h1><p>Open the experiment and send its generated circuit to the Lab again. Your saved circuits are safe.</p><ActionLink href="/algorithms">Back to algorithms</ActionLink></main>
            : <CircuitLab key={algorithm?.workspaceKey ?? experiment ?? 'free'} experiment={algorithm ? null : experiment} algorithm={algorithm ?? undefined} initialExploring={path === '/lab/states'} />
            : path === '/progress' ? <Progress />
              : path === '/challenges' || path.startsWith('/challenges/') ? <Challenges key={path} id={path === '/challenges' ? undefined : path.slice('/challenges/'.length)} />
                : path === '/algorithms' || path.startsWith('/algorithms/') ? <Algorithms key={path} id={path === '/algorithms' ? undefined : path.slice('/algorithms/'.length)} /> : <NotFound />}
  </Suspense></AppShell></TutorProvider>;
}
