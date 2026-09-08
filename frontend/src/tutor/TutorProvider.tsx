import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SimulationRequest } from '../api/types';
import { circuitKey } from '../lab/useCircuitEditor';
import { foundations, isFoundationId } from '../lesson/foundations/content';
import TutorPanel from './TutorPanel';
import type { LessonId, TutorContext } from './types';
import './tutor.css';

interface LabContext { lessonId: LessonId | null; circuit: SimulationRequest; selectedStep: number | null; apply: (request: SimulationRequest) => void }
const Bridge = createContext<{ setLab: (value: LabContext | null) => void; open: () => void; isOpen: boolean; ready: boolean } | null>(null);

export function TutorProvider({ path, children }: { path: string; children: ReactNode }) {
  const [lab, setLab] = useState<LabContext | null>(null);
  const [isOpen, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const open = useCallback(() => { trigger.current = document.activeElement as HTMLElement; setOpen(true); }, []);
  const isLab = path === '/lab' || path === '/lab/states';
  const id = path.slice('/learn/'.length);
  const lessonId = isLab ? lab?.lessonId ?? null : id === 'superposition' || isFoundationId(id) ? id : null;
  const title = lessonId === 'superposition' ? 'Superposition & the Hadamard gate' : lessonId ? foundations[lessonId].title : null;
  const available = isLab || !!lessonId;
  const circuit = isLab ? lab?.circuit ?? null : null;
  const selectedStep = isLab ? lab?.selectedStep ?? null : null;
  const context: TutorContext = {
    lessonId, circuit, selectedStep,
    label: circuit ? `${title ? title + ' · ' : ''}${circuit.numQubits} qubits · ${circuit.gates.length} gates · ${selectedStep === null ? 'Final state' : `Step ${selectedStep}`}` : title ?? 'Quantum foundations',
    key: JSON.stringify([lessonId, circuit ? circuitKey(circuit) : null, selectedStep]),
    apply: isLab ? lab?.apply : undefined,
  };
  useLayoutEffect(() => { setOpen(false); }, [path]);
  const ready = available && (!isLab || !!lab);
  const bridge = useMemo(() => ({ setLab, open, isOpen, ready }), [open, isOpen, ready]);
  return <Bridge.Provider value={bridge}>{children}{available && <TutorPanel context={context} open={isOpen} onClose={() => {
    setOpen(false); if (trigger.current?.isConnected) trigger.current.focus();
  }} />}</Bridge.Provider>;
}

export function TutorLauncher() {
  const bridge = useContext(Bridge);
  return bridge && <button className="tutor-launcher" disabled={!bridge.ready} aria-haspopup="dialog" aria-expanded={bridge.isOpen} onClick={bridge.open}><span aria-hidden="true">✦</span> AI Tutor</button>;
}

/** Only the canonical request/step cross this bridge. No results or lesson credit. */
export function useTutorLabContext(value: LabContext) {
  const setLab = useContext(Bridge)?.setLab;
  const { lessonId, circuit, selectedStep, apply } = value;
  useLayoutEffect(() => {
    setLab?.({ lessonId, circuit, selectedStep, apply });
    return () => setLab?.(null);
  }, [setLab, lessonId, circuit, selectedStep, apply]);
}
