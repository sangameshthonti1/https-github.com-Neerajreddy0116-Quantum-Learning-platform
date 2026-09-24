import { useSyncExternalStore } from "react";
import type { LibraryTopic } from "./types";

const storageKey = "qlp-library-demo-unlock-v1";
const receiptStorageKey = "qlp-library-demo-receipt-v1";
const freeTopicSlugs = new Set([
  "classical-information-and-bits",
  "qubits-and-superposition",
  "amplitudes-and-the-born-rule",
]);

export interface DemoLibraryReceipt {
  unlockedAt: string;
}

let unlocked = readAccess();
let receipt = readReceipt();
const listeners = new Set<() => void>();

function readAccess() {
  try {
    return localStorage.getItem(storageKey) === "unlocked";
  } catch {
    return false;
  }
}

function readReceipt(): DemoLibraryReceipt | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(receiptStorageKey) ?? "null",
    );
    if (!value || typeof value !== "object") return null;
    const unlockedAt = (value as DemoLibraryReceipt).unlockedAt;
    if (typeof unlockedAt !== "string" || Number.isNaN(Date.parse(unlockedAt)))
      return null;
    return { unlockedAt };
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDemoLibraryAccess() {
  return useSyncExternalStore(
    subscribe,
    () => unlocked,
    () => false,
  );
}

export function useDemoLibraryReceipt() {
  return useSyncExternalStore(
    subscribe,
    () => receipt,
    () => null,
  );
}

export function unlockDemoLibrary() {
  unlocked = true;
  receipt ??= { unlockedAt: new Date().toISOString() };
  try {
    localStorage.setItem(storageKey, "unlocked");
    localStorage.setItem(receiptStorageKey, JSON.stringify(receipt));
  } catch {
    // The current app session still unlocks when browser storage is unavailable.
  }
  emit();
}

export function resetDemoLibraryAccess() {
  unlocked = false;
  receipt = null;
  try {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(receiptStorageKey);
  } catch {
    // In-memory state still resets for the current app session.
  }
  emit();
}

export function isLibraryTopicFree(topic: LibraryTopic) {
  return topic.local === true || freeTopicSlugs.has(topic.slug);
}

export function isLibraryTopicLocked(
  topic: LibraryTopic,
  hasDemoAccess: boolean,
) {
  return !hasDemoAccess && !isLibraryTopicFree(topic);
}

export const freeLibraryTopicCount = freeTopicSlugs.size;
