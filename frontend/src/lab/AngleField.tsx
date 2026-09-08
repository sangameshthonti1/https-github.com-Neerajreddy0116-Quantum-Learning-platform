import { useId } from 'react';

export const validAngle = (text: string) => text.trim() !== '' && Number.isFinite(Number(text));

export default function AngleField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const help = useId();
  return <div className="lab-angle-field">
    <label className="lab-field">Angle (radians)<input type="number" step="any" required value={value}
      aria-invalid={!validAngle(value)} aria-describedby={help} onChange={(event) => onChange(event.target.value)} /></label>
    <div className="lab-angle-presets" aria-label="Angle presets">
      {[[0, '0'], [Math.PI / 4, 'π/4'], [Math.PI / 2, 'π/2'], [Math.PI, 'π'], [-Math.PI / 2, '−π/2']].map(([angle, label]) =>
        <button key={label} type="button" title={`Set angle to ${label} radians`} onClick={() => onChange(String(angle))}>{label}</button>)}
    </div>
    <p id={help} className="lab-muted">π radians = half a turn. Use a finite number or a preset.</p>
  </div>;
}
