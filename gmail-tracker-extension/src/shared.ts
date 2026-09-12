import type { AuthTokenMap } from "./types";
import { DEBUG, log } from "./logger";

export { DEBUG, log };

export const TRACKING_BASE_URL = "https://email-tracker-1356.onrender.com";
const TRACK_PATH_PREFIX = "/track/";

export function uuidv4(): string {
  const id = crypto.randomUUID();
  log("Generated UUID", { id });
  return id;
}

export function extractTrackUuid(src: string | null): string | null {
  // No log on the empty/no-match paths — called for every <img> on every
  // MutationObserver batch, and the overwhelming majority aren't trackers.
  if (!src) return null;

  const decoded = decodeURIComponent(src);
  const directPrefix = `${TRACKING_BASE_URL}${TRACK_PATH_PREFIX}`;
  if (decoded.startsWith(directPrefix)) {
    const uuid = decoded.slice(directPrefix.length).split(/[?#]/)[0] || null;
    log("extractTrackUuid: matched direct prefix", { src, uuid });
    return uuid;
  }

  const markerIndex = decoded.indexOf(TRACK_PATH_PREFIX);
  if (markerIndex === -1) return null;

  const candidate = decoded.slice(markerIndex + TRACK_PATH_PREFIX.length).split(/[?#]/)[0];
  log("extractTrackUuid: matched fallback marker", { src, uuid: candidate || null });
  return candidate || null;
}

// --- Auth: per-account JWT, kept in sync with chrome.storage.local ---
// Loaded async on script start and kept fresh via storage.onChanged so that
// the send-click handler (which must stay synchronous — appending the
// tracking pixel can't wait on an async storage read, or the provider may
// finish sending before the pixel lands in the DOM) can look tokens up
// without awaiting anything.
let authTokens: AuthTokenMap = {};

export function loadAuthTokens(): void {
  chrome.storage.local.get(["authTokens"], (result) => {
    authTokens = (result.authTokens as AuthTokenMap) || {};
    log("Loaded auth tokens from storage", { accounts: Object.keys(authTokens) });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.authTokens) {
    authTokens = (changes.authTokens.newValue as AuthTokenMap) || {};
    log("authTokens updated via storage.onChanged", { accounts: Object.keys(authTokens) });
  }
});

export function getStoredToken(email: string | null): string | null {
  if (!email) return null;
  return authTokens[email]?.token || null;
}

export function clearStoredToken(email: string | null): void {
  if (!email) return;
  chrome.storage.local.get(["authTokens"], (result) => {
    const tokens = (result.authTokens as AuthTokenMap) || {};
    delete tokens[email];
    chrome.storage.local.set({ authTokens: tokens });
  });
}

// --- Small helpers shared by 2+ parsers, extracted to avoid copy-pasting
// the exact same DOM-parsing logic — see each call site for why the pattern
// recurs. Not everything goes here: e.g. Gmail's chip resolution and
// Outlook's aria-label capture are structurally different enough per
// provider that forcing a shared abstraction would obscure more than it
// saves. ---

/** Extracts an email from a label formatted like "Full Name (email@x.com)" —
 * the pattern Gmail's and Yahoo's account-switcher aria-labels both use. */
export function extractEmailInParens(label: string): string | null {
  const match = label.match(/\(([^()]+@[^()]+)\)/);
  return match?.[1] ?? null;
}

/** Default "is this image still being composed" check: true if it sits
 * inside any editable region. Outlook and Yahoo both rely on exactly this;
 * Gmail needs an extra check on top (see GmailParser.isComposeImage) since
 * its message body isn't always marked contenteditable the same way. */
export function isComposeImageByContentEditable(img: HTMLImageElement): boolean {
  return !!img.closest('[contenteditable="true"]');
}

let lastSetupTabOpenedAt = 0;
export function openSetupTab(email: string | null): void {
  // Throttle so a burst of sends while logged out doesn't spawn a tab per send.
  const now = Date.now();
  if (now - lastSetupTabOpenedAt < 30000) {
    log("openSetupTab: throttled, a setup tab was opened recently");
    return;
  }
  lastSetupTabOpenedAt = now;

  const url = new URL(`${TRACKING_BASE_URL}/setup`);
  if (email) url.searchParams.set("email", email);
  log("openSetupTab: opening", { url: url.toString() });
  window.open(url.toString(), "_blank");
}
