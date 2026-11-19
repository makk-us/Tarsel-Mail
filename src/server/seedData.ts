import type {
  AIFilterRule,
  CalendarEvent,
  EmailThread,
  ImapAccountConfig,
  TodoItem,
} from '../types/mail.ts';

export const DEFAULT_ACCOUNT: ImapAccountConfig = {
  id: 'acc-primary',
  label: 'Work (Primary)',
  email: 'alex.mercer@tarsel.dev',
  displayName: 'Alex Mercer',
  mode: 'demo',
  imapHost: process.env.IMAP_HOST || 'imap.fastmail.com',
  imapPort: Number(process.env.IMAP_PORT || 993),
  imapSecure: process.env.IMAP_SECURE !== 'false',
  imapUser: process.env.IMAP_USER || 'alex.mercer@tarsel.dev',
  imapPass: process.env.IMAP_PASS || '',
  smtpHost: process.env.SMTP_HOST || 'smtp.fastmail.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: process.env.SMTP_SECURE !== 'false',
  smtpUser: process.env.SMTP_USER || 'alex.mercer@tarsel.dev',
  smtpPass: process.env.SMTP_PASS || '',
  writingStyle:
    'Direct, crisp, warm-professional. Short paragraphs, bullet points for action items, minimal fluff.',
  lastSyncAt: '2026-11-12T13:40:00.000Z',
};

