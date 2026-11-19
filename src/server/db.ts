import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  AIConfig,
  AIFilterRule,
  AIProviderType,
  CalendarEvent,
  EmailMessage,
  EmailThread,
  ImapAccountConfig,
  TodoItem,
} from '../types/mail.ts';
import {
  DEFAULT_ACCOUNT,
  SEED_CALENDAR,
  SEED_FILTERS,
  SEED_THREADS,
  SEED_TODOS,
} from './seedData.ts';
import { buildFtsMatchQuery, parseSearchQuery, filterThreadsByParsedQuery } from '../utils/mailSearch.ts';
import { isLocalPrivateAiUrl } from '../utils/aiProviderConfig.ts';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tarsel.db');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'kestrel.db');
if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  fs.renameSync(LEGACY_DB_PATH, DB_PATH);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${LEGACY_DB_PATH}${suffix}`)) {
      fs.renameSync(`${LEGACY_DB_PATH}${suffix}`, `${DB_PATH}${suffix}`);
    }
  }
}
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'demo',
    imap_host TEXT NOT NULL,
    imap_port INTEGER NOT NULL DEFAULT 993,
    imap_secure INTEGER NOT NULL DEFAULT 1,
    imap_user TEXT NOT NULL,
    imap_pass TEXT NOT NULL DEFAULT '',
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 465,
    smtp_secure INTEGER NOT NULL DEFAULT 1,
    smtp_user TEXT NOT NULL,
    smtp_pass TEXT NOT NULL DEFAULT '',
    writing_style TEXT NOT NULL DEFAULT '',
    last_sync_at TEXT
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    snippet TEXT NOT NULL,
    participants_json TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    is_unread INTEGER NOT NULL DEFAULT 1,
    is_starred INTEGER NOT NULL DEFAULT 0,
    is_important INTEGER NOT NULL DEFAULT 0,
    is_read_later INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'inbox',
    snoozed_until TEXT,
    bundle TEXT NOT NULL DEFAULT 'Updates',
    labels_json TEXT NOT NULL DEFAULT '[]',
    ai_summary TEXT,
    ai_action_items_json TEXT NOT NULL DEFAULT '[]',
    detected_meeting_json TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    from_name TEXT NOT NULL,
    from_email TEXT NOT NULL,
    to_json TEXT NOT NULL,
    cc_json TEXT NOT NULL DEFAULT '[]',
    date TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT,
    attachments_json TEXT NOT NULL DEFAULT '[]',
    is_from_me INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ai_filters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_apply_on_sync INTEGER NOT NULL DEFAULT 1,
    target_bundle TEXT,
    last_run_at TEXT,
    match_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    thread_subject TEXT,
    title TEXT NOT NULL,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'normal',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    attendees_json TEXT NOT NULL DEFAULT '[]',
    location TEXT NOT NULL DEFAULT '',
    source_thread_id TEXT
  );

  CREATE TABLE IF NOT EXISTS ai_settings (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_env_var TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
    thread_id UNINDEXED,
    subject,
    participants,
    body,
    labels,
    bundle,
    attachments,
    tokenize='unicode61'
  );
`);

const existingThreadCols = db
  .prepare("PRAGMA table_info('threads')")
  .all() as Array<{ name: string }>;
if (!existingThreadCols.some((col) => col.name === 'is_read_later')) {
  db.exec('ALTER TABLE threads ADD COLUMN is_read_later INTEGER NOT NULL DEFAULT 0;');
}

function mapAccountRow(row: Record<string, unknown>): ImapAccountConfig {
  return {
    id: String(row.id),
    label: String(row.label),
    email: String(row.email),
    displayName: String(row.display_name),
    mode: row.mode === 'imap' ? 'imap' : 'demo',
    imapHost: String(row.imap_host),
    imapPort: Number(row.imap_port),
    imapSecure: Boolean(row.imap_secure),
    imapUser: String(row.imap_user),
    imapPass: String(row.imap_pass ?? ''),
    smtpHost: String(row.smtp_host),
    smtpPort: Number(row.smtp_port),
    smtpSecure: Boolean(row.smtp_secure),
    smtpUser: String(row.smtp_user),
    smtpPass: String(row.smtp_pass ?? ''),
    writingStyle: String(row.writing_style ?? ''),
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
  };
}

