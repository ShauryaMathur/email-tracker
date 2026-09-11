# Setting up Email Tracker

You got a zip file with an extension in it — here's how to get it running. Takes about 5 minutes.

## Before you start, have these ready

- **Chrome**, signed into the Gmail account you send from.
- An **authenticator app** on your phone — Google Authenticator, Authy, or 1Password all work. This is for a one-time login code, no password to remember.
- **Telegram** installed — this is how you'll get notified when someone opens an email you sent.

## 1. Unzip the file

Unzip the file you were sent. You should end up with a folder containing a few files (`manifest.json`, `content.js`, etc.) — leave it wherever you unzipped it, don't move or delete it later, Chrome keeps reading from that folder.

## 2. Turn on Developer Mode in Chrome

1. Open a new tab and go to `chrome://extensions`
2. In the **top-right corner**, flip the **Developer mode** toggle on
3. Three new buttons will appear at the top-left: "Load unpacked", "Pack extension", "Update"

## 3. Load the extension

1. Click **Load unpacked**
2. Select the folder you unzipped in step 1
3. It should now show up in your extensions list, enabled

## 4. Send a test email

Go to Gmail and send yourself (or anyone) a test email. Since this is your first time, a **new tab will pop open automatically** asking you to set up your account — that first test email won't be tracked, and that's expected.

## 5. Set up your account (the new tab)

1. Your email should already be filled in — confirm it's right
2. You'll see a **QR code** — open your authenticator app and scan it (or type in the backup key shown below it if scanning doesn't work)
3. Your authenticator app will now show a 6-digit code — type that into the box and continue
4. Next it'll ask you to connect Telegram:
   - Open Telegram and search for **@PeekabooMail_bot**
   - Send it `/start`
   - It'll reply with a number — that's your Chat ID
   - Copy that number back into the setup page

   *(Setting up a second or third email later? Just send `/start` to the bot again — it'll reply with the same Chat ID any time, so you don't need to dig back through the chat history to find it.)*
5. You should see "✅ You're all set" — you can close that tab

## 6. You're done

From now on, every email you send from Gmail gets tracked automatically — no extra steps. When someone opens it, you'll get a Telegram message from the bot letting you know.

## What this actually does, in plain terms

It adds a tiny invisible tracking image to emails you send, so it can tell when the email gets opened, and pings you on Telegram when that happens. It doesn't read your emails or anyone else's — just knows when your own sent messages get opened.

## If something goes wrong

- **No setup tab opened after sending?** Check the address bar for a small blocked-popup icon — click it and allow popups for Gmail.
- **QR code won't scan?** Use the manual backup key shown below it instead — most authenticator apps have an "enter code manually" option.
- **Bot didn't reply on Telegram?** Make sure you sent `/start` (not just any message) and double check you searched for the exact bot username.
- Stuck on anything else — just text me.
