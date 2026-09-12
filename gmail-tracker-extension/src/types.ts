// Domain interface: one implementation per webmail provider (Gmail, Outlook,
// Yahoo, ...). Each provider's DOM is completely different — chip structure,
// account-switcher markup, reply rendering — so every method here is
// deliberately provider-specific behind a shared shape. content.ts only ever
// talks to this interface, never to a specific provider's DOM directly.
export interface EmailProviderParser {
  /** Human-readable name, used only in log lines. */
  readonly name: string;

  /** Is this provider's webmail UI actually present in the current document? */
  matchesActiveDocument(): boolean;

  /** The email address of whichever account is active in this tab/window, or null if it can't be determined. */
  getActiveAccountEmail(): string | null;

  /** Given the Send button that was just clicked, find the enclosing compose/reply container. */
  getComposeContainer(sendBtn: Element): Element | null;

  /** The editable message body element within a compose container. */
  getMessageBody(compose: Element): Element | null;

  getSubject(compose: Element): string;

  /** Comma-joined recipient email addresses (never display names). */
  getRecipients(compose: Element): string;

  /** Is this img currently part of an in-progress compose (not yet sent) — used to avoid tagging pixels the user hasn't sent yet. */
  isComposeImage(img: HTMLImageElement): boolean;

  /**
   * Given a click's target, find the actual Send button if this click was on
   * one, else null. Combines "is this a button" + "does its label say Send"
   * so provider-specific selectors/label text never leak into content.ts.
   */
  findSendButton(target: Element): Element | null;
}

export interface StoredAuthEntry {
  token: string;
  savedAt: number;
}

export type AuthTokenMap = Record<string, StoredAuthEntry>;
