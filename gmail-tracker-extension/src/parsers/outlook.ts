import type { EmailProviderParser } from "../types";
import { isComposeImageByContentEditable, log } from "../shared";

// Icon-font glyphs (presence indicator, etc.) get embedded directly in a
// recipient pill's textContent as Private Use Area characters, bracketing
// the actual name — confirmed via live inspection (char codes 57344-63743,
// i.e. U+E000-U+F8FF). Strip them before comparing against the
// aria-label-derived cache key below, or the match silently fails.
// Built via String.fromCodePoint rather than a literal regex range so this
// stays readable in any editor/diff instead of embedding invisible glyphs
// directly in the source (the exact class of bug this function fixes).
const PRIVATE_USE_AREA = new RegExp(
  `[${String.fromCodePoint(0xe000)}-${String.fromCodePoint(0xf8ff)}]`,
  "g"
);
function stripPrivateUseGlyphs(text: string): string {
  return text.replace(PRIVATE_USE_AREA, "");
}

export class OutlookParser implements EmailProviderParser {
  readonly name = "Outlook";

  // Outlook Web (outlook.office.com/outlook.live.com for work/school and
  // personal accounts, plus outlook.cloud.microsoft — the domain Microsoft
  // has been migrating users to, confirmed live: outlook.office.com/mail/
  // now 302s straight to outlook.cloud.microsoft/mail/) never exposes a
  // resolved contact's email as a DOM attribute the way Gmail does with
  // data-hovercard-id — confirmed via live inspection. The only place the
  // email appears before send-time is the autocomplete suggestion's own
  // aria-label ("Full Name - email@domain.com"), and only a *hovercard*
  // triggered by genuine hardware mouse movement reveals it afterwards
  // (confirmed: synthetic dispatchEvent does NOT trigger it — a content
  // script has no way to fake that). So instead of reading the final DOM at
  // send time like Gmail, we capture (name -> email) the moment a
  // suggestion is clicked, and look it up later by the pill's display name.
  private nameToEmail = new Map<string, string>();

  constructor() {
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as Element | null;
        const option = target?.closest?.('button[role="option"][aria-label*=" - "]');
        if (!option) return;
        const label = option.getAttribute("aria-label") || "";
        const match = label.match(/^(.*)\s-\s(\S+@\S+)$/);
        const name = match?.[1];
        const email = match?.[2];
        if (!name || !email) return;
        this.nameToEmail.set(name.trim(), email.trim());
        log("Outlook: captured name->email from suggestion", { name, email });
      },
      true
    );
  }

  matchesActiveDocument(): boolean {
    return (
      location.hostname === "outlook.office.com" ||
      location.hostname === "outlook.live.com" ||
      location.hostname === "outlook.cloud.microsoft"
    );
  }

  getActiveAccountEmail(): string | null {
    // The folder tree's root node (the mailbox itself) carries the signed-in
    // account's email as its `title`. First match only — doesn't attempt to
    // handle multiple simultaneously-open mailboxes/shared accounts.
    const root = document.querySelector('[role="treeitem"][title*="@"]');
    const email = root?.getAttribute("title") ?? null;
    if (email) {
      log("Outlook: resolved active account from folder tree root", { email });
    } else {
      log("Outlook: could not resolve active account email");
    }
    return email;
  }

  getComposeContainer(sendBtn: Element): Element | null {
    return sendBtn.closest(".owaMailComposeEditorScrollContainer");
  }

  getMessageBody(compose: Element): Element | null {
    return compose.querySelector('[contenteditable="true"][aria-label="Message body"]');
  }

  getSubject(compose: Element): string {
    const el = compose.querySelector<HTMLInputElement>('input[aria-label="Subject"]');
    const subject = el?.value?.trim();
    if (subject) {
      log("Outlook: resolved subject", { subject });
      return subject;
    }
    log("Outlook: subject fallback");
    return "(no subject)";
  }

  // Scoped to the To/Cc/Bcc field wrappers specifically (each carries its own
  // aria-label — confirmed via live inspection) rather than the whole
  // compose container, so this never accidentally matches an email address
  // that's just mentioned in the message body text.
  private static readonly RECIPIENT_FIELD_SELECTORS = ['[aria-label="To"]', '[aria-label="Cc"]', '[aria-label="Bcc"]'];

  getRecipients(compose: Element): string {
    const recipients = new Set<string>();

    for (const selector of OutlookParser.RECIPIENT_FIELD_SELECTORS) {
      const field = compose.querySelector<HTMLElement>(selector);
      if (!field) continue;

      // Direct-text extraction: an external contact's resolved pill already
      // embeds the address as visible text ("Full Name <email@x.com>" —
      // confirmed live), and so does a *not yet resolved* recipient — Tab
      // committed to the next field doesn't guarantee Outlook's async
      // contact-lookup has finished, and pressing it early leaves the
      // address sitting as plain text with no _EType_RECIPIENT_ENTITY class
      // at all (confirmed live: entity count was 0 immediately after Tab).
      // Scanning the field's raw text catches both cases without caring
      // which one actually happened — the old entity-only selector silently
      // dropped the unresolved case, which is what caused real sends to
      // report recipient "(unknown)".
      const text = stripPrivateUseGlyphs(field.textContent || "");
      for (const match of text.matchAll(/[^\s<>(),;]+@[^\s<>(),;]+/g)) {
        recipients.add(match[0]);
      }

      // Name-only fallback: an internal/Exchange-directory contact resolves
      // to an entity showing just the display name — no email anywhere in
      // the DOM — so the regex above finds nothing for it. Only the
      // name->email map captured at autocomplete-click time can resolve
      // these (see constructor).
      const entities = field.querySelectorAll<HTMLElement>('[class*="_EType_RECIPIENT_ENTITY"]');
      for (const entity of Array.from(entities)) {
        const name = stripPrivateUseGlyphs(entity.textContent || "").trim();
        if (!name || name.includes("@")) continue;
        const cached = this.nameToEmail.get(name);
        if (cached) recipients.add(cached);
        else log("Outlook: no cached email for recipient display name", { name });
      }
    }

    const to = recipients.size > 0 ? Array.from(recipients).join(", ") : "(unknown)";
    log("Outlook: resolved recipients", { to });
    return to;
  }

  isComposeImage(img: HTMLImageElement): boolean {
    return isComposeImageByContentEditable(img);
  }

  findSendButton(target: Element): Element | null {
    const btn = target.closest("button");
    if (!btn) return null;
    const label = btn.getAttribute("aria-label") || "";
    return label.toLowerCase() === "send" ? btn : null;
  }
}
