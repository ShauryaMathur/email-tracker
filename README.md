# Email Tracker

A personal project by Shaurya Mathur.

---

Ever sent an important email and spent the rest of the day wondering if it was even opened? This tool solves that. It quietly tracks when your emails get opened and notifies you the moment they do — no third-party services, no subscriptions, just yours.

## What it does

- **Tracks email opens** — know exactly when someone opens an email you sent
- **Real-time Telegram notifications** — get pinged the moment your email is read
- **Works inside Gmail** — no workflow changes, send emails exactly as you normally would
- **Doesn't count your own views** — opening your sent mail won't trigger a false notification
- **Tracks replies too** — not just new emails, but replies in ongoing threads

## How it works (roughly)

There are two pieces:

**A Chrome extension** that lives inside Gmail. When you hit send, it invisibly tags your email so it can be tracked later.

**A Flask backend** that watches for those tags. When your recipient opens the email, the backend logs it and fires off a Telegram message to let you know.

That's it.

## Built for personal use

This is a side project I built for myself — to scratch an itch and learn a bit along the way. It's not a product, there's no roadmap, and it makes no promises. Use it as-is or fork it and make it your own.

---

*Shaurya Mathur*
