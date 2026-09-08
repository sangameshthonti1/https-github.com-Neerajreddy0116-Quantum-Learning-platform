import { useId } from 'react';
import { isSimulatorBackend, simulatorLabels, type SimulatorBackend } from '../api/types';

export default function SimulatorSelector({ value, onChange }: {
  value: SimulatorBackend; onChange: (backend: SimulatorBackend) => void;
}) {
  const id = useId();
  return <div className="simulator-selector">
    <label htmlFor={id}>Simulator</label>
    <select id={id} value={value} aria-describedby={`${id}-help`} onChange={event => {
      if (isSimulatorBackend(event.target.value)) onChange(event.target.value);
    }}>
      <option value="qiskit">{simulatorLabels.qiskit} (default)</option>
      <option value="pennylane">{simulatorLabels.pennylane}</option>
    </select>
    <span id={`${id}-help`}>Two local simulators, same circuit. Compare ideal probabilities; sampled counts can differ.</span>
  </div>;
}
