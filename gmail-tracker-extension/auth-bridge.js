// Runs only on the setup page (see manifest.json content_scripts match).
// Bridges the plain web page (no chrome.* access) to extension storage:
// the setup page window.postMessage's the issued JWT on success, and this
// script writes it into chrome.storage.local where content.js reads it.
(function () {
  const LOG_PREFIX = "[TrackerAuthBridge]";

  function log(message, data) {
    if (data !== undefined) {
      console.log(`${LOG_PREFIX} ${message}`, data);
      return;
    }
    console.log(`${LOG_PREFIX} ${message}`);
  }

  function storeToken(email, token) {
    chrome.storage.local.get(["authTokens"], (result) => {
      const tokens = result.authTokens || {};
      tokens[email] = { token, savedAt: Date.now() };
      chrome.storage.local.set({ authTokens: tokens }, () => {
        log("Stored auth token for account", { email });
      });
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;

    const data = event.data;
    if (!data || data.type !== "EMAIL_TRACKER_AUTH") return;
    if (!data.email || !data.token) {
      log("Ignored EMAIL_TRACKER_AUTH message missing email/token", data);
      return;
    }

    log("Received auth token from setup page", { email: data.email });
    storeToken(data.email, data.token);
  });

  log("Loaded on setup page", { href: window.location.href });
})();
