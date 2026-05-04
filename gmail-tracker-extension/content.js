(function () {
  const DEBUG = true;
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

    // 1️⃣ All confirmed email chips
    const chipEls = compose.querySelectorAll('div.akl');
    const chipEmails = Array.from(chipEls)
      .map(el => el.innerText.trim())
      .filter(Boolean);

    // 2️⃣ Any text still in the input fields (aria-label varies between compose and reply)
    const inputEls = compose.querySelectorAll('input[aria-label$="recipients"], input[aria-label="To"]');
    const inputEmails = Array.from(inputEls)
      .map(el => el.value.trim())
      .filter(Boolean);

    // Combine both
    const recipients = [...chipEmails, ...inputEmails];

    const to = recipients.length > 0 ? recipients.join(", ") : "(unknown)";
    log("Resolved recipients", { to, chipCount: chipEmails.length, inputCount: inputEmails.length });
    return to;
  }

  function extractTrackUuid(src) {
    if (!src) {
      log("extractTrackUuid: empty src");
      return null;
    }

    const decoded = decodeURIComponent(src);
    const directPrefix = `${TRACKING_BASE_URL}${TRACK_PATH_PREFIX}`;
    if (decoded.startsWith(directPrefix)) {
      const uuid = decoded.slice(directPrefix.length).split(/[?#]/)[0] || null;
      log("extractTrackUuid: matched direct prefix", { src, uuid });
      return uuid;
    }

    const markerIndex = decoded.indexOf(TRACK_PATH_PREFIX);
    if (markerIndex === -1) {
      log("extractTrackUuid: not a tracker URL", { src });
      return null;
    }

    const candidate = decoded.slice(markerIndex + TRACK_PATH_PREFIX.length).split(/[?#]/)[0];
    log("extractTrackUuid: matched fallback marker", { src, uuid: candidate || null });
    return candidate || null;
  }

  function tagImageAsSenderView(img) {
    if (!(img instanceof HTMLImageElement)) {
      log("tagImageAsSenderView: skipped non-image node");
      return;
    }
    if (img.dataset.trackerSenderTagged === "true") {
      log("tagImageAsSenderView: already tagged", { src: img.getAttribute("src") });
      return;
    }
    if (isComposeImage(img)) {
      log("tagImageAsSenderView: skipped compose image", { src: img.getAttribute("src") });
      return;
    }

    const uuid = extractTrackUuid(img.getAttribute("src"));
    if (!uuid) {
      log("tagImageAsSenderView: skipped non-tracker image", { src: img.getAttribute("src") });
      return;
    }

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
    if (root instanceof HTMLImageElement) {
      log("tagSenderViewTrackers: scanning single image node");
      tagImageAsSenderView(root);
      return;
    }

    if (root instanceof Element || root instanceof Document) {
      const imgs = root.querySelectorAll("img");
      log("tagSenderViewTrackers: scanning image collection", { count: imgs.length });
      imgs.forEach(tagImageAsSenderView);
      return;
    }

    log("tagSenderViewTrackers: skipped unsupported root", { nodeType: root?.nodeType });
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

    const uuid = uuidv4();

    const subject = getSubject(compose);
    const to = getRecipients(compose);

    // Register final metadata
    fetch(`${TRACKING_BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uuid,
        subject,
        to
      })
    }).then((res) => {
      log("register call completed", { status: res.status, ok: res.ok, uuid });
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
    log("MutationObserver triggered", { mutationCount: mutations.length });
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element || node instanceof HTMLImageElement) {
          log("MutationObserver processing added node", {
            nodeName: node.nodeName,
            nodeType: node.nodeType
          });
          tagSenderViewTrackers(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  log("MutationObserver started");
  window.addEventListener("hashchange", () => {
    log("hashchange detected", { href: window.location.href, hash: window.location.hash });
    tagSenderViewTrackers(document);
  });
  tagSenderViewTrackers(document);

})();
