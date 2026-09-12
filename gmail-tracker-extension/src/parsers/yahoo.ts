import type { EmailProviderParser } from "../types";
import { extractEmailInParens, isComposeImageByContentEditable, log } from "../shared";

// Yahoo prefixes each recipient pill's visible text with a literal "|"
// character (confirmed via live inspection — plain ASCII pipe, char code
// 124, not an icon glyph) — strip it before comparing/displaying.
function cleanPillText(text: string): string {
  return text.replace(/^\|/, "").trim();
}

export class YahooParser implements EmailProviderParser {
  readonly name = "Yahoo";

  matchesActiveDocument(): boolean {
    return location.hostname === "mail.yahoo.com";
  }

  getActiveAccountEmail(): string | null {
    const btn = document.querySelector('button[aria-label^="Manage your Yahoo accounts"]');
    const label = btn?.getAttribute("aria-label") || "";
    const email = extractEmailInParens(label);
    if (email) {
      log("Yahoo: resolved active account", { email });
    } else {
      log("Yahoo: could not resolve active account email");
    }
    return email;
  }

  getComposeContainer(sendBtn: Element): Element | null {
    return sendBtn.closest('[data-test-id="compose"]');
  }

  getMessageBody(compose: Element): Element | null {
    return compose.querySelector('[data-test-id="rte"]');
  }

  getSubject(compose: Element): string {
    const el = compose.querySelector<HTMLInputElement>('input[aria-label="Subject"]');
    const subject = el?.value?.trim();
    if (subject) {
      log("Yahoo: resolved subject", { subject });
      return subject;
    }
    log("Yahoo: subject fallback");
    return "(no subject)";
  }

  getRecipients(compose: Element): string {
    const pills = compose.querySelectorAll<HTMLElement>('[data-test-id="y-pill"]');
    const recipients = Array.from(pills)
      .map((pill) => this.resolvePillEmail(pill))
      .filter((email): email is string => Boolean(email));

    const to = recipients.length > 0 ? recipients.join(", ") : "(unknown)";
    log("Yahoo: resolved recipients", { to, pillCount: pills.length });
    return to;
  }

  private resolvePillEmail(pill: HTMLElement): string | null {
    const text = cleanPillText(pill.textContent || "");
    if (!text) return null;
    // The common case: a raw-typed address that never resolved to a saved
    // contact — the pill's visible text already IS the email.
    if (text.includes("@")) return text;

    // For a resolved contact, the pill's own visible text is the display
    // name, same problem as Gmail/Outlook — but Yahoo's fix is simpler than
    // either of those: a descendant element carries a `title` attribute in
    // "Name <email>" form. Scoped as a *descendant of this specific pill*
    // (not a sibling-array index correlation, which — confirmed via live
    // testing with 3+ recipients — does NOT reliably hold across different
    // pill counts), so there's no cross-recipient mixup risk.
    const title = pill.querySelector("[title]")?.getAttribute("title") || "";
    const match = title.match(/<([^<>]+@[^<>]+)>/);
    if (match?.[1]) return match[1];
    log("Yahoo: no resolvable email for recipient display name", { name: text });
    return null;
  }

  isComposeImage(img: HTMLImageElement): boolean {
    return isComposeImageByContentEditable(img);
  }

  findSendButton(target: Element): Element | null {
    return target.closest('button[data-test-id="compose-send-button"]');
  }
}
