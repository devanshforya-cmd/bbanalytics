export interface WorkspaceResetState { epoch: string; resetting: boolean }
export const WORKSPACE_EPOCH_KEY = 'bb_workspace_epoch';
export function workspaceEpochMatches(header: string | null, state: WorkspaceResetState) {
  return !state.resetting && header === state.epoch;
}
export function isWorkspaceStorageKey(key: string) {
  return /^(bb[_:-]|brand[_ -]?bucket)/i.test(key);
}
