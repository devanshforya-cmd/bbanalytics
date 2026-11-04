import { isWorkspaceStorageKey, WORKSPACE_EPOCH_KEY, type WorkspaceResetState } from './workspace-reset';

let installed = false;
export function installWorkspaceFetch() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  const loadedEpoch = localStorage.getItem(WORKSPACE_EPOCH_KEY);
  let state: Promise<WorkspaceResetState> | null = null;
  let clearing = false;
  async function clearAndReload(epoch: string): Promise<never> {
    if (!clearing) {
      clearing = true;
      for (const storage of [localStorage, sessionStorage]) {
        for (const key of Object.keys(storage)) if (isWorkspaceStorageKey(key)) storage.removeItem(key);
      }
      localStorage.setItem(WORKSPACE_EPOCH_KEY, epoch);
      // Other tabs stop immediately; in-memory queues are discarded on navigation.
      window.dispatchEvent(new Event('bb-workspace-reset'));
      try {
        const request = indexedDB.deleteDatabase('bb_command_center_offline_cache');
        request.onblocked = () => { /* Reload closes any open cache connection. */ };
        if ('caches' in window) await Promise.all((await caches.keys()).filter(key => key.startsWith('bb-')).map(key => caches.delete(key)));
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration('/sw.js');
          await (await registration?.pushManager?.getSubscription())?.unsubscribe();
        }
      } catch { /* Server epoch checks still block every stale upload. */ }
      window.location.replace('/login');
    }
    throw new Error('Workspace was reset. Sign in again.');
  }
  async function readState() {
    const response = await originalFetch('/api/workspace-state', { cache: 'no-store' });
    if (!response.ok) throw new Error('Workspace status is unavailable. Reconnect before syncing.');
    const result = await response.json() as WorkspaceResetState;
    if (typeof result.epoch !== 'string' || !result.epoch) throw new Error('Invalid workspace status.');
    if (result.epoch !== loadedEpoch) return clearAndReload(result.epoch);
    if (result.resetting) throw new Error('Workspace reset is in progress. Please reload shortly.');
    return result;
  }
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || url.pathname === '/api/workspace-state') return originalFetch(input, init);
    if (clearing) throw new Error('Workspace is reloading.');
    state ||= readState().catch(error => { state = null; throw error; });
    const current = await state;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Workspace-Epoch', current.epoch);
    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 409 || response.status === 503) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === 'WORKSPACE_RESET') { state = null; await readState(); throw new Error(body.error); }
    }
    return response;
  };
  window.addEventListener('storage', event => {
    if (event.key === WORKSPACE_EPOCH_KEY && event.newValue !== loadedEpoch) void clearAndReload(event.newValue || 'initial').catch(() => {});
  });
  void (state = readState().catch(error => { state = null; throw error; })).catch(() => {});
}
