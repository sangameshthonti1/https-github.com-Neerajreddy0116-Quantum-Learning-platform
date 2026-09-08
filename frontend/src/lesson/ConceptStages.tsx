import { useState } from 'react';

export function CircuitSketch({ twice = false }: { twice?: boolean }) {
  return <figure className="lesson-circuit"><div role="img" aria-label={`A qubit starts in ket zero and passes through ${twice ? 'two H gates in sequence' : 'one H gate'} before a final measurement`}>
    <span>|0⟩</span><span aria-hidden="true">──</span><b>H</b>{twice && <><span aria-hidden="true">──</span><b>H</b></>}<span aria-hidden="true">──→</span><span>Read 0 or 1</span>
  </div><figcaption>Read left to right. A line is one qubit; a box is a gate.</figcaption></figure>;
}
export function Welcome() {
  return <>
    <p className="lesson-lead">What makes a quantum bit different from an ordinary computer bit?</p>
    <p>Your phone stores information using tiny units called <strong>bits</strong>. Each bit has one of two values: 0 or 1. Quantum computers use <strong>quantum bits</strong>, or <strong>qubits</strong>.</p>
    <p>A qubit also gives a 0 or a 1 when we read it in the way used in this lesson. That reading is called a <strong>measurement</strong>. The interesting difference is what can happen before we read.</p>
    <p>A <strong>quantum state</strong> is the mathematical description we use to predict a quantum system’s behavior. An operation called a <strong>quantum gate</strong> changes that state before measurement.</p>
    <div className="lesson-callout"><h3>Your experiment</h3><p>You’ll build a circuit with one gate, predict its results, and investigate a surprise when you use that gate twice. A circuit is a sequence of gates applied to qubits.</p></div>
    <p>No physics or advanced mathematics needed. Take this one idea at a time; you can return to any section you have reached.</p>
  </>;
}
export function Bits() {
  return <>
    <p>Think of an ordinary switch: it is off or on. A classical bit similarly has a value of 0 or 1, even if we have not looked at it. Here, <strong>classical</strong> means the ordinary, non-quantum kind.</p>
    <div className="lesson-comparison"><section><span className="lesson-big-symbol">0 <small>or</small> 1</span><h3>Classical bit</h3><p>One stored value. Not knowing it does not change what is stored.</p></section><section><span className="lesson-big-symbol">|0⟩ <small>and</small> |1⟩</span><h3>Two basic quantum states</h3><p>Two reference states for describing a qubit. This does not mean two classical values are read at once.</p></section></div>
    <p>A qubit is a quantum system with two basic states for the kind of reading we use. We label them <strong>|0⟩</strong> and <strong>|1⟩</strong>, read “ket zero” and “ket one.” The vertical line and angled bracket together are called a <strong>ket</strong>: they mark a quantum state label.</p>
    <p>These two reference states are called the <strong>computational basis states</strong>. Preparing |0⟩ guarantees a reading of 0; preparing |1⟩ guarantees a reading of 1. “Basis” here means the basic states used to describe other states.</p>
    <p>A more general qubit state needs two numbers, called <strong>probability amplitudes</strong>, that calculate the chances of the readings. We’ll meet them next. Unlike an unknown switch position, these numbers can combine and cancel under later gates.</p>
    <p>The switch comparison stops here: an ordinary switch does not have quantum amplitudes.</p>
  </>;
}
export function Amplitudes() {
  const [percent, setPercent] = useState(50);
  const p = percent / 100;
  const a = Math.sqrt(p), b = Math.sqrt(1 - p);
  return <>
    <p>A <strong>probability</strong> is a chance: 0% means impossible and 100% means certain. A probability amplitude is a number in the quantum state used to calculate such a chance. There is one amplitude for |0⟩ and another for |1⟩.</p>
    <p>Here is a compact way to write those two amplitudes and the states they belong to:</p>
    <div className="lesson-equation" aria-label="Ket psi equals alpha times ket zero plus beta times ket one">|ψ⟩ = α|0⟩ + β|1⟩</div>
    <dl className="lesson-symbols"><dt>|ψ⟩</dt><dd>“Ket psi”: the whole qubit state. ψ (psi) is just its name.</dd><dt>α and β</dt><dd>“Alpha” and “beta”: the amplitudes for |0⟩ and |1⟩, respectively.</dd><dt>α|0⟩ + β|1⟩</dt><dd>Each amplitude weights its basis state. Writing them next to each other means multiplication; + combines the two contributions. = means both sides describe the same state.</dd></dl>
    <p>Amplitudes can be <strong>complex numbers</strong>, which have a real part and an imaginary part. You do not need that mathematics yet. For now we’ll use positive real amplitudes, whose <strong>magnitude</strong> is simply their size.</p>
    <div className="lesson-callout"><h3>The rule to remember</h3><p>Probability = squared magnitude of amplitude. “Squared” means multiplied by itself.</p><p className="lesson-math">0.7071 × 0.7071 ≈ 0.5 = 50%</p><p>The symbol ≈ means “approximately equal.” Our rounded amplitude gives about a half chance, not a 70.71% chance.</p></div>
    <p>The probabilities of all possible outcomes must add up to 100%. This requirement is called <strong>normalization</strong>. It is the probabilities that add to one, not the amplitudes.</p>
    <section className="lesson-demo" aria-label="Amplitude to probability demonstration"><h3>Try a valid pair</h3><p>This arithmetic illustration keeps the probabilities at 100% in total. Moving one control adjusts both positive amplitudes together; it does not run a circuit.</p>
      <label htmlFor="probability-demo">Chance of zero: {percent}%</label><input id="probability-demo" type="range" min="0" max="100" step="1" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
      <div className="lesson-comparison" aria-live="polite"><div><h3>For |0⟩</h3><p>Amplitude: {a.toFixed(4)}</p><p>{a.toFixed(4)}² ≈ {p.toFixed(2)} → {percent}%</p><meter min="0" max="100" value={percent} aria-label="Illustrated probability of zero" /></div><div><h3>For |1⟩</h3><p>Amplitude: {b.toFixed(4)}</p><p>{b.toFixed(4)}² ≈ {(1 - p).toFixed(2)} → {100 - percent}%</p><meter min="0" max="100" value={100 - percent} aria-label="Illustrated probability of one" /></div></div>
      <p>Here ² means “square this number” and → means “which gives.” Displayed amplitudes are rounded. Total probability: {percent}% + {100 - percent}% = 100%.</p>
    </section>
    <details><summary>Learn more: negative and complex amplitudes</summary><p>A negative real amplitude also gives a positive probability: (−0.5)² = 0.25. Its sign still matters when a later gate combines amplitudes. For a complex amplitude with real part a and imaginary part b, its squared magnitude is a² + b². The imaginary part is another numerical component, not an “imaginary” probability.</p></details>
  </>;
}
export function Hadamard() {
  return <>
    <p>The <strong>Hadamard gate</strong>, written <strong>H</strong>, is a particular rule for changing a qubit’s amplitudes. Applied to |0⟩, it produces equal positive amplitudes for the two basis states.</p>
    <p>A state with nonzero amplitudes for both |0⟩ and |1⟩ is called a <strong>superposition</strong> of these basis states. It describes the qubit before reading it; one reading still gives just 0 or 1.</p>
    <CircuitSketch />
    <p>In symbols, the change is:</p>
    <div className="lesson-equation" aria-label="H applied to ket zero equals ket zero plus ket one, all divided by the square root of two">H|0⟩ = (|0⟩ + |1⟩)/√2</div>
    <p>H|0⟩ means “apply H to ket zero.” On the right, + combines the two basic states; the parentheses group them so that /√2 divides <em>both</em> amplitudes by the square root of two. The = sign says this is the resulting state.</p>
    <p><strong>√2</strong> is the positive number that squares to 2, about 1.414. Each amplitude is <strong>1/√2</strong>, about 0.7071. Its squared magnitude is exactly 1/2, or 50%: 0.7071 × 0.7071 ≈ 0.5 with rounded numbers.</p>
    <div className="lesson-callout"><p>H changes the amplitudes in a fixed, repeatable way. It does not randomly choose a bit inside the gate. We get a sampled 0 or 1 when we measure afterward.</p></div>
  </>;
}
export function Interference() {
  return <section className="lesson-interference"><h3>Why does the second H undo the first?</h3>
    <p>The first H leaves two positive amplitudes. The second H combines contributions from both. For the zero amplitude, those contributions have the same sign and add. For the one amplitude, they have opposite signs and cancel.</p>
    <div className="lesson-comparison"><section><h3>Contributions to |0⟩</h3><p className="lesson-math">+½ + ½ = 1</p><p>Adding contributions is <strong>constructive interference</strong>.</p></section><section><h3>Contributions to |1⟩</h3><p className="lesson-math">+½ − ½ = 0</p><p>Cancellation is <strong>destructive interference</strong>.</p></section></div>
    <p>Here ½ means one half, and − means subtract. These are contributions to <em>amplitudes</em>, not probabilities. Each half comes from multiplying 1/√2 from the first gate by 1/√2 from the second. The H rule gives one contribution to the one amplitude a minus sign. Only after adding do we square: 1² = 1 for zero and 0² = 0 for one.</p>
    <p><strong>Interference</strong> is this combining of amplitudes, including their signs. It explains why treating the first H as an ordinary random choice gives the wrong prediction.</p>
    <p>If the intermediate state were merely a hidden classical 0 or 1 with equal chances, applying H to either corresponding basis state would give a 50/50 reading. There would be no cancellation between them. The return to certain zero distinguishes the superposition from that random mixture.</p>
    <p>This depends on <strong>not measuring between the gates</strong>. A real intermediate reading changes the state. The Explorer calculates intermediate states without performing that reading; each sampled Lab run measures only at the end.</p>
    <details><summary>Learn more: the complete H rule</summary><p>For real starting amplitudes α (for zero) and β (for one), H gives new amplitudes (α + β)/√2 for zero and (α − β)/√2 for one. The + adds, the − subtracts, and /√2 divides the result by the square root of two.</p><p>After the first H, α = β = 1/√2. The second H therefore gives 1 and 0. A negative amplitude is not a negative probability; its sign affects how contributions combine before squaring.</p></details>
  </section>;
}
