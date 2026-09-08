import { lazy, useState } from 'react';
import { ActionLink, Badge, Icon, PageHeading } from '../app/ui';
import { Link } from '../app/navigation';
import { useCatalog } from './api';
import { useChallengeProgress } from './progress';
import TargetVisual from './TargetVisual';
import './challenges.css';
const CircuitLab = lazy(() => import('../lab/CircuitLab'));

function CatalogStatus({ error, retry }: { error: string | null; retry: () => void }) {
  return <main className="q-page"><PageHeading eyebrow="INDEPENDENT PRACTICE" title="Put your intuition to the test.">Build, inspect, and verify your own quantum circuits.</PageHeading>
    {error ? <section className="challenge-service-error" role="alert"><h2>Challenges could not load</h2><p>{error}</p><button className="q-button q-button-primary" onClick={retry}>Retry loading challenges</button></section>
      : <p role="status">Loading the verified challenge catalog…</p>}</main>;
}

export default function Challenges({ id }: { id?: string }) {
  const { catalog, error, retry } = useCatalog();
  const progress = useChallengeProgress();
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  if (!catalog) return <CatalogStatus error={error} retry={retry} />;
  if (id) {
    const index = catalog.findIndex(c => c.id === id);
    const challenge = catalog[index];
    return challenge ? <CircuitLab key={id} challenge={challenge} nextChallenge={catalog[index + 1]} />
      : <main className="q-page"><PageHeading eyebrow="CHALLENGES" title="That challenge is not in this collection.">Your drafts and progress are safe.</PageHeading><ActionLink href="/challenges">Back to challenges</ActionLink></main>;
  }
  const completed = catalog.filter(c => progress[c.id]?.completedAt).length;
  const attempts = catalog.reduce((sum, c) => sum + (progress[c.id]?.attempts ?? 0), 0);
  const featured = catalog.find(c => c.id === 'bell')!;
  const shown = catalog.filter(c => filter === 'all' || (filter === 'completed' ? !!progress[c.id]?.completedAt : !progress[c.id]?.completedAt));
  return <main className="q-page challenge-catalog">
    <PageHeading eyebrow="YOUR CIRCUIT. YOUR DISCOVERY." title="Put your intuition to the test.">Eight small problems. Real quantum states. Build a circuit of your own, then let the simulator verify what you made.</PageHeading>
    <section className="challenge-featured" aria-label="Featured challenge">
      <div className="challenge-featured-copy"><span className="challenge-kicker">FEATURED CHALLENGE · TWO QUBITS</span><h2>Two qubits.<br /><em>One shared possibility.</em></h2><p>Create a Bell pair and see how a single quantum state connects two outcomes. Can you make them agree every time?</p>
        <ActionLink href={`/challenges/${featured.id}`}>{progress[featured.id]?.completedAt ? 'Revisit the Bell challenge' : 'Build a Bell state'}</ActionLink>
        <span className="challenge-feature-note">{progress[featured.id]?.completedAt ? 'Completed in this tab session' : 'Independent construction · Verified state fidelity'}</span></div>
      <div className="challenge-feature-art"><div className="challenge-orbit" aria-hidden="true"><span>|00⟩</span><i>+</i><span>|11⟩</span></div><TargetVisual challenge={featured} compact /></div>
    </section>
    <section className="challenge-session-strip" aria-label="Challenge session summary"><div><strong>{completed}<small> / {catalog.length}</small></strong><span>verified completions</span></div><div><strong>{attempts}</strong><span>submissions this session</span></div><p>Progress follows your evidence.<br /><span>Hints are free. Every circuit is yours to revise.</span></p><Link href="/progress" className="q-text-link">Your learning record <Icon name="arrow" size={16} /></Link></section>
    <div className="q-catalog-toolbar"><div className="q-segmented" role="group" aria-label="Filter challenges">
      {([['all', 'All challenges'], ['open', 'To explore'], ['completed', 'Completed']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} <span>{value === 'all' ? catalog.length : value === 'completed' ? completed : catalog.length - completed}</span></button>)}
    </div><span className="q-muted">Start anywhere. Build at your own pace.</span></div>
    <div className="challenge-grid">{shown.map(c => {
      const p = progress[c.id];
      return <article className="challenge-card" key={c.id} data-complete={!!p?.completedAt}>
        <div className="challenge-card-top"><span className="challenge-number">{String(catalog.indexOf(c) + 1).padStart(2, '0')}</span><Badge tone={p?.completedAt ? 'success' : p?.attempts ? 'blue' : 'neutral'}>{p?.completedAt ? 'Completed' : p?.attempts ? 'In progress' : 'Available'}</Badge></div>
        <p className="challenge-card-meta">{c.difficulty} · {c.startingCircuit.numQubits} qubit{c.startingCircuit.numQubits > 1 ? 's' : ''}</p><h2><Link href={`/challenges/${c.id}`}>{c.title}</Link></h2><p>{c.objective}</p><TargetVisual challenge={c} compact />
        <div className="challenge-card-bottom"><span>{p?.attempts ? `${p.attempts} submission${p.attempts === 1 ? '' : 's'} · Best ${p.best?.score ?? 0}/100` : c.criterion === 'state' ? 'Full state verification' : 'Distribution verification'}</span><Link href={`/challenges/${c.id}`} aria-label={`${p?.attempts ? 'Continue' : 'Start'} ${c.title}`}><Icon name="arrow" /></Link></div>
      </article>;
    })}</div>
    {!shown.length && <section className="challenge-empty"><h2>{filter === 'completed' ? 'Your first verified solution belongs here.' : 'You have explored every challenge.'}</h2><p>{filter === 'completed' ? 'Choose a challenge, build your circuit, and submit it for grading.' : 'Revisit a challenge to try a different construction.'}</p><button className="q-button q-button-secondary" onClick={() => setFilter('all')}>Show all challenges</button></section>}
    <footer className="q-page-footer"><span>Local Qiskit grading · No AI key needed</span><span>Session progress stays in this tab</span></footer>
  </main>;
}