export const SEED_THREADS: EmailThread[] = [
  {
    id: 'thr-101',
    accountId: 'acc-primary',
    subject: 'Q4 Search Index Architecture & Latency Targets',
    snippet:
      'Can we review the FTS5 tokenizer benchmarks tomorrow at 10:30 AM PST before freezing the Docker image?',
    participants: [
      { name: 'Elena Rostova', email: 'elena.rostova@tarsel.dev' },
      { name: 'Alex Mercer', email: 'alex.mercer@tarsel.dev' },
    ],
    lastMessageAt: '2026-11-12T13:28:00.000Z',
    isUnread: true,
    isStarred: true,
    isImportant: true,
    status: 'inbox',
    bundle: 'Priority',
    labels: ['Engineering', 'Architecture'],
    aiSummary:
      'Elena benchmarked SQLite FTS5 trigram vs. unicode61 tokenization across 120k emails (p99 dropped to 6.4ms) and wants to finalize the multi-stage Docker Alpine/Slim build tomorrow at 10:30 AM.',
    aiActionItems: [
      'Review FTS5 benchmark PR #418 before tomorrow 10:30 AM',
      'Confirm memory cap for container build in docker-compose.yml',
    ],
    detectedMeeting: {
      title: 'FTS5 & Docker Image Freeze Review',
      proposedTime: '2026-11-13T10:30:00.000Z',
      durationMinutes: 30,
    },
    messages: [
      {
        id: 'msg-101-1',
        threadId: 'thr-101',
        fromName: 'Elena Rostova',
        fromEmail: 'elena.rostova@tarsel.dev',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T11:10:00.000Z',
        bodyText:
          'Hi Alex,\n\nI finished running the indexing benchmarks against a 120,000-message Maildir corpus. Switching our SQLite FTS5 table to unicode61 with prefix="2 3" brought p99 query latency down from 41ms to 6.4ms.\n\nOnly catch: better-sqlite3 native compilation in the Docker image needs python3 + make in the builder stage, then we copy the clean node_modules into node:22-slim.\n\nBest,\nElena',
        attachments: [
          {
            id: 'att-101-1',
            filename: 'fts5-latency-benchmarks.csv',
            mimeType: 'text/csv',
            sizeBytes: 48200,
          },
        ],
      },
      {
        id: 'msg-101-2',
        threadId: 'thr-101',
        fromName: 'Alex Mercer',
        fromEmail: 'alex.mercer@tarsel.dev',
        to: ['elena.rostova@tarsel.dev'],
        date: '2026-11-12T12:04:00.000Z',
        isFromMe: true,
        bodyText:
          '6.4ms p99 on 120k emails is fantastic. Did you test incremental IMAP UIDVALIDITY sync updates while queries are running under WAL mode?',
        attachments: [],
      },
      {
        id: 'msg-101-3',
        threadId: 'thr-101',
        fromName: 'Elena Rostova',
        fromEmail: 'elena.rostova@tarsel.dev',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T13:28:00.000Z',
        bodyText:
          'Yes — WAL mode + synchronous=NORMAL handles concurrent IMAP IDLE appends with zero reader blocking.\n\nCan we meet tomorrow (Nov 13) at 10:30 AM for 30 mins to review PR #418 and lock the Dockerfile before tagging v1.0?',
        attachments: [],
      },
    ],
  },
  {
    id: 'thr-102',
    accountId: 'acc-primary',
    subject: 'Enterprise MSA & DPA Sign-off — Nordlicht GmbH',
    snippet:
      'Hallo Alex, anbei die finalen Vertragsunterlagen für das Self-Hosted Deployment in Frankfurt. Bitte bis Freitag gegenzeichnen.',
    participants: [
      { name: 'Lukas Weber', email: 'l.weber@nordlicht-gmbh.de' },
      { name: 'Alex Mercer', email: 'alex.mercer@tarsel.dev' },
    ],
    lastMessageAt: '2026-11-12T12:52:00.000Z',
    isUnread: true,
    isStarred: false,
    isImportant: true,
    status: 'inbox',
    bundle: 'Priority',
    labels: ['Legal', 'Enterprise'],
    aiSummary:
      'Lukas Weber sent the final German-language MSA and GDPR DPA for Nordlicht GmbH’s Frankfurt self-hosted rollout and requested countersignature by Friday.',
    aiActionItems: ['Countersign Nordlicht DPA PDF by Friday 17:00 CET'],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-102-1',
        threadId: 'thr-102',
        fromName: 'Lukas Weber',
        fromEmail: 'l.weber@nordlicht-gmbh.de',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T12:52:00.000Z',
        bodyText:
          'Hallo Alex,\n\nvielen Dank für das konstruktive Gespräch gestern. Unsere Rechtsabteilung hat die letzten Änderungen am Auftragsverarbeitungsvertrag (AVV / DPA) freigegeben.\n\nIm Anhang findest du das finale PDF. Könntest du das Dokument bis Freitag gegenzeichnen, damit unser Ops-Team nächste Woche den Docker-Container auf unserem Frankfurter Server ausrollen kann?\n\nViele Grüße\nLukas Weber\nHead of IT, Nordlicht GmbH',
        attachments: [
          {
            id: 'att-102-1',
            filename: 'Nordlicht_GmbH_AVV_DPA_2026.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 612400,
          },
        ],
      },
    ],
  },
  {
    id: 'thr-103',
    accountId: 'acc-primary',
    subject: 'AWS Invoice #84921 — November Cloud Infrastructure ($1,482.40)',
    snippet:
      'Your Amazon Web Services billing statement for Account 4920-1182 is ready. Total charged: $1,482.40.',
    participants: [{ name: 'AWS Billing', email: 'no-reply@billing.amazonaws.com' }],
    lastMessageAt: '2026-11-12T11:15:00.000Z',
    isUnread: true,
    isStarred: true,
    isImportant: false,
    status: 'inbox',
    bundle: 'Finance & Receipts',
    labels: ['Finance', 'Cloud'],
    aiSummary: null,
    aiActionItems: [],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-103-1',
        threadId: 'thr-103',
        fromName: 'AWS Billing',
        fromEmail: 'no-reply@billing.amazonaws.com',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T11:15:00.000Z',
        bodyText:
          'Hello,\n\nYour AWS invoice #84921 for the billing period Oct 1 - Oct 31 is now available.\n\nTotal Amount Due: $1,482.40\nPrimary Services:\n- EC2 & EKS Worker Nodes: $914.20\n- RDS & S3 Backup Snapshots: $388.20\n- CloudFront & Route53: $180.00\n\nPlease find the itemized PDF invoice attached for your accounting records.',
        attachments: [
          {
            id: 'att-103-1',
            filename: 'AWS-Invoice-84921.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 245900,
          },
        ],
      },
    ],
  },
  {
    id: 'thr-104',
    accountId: 'acc-primary',
    subject: 'Stripe Receipt — Linear Workspace Annual Plan ($384.00)',
    snippet:
      'Receipt from Linear Orbit Inc. Amount paid: $384.00 on Visa ending in 4242.',
    participants: [{ name: 'Stripe Receipts', email: 'receipts+acct@stripe.com' }],
    lastMessageAt: '2026-11-12T08:40:00.000Z',
    isUnread: false,
    isStarred: false,
    isImportant: false,
    status: 'inbox',
    bundle: 'Finance & Receipts',
    labels: ['Receipt', 'Finance'],
    aiSummary: null,
    aiActionItems: [],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-104-1',
        threadId: 'thr-104',
        fromName: 'Stripe Receipts',
        fromEmail: 'receipts+acct@stripe.com',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T08:40:00.000Z',
        bodyText:
          'Receipt from Linear Orbit Inc.\nInvoice #LN-2026-9941\nAmount Paid: $384.00\nPayment Method: Visa •••• 4242\n\nThank you for your business.',
        attachments: [
          {
            id: 'att-104-1',
            filename: 'Receipt-LN-2026-9941.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 91300,
          },
        ],
      },
    ],
  },
  {
    id: 'thr-105',
    accountId: 'acc-primary',
    subject: 'Lufthansa Booking Confirmation — MUC → SFO (LH 458)',
    snippet:
      'Confirmed: Departure Nov 18 at 11:45 AM from Munich Terminal 2. Seat 14A.',
    participants: [{ name: 'Lufthansa', email: 'booking@lufthansa.com' }],
    lastMessageAt: '2026-11-11T19:20:00.000Z',
    isUnread: false,
    isStarred: true,
    isImportant: false,
    status: 'inbox',
    bundle: 'Travel',
    labels: ['Flights'],
    aiSummary:
      'Round-trip Lufthansa flight LH 458 from Munich (MUC) to San Francisco (SFO) departing Nov 18 at 11:45 AM, Seat 14A.',
    aiActionItems: ['Check in online 24h before Nov 18 11:45 AM departure'],
    detectedMeeting: {
      title: 'Flight LH 458: MUC → SFO',
      proposedTime: '2026-11-18T11:45:00.000Z',
      durationMinutes: 660,
    },
    messages: [
      {
        id: 'msg-105-1',
        threadId: 'thr-105',
        fromName: 'Lufthansa',
        fromEmail: 'booking@lufthansa.com',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-11T19:20:00.000Z',
        bodyText:
          'Booking Code: K8X92M\nPassenger: Alex Mercer\n\nOutbound: Nov 18, 2026 — LH 458\nMunich (MUC) 11:45 → San Francisco (SFO) 14:45\nSeat: 14A (Window)\n\nYour e-ticket receipt is attached.',
        attachments: [
          {
            id: 'att-105-1',
            filename: 'Lufthansa_Itinerary_K8X92M.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 312000,
          },
        ],
      },
    ],
  },
  {
    id: 'thr-106',
    accountId: 'acc-primary',
    subject: '[tarsel-mail/core] CI Build Passed: multi-arch Docker image (arm64/amd64)',
    snippet:
      'GitHub Actions workflow "Release Container" succeeded in 2m 14s on main.',
    participants: [{ name: 'GitHub Actions', email: 'notifications@github.com' }],
    lastMessageAt: '2026-11-12T13:05:00.000Z',
    isUnread: true,
    isStarred: false,
    isImportant: false,
    status: 'inbox',
    bundle: 'DevOps',
    labels: ['CI/CD', 'Docker'],
    aiSummary: null,
    aiActionItems: [],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-106-1',
        threadId: 'thr-106',
        fromName: 'GitHub Actions',
        fromEmail: 'notifications@github.com',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T13:05:00.000Z',
        bodyText:
          'Repository: tarsel-mail/core\nWorkflow: Release Container (linux/amd64, linux/arm64)\nCommit: a94f21c — "Optimize SQLite WAL checkpoint on shutdown"\nDuration: 2m 14s\nImage Size: 184 MB\nStatus: PASSED',
        attachments: [],
      },
    ],
  },
  {
    id: 'thr-107',
    accountId: 'acc-primary',
    subject: 'Pragmatic Engineer #312: Why Local-First & Self-Hosted Apps Are Winning',
    snippet:
      'In this week’s deep dive: SQLite in production, IMAP resurgence, and sub-50ms keyboard UIs.',
    participants: [{ name: 'Gergely Orosz', email: 'pragmatic@substack.com' }],
    lastMessageAt: '2026-11-12T06:00:00.000Z',
    isUnread: true,
    isStarred: false,
    isImportant: false,
    status: 'inbox',
    bundle: 'Newsletters',
    labels: ['Reading'],
    aiSummary: null,
    aiActionItems: [],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-107-1',
        threadId: 'thr-107',
        fromName: 'Gergely Orosz',
        fromEmail: 'pragmatic@substack.com',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T06:00:00.000Z',
        bodyText:
          'Welcome to issue #312 of The Pragmatic Engineer.\n\n1. Why teams are moving back to single-container Docker deployments with embedded SQLite.\n2. Keyboard-first web applications: lessons from Superhuman, Linear, and Shortwave.\n3. Evaluating LLM latency budgets for inbox triage (< 400ms).\n\nRead the full edition online.',
        attachments: [],
      },
    ],
  },
  {
    id: 'thr-108',
    accountId: 'acc-primary',
    subject: 'Design Crit: Bundled Inbox Motion & Dark Slate Contrast',
    snippet:
      'Updated the Figma tokens for light/dark parity. Free for a quick 15-min walkthrough at 3:00 PM today?',
    participants: [
      { name: 'Maya Lin', email: 'maya@studio-tarsel.dev' },
      { name: 'Alex Mercer', email: 'alex.mercer@tarsel.dev' },
    ],
    lastMessageAt: '2026-11-12T12:18:00.000Z',
    isUnread: false,
    isStarred: false,
    isImportant: true,
    status: 'inbox',
    bundle: 'Priority',
    labels: ['Design'],
    aiSummary:
      'Maya finalized light/dark surface contrast tokens and asked for a 15-minute walkthrough at 3:00 PM today.',
    aiActionItems: ['Reply to Maya confirming 3:00 PM design walkthrough'],
    detectedMeeting: {
      title: 'Design Crit: Dark Slate Contrast',
      proposedTime: '2026-11-12T15:00:00.000Z',
      durationMinutes: 15,
    },
    messages: [
      {
        id: 'msg-108-1',
        threadId: 'thr-108',
        fromName: 'Maya Lin',
        fromEmail: 'maya@studio-tarsel.dev',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T12:18:00.000Z',
        bodyText:
          'Hey Alex,\n\nI tuned the dark slate borders (#1E293B) and tabular-num spacing on the bundle rows so there is zero layout shift when marking emails done.\n\nWant to hop on a quick 15-min screen share today at 3:00 PM PST to sign off?\n\n— Maya',
        attachments: [
          {
            id: 'att-108-1',
            filename: 'tarsel-contrast-audit.png',
            mimeType: 'image/png',
            sizeBytes: 428000,
          },
        ],
      },
    ],
  },
  {
    id: 'thr-109',
    accountId: 'acc-primary',
    subject: 'Scale your outbound pipeline 10x with AI SDRs (Demo?)',
    snippet:
      'Hi Alex, noticed you run engineering at Tarsel — quick 10 min chat about cold outreach automation?',
    participants: [{ name: 'Jordan Vance', email: 'jordan@growthblitz-ai.io' }],
    lastMessageAt: '2026-11-12T07:45:00.000Z',
    isUnread: true,
    isStarred: false,
    isImportant: false,
    status: 'inbox',
    bundle: 'Updates',
    labels: ['Cold Outreach'],
    aiSummary: null,
    aiActionItems: [],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-109-1',
        threadId: 'thr-109',
        fromName: 'Jordan Vance',
        fromEmail: 'jordan@growthblitz-ai.io',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-12T07:45:00.000Z',
        bodyText:
          'Hi Alex,\n\nHope your week is going well! I saw Tarsel Mail is growing fast and wanted to share how we help teams 10x outbound pipeline with automated cold outreach.\n\nDo you have 10 minutes this week?\n\nBest,\nJordan',
        attachments: [],
      },
    ],
  },
  {
    id: 'thr-110',
    accountId: 'acc-primary',
    subject: 'Hetzner Cloud Server Invoice #2026-88412 (€48.90)',
    snippet:
      'Your monthly Hetzner Cloud invoice for CPX41-ashburn-prod is attached.',
    participants: [{ name: 'Hetzner Billing', email: 'billing@hetzner.com' }],
    lastMessageAt: '2026-11-10T16:10:00.000Z',
    isUnread: false,
    isStarred: false,
    isImportant: false,
    status: 'done',
    bundle: 'Finance & Receipts',
    labels: ['Finance', 'Cloud'],
    aiSummary: null,
    aiActionItems: [],
    detectedMeeting: null,
    messages: [
      {
        id: 'msg-110-1',
        threadId: 'thr-110',
        fromName: 'Hetzner Billing',
        fromEmail: 'billing@hetzner.com',
        to: ['alex.mercer@tarsel.dev'],
        date: '2026-11-10T16:10:00.000Z',
        bodyText:
          'Dear Alex Mercer,\n\nAttached is your Hetzner Cloud invoice #2026-88412 totaling €48.90 for October server usage.\n\nThank you for hosting with Hetzner.',
        attachments: [
          {
            id: 'att-110-1',
            filename: 'Hetzner_2026_88412.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 118400,
          },
        ],
      },
    ],
  },
];

