import { lazy, Suspense } from 'react';

const CircuitLab = lazy(() => import('./lab/CircuitLab'));
const CircuitTest = lazy(async () => {
  await import('./styles.css');
  return import('./CircuitTest');
});

export default function App() {
  const legacy = window.location.pathname.replace(/\/$/, '') === '/circuit-test';
  return <Suspense fallback={<p>Loading workspace…</p>}>
    {legacy ? <CircuitTest /> : <CircuitLab />}
  </Suspense>;
}
