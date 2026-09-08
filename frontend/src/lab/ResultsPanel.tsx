import { useId, useRef, useState } from 'react';
import type { SimulationRequest, SimulationResponse } from '../api/types';
import { formatNumber, ProbabilityBars, StatevectorTable } from './QuantumStateViews';

export interface ResultsPanelProps {
  request: SimulationRequest;
  result: { request: SimulationRequest; response: SimulationResponse } | null;
  stale: boolean;
  loading: boolean;
  error: string | null;
}

const tabs = [
  { key: 'probabilities', label: 'Ideal probabilities' },
  { key: 'counts', label: 'Sampled counts' },
  { key: 'statevector', label: 'Statevector' },
] as const;

type ResultTab = typeof tabs[number]['key'];

function circuitSummary(request: SimulationRequest) {
  return `${request.numQubits} qubits · ${request.gates.length} gates · ${request.shots.toLocaleString()} shots`;
}

export default function ResultsPanel({ request, result, stale, loading, error }: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('probabilities');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const response = result?.response;
  const retained = stale || loading || Boolean(error);

  return (
    <section className="lab-results-content" aria-label="Lab simulation results">
      <header className="lab-results-header">
        <h2>Results</h2>
        {response && <span className="lab-chip">{response.shots.toLocaleString()} shots</span>}
      </header>

      {loading && <p className="lab-notice" role="status">Running simulation… {result ? 'Showing the last successful result snapshot until this run completes.' : 'Results will appear when this run completes.'}</p>}
      {error && (
        <div className="lab-error" role="alert">
          <strong>Simulation could not complete</strong>
          <p>{error}</p>
          <p>Check the circuit settings and API connection, then run again.</p>
          {result && <p>The last successful result is retained below; it is not a result of the failed run.</p>}
        </div>
      )}
      {stale && (
        <div className="lab-notice lab-stale-banner" role="status">
          <strong>Results are stale</strong>
          <p>Run the circuit again to update the results.</p>
          {result && <p>Previous circuit: {circuitSummary(result.request)}.</p>}
        </div>
      )}

      {!result ? (
        <div className="lab-results-empty">
          <span className="lab-empty-symbol" aria-hidden="true">|ψ⟩</span>
          <h3>No simulation results yet</h3>
          <p>Select Run Simulation to explore probabilities, counts, and amplitudes.</p>
        </div>
      ) : (
        <div className="lab-result-snapshot">
          <p className="lab-snapshot-label">{retained ? 'Last successful result snapshot' : 'Result snapshot · current circuit'}</p>
          <p className="lab-snapshot-summary">{circuitSummary(result.request)}</p>
        </div>
      )}

      {response && (
        <>
          <div className="lab-result-tabs" role="tablist" aria-label="Result views">
            {tabs.map((tab, index) => (
              <button
                key={tab.key}
                ref={(element) => { tabRefs.current[index] = element; }}
                type="button"
                role="tab"
                id={`${id}-tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`${id}-panel-${tab.key}`}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = tabs.length - 1;
                  else return;
                  event.preventDefault();
                  const nextTab = tabs[next];
                  if (nextTab) setActiveTab(nextTab.key);
                  tabRefs.current[next]?.focus();
                }}
              >{tab.label}</button>
            ))}
          </div>

          {tabs.map((tab) => (
            <div
              key={tab.key}
              id={`${id}-panel-${tab.key}`}
              role="tabpanel"
              aria-labelledby={`${id}-tab-${tab.key}`}
              tabIndex={0}
              hidden={activeTab !== tab.key}
              className="lab-result-view"
            >
              {tab.key === 'probabilities' && (
                <>
                  <p className="lab-muted">Ideal probabilities from the pre-measurement state, not estimated from shots.</p>
                  <ProbabilityBars probabilities={response.probabilities} />
                </>
              )}
              {tab.key === 'counts' && (
                <>
                  <p className="lab-muted">{response.shots.toLocaleString()} actual sampled shots. Sampling can differ from the ideal distribution.</p>
                  <ul className="lab-probability-list lab-count-list">
                    {Object.entries(response.counts).sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => (
                      <li key={label} data-testid={`lab-count-${label}`}>
                        <div className="lab-bar-label"><code>|{label}⟩</code><span>{count.toLocaleString()} <small>({formatNumber(count / response.shots * 100)}%)</small></span></div>
                        <div className="lab-bar-track" aria-hidden="true"><span style={{ width: `${count / response.shots * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {tab.key === 'statevector' && (
                <>
                  <p className="lab-muted">Complex amplitudes before measurement. Probability = real² + imaginary².</p>
                  <StatevectorTable statevector={response.statevector} basis={response.statevector.map((_, i) => i.toString(2).padStart(response.numQubits, '0'))} />
                </>
              )}
            </div>
          ))}
        </>
      )}

      <details className="lab-details">
        <summary>Details</summary>
        <h3>Reading the results</h3>
        <p className="lab-muted">Labels: <code>q[n−1]…q[0]</code>; q0 is the rightmost, least-significant bit. For example, X on q0 in a two-qubit circuit gives 01. All qubits are measured at the end; the statevector is saved before measurement.</p>
        <p className="lab-muted">Simulator: local Qiskit Aer, noiseless CPU. Initial state: |0…0⟩. Current seed: {request.seedSimulator ?? 'chosen by simulator'}.</p>
        {response && (
          <>
            <h3>Result execution metadata</h3>
            <dl className="lab-metadata">
              <div><dt>Backend / device</dt><dd>{response.backend} / CPU</dd></div>
              <div><dt>Result qubits</dt><dd>{response.numQubits}</dd></div>
              <div><dt>Result shots</dt><dd>{response.shots}</dd></div>
              {Object.entries(response.metadata).map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
              ))}
            </dl>
          </>
        )}
        <h3>Current request · editor</h3>
        <pre tabIndex={0} aria-label="Current request JSON">{JSON.stringify(request, null, 2)}</pre>
        {result && (
          <>
            <h3>{retained ? 'Previous successful request · result snapshot' : 'Successful request · result snapshot'}</h3>
            <pre tabIndex={0} aria-label="Result snapshot request JSON">{JSON.stringify(result.request, null, 2)}</pre>
            <h3>Response · result snapshot</h3>
            <p className="lab-muted">Raw numbers retain the full precision returned by the API.</p>
            <pre tabIndex={0} aria-label="Result snapshot response JSON">{JSON.stringify(result.response, null, 2)}</pre>
          </>
        )}
      </details>
    </section>
  );
}
