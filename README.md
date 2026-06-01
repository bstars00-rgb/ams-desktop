# AMS Desktop — local mapping assistant (no backend)

A **local** tool that runs on your laptop. It keeps your clients' mapping-system
logins in an **encrypted vault**, logs into a chosen client (Trip.com, etc.),
reads the room-mapping page, and **recommends the best match with the AMS
algorithm**. It writes a local audit log.

> **No backend, no database, no hosting.** Everything runs on this PC.
> **Credentials and logs never leave this machine** (vault.enc, auth/, audit.log are git-ignored).
> **The tool never clicks "Mapping" — the final confirmation is always yours.**

This is a **separate private project** from the public AMS web app.

---

## ⚠ Before you use it
- **Terms of Service:** automating a partner portal may be restricted. Use your own
  legitimate accounts, keep volumes reasonable, and prefer official APIs where offered.
- **Security:** the vault is encrypted with **AES-256-GCM** using a master password you
  choose. Pick a strong master password. The encrypted `vault.enc` stays on this PC.
- **Safety:** recommendation only — it does not submit mappings.

---

## Install
```bash
cd ams-desktop
npm install
npx playwright install chromium
```

## 1) Add your clients to the vault (one-time)
```bash
npm run vault add      # name / login URL / id / password  (encrypted)
npm run vault list     # list clients (no passwords shown)
npm run vault show     # reveal one client's details (after unlock)
npm run vault remove   # remove a client
```
The first run asks you to set a **master password**. You'll need it each time.

## 2) Run the assistant
```bash
npm run run
#  → enter your name (for the log) + master password
#  → pick a client
#  → it opens the site, tries to log in (or log in manually), you go to a
#     room's mapping page and press ENTER
#  → it prints the AMS recommendation and highlights the best row
#  → you make the final "Mapping" click yourself
```

Sessions are saved per client (`auth/<client>.json`) so you don't log in every time.
Every recommendation is appended to `audit.log` (who / when / client / room / pick).

---

## Files (all git-ignored — stay on this PC)
- `vault.enc` — encrypted credentials
- `auth/` — saved browser sessions per client
- `audit.log` — local audit trail
- `reports/` — page.html/png saved when the reader can't find the table

## Notes & next steps
- **Page reader:** parses `<table>` elements generically. If a client's page uses a
  different layout, it saves `reports/page.html` — share it to tune the reader per client.
- **Roadmap (human confirm kept):** GUI (Electron) · batch over many rooms ·
  multi-source signals (our inventory + hotel website + OTA) · optional
  high-confidence auto-click with a human review queue.
- **Team sharing:** vault/logs are per-PC. Central credential sharing + central audit
  across employees would need a small shared service (out of scope for the no-backend build).