export const SEED_FILTERS: AIFilterRule[] = [
  {
    id: 'flt-1',
    name: 'High-Value Invoices & Receipts',
    prompt:
      'Automatically label invoices, billing statements, and receipts as Finance, star anything over $500, and bundle into Finance & Receipts.',
    enabled: true,
    autoApplyOnSync: true,
    targetBundle: 'Finance & Receipts',
    lastRunAt: '2026-11-12T13:35:00.000Z',
    matchCount: 3,
    createdAt: '2026-11-01T09:00:00.000Z',
  },
  {
    id: 'flt-2',
    name: 'Sweep Cold Sales Outreach',
    prompt:
      'Identify unsolicited cold sales pitches or outbound SDR demo requests, label them as Cold Outreach, and auto-archive them out of my primary inbox.',
    enabled: true,
    autoApplyOnSync: true,
    targetBundle: 'Updates',
    lastRunAt: '2026-11-12T13:35:00.000Z',
    matchCount: 1,
    createdAt: '2026-11-03T14:20:00.000Z',
  },
  {
    id: 'flt-3',
    name: 'Infrastructure & CI Alerts',
    prompt:
      'Bundle emails mentioning GitHub Actions, Docker builds, Kubernetes, or server alerts into DevOps and label as CI/CD.',
    enabled: true,
    autoApplyOnSync: true,
    targetBundle: 'DevOps',
    lastRunAt: '2026-11-12T13:35:00.000Z',
    matchCount: 1,
    createdAt: '2026-11-05T11:00:00.000Z',
  },
  {
    id: 'flt-4',
    name: 'Executive & Contract Deadlines',
    prompt:
      'Mark emails requesting contract sign-off, legal review, or urgent engineering approvals as Important, bundle into Priority, and create a To-Do item.',
    enabled: true,
    autoApplyOnSync: false,
    targetBundle: 'Priority',
    lastRunAt: null,
    matchCount: 0,
    createdAt: '2026-11-10T16:45:00.000Z',
  },
];

