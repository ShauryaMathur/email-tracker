import type { EmailProviderParser } from "./types";
import {
  TRACKING_BASE_URL,
  clearStoredToken,
  getStoredToken,
  loadAuthTokens,
  log,
  openSetupTab,
  uuidv4,
} from "./shared";

/**
 * Watches for the provider's Send button being clicked, and — if this
 * account has a linked auth token — registers the outgoing email with the
 * backend and injects a tracking pixel before the provider finishes sending.
 * If there's no token, the send goes out untracked and a setup tab opens.
 */
export function initSendTracking(parser: EmailProviderParser): void {
  loadAuthTokens();

  function handleSendClick(sendBtn: Element): void {
    const compose = parser.getComposeContainer(sendBtn);
    if (!compose) {
      log("handleSendClick: no compose container found");
      return;
    }

    const body = parser.getMessageBody(compose) as HTMLElement | null;
    if (!body) {
      log("handleSendClick: no message body found");
      return;
    }

    // Already injected → skip
    if (body.dataset.trackerInjected === "true") {
      log("handleSendClick: tracker already injected, skipping");
      return;
    }

    const activeEmail = parser.getActiveAccountEmail();
    const token = getStoredToken(activeEmail);

    if (!token) {
      log("handleSendClick: no auth token for this account, sending untracked", { activeEmail });
      openSetupTab(activeEmail);
      return;
    }

    const uuid = uuidv4();
    const subject = parser.getSubject(compose);
    const to = parser.getRecipients(compose);

    // Register final metadata. Not awaited — the pixel below must be
    // appended synchronously, in this same click handler, or the provider
    // may finish serializing the send before we get the chance.
    fetch(`${TRACKING_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uuid, subject, to }),
    })
      .then((res) => {
        log("register call completed", { status: res.status, ok: res.ok, uuid });
        if (res.status === 401) {
          log("register: token rejected, clearing stored token", { activeEmail });
          clearStoredToken(activeEmail);
        }
      })
      .catch((err) => {
        log("register call failed", { uuid, error: String(err) });
      });

    // Inject pixel at send-time
    const img = document.createElement("img");
    img.src = `${TRACKING_BASE_URL}/track/${uuid}`;
    img.width = 1;
    img.height = 1;
    img.style.display = "none";

    body.appendChild(img);
    body.dataset.trackerInjected = "true";

    log("Send detected: pixel injected", { uuid, subject, to });
  }

  document.addEventListener(
    "click",
    (e) => {
      const sendBtn = parser.findSendButton(e.target as Element);
      if (!sendBtn) return;
      log("Detected send button click");
      handleSendClick(sendBtn);
    },
    true
  );
}
