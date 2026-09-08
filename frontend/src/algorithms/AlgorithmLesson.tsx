import { useState } from 'react';
import type { AlgorithmId, OracleDefinition } from './types';

export function AlgorithmMotif({ id }: { id: AlgorithmId }) {
  const dj = id === 'deutsch-jozsa';
  return <svg className="algorithm-motif" viewBox="0 0 480 180" role="img" aria-label={dj ? 'Conceptual circuit: inputs pass through an oracle and interference to reveal a property.' : 'Conceptual circuit: a phase oracle and diffuser form a repeated Grover iteration.'}>
    <defs><pattern id={`grid-${id}`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="currentColor" opacity=".17" /></pattern></defs>
    <rect width="480" height="180" fill={`url(#grid-${id})`} />
    <g fill="none" stroke="currentColor" strokeWidth="1.3" opacity=".5"><path d="M30 65H448M30 113H448" /><path d="m438 60 10 5-10 5m0 38 10 5-10 5" /></g>
    <g fill="#1b2e48" stroke="#78ded8"><rect x="80" y="47" width="38" height="36" rx="5" /><rect x="80" y="95" width="38" height="36" rx="5" /><rect x="166" y="35" width="104" height="108" rx="8" /><rect x="312" y="35" width="104" height="108" rx="8" /></g>
    <g fill="currentColor" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="15"><text x="99" y="71">H</text><text x="99" y="119">H</text><text x="218" y="85">{dj ? 'f(x)' : '− phase'}</text><text x="218" y="109" fontSize="11">ORACLE</text><text x="364" y="85">{dj ? 'H' : 'reflect'}</text><text x="364" y="109" fontSize="11">{dj ? 'INTERFERE' : 'DIFFUSER'}</text></g>
    <text x="240" y="169" textAnchor="middle" fill="currentColor" opacity=".7" fontSize="10" letterSpacing="1.5">{dj ? 'A PROPERTY FROM INTERFERENCE' : 'ONE ITERATION · THEN REPEAT WITH CARE'}</text>
  </svg>;
}

export function ProblemLesson({ id }: { id: AlgorithmId }) {
  const dj = id === 'deutsch-jozsa';
  return <section id="problem" className="algorithm-problem" aria-label="Understand the problem">
    <div className="algorithm-section-label"><span>01</span><h2>Start with a question.</h2></div>
    <div className="algorithm-teaching-grid">
      <div><h3>{dj ? 'Same every time, or half and half?' : 'Which item passes the test?'}</h3>
        {dj ? <><p>A <strong>bit</strong> is 0 or 1. A <strong>Boolean function</strong> is a rule that takes one or more bits and returns one bit. For example, “return the rightmost bit” maps 00 → 0 and 01 → 1.</p><p>Imagine a sealed box holding the rule. You are promised it is <strong>constant</strong> (the same output for every input) or <strong>balanced</strong> (0 for exactly half the inputs, 1 for the other half). Your task is to tell which.</p></>
          : <><p>Imagine four unlabelled lockers and one correct key. You can check whether a locker is the one you want, but the lockers have no useful order. This is an <strong>unstructured search</strong>.</p><p>The item that passes the check is the <strong>marked item</strong>. Here we use a bitstring, such as 10, to name it. You choose the mark to build an inspectable example; in an application, a checking rule defines it.</p></>}</div>
      <div><h3>What would you do classically?</h3>
        {dj ? <><p>Ask the box for one output at a time. Two different outputs prove “balanced.” Matching outputs may leave doubt: with four possible inputs, a third matching output is needed to prove “constant” under the promise.</p><p>A deterministic method must always be right. Its worst case is <strong>2 queries for one input bit, or 3 for two</strong>. Random guessing with an allowed error is a different comparison.</p></>
          : <><p>Check the lockers one at a time. For a large unsorted collection, the number of checks grows in proportion to the collection’s size.</p><p>Grover reduces the number of calls to a quantum checking rule to roughly the square root of the number of items. This is a <strong>quadratic query advantage</strong>; building the oracle and running its gates also have costs.</p></>}</div>
      <div><h3>The quantum idea</h3>
        <p>A <strong>qubit</strong> can have an amplitude for 0 and for 1. An amplitude is a number whose squared magnitude gives a measurement probability. A <strong>superposition</strong> has several nonzero amplitudes. A <strong>register</strong> is a group of qubits.</p>
        <p>An <strong>oracle</strong> is a reusable circuit that applies the checking rule. <strong>Phase</strong> describes an amplitude’s direction; a minus sign reverses it. When gates combine amplitudes, signs can make them add or cancel. This is <strong>interference</strong>.</p>
      </div>
    </div>
    <div className="algorithm-insight"><span aria-hidden="true">↳</span><p>{dj
      ? 'Deutsch–Jozsa uses one oracle query, then interference puts the promised property into the input measurement. It does not reveal every function output or classify functions outside the promise.'
      : 'A phase oracle reverses the marked amplitude. The diffuser reflects amplitudes about their average, converting that sign difference into a change in probability. Measurement still returns just one item.'}</p></div>
    <p className="algorithm-gate-primer">A <strong>gate</strong> is one circuit operation. <strong>X</strong> swaps 0 and 1. <strong>H</strong>, the Hadamard gate, mixes their amplitudes, creating equal magnitudes when starting from 0. <strong>Z</strong> reverses the sign of the 1 amplitude. <strong>CX</strong> applies X to a target when its control is 1; <strong>CZ</strong> applies Z under the same condition. Gates act before the final measurement.</p>
    <details className="algorithm-details"><summary>{dj ? 'Why does the helper make phase kickback work?' : 'Why can another iteration make the answer less likely?'}</summary>
      {dj ? <><p>The helper qubit, or <strong>ancilla</strong>, starts at 0. X flips it to 1; H, the Hadamard gate, makes the state called “minus”: equal amplitudes for 0 and 1 with opposite signs. Flipping this helper swaps those amplitudes, which multiplies its whole state by −1.</p><p>The reversible oracle keeps the input bits and flips the helper only when the function returns 1. In a superposition, this gives those input components a minus sign while leaving the helper in the same physical state. That transfer of the function value into a phase is <strong>phase kickback</strong>.</p><p>The last H gates act only on the inputs. At the all-zero input output, the signed contributions all add for a constant function, or cancel for a balanced function. We sum over both helper outcomes when reading that probability.</p></>
        : <><p>The diffuser’s reflection moves the state through a repeating cycle. An early iteration can move it closer to the marked item; once it passes the best point, another can move it away. For four items and one mark, compare 0, 1, and 2 iterations to see the rise and fall.</p><p>With only two items, standard Grover iterations keep the marked probability at 50%. That example shows why the register size matters and why this algorithm does not guarantee success for every configuration.</p></>}
    </details>
    <details className="algorithm-details"><summary>Optional mathematics · every symbol explained</summary>
      {dj ? <><p>Let <strong>n</strong> be the number of input bits, <strong>x</strong> an input bitstring, <strong>f(x)</strong> the Boolean output, and <strong>N = 2ⁿ</strong> the number of inputs. The all-zero input amplitude after interference is:</p><p className="algorithm-equation">a₀ = (1 / N) ∑ₓ (−1)<sup>f(x)</sup></p><p>The sum symbol ∑ means “add one term for each input.” Each term is +1 when f(x)=0 and −1 when f(x)=1. A constant function gives a₀ = +1 or −1; a balanced function gives a₀ = 0. The probability is |a₀|²: 1 or 0. These are input-register amplitudes with the separate helper state factored out.</p><p>The reversible oracle implements (x, y) → (x, y ⊕ f(x)), where y is the helper bit and ⊕ means addition modulo two (exclusive OR). The classical deterministic worst case is N/2 + 1 queries.</p></>
        : <><p>Let <strong>a</strong> be one amplitude and <strong>μ</strong> (mu) the average of all amplitudes. The diffuser maps a → 2μ − a. Our H/X/Z or H/X/CZ decomposition implements its negative: every amplitude also receives the same overall minus sign. This <strong>global phase</strong> changes no measurement probability or physical state; raw traces retain it.</p><p>For <strong>N</strong> items, one marked item, and <strong>k</strong> iterations, define the angle <strong>θ</strong> (theta) by sin(θ)=1/√N. Then ideal marked probability is:</p><p className="algorithm-equation">P(k) = sin²((2k + 1)θ)</p><p>√ means square root and sin² means square the sine. The repeating sine explains over-rotation. The interface displays probabilities from the executed circuit, with this formula used as an independent mathematical check in tests.</p></>}
    </details>
  </section>;
}

export function ClassicalOracle({ oracle }: { oracle: OracleDefinition }) {
  const [queried, setQueried] = useState<string[]>([]);
  const observed = oracle.truthTable.filter(r => queried.includes(r.input));
  const distinct = new Set(observed.map(r => r.output));
  const verdict = distinct.size === 2 ? 'Two different outputs: balanced is now certain.'
    : observed.length > oracle.truthTable.length / 2 ? 'More than half the inputs agree: constant is now certain under the promise.'
      : 'There is not enough evidence yet to be certain.';
  return <div className="algorithm-oracle-table">
    <h3>Try the classical box</h3><p>Reveal one input at a time. Each new input uses one query.</p>
    <div className="algorithm-query-inputs">{oracle.truthTable.map(r => <button key={r.input} disabled={queried.includes(r.input)} onClick={() => setQueried(q => [...q, r.input])} aria-label={`Query input ${r.input}`}><code>{r.input}</code><span aria-hidden="true">→</span><strong>{queried.includes(r.input) ? r.output : '?'}</strong></button>)}</div>
    <p role="status">{queried.length} classical {queried.length === 1 ? 'query' : 'queries'}. {verdict}</p>
    <details className="algorithm-details"><summary>Reveal the selected rule’s full truth table</summary><p>{oracle.label} · {oracle.category}. A truth table lists the output for every possible input.</p><table><thead><tr><th scope="col">Input</th><th scope="col">f(input)</th></tr></thead><tbody>{oracle.truthTable.map(r => <tr key={r.input}><th scope="row"><code>{r.input}</code></th><td>{r.output}</td></tr>)}</tbody></table></details>
  </div>;
}
