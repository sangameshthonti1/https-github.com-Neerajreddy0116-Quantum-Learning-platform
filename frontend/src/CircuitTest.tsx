import { useEffect, useRef, useState } from 'react';
import { simulateCircuit } from './api/client';
import type { Gate, SimulationRequest, SimulationResponse } from './api/types';
import { templates } from './templates';

const metadataLabels: Record<keyof SimulationResponse['metadata'], string> = {
  method: 'Simulation method',
  measurement: 'Measurement',
  statevectorStage: 'Statevector stage',
  bitOrder: 'Bit order',
  seedSimulator: 'Simulator seed',
  gateCount: 'Gate count',
  circuitDepth: 'Circuit depth',
  executionTimeMs: 'Execution time (ms)',
  qiskitVersion: 'Qiskit version',
  aerVersion: 'Aer version',
  engine: 'Engine',
  pennylaneVersion: 'PennyLane version',
};

function describeGate(gate: Gate): string {
  if (gate.type === 'cx') {
    return `CX · control q${gate.controls[0]} → target q${gate.targets[0]}`;
  }
  return `${gate.type.toUpperCase()} · target q${gate.targets[0]}`;
}

function SimulationResults({ result }: { result: SimulationResponse }) {
  return (
    <section aria-label="Simulation results" className="results">
      <div className="section-heading">
        <div>
          <p className="eyebrow">02 / Observe</p>
          <h2>Simulation results</h2>
        </div>
        <span className="badge">Response received</span>
      </div>

      <div className="result-summary">
        <span>Backend <strong>{result.backend}</strong></span>
        <span>Qubits <strong>{result.numQubits}</strong></span>
        <span>Shots <strong>{result.shots.toLocaleString('en-US')}</strong></span>
      </div>

      <div className="results-grid">
        <section className="panel" aria-labelledby="probabilities-heading">
          <h3 id="probabilities-heading">Ideal probabilities</h3>
          <p className="section-description">
            Calculated from the pre-measurement statevector, not estimated from counts.
          </p>
          <ul className="probability-list">
            {Object.entries(result.probabilities)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([label, probability]) => (
                <li key={label} data-testid={`probability-${label}`} className="probability-row">
                  <div className="probability-label">
                    <span className="basis">|{label}⟩</span>
                    <span>{(probability * 100).toFixed(2)}%</span>
                  </div>
                  <meter
                    min={0}
                    max={1}
                    value={probability}
                    aria-label={`Probability of basis state ${label}`}
                    aria-valuetext={`${(probability * 100).toFixed(2)} percent`}
                  >
                    {(probability * 100).toFixed(2)}%
                  </meter>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="counts-heading">
          <h3 id="counts-heading">Measurement counts</h3>
          <p className="section-description">
            Actual sampled outcomes from {result.shots.toLocaleString('en-US')} shots.
            Counts can differ from ideal probability × shots.
          </p>
          <div className="table-scroll" role="region" aria-label="Measurement counts table" tabIndex={0}>
            <table>
              <caption className="sr-only">Sampled counts for every basis state</caption>
              <thead><tr><th scope="col">Basis state</th><th scope="col">Count</th></tr></thead>
              <tbody>
                {Object.entries(result.counts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([label, count]) => (
                    <tr key={label} data-testid={`count-${label}`}>
                      <th scope="row" className="basis">|{label}⟩</th>
                      <td>{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="statevector-heading">
        <h3 id="statevector-heading">Pre-measurement statevector</h3>
        <p className="section-description">
          Complex amplitudes before terminal measurement of all qubits, not a collapsed
          post-measurement state. Displayed to eight significant digits; the raw response
          preserves full returned precision.
        </p>
        <div className="table-scroll" role="region" aria-label="Statevector table" tabIndex={0}>
          <table>
            <caption className="sr-only">Real and imaginary components of each basis amplitude</caption>
            <thead>
              <tr><th scope="col">Basis state</th><th scope="col">Real</th><th scope="col">Imaginary</th></tr>
            </thead>
            <tbody>
              {result.statevector.map((amplitude, index) => {
                const label = index.toString(2).padStart(result.numQubits, '0');
                return (
                  <tr key={label}>
                    <th scope="row" className="basis">|{label}⟩</th>
                    <td>{amplitude.real.toPrecision(8)}</td>
                    <td>{amplitude.imag.toPrecision(8)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="metadata-heading">
        <h3 id="metadata-heading">Execution details</h3>
        <dl className="metadata-grid">
          {(Object.keys(metadataLabels) as Array<keyof SimulationResponse['metadata']>).filter(key => result.metadata[key] !== undefined).map((key) => (
            <div key={key}>
              <dt>{metadataLabels[key]}</dt>
              <dd>{result.metadata[key]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <details className="panel raw-response">
        <summary>Raw response · full precision</summary>
        <pre tabIndex={0} aria-label="Raw simulation response">{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function App() {
  const [templateId, setTemplateId] = useState('empty');
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const selectedTemplate = templates.find((template) => template.id === templateId);

  useEffect(() => () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  async function runSimulation(request: SimulationRequest) {
    if (activeRequest.current) return;

    const controller = new AbortController();
    activeRequest.current = controller;
    setResult(null);
    setError(null);
    setLoading(true);

    try {
      const response = await simulateCircuit(request, controller.signal);
      if (activeRequest.current === controller && !controller.signal.aborted) {
        setResult(response);
      }
    } catch (cause: unknown) {
      if (activeRequest.current === controller && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'The simulation could not be completed. Please try again.');
      }
    } finally {
      if (activeRequest.current === controller && !controller.signal.aborted) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  if (!selectedTemplate) {
    return <main className="app-shell"><p role="alert">Circuit template unavailable. Please reload the page.</p></main>;
  }

  const request = selectedTemplate.request;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to circuit test</a>
      <div className="app-shell">
        <header className="site-header">
          <a className="brand" href="./" aria-label="Quantum Learning home">
            <span className="brand-mark" aria-hidden="true">q</span>
            Quantum Learning
          </a>
          <span className="header-note">Circuit workspace</span>
        </header>

        <main id="main-content">
          <div className="page-heading">
            <p className="eyebrow">Learn by running</p>
            <h1>Circuit Test</h1>
            <p className="intro">A small circuit. A closer look at quantum behavior.
              Choose a template, inspect the request, and run a real simulation.</p>
          </div>

          <section aria-labelledby="circuit-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">01 / Prepare</p>
                <h2 id="circuit-heading">Your circuit</h2>
              </div>
              <span className="badge">Local · noiseless</span>
            </div>

            <div className="setup-grid">
              <form className="panel" onSubmit={(event) => {
                event.preventDefault();
                void runSimulation(request);
              }} aria-busy={loading}>
                <fieldset disabled={loading}>
                  <legend className="sr-only">Simulation configuration</legend>
                  <label htmlFor="circuit-template">Circuit template</label>
                  <select id="circuit-template" value={templateId} aria-describedby="template-description" onChange={(event) => {
                    setTemplateId(event.target.value);
                    setResult(null);
                    setError(null);
                  }}>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
                  </select>
                  <p id="template-description" className="section-description template-description">{selectedTemplate.description}</p>

                  <dl className="request-settings">
                    <div><dt>Simulator</dt><dd>Qiskit Aer <code>qiskit</code></dd></div>
                    <div><dt>Qubits</dt><dd>{request.numQubits}</dd></div>
                    <div><dt>Shots</dt><dd>{request.shots}</dd></div>
                    <div><dt>Simulator seed</dt><dd>{request.seedSimulator}</dd></div>
                  </dl>

                  <h3 className="gates-heading">Gates in execution order</h3>
                  {request.gates.length === 0 ? (
                    <p className="empty-gates">No gates · identity circuit</p>
                  ) : (
                    <ol className="gate-list">
                      {request.gates.map((gate) => (
                        <li key={gate.id}><span>{describeGate(gate)}</span><code>{gate.id}</code></li>
                      ))}
                    </ol>
                  )}
                  <p className="small-note">Every qubit starts in |0⟩. All qubits are measured at the end.</p>
                  <button type="submit" aria-label="Run Simulation" disabled={loading}>
                    {loading ? 'Running simulation…' : 'Run Simulation'}
                    {!loading && <span aria-hidden="true"> →</span>}
                  </button>
                </fieldset>
              </form>

              <section className="panel request-panel" aria-labelledby="request-heading">
                <div className="request-heading">
                  <h3 id="request-heading">Simulation request</h3>
                  <span className="read-only-label">Read only</span>
                </div>
                <p className="section-description">The exact JSON sent to <code>POST /api/simulate</code>.</p>
                <pre data-testid="request-json" tabIndex={0} aria-label="Simulation request JSON">{JSON.stringify(request, null, 2)}</pre>
              </section>
            </div>
          </section>

          <aside className="bit-order-note" aria-label="How to read quantum results">
            <strong>Reading the results</strong>
            <p>Qubit q0 is the least-significant bit: basis labels use <code>q[n-1]...q[0]</code> order.
              Ideal probabilities and amplitudes describe the state before measurement;
              counts are sampled from terminal measurements.</p>
          </aside>

          <div className="run-status" role="status" aria-live="polite" aria-atomic="true">
            {loading ? 'Running simulation…' : result ? 'Simulation complete. Results are available below.' : ''}
          </div>
          {error !== null && (
            <div className="error-panel" role="alert">
              <h2>Simulation failed</h2>
              <p>{error}</p>
              <p className="small-note">No results are shown. You can retry with Run Simulation.</p>
            </div>
          )}
          {result && <SimulationResults result={result} />}
          {!result && !loading && error === null && (
            <div className="empty-results">
              <h2>Ready when you are</h2>
              <p>Run your circuit to see probabilities, measurement counts, and the statevector.
                Results appear only after the simulator responds.</p>
            </div>
          )}
        </main>

        <footer>Quantum Learning <span aria-hidden="true">/</span> Explore the circuit. Understand the state.</footer>
      </div>
    </>
  );
}
