import type { ComplexAmplitude } from '../api/types';

export const displayTolerance = 1e-10;
export function formatNumber(value: number) {
  const display = Math.abs(value) < displayTolerance ? 0 : Math.abs(value - 1) < displayTolerance ? 1 : value;
  return display !== 0 && Math.abs(display) < 0.0001 ? display.toExponential(4) : display.toFixed(4);
}

export function ProbabilityBars({ probabilities, prefix = 'lab' }: { probabilities: Record<string, number>; prefix?: string }) {
  return <ul className="lab-probability-list">
    {Object.entries(probabilities).sort(([a], [b]) => a.localeCompare(b)).map(([label, probability]) => (
      <li key={label} data-testid={`${prefix}-probability-${label}`} title={`Probability: ${probability}`}>
        <div className="lab-bar-label"><code>|{label}⟩</code><span>{formatNumber(probability)} <small>({formatNumber(probability * 100)}%)</small></span></div>
        <div className="lab-bar-track" aria-hidden="true"><span style={{ width: `${Math.min(1, Math.max(0, probability)) * 100}%` }} /></div>
      </li>
    ))}
  </ul>;
}

export function StatevectorTable({ statevector, basis, label = 'Statevector amplitudes' }: { statevector: ComplexAmplitude[]; basis: string[]; label?: string }) {
  return <div className="lab-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className="lab-statevector-table">
      <thead><tr><th scope="col">Basis</th><th scope="col">Real</th><th scope="col">Imaginary</th></tr></thead>
      <tbody>{statevector.map((amplitude, index) => <tr key={index}>
        <th scope="row"><code>|{basis[index]}⟩</code></th>
        <td title={String(amplitude.real)}>{formatNumber(amplitude.real)}</td>
        <td title={String(amplitude.imag)}>{formatNumber(amplitude.imag)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
