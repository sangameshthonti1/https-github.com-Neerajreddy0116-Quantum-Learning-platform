import { lazy, Suspense } from 'react';

const CircuitLab = lazy(() => import('./lab/CircuitLab'));
const SuperpositionLesson = lazy(() => import('./lesson/SuperpositionLesson'));
const CircuitTest = lazy(async () => {
  await import('./styles.css');
  return import('./CircuitTest');
});

export default function App() {
  const legacy = window.location.pathname.replace(/\/$/, '') === '/circuit-test';
  const lesson = window.location.pathname.replace(/\/$/, '') === '/learn/superposition';
  return <Suspense fallback={<p>Loading workspace…</p>}>
    {legacy ? <CircuitTest /> : lesson ? <SuperpositionLesson /> : <CircuitLab />}
  </Suspense>;
}
