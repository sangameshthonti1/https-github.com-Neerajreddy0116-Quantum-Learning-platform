import { useState } from 'react';

/** A labelled conceptual diagram, independent of simulator results or learner progress. */
export default function QuantumVisual() {
  const [view, setView] = useState<'prepare' | 'transform' | 'observe'>('transform');
  return <figure className="q-quantum-visual">
    <div className="q-visual-label"><span className="q-live-dot" /> A QUBIT, THREE PERSPECTIVES</div>
    <svg viewBox="0 0 400 255" role="img" aria-label={view === 'prepare' ? 'Conceptual map: the zero state at the top of the Bloch sphere' : view === 'transform' ? 'Conceptual map: H takes the zero state to the plus state on the equator' : 'Conceptual measurement diagram: one reading gives zero or one'}>
      <g stroke="#607e9f" fill="none" strokeWidth="1">
        <circle cx="204" cy="128" r="88" /><ellipse cx="204" cy="128" rx="88" ry="28" />
        <ellipse cx="204" cy="128" rx="35" ry="88" transform="rotate(28 204 128)" />
        <path d="M204 22v213M100 128h209M147 190l114-125" strokeDasharray="3 5" opacity=".6" />
      </g>
      <g fill="#cbd8e9" fontSize="14" fontFamily="Georgia, serif"><text x="191" y="18">|0⟩</text><text x="191" y="251">|1⟩</text><text x="314" y="132">|+⟩</text></g>
      <circle cx="204" cy="128" r="3" fill="#9db1ce" />
      {view !== 'observe' ? <g className="q-vector" key={view}>
        <path d={view === 'prepare' ? 'M204 128V40' : 'M204 128h88'} stroke="#64d7d7" strokeWidth="3" />
        <circle cx={view === 'prepare' ? 204 : 292} cy={view === 'prepare' ? 40 : 128} r="6" fill="#78e4df" />
        {view === 'transform' && <><path d="M204 40Q286 40 292 111" fill="none" stroke="#78e4df" strokeDasharray="4 5" /><rect x="253" y="43" width="28" height="28" rx="6" fill="#244265" stroke="#6484a7" /><text x="267" y="63" textAnchor="middle" fill="white" fontSize="16">H</text></>}
      </g> : <g fill="#78e4df"><circle cx="204" cy="40" r="6" /><circle cx="204" cy="216" r="6" /><text x="27" y="123" fontSize="11">ONE READING</text><text x="42" y="143" fontSize="15">0 or 1</text></g>}
    </svg>
    <div className="q-visual-controls" aria-label="Concept illustration">{(['prepare', 'transform', 'observe'] as const).map((item, i) => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}><span>0{i + 1}</span>{item}</button>)}</div>
    <figcaption>{view === 'prepare' ? 'Prepare a qubit in the zero state, |0⟩.' : view === 'transform' ? 'H changes |0⟩ into the equal-amplitude state, |+⟩.' : 'Measuring |+⟩ gives one bit: 0 or 1, with equal chances.'}<small>Concept illustration · run your own circuit in the Lab</small></figcaption>
  </figure>;
}
