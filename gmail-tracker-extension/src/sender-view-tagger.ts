import type { EmailProviderParser } from "./types";
import { TRACKING_BASE_URL, extractTrackUuid, log } from "./shared";

/**
 * Rewrites a tracker <img> found outside an in-progress compose (i.e. in a
 * message the user is viewing, not writing) to carry `viewer=sender`, so the
 * backend doesn't count the sender re-opening their own sent mail as a real
 * open. Scans the whole page once on load, then incrementally via a
 * MutationObserver for anything added later (webmail SPAs render lazily).
 */
export function startSenderViewTagging(parser: EmailProviderParser): void {
  function tagImage(img: HTMLImageElement): void {
    // No per-candidate logging here on purpose — this runs on every <img> in
    // every MutationObserver batch, and webmail DOM churns constantly (list
    // virtualization, hover previews, read-state updates, ...). Only the
    // actual tag-rewrite below is worth a log line.
    if (img.dataset.trackerSenderTagged === "true") return;
    if (parser.isComposeImage(img)) return;

    const uuid = extractTrackUuid(img.getAttribute("src"));
    if (!uuid) return;

    const before = img.getAttribute("src");
    const url = new URL(`${TRACKING_BASE_URL}/track/${uuid}`);
    url.searchParams.set("viewer", "sender");
    img.src = url.toString();
    img.dataset.trackerSenderTagged = "true";
    log("tagImageAsSenderView: rewrote tracker src to sender-view", { uuid, before, after: img.src });
  }

  function tagAll(root: Document | Element | HTMLImageElement): void {
    if (root instanceof HTMLImageElement) {
      tagImage(root);
      return;
    }
    root.querySelectorAll<HTMLImageElement>("img").forEach(tagImage);
  }

  const observer = new MutationObserver((mutations) => {
    // No per-batch logging — webmail DOM churns on essentially every
    // interaction, so this fires constantly. tagImage() is the one that
    // logs, and only when it actually finds a tracker pixel.
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLImageElement || node instanceof Element) {
          tagAll(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => {
    log("hashchange detected", { href: window.location.href });
    tagAll(document);
  });
  tagAll(document);
}
