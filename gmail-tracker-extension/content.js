(function () {
  const DEBUG = false;
  const LOG_PREFIX = "[TrackerExt]";

  function log(message, data) {
    if (!DEBUG) return;
    const ts = new Date().toISOString();
    if (data !== undefined) {
      console.log(`${LOG_PREFIX} ${ts} ${message}`, data);
      return;
    }
    console.log(`${LOG_PREFIX} ${ts} ${message}`);
  }

  log("Loaded", { href: window.location.href, hash: window.location.hash });

  const TRACKING_BASE_URL = "https://email-tracker-1356.onrender.com";
  const TRACK_PATH_PREFIX = "/track/";

  // --- Auth: per-Gmail-account JWT, kept in sync with chrome.storage.local ---
  // Loaded async on script start and kept fresh via storage.onChanged so that
  // handleSendClick (which must stay synchronous — see below) can look tokens
  // up without awaiting anything.
  let authTokens = {};

  function loadAuthTokens() {
    chrome.storage.local.get(["authTokens"], (result) => {
      authTokens = result.authTokens || {};
      log("Loaded auth tokens from storage", { accounts: Object.keys(authTokens) });
    });
  }
  loadAuthTokens();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.authTokens) {
      authTokens = changes.authTokens.newValue || {};
      log("authTokens updated via storage.onChanged", { accounts: Object.keys(authTokens) });
    }
  });

  function getStoredToken(email) {
    if (!email) return null;
    return authTokens[email]?.token || null;
  }

  function clearStoredToken(email) {
    if (!email) return;
    chrome.storage.local.get(["authTokens"], (result) => {
      const tokens = result.authTokens || {};
      delete tokens[email];
      chrome.storage.local.set({ authTokens: tokens });
    });
  }

  function getActiveGmailEmail() {
    // Gmail's account-switcher button generally has an aria-label like
    // "Google Account: Full Name (email@example.com)". This is DOM-scraping
    // and may need updating if Gmail changes its markup — same fragility
    // tradeoff as getSubject()/getRecipients() below.
    const accountBtn = document.querySelector(
      'a[aria-label*="Google Account"], a[aria-label*="Account"][href*="SignOutOptions"]'
    );
    const label = accountBtn?.getAttribute("aria-label");
    const match = label?.match(/\(([^()]+@[^()]+)\)/);
    if (match) {
      log("getActiveGmailEmail: resolved from account switcher", { email: match[1] });
      return match[1];
    }
    log("getActiveGmailEmail: could not resolve active account email");
    return null;
  }

  let lastSetupTabOpenedAt = 0;
  function openSetupTab(email) {
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

  function uuidv4() {
    const id = crypto.randomUUID();
    log("Generated UUID", { id });
    return id;
  }

  function getSubject(compose) {
    const el = compose.querySelector('input[name="subjectbox"]');
    if (el?.value?.trim()) {
      const subject = el.value.trim();
      log("Resolved subject from input", { subject });
      return subject;
    }
    // Replies: no subject input — fall back to thread title in the page
    const threadHeader = document.querySelector('h2[data-legacy-thread-id], h2.hP');
    if (threadHeader?.textContent?.trim()) {
      const subject = "Re: " + threadHeader.textContent.trim();
      log("Resolved subject from thread header", { subject });
      return subject;
    }
    log("Resolved subject: fallback");
    return "(no subject)";
  }

  function getRecipients(compose) {
    if (!compose) return "(unknown)";

    // 1️⃣ All confirmed email chips (new compose)
    const chipEls = compose.querySelectorAll('div.akl');
    const chipEmails = Array.from(chipEls)
      .map(el => el.innerText.trim())
      .filter(Boolean);

    // 2️⃣ Any text still in the input fields (aria-label varies between compose and reply)
    const inputEls = compose.querySelectorAll('input[aria-label$="recipients"], input[aria-label="To"]');
    const inputEmails = Array.from(inputEls)
      .map(el => el.value.trim())
      .filter(Boolean);

    let recipients = [...chipEmails, ...inputEmails];

    // 3️⃣ Replies: Gmail renders the collapsed "to <name>" recap as a
    // separate DOM branch, not a descendant of the reply editor at all — so
    // #1 and #2 above never match it (confirmed via live DOM inspection).
    // Fall back to the nearest visible [email]-attributed element sitting
    // just above this reply's message body, which is that recap line.
    if (recipients.length === 0) {
      const recapEmail = getReplyRecapEmail(compose);
      if (recapEmail) recipients = [recapEmail];
    }

    const to = recipients.length > 0 ? recipients.join(", ") : "(unknown)";
    log("Resolved recipients", { to, chipCount: chipEmails.length, inputCount: inputEmails.length });
    return to;
  }

  function getReplyRecapEmail(compose) {
    const body = compose.querySelector('div[aria-label="Message Body"]');
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect();

    let best = null;
    let bestGap = Infinity;
    document.querySelectorAll('[email]').forEach((el) => {
      if (el.offsetParent === null) return; // skip hidden/detached elements
      const gap = bodyRect.top - el.getBoundingClientRect().bottom;
      if (gap >= 0 && gap < 300 && gap < bestGap) {
        best = el;
        bestGap = gap;
      }
    });

    if (!best) {
      log("getReplyRecapEmail: no candidate found above message body");
      return null;
    }

    const email = best.getAttribute("email");
    log("getReplyRecapEmail: resolved from recap line", { email, gap: bestGap });
    return email;
  }

  function extractTrackUuid(src) {
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

  function tagImageAsSenderView(img) {
    // No per-candidate logging here on purpose — this runs on every <img> in
    // every MutationObserver batch, and Gmail's DOM churns constantly (list
    // virtualization, hover previews, read-state updates, ...). Only the
    // actual tag-rewrite below is worth a log line.
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.trackerSenderTagged === "true") return;
    if (isComposeImage(img)) return;

    const uuid = extractTrackUuid(img.getAttribute("src"));
    if (!uuid) return;

    const before = img.getAttribute("src");
    const url = new URL(`${TRACKING_BASE_URL}/track/${uuid}`);
    url.searchParams.set("viewer", "sender");
    img.src = url.toString();
    img.dataset.trackerSenderTagged = "true";
    log("tagImageAsSenderView: rewrote tracker src to sender-view", {
      uuid,
      before,
      after: img.src
    });
  }

  function isComposeImage(img) {
    // Suppress tagging for images currently being composed (new email or inline reply)
    if (img.closest('[contenteditable="true"]')) return true;
    if (img.closest('div[aria-label="Message Body"]')) return true;
    return false;
  }

  function tagSenderViewTrackers(root = document) {
    // Runs on every MutationObserver batch — no per-call logging (see
    // tagImageAsSenderView for why). Only an actual tag-rewrite logs.
    if (root instanceof HTMLImageElement) {
      tagImageAsSenderView(root);
      return;
    }

    if (root instanceof Element || root instanceof Document) {
      root.querySelectorAll("img").forEach(tagImageAsSenderView);
    }
  }

  function findReplyCompose(sendBtn) {
    let el = sendBtn.parentElement;
    while (el && el !== document.body) {
      if (el.querySelector('div[aria-label="Message Body"]')) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function handleSendClick(sendBtn) {
    const compose = sendBtn.closest('div[role="dialog"]') || findReplyCompose(sendBtn);
    if (!compose) {
      log("handleSendClick: no compose container found");
      return;
    }

    const body = compose.querySelector('div[aria-label="Message Body"]');
    if (!body) {
      log("handleSendClick: no message body found");
      return;
    }

    // Already injected → skip
    if (body.dataset.trackerInjected === "true") {
      log("handleSendClick: tracker already injected, skipping");
      return;
    }

    const activeEmail = getActiveGmailEmail();
    const token = getStoredToken(activeEmail);

    if (!token) {
      log("handleSendClick: no auth token for this account, sending untracked", { activeEmail });
      openSetupTab(activeEmail);
      return;
    }

    const uuid = uuidv4();

    const subject = getSubject(compose);
    const to = getRecipients(compose);

    // Register final metadata. Not awaited — the pixel below must be
    // appended synchronously, in this same click handler, or Gmail may
    // finish serializing the send before we get the chance.
    fetch(`${TRACKING_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        uuid,
        subject,
        to
      })
    }).then((res) => {
      log("register call completed", { status: res.status, ok: res.ok, uuid });
      if (res.status === 401) {
        log("register: token rejected, clearing stored token", { activeEmail });
        clearStoredToken(activeEmail);
      }
    }).catch((err) => {
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

    log("Send detected: pixel injected", {
      uuid,
      subject,
      to
    });
  }

  document.addEventListener("click", (e) => {
    const sendBtn = e.target.closest('div[role="button"]');
    if (!sendBtn) return;

    const label =
      sendBtn.getAttribute("aria-label") ||
      sendBtn.getAttribute("data-tooltip") ||
      "";

    if (!label.toLowerCase().includes("send")) return;

    log("Detected send button click", {
      label,
      tooltip: sendBtn.getAttribute("data-tooltip"),
      ariaLabel: sendBtn.getAttribute("aria-label")
    });

    handleSendClick(sendBtn);
  }, true);

  const observer = new MutationObserver((mutations) => {
    // No per-batch logging — Gmail's DOM churns on essentially every
    // interaction, so this fires constantly. tagImageAsSenderView() is the
    // one that logs, and only when it actually finds a tracker pixel.
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element || node instanceof HTMLImageElement) {
          tagSenderViewTrackers(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => {
    log("hashchange detected", { href: window.location.href, hash: window.location.hash });
    tagSenderViewTrackers(document);
  });
  tagSenderViewTrackers(document);

})();
