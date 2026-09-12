// Runs only on the setup page (see manifest.json content_scripts match).
// Bridges the plain web page (no chrome.* access) to extension storage:
// the setup page window.postMessage's the issued JWT on success, and this
// script writes it into chrome.storage.local where content.ts reads it.
import type { AuthTokenMap } from "./types";
import { log } from "./logger";

function storeToken(email: string, token: string): void {
  chrome.storage.local.get(["authTokens"], (result) => {
    const tokens = (result.authTokens as AuthTokenMap) || {};
    tokens[email] = { token, savedAt: Date.now() };
    chrome.storage.local.set({ authTokens: tokens }, () => {
      log("Stored auth token for account", { email });
    });
  });
}

interface AuthMessage {
  type: "EMAIL_TRACKER_AUTH";
  email: string;
  token: string;
}

function isAuthMessage(data: unknown): data is AuthMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === "EMAIL_TRACKER_AUTH"
  );
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data;
  if (!isAuthMessage(data)) return;
  if (!data.email || !data.token) {
    log("Ignored EMAIL_TRACKER_AUTH message missing email/token", data);
    return;
  }

  log("Received auth token from setup page", { email: data.email });
  storeToken(data.email, data.token);
});

log("Loaded on setup page", { href: window.location.href });
