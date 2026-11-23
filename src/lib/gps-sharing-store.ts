/**
 * Shared state for device GPS sharing. The tracker (mounted once in the app shell, no UI of its own)
 * owns the GPS watch and publishes here; the profile drawer shows the state and its controls.
 */
import { useSyncExternalStore } from 'react';

export interface GpsSharingState {
  allowed: boolean;   // this person's job includes field tracking
  enabled: boolean;   // they turned sharing on for this device
  onDuty: boolean;
  message: string;
  lastSaved: string;
}

const listeners = new Set<() => void>();
let state: GpsSharingState = { allowed: false, enabled: false, onDuty: false, message: 'GPS sharing is off on this device.', lastSaved: '' };
let actions: { setEnabled: (on: boolean) => void; retry: () => void } = { setEnabled: () => {}, retry: () => {} };

export function publishGpsSharing(next: GpsSharingState) {
  if (Object.keys(next).every((k) => next[k as keyof GpsSharingState] === state[k as keyof GpsSharingState])) return;
  state = next;
  listeners.forEach((listener) => listener());
}

export function registerGpsActions(next: typeof actions) { actions = next; }
export const gpsActions = { setEnabled: (on: boolean) => actions.setEnabled(on), retry: () => actions.retry() };

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useGpsSharing(): GpsSharingState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
