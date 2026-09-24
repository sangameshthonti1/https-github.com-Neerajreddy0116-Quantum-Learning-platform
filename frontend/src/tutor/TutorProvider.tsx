import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SimulationRequest } from "../api/types";
import { circuitKey } from "../lab/useCircuitEditor";
import { foundations, isFoundationId } from "../lesson/foundations/content";
import TutorPanel from "./TutorPanel";
import type { LessonId, TutorContext } from "./types";
import "./tutor.css";

interface LabContext {
  lessonId: LessonId | null;
  circuit: SimulationRequest;
  selectedStep: number | null;
  apply: (request: SimulationRequest) => void;
}
const Bridge = createContext<{
  setLab: (value: LabContext | null) => void;
  open: () => void;
  isOpen: boolean;
  ready: boolean;
} | null>(null);

function pageLabel(path: string) {
  if (path === "/" || path === "/dashboard") return "Dashboard";
  if (path === "/learn") return "Curriculum";
  if (path === "/library" || path.startsWith("/library/"))
    return "Knowledge Library";
  if (path === "/lab") return "Circuit Lab";
  if (path === "/lab/states") return "State Explorer";
  if (path === "/algorithms") return "Algorithms";
  if (path === "/algorithms/deutsch-jozsa") return "Deutsch–Jozsa algorithm";
  if (path === "/algorithms/grover") return "Grover’s search";
  if (path === "/algorithms/vqe") return "VQE experiment";
  if (path === "/algorithms/qaoa") return "QAOA experiment";
  if (path.startsWith("/algorithms/")) return "Algorithm Explorer";
  if (path === "/challenges") return "Challenges";
  if (path.startsWith("/challenges/")) return "Challenge workspace";
  if (path === "/progress") return "Progress";
  if (path === "/payments") return "Payments & billing";
  return "Quantum Learning";
}

export function TutorProvider({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const [lab, setLab] = useState<LabContext | null>(null);
  const [isOpen, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const open = useCallback(() => {
    trigger.current = document.activeElement as HTMLElement;
    setOpen(true);
  }, []);
  const isCircuitWorkspace =
    path === "/lab" ||
    path === "/lab/states" ||
    path.startsWith("/challenges/");
  const id = path.slice("/learn/".length);
  const lessonId = isCircuitWorkspace
    ? (lab?.lessonId ?? null)
    : id === "superposition" || isFoundationId(id)
      ? id
      : null;
  const lessonTitle =
    lessonId === "superposition"
      ? "Superposition & the Hadamard gate"
      : lessonId
        ? foundations[lessonId].title
        : null;
  const title = lessonTitle ?? pageLabel(path);
  const circuit = isCircuitWorkspace ? (lab?.circuit ?? null) : null;
  const selectedStep = isCircuitWorkspace ? (lab?.selectedStep ?? null) : null;
  const context: TutorContext = {
    lessonId,
    circuit,
    selectedStep,
    label: circuit
      ? `${title} · ${circuit.numQubits} qubits · ${circuit.gates.length} gates · ${selectedStep === null ? "Final state" : `Step ${selectedStep}`}`
      : title,
    key: JSON.stringify([
      path,
      lessonId,
      circuit ? circuitKey(circuit) : null,
      selectedStep,
    ]),
    apply: isCircuitWorkspace ? lab?.apply : undefined,
  };
  useLayoutEffect(() => {
    setOpen(false);
  }, [path]);
  const ready = !isCircuitWorkspace || !!lab;
  const bridge = useMemo(
    () => ({ setLab, open, isOpen, ready }),
    [open, isOpen, ready],
  );
  return (
    <Bridge.Provider value={bridge}>
      {children}
      <TutorPanel
        context={context}
        open={isOpen}
        onClose={() => {
          setOpen(false);
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
      />
    </Bridge.Provider>
  );
}

export function TutorLauncher() {
  const bridge = useContext(Bridge);
  return (
    bridge && (
      <button
        className="tutor-launcher"
        disabled={!bridge.ready}
        aria-haspopup="dialog"
        aria-expanded={bridge.isOpen}
        onClick={bridge.open}
      >
        <span aria-hidden="true">✦</span> AI Tutor
      </button>
    )
  );
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
