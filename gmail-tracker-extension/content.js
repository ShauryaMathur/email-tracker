(function () {
  console.log("[TrackerExt] Loaded");

  // 🔴 Change this when ngrok URL changes
  const TRACKING_BASE_URL = "https://email-tracker-1356.onrender.com";
  // const TRACKING_BASE_URL = "https://2db1dd5b5796.ngrok-free.app";

  function uuidv4() {
    return crypto.randomUUID();
  }

  function findComposeBodies(root = document) {
    return root.querySelectorAll('div[aria-label="Message Body"]');
  }

function getSubject(compose) {
  const el = compose.querySelector('input[name="subjectbox"]');
  return el?.value?.trim() || "(no subject)";
}

function getRecipients(compose) {
  if (!compose) return "(unknown)";

  // 1️⃣ All confirmed email chips
  const chipEls = compose.querySelectorAll('div.akl');
  const chipEmails = Array.from(chipEls)
    .map(el => el.innerText.trim())
    .filter(Boolean);

  // 2️⃣ Any text still in the input fields
  const inputEls = compose.querySelectorAll('input[aria-label$="recipients"]');
  const inputEmails = Array.from(inputEls)
    .map(el => el.value.trim())
    .filter(Boolean);

  // Combine both
  const recipients = [...chipEmails, ...inputEmails];

  return recipients.length > 0 ? recipients.join(", ") : "(unknown)";
}

function handleSendClick(sendBtn) {
  const compose = sendBtn.closest('div[role="dialog"]');
  if (!compose) return;

  const body = compose.querySelector('div[aria-label="Message Body"]');
  if (!body) return;

  // Already injected → skip
  if (body.dataset.trackerInjected === "true") return;

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
  }).catch(() => {});

  // Inject pixel at send-time
  const img = document.createElement("img");
  img.src = `${TRACKING_BASE_URL}/track/${uuid}`;
  img.width = 1;
  img.height = 1;
  img.style.display = "none";

  body.appendChild(img);
  body.dataset.trackerInjected = "true";

  console.log("[TrackerExt] Send detected → pixel injected", {
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

  handleSendClick(sendBtn);
}, true);


  function injectPixel(composeBody) {
    // Prevent duplicate injection
    if (composeBody.dataset.trackerInjected === "true") return;

    const uuid = uuidv4();
    const img = document.createElement("img");

    img.src = `${TRACKING_BASE_URL}/track/${uuid}`;
    img.width = 1;
    img.height = 1;
    img.style.opacity = "0";

    composeBody.appendChild(img);
    composeBody.dataset.trackerInjected = "true";

    console.log("[TrackerExt] Pixel injected:", uuid);
  }

})();