export function upsertThread(thread: EmailThread): void {
  const insertThread = db.prepare(`
    INSERT INTO threads (
      id, account_id, subject, snippet, participants_json, last_message_at,
      is_unread, is_starred, is_important, is_read_later, status, snoozed_until, bundle,
      labels_json, ai_summary, ai_action_items_json, detected_meeting_json
    ) VALUES (
      @id, @account_id, @subject, @snippet, @participants_json, @last_message_at,
      @is_unread, @is_starred, @is_important, @is_read_later, @status, @snoozed_until, @bundle,
      @labels_json, @ai_summary, @ai_action_items_json, @detected_meeting_json
    )
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      snippet = excluded.snippet,
      participants_json = excluded.participants_json,
      last_message_at = excluded.last_message_at,
      is_unread = excluded.is_unread,
      is_starred = excluded.is_starred,
      is_important = excluded.is_important,
      is_read_later = excluded.is_read_later,
      status = excluded.status,
      snoozed_until = excluded.snoozed_until,
      bundle = excluded.bundle,
      labels_json = excluded.labels_json,
      ai_summary = excluded.ai_summary,
      ai_action_items_json = excluded.ai_action_items_json,
      detected_meeting_json = excluded.detected_meeting_json
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (
      id, thread_id, from_name, from_email, to_json, cc_json, date,
      body_text, body_html, attachments_json, is_from_me
    ) VALUES (
      @id, @thread_id, @from_name, @from_email, @to_json, @cc_json, @date,
      @body_text, @body_html, @attachments_json, @is_from_me
    )
    ON CONFLICT(id) DO UPDATE SET
      body_text = excluded.body_text,
      body_html = excluded.body_html,
      attachments_json = excluded.attachments_json
  `);

  const tx = db.transaction((t: EmailThread) => {
    insertThread.run({
      id: t.id,
      account_id: t.accountId,
      subject: t.subject,
      snippet: t.snippet,
      participants_json: JSON.stringify(t.participants),
      last_message_at: t.lastMessageAt,
      is_unread: t.isUnread ? 1 : 0,
      is_starred: t.isStarred ? 1 : 0,
      is_important: t.isImportant ? 1 : 0,
      is_read_later: t.isReadLater ? 1 : 0,
      status: t.status,
      snoozed_until: t.snoozedUntil ?? null,
      bundle: t.bundle,
      labels_json: JSON.stringify(t.labels),
      ai_summary: t.aiSummary ?? null,
      ai_action_items_json: JSON.stringify(t.aiActionItems ?? []),
      detected_meeting_json: t.detectedMeeting ? JSON.stringify(t.detectedMeeting) : null,
    });

    for (const msg of t.messages) {
      insertMessage.run({
        id: msg.id,
        thread_id: t.id,
        from_name: msg.fromName,
        from_email: msg.fromEmail,
        to_json: JSON.stringify(msg.to),
        cc_json: JSON.stringify(msg.cc ?? []),
        date: msg.date,
        body_text: msg.bodyText,
        body_html: msg.bodyHtml ?? null,
        attachments_json: JSON.stringify(msg.attachments ?? []),
        is_from_me: msg.isFromMe ? 1 : 0,
      });
    }
  });

  tx(thread);
  indexThreadFts(thread.id);
}

