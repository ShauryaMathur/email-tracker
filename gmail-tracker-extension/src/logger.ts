// Deliberately dependency-free (no chrome.* calls, no top-level side
// effects) — auth-bridge.ts imports only this, not all of shared.ts, so its
// bundle doesn't drag in the auth-token/chrome.storage machinery it has no
// use for. Importing from a module with side effects prevents esbuild from
// tree-shaking the rest of it out, even for unrelated exports.
export const DEBUG = false;
const LOG_PREFIX = "[TrackerExt]";

export function log(message: string, data?: unknown): void {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`${LOG_PREFIX} ${ts} ${message}`, data);
    return;
  }
  console.log(`${LOG_PREFIX} ${ts} ${message}`);
}
