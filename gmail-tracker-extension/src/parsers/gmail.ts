import type { EmailProviderParser } from "../types";
import { extractEmailInParens, log } from "../shared";

export class GmailParser implements EmailProviderParser {
  readonly name = "Gmail";

  matchesActiveDocument(): boolean {
    return location.hostname === "mail.google.com";
  }

  getActiveAccountEmail(): string | null {
    // Gmail's account-switcher button generally has an aria-label like
    // "Google Account: Full Name (email@example.com)". This is DOM-scraping
    // and may need updating if Gmail changes its markup — same fragility
    // tradeoff as getSubject()/getRecipients() below.
    const accountBtn = document.querySelector(
      'a[aria-label*="Google Account"], a[aria-label*="Account"][href*="SignOutOptions"]'
    );
    const label = accountBtn?.getAttribute("aria-label") || "";
    const email = extractEmailInParens(label);
    if (email) {
      log("Gmail: resolved active account from account switcher", { email });
    } else {
      log("Gmail: could not resolve active account email");
    }
    return email;
  }

  getComposeContainer(sendBtn: Element): Element | null {
    return sendBtn.closest('div[role="dialog"]') || this.findReplyCompose(sendBtn);
  }

  private findReplyCompose(sendBtn: Element): Element | null {
    let el = sendBtn.parentElement;
    while (el && el !== document.body) {
      if (el.querySelector('div[aria-label="Message Body"]')) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  getMessageBody(compose: Element): Element | null {
    return compose.querySelector('div[aria-label="Message Body"]');
  }

  getSubject(compose: Element): string {
    const el = compose.querySelector<HTMLInputElement>('input[name="subjectbox"]');
    if (el?.value?.trim()) {
      const subject = el.value.trim();
      log("Gmail: resolved subject from input", { subject });
      return subject;
    }
    // Replies: no subject input — fall back to thread title in the page
    const threadHeader = document.querySelector('h2[data-legacy-thread-id], h2.hP');
    if (threadHeader?.textContent?.trim()) {
      const subject = "Re: " + threadHeader.textContent.trim();
      log("Gmail: resolved subject from thread header", { subject });
      return subject;
    }
    log("Gmail: subject fallback");
    return "(no subject)";
  }

  getRecipients(compose: Element): string {
    // 1️⃣ All confirmed email chips (new compose)
    const chipEls = compose.querySelectorAll<HTMLElement>("div.akl");
    const chipEmails = Array.from(chipEls).map((el) => this.resolveChipEmail(el)).filter(Boolean);

    // 2️⃣ Any text still in the input fields (aria-label varies between compose and reply)
    const inputEls = compose.querySelectorAll<HTMLInputElement>(
      'input[aria-label$="recipients"], input[aria-label="To"]'
    );
    const inputEmails = Array.from(inputEls).map((el) => el.value.trim()).filter(Boolean);

    let recipients = [...chipEmails, ...inputEmails];

    // 3️⃣ Replies: Gmail renders the collapsed "to <name>" recap as a
    // separate DOM branch, not a descendant of the reply editor at all — so
    // #1 and #2 above never match it (confirmed via live DOM inspection).
    // Fall back to the nearest visible [email]-attributed element sitting
    // just above this reply's message body, which is that recap line.
    if (recipients.length === 0) {
      const recapEmail = this.getReplyRecapEmail(compose);
      if (recapEmail) recipients = [recapEmail];
    }

    const to = recipients.length > 0 ? recipients.join(", ") : "(unknown)";
    log("Gmail: resolved recipients", { to, chipCount: chipEmails.length, inputCount: inputEmails.length });
    return to;
  }

  private resolveChipEmail(chip: HTMLElement): string {
    // For a resolved contact, the chip's own visible text is the contact's
    // NAME ("Shaurya Mathur"), not the address — confirmed via live DOM
    // inspection. The actual email lives in a `data-hovercard-id` attribute
    // on an ancestor wrapper (Gmail's People Kit chip rendering), several
    // levels up. Fall back to the chip's own text for addresses that never
    // resolved to a contact (data-hovercard-id absent) — that's the case
    // that already worked correctly before this fix.
    const hovercard = chip.closest("[data-hovercard-id]");
    const hovercardEmail = hovercard?.getAttribute("data-hovercard-id");
    if (hovercardEmail && hovercardEmail.includes("@")) {
      return hovercardEmail.trim();
    }
    return chip.innerText.trim();
  }

  private getReplyRecapEmail(compose: Element): string | null {
    const body = this.getMessageBody(compose);
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect();

    let best: Element | null = null;
    let bestGap = Infinity;
    document.querySelectorAll("[email]").forEach((el) => {
      if ((el as HTMLElement).offsetParent === null) return; // skip hidden/detached elements
      const gap = bodyRect.top - el.getBoundingClientRect().bottom;
      if (gap >= 0 && gap < 300 && gap < bestGap) {
        best = el;
        bestGap = gap;
      }
    });

    if (!best) {
      log("Gmail: no reply-recap candidate found above message body");
      return null;
    }

    const email = (best as Element).getAttribute("email");
    log("Gmail: resolved reply recap email", { email, gap: bestGap });
    return email;
  }

  isComposeImage(img: HTMLImageElement): boolean {
    // Suppress tagging for images currently being composed (new email or inline reply)
    if (img.closest('[contenteditable="true"]')) return true;
    if (img.closest('div[aria-label="Message Body"]')) return true;
    return false;
  }

  findSendButton(target: Element): Element | null {
    const btn = target.closest('div[role="button"]');
    if (!btn) return null;
    const label = btn.getAttribute("aria-label") || btn.getAttribute("data-tooltip") || "";
    return label.toLowerCase().includes("send") ? btn : null;
  }
}