export function indexThreadFts(threadId: string): void {
  const thread = getThreadById(threadId);
  db.prepare('DELETE FROM emails_fts WHERE thread_id = ?').run(threadId);
  if (!thread) return;

  const participantsText = thread.participants
    .map((p) => `${p.name} ${p.email}`)
    .join(' ');
  const bodyText = thread.messages.map((m) => m.bodyText).join('\n');
  const attachmentsText = thread.messages
    .flatMap((m) => m.attachments.map((a) => a.filename))
    .join(' ');

  db.prepare(`
    INSERT INTO emails_fts (thread_id, subject, participants, body, labels, bundle, attachments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    thread.id,
    thread.subject,
    participantsText,
    bodyText,
    thread.labels.join(' '),
    thread.bundle,
    attachmentsText
  );
}

export function reindexAllFts(): void {
  db.prepare('DELETE FROM emails_fts').run();
  const rows = db.prepare('SELECT id FROM threads').all() as { id: string }[];
  for (const row of rows) {
    indexThreadFts(row.id);
  }
}

export function seedDatabaseIfEmpty(): void {
  const accountCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as { cnt: number }
  ).cnt;

  if (accountCount === 0) {
    saveAccount(DEFAULT_ACCOUNT);
  }

  const threadCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM threads').get() as { cnt: number }
  ).cnt;

  if (threadCount === 0) {
    for (const thread of SEED_THREADS) {
      upsertThread(thread);
    }
  }

  const filterCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM ai_filters').get() as { cnt: number }
  ).cnt;

  if (filterCount === 0) {
    for (const f of SEED_FILTERS) {
      upsertFilter(f);
    }
  }

  const todoCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM todos').get() as { cnt: number }
  ).cnt;

  if (todoCount === 0) {
    for (const t of SEED_TODOS) {
      upsertTodo(t);
    }
  }

  const calCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM calendar_events').get() as { cnt: number }
  ).cnt;

  if (calCount === 0) {
    for (const c of SEED_CALENDAR) {
      upsertCalendarEvent(c);
    }
  }
}

export function getAccounts(): ImapAccountConfig[] {
  const rows = db.prepare('SELECT * FROM accounts').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    ...mapAccountRow(r),
    // Never leak raw password to browser, expose masked indicator
    imapPass: r.imap_pass ? '••••••••' : '',
    smtpPass: r.smtp_pass ? '••••••••' : '',
  }));
}

export function getAccountWithSecrets(accountId: string): ImapAccountConfig | null {
  const row = db
    .prepare('SELECT * FROM accounts WHERE id = ?')
    .get(accountId) as Record<string, unknown> | undefined;
  return row ? mapAccountRow(row) : null;
}

export function saveAccount(account: ImapAccountConfig): ImapAccountConfig {
  const existing = getAccountWithSecrets(account.id);
  const imapPass =
    account.imapPass && account.imapPass !== '••••••••'
      ? account.imapPass
      : existing?.imapPass ?? '';
  const smtpPass =
    account.smtpPass && account.smtpPass !== '••••••••'
      ? account.smtpPass
      : existing?.smtpPass ?? '';

  db.prepare(`
    INSERT INTO accounts (
      id, label, email, display_name, mode,
      imap_host, imap_port, imap_secure, imap_user, imap_pass,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass,
      writing_style, last_sync_at
    ) VALUES (
      @id, @label, @email, @display_name, @mode,
      @imap_host, @imap_port, @imap_secure, @imap_user, @imap_pass,
      @smtp_host, @smtp_port, @smtp_secure, @smtp_user, @smtp_pass,
      @writing_style, @last_sync_at
    )
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      email = excluded.email,
      display_name = excluded.display_name,
      mode = excluded.mode,
      imap_host = excluded.imap_host,
      imap_port = excluded.imap_port,
      imap_secure = excluded.imap_secure,
      imap_user = excluded.imap_user,
      imap_pass = excluded.imap_pass,
      smtp_host = excluded.smtp_host,
      smtp_port = excluded.smtp_port,
      smtp_secure = excluded.smtp_secure,
      smtp_user = excluded.smtp_user,
      smtp_pass = excluded.smtp_pass,
      writing_style = excluded.writing_style,
      last_sync_at = COALESCE(excluded.last_sync_at, accounts.last_sync_at)
  `).run({
    id: account.id,
    label: account.label,
    email: account.email,
    display_name: account.displayName,
    mode: account.mode,
    imap_host: account.imapHost,
    imap_port: account.imapPort,
    imap_secure: account.imapSecure ? 1 : 0,
    imap_user: account.imapUser,
    imap_pass: imapPass,
    smtp_host: account.smtpHost,
    smtp_port: account.smtpPort,
    smtp_secure: account.smtpSecure ? 1 : 0,
    smtp_user: account.smtpUser,
    smtp_pass: smtpPass,
    writing_style: account.writingStyle,
    last_sync_at: account.lastSyncAt ?? null,
  });

  return getAccounts().find((a) => a.id === account.id)!;
}

function hydrateThread(row: Record<string, unknown>): EmailThread {
  const msgRows = db
    .prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC')
    .all(String(row.id)) as Record<string, unknown>[];

  const messages: EmailMessage[] = msgRows.map((m) => ({
    id: String(m.id),
    threadId: String(m.thread_id),
    fromName: String(m.from_name),
    fromEmail: String(m.from_email),
    to: JSON.parse(String(m.to_json || '[]')),
    cc: JSON.parse(String(m.cc_json || '[]')),
    date: String(m.date),
    bodyText: String(m.body_text),
    bodyHtml: m.body_html ? String(m.body_html) : undefined,
    attachments: JSON.parse(String(m.attachments_json || '[]')),
    isFromMe: Boolean(m.is_from_me),
  }));

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    subject: String(row.subject),
    snippet: String(row.snippet),
    participants: JSON.parse(String(row.participants_json || '[]')),
    lastMessageAt: String(row.last_message_at),
    isUnread: Boolean(row.is_unread),
    isStarred: Boolean(row.is_starred),
    isImportant: Boolean(row.is_important),
    isReadLater: Boolean(row.is_read_later),
    status: String(row.status) as EmailThread['status'],
    snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
    bundle: String(row.bundle || 'Updates'),
    labels: JSON.parse(String(row.labels_json || '[]')),
    aiSummary: row.ai_summary ? String(row.ai_summary) : null,
    aiActionItems: JSON.parse(String(row.ai_action_items_json || '[]')),
    detectedMeeting: row.detected_meeting_json
      ? JSON.parse(String(row.detected_meeting_json))
      : null,
    messages,
  };
}

export function getAllThreads(accountId?: string): EmailThread[] {
  const rows = accountId
    ? (db
        .prepare(
          'SELECT * FROM threads WHERE account_id = ? ORDER BY last_message_at DESC'
        )
        .all(accountId) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM threads ORDER BY last_message_at DESC')
        .all() as Record<string, unknown>[]);
  return rows.map(hydrateThread);
}

export function getThreadById(id: string): EmailThread | null {
  const row = db
    .prepare('SELECT * FROM threads WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? hydrateThread(row) : null;
}

export function searchThreadsFts(
  rawQuery: string,
  accountId?: string
): EmailThread[] {
  const parsed = parseSearchQuery(rawQuery);
  const ftsExpr = buildFtsMatchQuery(parsed.textTerms);

  let candidateThreads: EmailThread[] = [];

  if (ftsExpr) {
    try {
      const matchedIds = db
        .prepare(
          `SELECT thread_id, snippet(emails_fts, 3, '<<', '>>', '...', 18) AS hit_snippet
           FROM emails_fts
           WHERE emails_fts MATCH ?
           ORDER BY bm25(emails_fts)
           LIMIT 100`
        )
        .all(ftsExpr) as { thread_id: string; hit_snippet: string }[];

      const snippetMap = new Map(
        matchedIds.map((r) => [r.thread_id, r.hit_snippet])
      );
      candidateThreads = matchedIds
        .map((r) => getThreadById(r.thread_id))
        .filter((t): t is EmailThread => Boolean(t))
        .filter((t) => !accountId || t.accountId === accountId)
        .map((t) => ({
          ...t,
          searchSnippet: snippetMap.get(t.id) || t.snippet,
        }));
    } catch {
      candidateThreads = getAllThreads(accountId);
    }
  } else {
    candidateThreads = getAllThreads(accountId);
  }

  return filterThreadsByParsedQuery(candidateThreads, parsed);
}

export function updateThreadFields(
  threadId: string,
  patch: Partial<{
    isUnread: boolean;
    isStarred: boolean;
    isImportant: boolean;
    isReadLater: boolean;
    status: EmailThread['status'];
    snoozedUntil: string | null;
    bundle: string;
    labels: string[];
    aiSummary: string | null;
    aiActionItems: string[];
    detectedMeeting: EmailThread['detectedMeeting'];
  }>
): EmailThread | null {
  const current = getThreadById(threadId);
  if (!current) return null;

  const updated: EmailThread = {
    ...current,
    ...patch,
  };

  db.prepare(`
    UPDATE threads SET
      is_unread = @is_unread,
      is_starred = @is_starred,
      is_important = @is_important,
      is_read_later = @is_read_later,
      status = @status,
      snoozed_until = @snoozed_until,
      bundle = @bundle,
      labels_json = @labels_json,
      ai_summary = @ai_summary,
      ai_action_items_json = @ai_action_items_json,
      detected_meeting_json = @detected_meeting_json
    WHERE id = @id
  `).run({
    id: updated.id,
    is_unread: updated.isUnread ? 1 : 0,
    is_starred: updated.isStarred ? 1 : 0,
    is_important: updated.isImportant ? 1 : 0,
    is_read_later: updated.isReadLater ? 1 : 0,
    status: updated.status,
    snoozed_until: updated.snoozedUntil ?? null,
    bundle: updated.bundle,
    labels_json: JSON.stringify(updated.labels),
    ai_summary: updated.aiSummary ?? null,
    ai_action_items_json: JSON.stringify(updated.aiActionItems ?? []),
    detected_meeting_json: updated.detectedMeeting
      ? JSON.stringify(updated.detectedMeeting)
      : null,
  });

  indexThreadFts(updated.id);
  return getThreadById(updated.id);
}

export function getFilters(): AIFilterRule[] {
  const rows = db
    .prepare('SELECT * FROM ai_filters ORDER BY created_at DESC')
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    prompt: String(r.prompt),
    enabled: Boolean(r.enabled),
    autoApplyOnSync: Boolean(r.auto_apply_on_sync),
    targetBundle: r.target_bundle ? String(r.target_bundle) : null,
    lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
    matchCount: Number(r.match_count || 0),
    createdAt: String(r.created_at),
  }));
}

export function upsertFilter(filter: AIFilterRule): AIFilterRule {
  db.prepare(`
    INSERT INTO ai_filters (
      id, name, prompt, enabled, auto_apply_on_sync, target_bundle, last_run_at, match_count, created_at
    ) VALUES (
      @id, @name, @prompt, @enabled, @auto_apply_on_sync, @target_bundle, @last_run_at, @match_count, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      prompt = excluded.prompt,
      enabled = excluded.enabled,
      auto_apply_on_sync = excluded.auto_apply_on_sync,
      target_bundle = excluded.target_bundle,
      last_run_at = excluded.last_run_at,
      match_count = excluded.match_count
  `).run({
    id: filter.id,
    name: filter.name,
    prompt: filter.prompt,
    enabled: filter.enabled ? 1 : 0,
    auto_apply_on_sync: filter.autoApplyOnSync ? 1 : 0,
    target_bundle: filter.targetBundle ?? null,
    last_run_at: filter.lastRunAt ?? null,
    match_count: filter.matchCount,
    created_at: filter.createdAt,
  });

  return getFilters().find((f) => f.id === filter.id)!;
}

export function deleteFilter(id: string): void {
  db.prepare('DELETE FROM ai_filters WHERE id = ?').run(id);
}

export function getTodos(): TodoItem[] {
  const rows = db
    .prepare('SELECT * FROM todos ORDER BY completed ASC, created_at DESC')
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    threadId: r.thread_id ? String(r.thread_id) : null,
    threadSubject: r.thread_subject ? String(r.thread_subject) : null,
    title: String(r.title),
    dueDate: r.due_date ? String(r.due_date) : null,
    completed: Boolean(r.completed),
    priority: (r.priority === 'high' || r.priority === 'low'
      ? r.priority
      : 'normal') as TodoItem['priority'],
    createdAt: String(r.created_at),
  }));
}

export function upsertTodo(todo: TodoItem): TodoItem {
  db.prepare(`
    INSERT INTO todos (
      id, thread_id, thread_subject, title, due_date, completed, priority, created_at
    ) VALUES (
      @id, @thread_id, @thread_subject, @title, @due_date, @completed, @priority, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      due_date = excluded.due_date,
      completed = excluded.completed,
      priority = excluded.priority
  `).run({
    id: todo.id,
    thread_id: todo.threadId ?? null,
    thread_subject: todo.threadSubject ?? null,
    title: todo.title,
    due_date: todo.dueDate ?? null,
    completed: todo.completed ? 1 : 0,
    priority: todo.priority,
    created_at: todo.createdAt,
  });

  return getTodos().find((t) => t.id === todo.id)!;
}

export function deleteTodo(id: string): void {
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);
}

export function getCalendarEvents(): CalendarEvent[] {
  const rows = db
    .prepare('SELECT * FROM calendar_events ORDER BY start_time ASC')
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    attendees: JSON.parse(String(r.attendees_json || '[]')),
    location: String(r.location || ''),
    sourceThreadId: r.source_thread_id ? String(r.source_thread_id) : null,
  }));
}

export function upsertCalendarEvent(event: CalendarEvent): CalendarEvent {
  db.prepare(`
    INSERT INTO calendar_events (
      id, title, start_time, end_time, attendees_json, location, source_thread_id
    ) VALUES (
      @id, @title, @start_time, @end_time, @attendees_json, @location, @source_thread_id
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      attendees_json = excluded.attendees_json,
      location = excluded.location
  `).run({
    id: event.id,
    title: event.title,
    start_time: event.startTime,
    end_time: event.endTime,
    attendees_json: JSON.stringify(event.attendees),
    location: event.location,
    source_thread_id: event.sourceThreadId ?? null,
  });

  return getCalendarEvents().find((c) => c.id === event.id)!;
}

function getDefaultAiConfig(): AIConfig {
  const envUrl = process.env.AI_BASE_URL?.trim() || 'http://127.0.0.1:11434/v1';
  const safeBaseUrl = isLocalPrivateAiUrl(envUrl)
    ? envUrl
    : 'http://127.0.0.1:11434/v1';

  return {
    provider: 'ollama',
    baseUrl: safeBaseUrl,
    model: process.env.AI_MODEL?.trim() || 'qwen2.5:3b',
    apiKeyEnvVar: 'NONE',
  };
}

export function getAiConfig(): AIConfig {
  const row = db
    .prepare('SELECT * FROM ai_settings WHERE id = ?')
    .get('default') as Record<string, unknown> | undefined;

  if (!row) {
    const def = getDefaultAiConfig();
    saveAiConfig(def);
    return def;
  }

  const rawBaseUrl = String(row.base_url || '');
  const rawProvider = String(row.provider || '');

  // Enforce local Ollama only: migrate any legacy cloud AI provider settings automatically
  if (rawProvider !== 'ollama' || !isLocalPrivateAiUrl(rawBaseUrl)) {
    const def = getDefaultAiConfig();
    saveAiConfig(def);
    return def;
  }

  return {
    provider: 'ollama',
    baseUrl: rawBaseUrl,
    model: String(row.model || 'qwen2.5:3b'),
    apiKeyEnvVar: 'NONE',
  };
}

export function saveAiConfig(config: AIConfig): AIConfig {
  const safeUrl = isLocalPrivateAiUrl(config.baseUrl)
    ? config.baseUrl
    : 'http://127.0.0.1:11434/v1';

  db.prepare(`
    INSERT INTO ai_settings (id, provider, base_url, model, api_key_env_var)
    VALUES ('default', @provider, @base_url, @model, @api_key_env_var)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      base_url = excluded.base_url,
      model = excluded.model,
      api_key_env_var = excluded.api_key_env_var
  `).run({
    provider: 'ollama',
    base_url: safeUrl,
    model: config.model || 'qwen2.5:3b',
    api_key_env_var: 'NONE',
  });

  return getAiConfig();
}

seedDatabaseIfEmpty();