export const SEED_TODOS: TodoItem[] = [
  {
    id: 'todo-1',
    threadId: 'thr-102',
    threadSubject: 'Enterprise MSA & DPA Sign-off — Nordlicht GmbH',
    title: 'Countersign Nordlicht GmbH AVV / DPA PDF before Friday',
    dueDate: '2026-11-14',
    completed: false,
    priority: 'high',
    createdAt: '2026-11-12T12:55:00.000Z',
  },
  {
    id: 'todo-2',
    threadId: 'thr-101',
    threadSubject: 'Q4 Search Index Architecture & Latency Targets',
    title: 'Review Elena’s FTS5 PR #418 & Docker multi-stage build',
    dueDate: '2026-11-13',
    completed: false,
    priority: 'high',
    createdAt: '2026-11-12T13:30:00.000Z',
  },
  {
    id: 'todo-3',
    threadId: 'thr-103',
    threadSubject: 'AWS Invoice #84921 — November Cloud Infrastructure ($1,482.40)',
    title: 'Forward AWS Invoice #84921 to bookkeeping',
    dueDate: '2026-11-15',
    completed: false,
    priority: 'normal',
    createdAt: '2026-11-12T11:20:00.000Z',
  },
];

export const SEED_CALENDAR: CalendarEvent[] = [
  {
    id: 'cal-1',
    title: 'Morning Inbox Zero & Triage Sprint',
    startTime: '2026-11-12T09:00:00.000Z',
    endTime: '2026-11-12T09:30:00.000Z',
    attendees: ['alex.mercer@tarsel.dev'],
    location: 'Focus Block',
    sourceThreadId: null,
  },
  {
    id: 'cal-2',
    title: 'Design Crit: Dark Slate Contrast (with Maya)',
    startTime: '2026-11-12T15:00:00.000Z',
    endTime: '2026-11-12T15:15:00.000Z',
    attendees: ['alex.mercer@tarsel.dev', 'maya@studio-tarsel.dev'],
    location: 'Jitsi / Meet Room',
    sourceThreadId: 'thr-108',
  },
  {
    id: 'cal-3',
    title: 'FTS5 & Docker Image Freeze Review',
    startTime: '2026-11-13T10:30:00.000Z',
    endTime: '2026-11-13T11:00:00.000Z',
    attendees: ['alex.mercer@tarsel.dev', 'elena.rostova@tarsel.dev'],
    location: 'Engineering Sync',
    sourceThreadId: 'thr-101',
  },
];
