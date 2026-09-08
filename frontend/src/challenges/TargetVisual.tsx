import type { Challenge } from './types';

export default function TargetVisual({ challenge, compact = false }: { challenge: Challenge; compact?: boolean }) {
  return <figure className={`challenge-target ${compact ? 'challenge-target-compact' : ''}`} aria-label={`Target: ${challenge.targetLabel}`}>
    <figcaption>{challenge.criterion === 'state' ? 'TARGET QUANTUM STATE' : 'TARGET MEASUREMENT DISTRIBUTION'}</figcaption>
    <div className="challenge-equation">{challenge.targetLabel}</div>
    {!compact && <div className="challenge-basis">{Object.entries(challenge.targetProbabilities).sort(([a], [b]) => a.localeCompare(b)).map(([basis, p]) => <div key={basis} className="challenge-basis-item" data-active={p > 0}>
      <div className="challenge-basis-track" aria-hidden="true"><span style={{ height: `${p * 100}%` }} /></div>
      <code>|{basis}⟩</code><span>{Math.round(p * 100)}%</span>
      {challenge.targetState && <small aria-label={`Target amplitude for ${basis}`}>{p > 0 ? `${challenge.targetState[parseInt(basis, 2)]!.real < 0 ? '−' : '+'}${Math.abs(challenge.targetState[parseInt(basis, 2)]!.real).toFixed(3)}` : '0'}</small>}
    </div>)}</div>}
    <p>{challenge.criterion === 'state' ? 'Signed values show target amplitudes. Relative phase matters; a common global phase is equivalent.' : 'Exact ideal probabilities. Any relative phase is accepted.'}</p>
  </figure>;
}
