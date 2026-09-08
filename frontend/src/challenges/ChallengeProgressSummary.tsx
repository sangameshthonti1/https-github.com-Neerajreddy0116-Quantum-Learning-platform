import { ActionLink, Badge } from '../app/ui';
import { Link } from '../app/navigation';
import { useCatalog } from './api';
import { useChallengeProgress } from './progress';
import './challenges.css';

export default function ChallengeProgressSummary({ detailed = false }: { detailed?: boolean }) {
  const { catalog, error, retry } = useCatalog();
  const progress = useChallengeProgress();
  if (!catalog) return <section className="q-record-card"><h2>Challenge progress</h2><p>{error ?? 'Loading challenge progress…'}</p>{error && <button className="q-button q-button-secondary" onClick={retry}>Retry challenges</button>}</section>;
  const completed = catalog.filter(c => progress[c.id]?.completedAt).length;
  return <section className="q-record-card challenge-progress" aria-label="Challenge progress"><div className="q-section-heading"><h2>Independent challenges</h2><Badge tone={completed ? 'success' : 'neutral'}>{completed} / {catalog.length} completed</Badge></div>
    <p>Completion follows a verified target match and satisfied constraints. Lesson activities are tracked separately.</p>
    {detailed && <ol className="challenge-records">{catalog.map(c => { const p = progress[c.id]; return <li key={c.id}><Link href={`/challenges/${c.id}`}>{c.title}</Link><span>{p?.attempts ?? 0} submissions · Best {p?.best?.score ?? 0}/100</span><Badge tone={p?.completedAt ? 'success' : 'neutral'}>{p?.completedAt ? 'Completed' : p?.attempts ? 'In progress' : 'Not attempted'}</Badge></li>; })}</ol>}
    <ActionLink href="/challenges" secondary>Explore challenges</ActionLink>
  </section>;
}
