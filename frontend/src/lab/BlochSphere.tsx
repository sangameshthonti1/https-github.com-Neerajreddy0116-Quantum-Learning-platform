import { useId, useState } from 'react';
import type { TraceStep } from '../api/types';
import { displayTolerance, formatNumber } from './QuantumStateViews';

type Point = [number, number, number];

export default function BlochSphere({ step }: { step: TraceStep | null }) {
  const [qubit, setQubit] = useState(0);
  const [azimuth, setAzimuth] = useState(35);
  const [elevation, setElevation] = useState(20);
  const id = useId();
  const reduced = step?.qubits[qubit] ?? step?.qubits[0];
  const a = azimuth * Math.PI / 180;
  const e = elevation * Math.PI / 180;
  // Orthographic view of a unit sphere. Rotation changes the camera only;
  // the backend vector is never normalized or projected onto the surface.
  function project([x, y, z]: Point) {
    const depth = x * Math.sin(a) + y * Math.cos(a);
    return { x: 140 + 88 * (x * Math.cos(a) - y * Math.sin(a)),
      y: 140 + 88 * (depth * Math.sin(e) - z * Math.cos(e)),
      depth: depth * Math.cos(e) + z * Math.sin(e) };
  }
  const circles = [0, 1, 2].flatMap((plane) => Array.from({ length: 64 }, (_, i) => {
    function point(t: number): Point {
      const c = Math.cos(t), s = Math.sin(t);
      return plane === 0 ? [c, s, 0] : plane === 1 ? [c, 0, s] : [0, c, s];
    }
    return [project(point(i * Math.PI / 32)), project(point((i + 1) * Math.PI / 32))];
  }));
  const vector = reduced?.blochVector;
  const length = vector ? Math.hypot(vector.x, vector.y, vector.z) : 0;
  const purity = reduced?.densityMatrix.flat().reduce((sum, value) => sum + value.real ** 2 + value.imag ** 2, 0) ?? 0;
  const mixedness = length < displayTolerance ? 'Maximally mixed' : Math.abs(purity - 1) < displayTolerance ? 'Pure' : 'Mixed';
  const endpoint = vector ? project([vector.x, vector.y, vector.z]) : project([0, 0, 0]);
  const axes: { point: Point; label: string }[] = [
    { point: [1.2, 0, 0], label: '+X' }, { point: [0, 1.2, 0], label: '+Y' },
    { point: [0, 0, 1.2], label: '+Z · |0⟩' }, { point: [0, 0, -1.2], label: '−Z · |1⟩' },
  ];
  return <section className="bloch-panel" aria-label="Reduced qubit states">
    <div><span className="lab-eyebrow">SINGLE-QUBIT VIEW</span><h2>Bloch sphere</h2></div>
    {!reduced || !step ? <p className="lab-muted">Trace the current circuit and select a step to inspect its reduced qubit states.</p> : <>
      <div className="lab-actions" aria-label="Choose a reduced qubit">
        {step.qubits.map((q) => <button key={q.qubit} aria-label={`Inspect q${q.qubit}`} aria-pressed={reduced.qubit === q.qubit} onClick={() => setQubit(q.qubit)}>q{q.qubit}</button>)}
      </div>
      <p className="lab-muted">Step {step.index} · q{reduced.qubit} · <strong>{mixedness}</strong></p>
      <svg className="bloch-sphere" viewBox="0 0 280 280" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>Bloch sphere for q{reduced.qubit}</title>
        <desc id={`${id}-description`}>Step {step.index}. {mixedness}. Vector ({formatNumber(vector!.x)}, {formatNumber(vector!.y)}, {formatNumber(vector!.z)}). Length {formatNumber(length)}. Dashed segments are behind the center plane.</desc>
        <circle cx="140" cy="140" r="88" fill="#f8fafc" stroke="#b8c7d7" />
        {circles.map(([from, to], i) => from && to && <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#a9bbd1" opacity={from.depth < 0 ? 0.4 : 0.8} strokeDasharray={from.depth < 0 ? '2 3' : undefined} />)}
        {axes.map((axis) => {
          const p = project(axis.point);
          return <g key={axis.label}><line x1="140" y1="140" x2={p.x} y2={p.y} stroke="#94a3b8" strokeDasharray="3 4" />
            <text x={p.x} y={p.y - 7} textAnchor="middle" fill="#475569" fontSize="11">{axis.label}</text></g>;
        })}
        <circle cx="140" cy="140" r="2" fill="#64748b" />
        {length >= displayTolerance && <line x1="140" y1="140" x2={endpoint.x} y2={endpoint.y} stroke="#245bc1" strokeWidth="3" strokeDasharray={endpoint.depth < 0 ? '5 3' : undefined} />}
        <circle data-testid="bloch-endpoint" cx={endpoint.x} cy={endpoint.y} r="5" fill="#245bc1" stroke="white" strokeWidth="1.5" />
      </svg>
      <dl className="bloch-values" data-testid={`bloch-values-q${reduced.qubit}`}>
        <div><dt>Vector (x, y, z)</dt><dd>({formatNumber(vector!.x)}, {formatNumber(vector!.y)}, {formatNumber(vector!.z)})</dd></div>
        <div><dt>Vector length</dt><dd>{formatNumber(length)}</dd></div>
        <div><dt>Purity · Tr(ρ²)</dt><dd>{formatNumber(purity)}</dd></div>
      </dl>
      <p className="lab-muted">{mixedness === 'Pure' ? 'On the surface: this qubit has a pure reduced state.'
        : mixedness === 'Maximally mixed' ? 'At the center: this qubit is maximally mixed. Its reduced state has no preferred direction.'
          : 'Inside the sphere: this qubit has a mixed reduced state.'} The joint state remains pure.</p>
      <details className="bloch-controls"><summary>Rotate view</summary>
        <label>Azimuth · {azimuth}°<input aria-label="Sphere azimuth" type="range" min="-180" max="180" value={azimuth} onChange={(event) => setAzimuth(Number(event.target.value))} /></label>
        <label>Elevation · {elevation}°<input aria-label="Sphere elevation" type="range" min="-80" max="80" value={elevation} onChange={(event) => setElevation(Number(event.target.value))} /></label>
        <button onClick={() => { setAzimuth(35); setElevation(20); }}>Reset view</button>
      </details>
      <p className="lab-muted">The arrow uses the backend’s reduced-state vector. Camera rotation does not change the quantum state.</p>
    </>}
  </section>;
}
