(function () {
  console.log("[TrackerExt] Loaded");

  // 🔴 Change this when ngrok URL changes
  const TRACKING_BASE_URL = "https://39a36108a29a.ngrok-free.app";

  function uuidv4() {
    return crypto.randomUUID();
  }

  function findComposeBodies(root = document) {
    return root.querySelectorAll('div[aria-label="Message Body"]');
  }

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

  // Initial pass
  findComposeBodies().forEach(injectPixel);

  // Observe for new compose windows
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Direct compose body
        if (node.matches?.('div[aria-label="Message Body"]')) {
          injectPixel(node);
        }

        // Nested compose body
        node
          .querySelectorAll?.('div[aria-label="Message Body"]')
          .forEach(injectPixel);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
