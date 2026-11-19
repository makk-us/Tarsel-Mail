# Tarsel Mail

A self-hosted, privacy-first IMAP webmail client inspired by **Superhuman**, **Shortwave**, and **Google Inbox**. Built with React, Express, SQLite FTS5, `imapflow`, `nodemailer`, and **built-in local Ollama AI** inside the container — with **zero external AI accounts, API keys, or cloud LLM access to your emails**.

## Core Features

- **100% Local Ollama AI Included in the Container**: The Docker image bundles Ollama directly alongside Tarsel Mail (`127.0.0.1:11434`) and stores downloaded models in `/data/ollama`. Plain-English filters, thread summaries, smart drafts, and semantic search run completely locally on your hardware with deterministic local rule/FTS5 fallbacks when offline. External cloud AI endpoints are blocked so email data never leaves your local/private network.
- **Google Inbox-Style Bundles & Split Tabs**: Automatic and rule-driven grouping (`Priority`, `Finance & Receipts`, `DevOps`, `Travel`, `Updates`, `Newsletters`, plus custom bundles) with one-click bundle sweep.
- **Read Later Queue**: Save important articles, digests, and threads to a dedicated **Read Later** section via the **`l`** shortcut, toolbar button, or Command Palette (`Cmd+K` / `Ctrl+K`).
- **Plain-English AI Filters**: Write custom automation scripts in natural language (e.g., *"Label invoices and receipts as Finance, star anything over $500, and bundle into Finance & Receipts"*). Preview matches or run automatically on IMAP sync.
- **Resizable Multi-Pane Workspace**: Drag dividers to resize the sidebar, thread list, email preview, and quick-reply composer height (saved locally across reloads).
- **Keyboard-First Navigation**:
  - `j` / `k` or `↑` / `↓` — Navigate threads
  - `Enter` / `o` — Open thread
  - `e` — Mark Done / Archive
  - `s` — Star / Unstar
  - `l` — Save / Remove from Read Later
  - `h` — Snooze
  - `t` — Convert email to To-Do
  - `r` — Focus Quick Reply
  - `c` — Compose new email
  - `/` — Focus instant FTS5 search
  - `Cmd+K` / `Ctrl+K` — Command Palette
  - `?` — Keyboard Shortcuts cheat sheet
- **Blazing-Fast SQLite FTS5 Search**: Sub-10ms full-text search across subjects, senders, bodies, labels, and attachment filenames with operators (`from:`, `bundle:`, `label:`, `has:attachment`, `is:starred`, `is:unread`, `is:important`, `is:readlater`) plus local Ollama Semantic Search.
- **Google Takeout `.mbox` Import & Bundle Merger**: Import single or multi-file Google Takeout `.mbox` archives, parse `X-Gmail-Labels` and `X-GM-THRID` threads, and either merge labels/folders into existing bundles or create brand-new bundles directly from your labels.
- **Real IMAP & SMTP Support**: Connect any standard IMAP/SMTP provider (Fastmail, Gmail App Passwords, Proton Mail Bridge, Stalwart, Dovecot/Postfix) or explore immediately in built-in local mode.

---

## Self-Hosting in Docker & Portainer (Local Ollama Included)

### Option 1: Single Docker Container (`docker build` + `docker run`)

```bash
docker build -t tarsel-mail .
docker run -d \
  --name tarsel-mail \
  --restart unless-stopped \
  -p 3000:3000 \
  -v tarsel_data:/data \
  tarsel-mail
```

- **Everything runs in one container**: Express + React UI on port `3000`, SQLite FTS5 DB in `/data/tarsel.db`, and embedded `ollama serve` bound strictly to `127.0.0.1:11434` with models persisted in `/data/ollama`.
- On first boot, the container automatically pulls `qwen2.5:3b` (override with `-e AI_MODEL=qwen2.5:1.5b` for smaller RAM footprints, or `-e OLLAMA_AUTO_PULL=false` to pull manually in **Settings**).

### Option 2: Portainer Stacks from GitHub (`docker-compose.yml`)

1. Push this repository to GitHub (`.gitignore` excludes `.env*`, `data/`, and `node_modules/`).
2. In **Portainer**, go to **Stacks → + Add stack**.
3. Set **Name** to `tarsel-mail` and select **Build method: Repository**.
4. Enter your GitHub **Repository URL**, branch `refs/heads/main`, and Compose path `docker-compose.yml`.
5. Click **Deploy the stack** — no API key environment variables are needed.
6. Open `http://<YOUR_SERVER_IP>:3000`.

### Option 3: Docker Compose CLI

```bash
git clone <your-repo-url> tarsel-mail
cd tarsel-mail
docker compose up -d --build
```

Check container health or logs:

```bash
docker logs -f tarsel-mail
curl http://localhost:3000/api/health
```

---

## Connecting Your IMAP / SMTP Mailbox

1. Open **IMAP & Docker Config** in the bottom-left sidebar.
2. Switch Mailbox Source from **Local Demo Mailbox** to **Live IMAP / SMTP Server**.
3. Enter your IMAP and SMTP details, click **Test IMAP Connection**, save, and click **Sync** in the top bar.

---

## Local Development (Without Docker)

Requires **Node.js 22+**:

```bash
npm install
cp .env.example .env
npm run dev
```

Run unit tests and type checking:

```bash
npm test
npm run lint
```
