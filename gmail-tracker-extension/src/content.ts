import type { EmailProviderParser } from "./types";
import { DEBUG, log } from "./shared";
import { GmailParser } from "./parsers/gmail";
import { OutlookParser } from "./parsers/outlook";
import { YahooParser } from "./parsers/yahoo";
import { startSenderViewTagging } from "./sender-view-tagger";
import { initSendTracking } from "./send-tracker";

log("Loaded", { href: window.location.href, debug: DEBUG });

// Registry of all supported providers. Adding a new one is just adding an
// instance here — nothing else in this file is provider-specific.
const PARSERS: EmailProviderParser[] = [new GmailParser(), new OutlookParser(), new YahooParser()];

const activeParser = PARSERS.find((p) => p.matchesActiveDocument()) ?? null;

if (!activeParser) {
  log("No provider parser matched this document — extension is idle here");
} else {
  log(`Active provider: ${activeParser.name}`);
  initSendTracking(activeParser);
  startSenderViewTagging(activeParser);
}
