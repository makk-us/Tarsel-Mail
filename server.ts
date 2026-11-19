import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import {
  deleteFilter,
  deleteTodo,
  getAccounts,
  getAccountWithSecrets,
  getAiConfig,
  getAllThreads,
  getCalendarEvents,
  getFilters,
  getThreadById,
  getTodos,
  saveAccount,
  saveAiConfig,
  searchThreadsFts,
  updateThreadFields,
  upsertCalendarEvent,
  upsertFilter,
  upsertThread,
  upsertTodo,
} from './src/server/db.ts';
import {
  assistWriting,
  evaluateAiFilter,
  getAiStatus,
  listOllamaModels,
  pullOllamaModel,
  semanticSearch,
  summarizeThread,
  testAiConnection,
} from './src/server/aiService.ts';
import {
  sendSmtpEmail,
  syncImapAccount,
  testImapConnection,
} from './src/server/imapSync.ts';
import {
  commitMboxImport,
  discardStagedMboxImport,
  inspectMboxFiles,
} from './src/server/mboxImporter.ts';
import type {
  AIConfig,
  AIFilterRule,
  EmailThread,
  ImapAccountConfig,
  MboxCommitOptions,
} from './src/types/mail.ts';
import {
  AI_PROVIDER_PRESETS,
  assertLocalPrivateAiUrl,
} from './src/utils/aiProviderConfig.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function createApp() {
  const app = express();

  // Dedicated MBOX inspection route placed before global 2mb JSON cap to handle large Takeout exports
  app.post(
    '/api/import/mbox/inspect',
    express.raw({
      type: ['application/octet-stream', 'application/mbox', 'text/plain'],
      limit: '250mb',
    }),
    express.json({ limit: '50mb' }),
    async (req, res) => {
      try {
        const accounts = getAccounts();
        const fallbackAccount = accounts[0];
        const queryAccountId =
          typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

        if (Buffer.isBuffer(req.body)) {
          const rawFilename =
            (typeof req.query.filename === 'string' && req.query.filename) ||
            req.header('x-mbox-filename') ||
            'Takeout.mbox';
          const folderOverride =
            (typeof req.query.folderOverride === 'string' && req.query.folderOverride) ||
            req.header('x-mbox-folder') ||
            undefined;
          const accountId =
            queryAccountId ||
            req.header('x-account-id') ||
            fallbackAccount?.id ||
            'acc-primary';
          const acc = accounts.find((a) => a.id === accountId) || fallbackAccount;

          const preview = await inspectMboxFiles({
            files: [{ filename: rawFilename, content: req.body, folderOverride }],
            accountId,
            accountEmail: acc?.email,
          });
          return res.json(preview);
        }

        const body = req.body as {
          accountId?: string;
          files?: Array<{
            filename?: string;
            content?: string;
            folderOverride?: string;
          }>;
        };

        const files = (body?.files || [])
          .filter((f) => typeof f.content === 'string' && f.content.trim().length > 0)
          .map((f, i) => ({
            filename: f.filename?.trim() || `takeout-${i + 1}.mbox`,
            content: f.content!,
            folderOverride: f.folderOverride,
          }));

        if (files.length === 0) {
          return res
            .status(400)
            .json({ error: 'At least one non-empty .mbox file is required.' });
        }

        const accountId = body.accountId || fallbackAccount?.id || 'acc-primary';
        const acc = accounts.find((a) => a.id === accountId) || fallbackAccount;
        const preview = await inspectMboxFiles({
          files,
          accountId,
          accountEmail: acc?.email,
        });
        return res.json(preview);
      } catch (err) {
        return res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to parse MBOX file.',
        });
      }
    }
  );

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    const aiStatus = getAiStatus();
    res.json({
      ok: true,
      localOnly: true,
      aiStatus,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/api/bootstrap', (_req, res) => {
    const accounts = getAccounts();
    const activeAccountId = accounts[0]?.id ?? 'acc-primary';
    const threads = getAllThreads();
    const filters = getFilters();
    const todos = getTodos();
    const calendarEvents = getCalendarEvents();
    const aiConfig = getAiConfig();
    const aiStatus = getAiStatus();

    res.json({
      accounts,
      activeAccountId,
      threads,
      filters,
      todos,
      calendarEvents,
      aiConfig,
      aiStatus,
    });
  });

  app.get('/api/ai/config', (_req, res) => {
    res.json({
      aiConfig: getAiConfig(),
      aiStatus: getAiStatus(),
    });
  });

  app.post('/api/ai/config', (req, res) => {
    const body = req.body as Partial<AIConfig>;
    if (body.provider && body.provider !== 'ollama') {
      return res.status(400).json({
        error: 'Only local Ollama is permitted. External AI accounts are disabled.',
      });
    }

    const preset = AI_PROVIDER_PRESETS.ollama;
    let safeUrl = preset.defaultBaseUrl;
    try {
      safeUrl = body.baseUrl?.trim()
        ? assertLocalPrivateAiUrl(body.baseUrl)
        : preset.defaultBaseUrl;
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid local Ollama Base URL.',
      });
    }

    const model = body.model?.trim() || preset.defaultModel;
    const saved = saveAiConfig({
      provider: 'ollama',
      baseUrl: safeUrl,
      model,
      apiKeyEnvVar: 'NONE',
    });
    return res.json({
      aiConfig: saved,
      aiStatus: getAiStatus(),
    });
  });

  app.post('/api/ai/test', async (req, res) => {
    const body = req.body as Partial<AIConfig> | undefined;
    let overrideConfig: AIConfig | undefined;
    if (body && (body.provider || body.baseUrl || body.model)) {
      if (body.provider && body.provider !== 'ollama') {
        return res.status(400).json({
          ok: false,
          error: 'Only local Ollama is permitted. External AI accounts are disabled.',
        });
      }
      const preset = AI_PROVIDER_PRESETS.ollama;
      try {
        overrideConfig = {
          provider: 'ollama',
          baseUrl: body.baseUrl?.trim()
            ? assertLocalPrivateAiUrl(body.baseUrl)
            : preset.defaultBaseUrl,
          model: body.model?.trim() || preset.defaultModel,
          apiKeyEnvVar: 'NONE',
        };
      } catch (err) {
        return res.status(400).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Invalid local Ollama Base URL.',
        });
      }
    }

    const result = await testAiConnection(overrideConfig);
    return res.json(result);
  });

  app.get('/api/ai/ollama/models', async (req, res) => {
    const rawUrl =
      typeof req.query.baseUrl === 'string' && req.query.baseUrl.trim()
        ? req.query.baseUrl
        : getAiConfig().baseUrl || AI_PROVIDER_PRESETS.ollama.defaultBaseUrl;
    try {
      const safeUrl = assertLocalPrivateAiUrl(rawUrl);
      const outcome = await listOllamaModels(safeUrl);
      return res.json(outcome);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        models: [],
        error: err instanceof Error ? err.message : 'Invalid local Ollama Base URL.',
      });
    }
  });

  app.post('/api/ai/ollama/pull', async (req, res) => {
    const body = req.body as { baseUrl?: string; model?: string };
    const model = body.model?.trim();
    if (!model || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(model)) {
      return res.status(400).json({
        ok: false,
        error: 'Valid Ollama model name is required (e.g. qwen2.5:3b).',
      });
    }
    const rawUrl =
      body.baseUrl?.trim() ||
      getAiConfig().baseUrl ||
      AI_PROVIDER_PRESETS.ollama.defaultBaseUrl;
    try {
      const safeUrl = assertLocalPrivateAiUrl(rawUrl);
      const outcome = await pullOllamaModel(safeUrl, model);
      return res.json(outcome);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid local Ollama Base URL.',
      });
    }
  });

  app.get('/api/threads', (req, res) => {
    const accountId =
      typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    res.json({ threads: getAllThreads(accountId) });
  });

  app.get('/api/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const mode = req.query.mode === 'ai' ? 'ai' : 'fts';

    if (!q.trim()) {
      return res.json({ threads: getAllThreads(), mode: 'fts', explanation: '' });
    }

    if (mode === 'ai') {
      const all = getAllThreads();
      const semantic = await semanticSearch(q, all);
      const idSet = new Set(semantic.threadIds);
      const ordered = semantic.threadIds
        .map((id) => all.find((t) => t.id === id))
        .filter((t): t is EmailThread => Boolean(t));
      // Supplement with FTS5 matches if needed
      const ftsFallback = searchThreadsFts(q).filter((t) => !idSet.has(t.id));
      return res.json({
        threads: [...ordered, ...ftsFallback],
        mode: semantic.usedLocalAi ? 'ai' : 'fts',
        explanation: semantic.explanation,
        providerUsed: semantic.providerUsed,
      });
    }

    const start = performance.now();
    const threads = searchThreadsFts(q);
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    return res.json({
      threads,
      mode: 'fts',
      latencyMs,
    });
  });

  app.post('/api/threads/:id/action', (req, res) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const current = getThreadById(id);
    if (!current) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const patch: Parameters<typeof updateThreadFields>[1] = {};
    if (typeof body.isUnread === 'boolean') patch.isUnread = body.isUnread;
    if (typeof body.isStarred === 'boolean') patch.isStarred = body.isStarred;
    if (typeof body.isImportant === 'boolean') patch.isImportant = body.isImportant;
    if (typeof body.isReadLater === 'boolean') patch.isReadLater = body.isReadLater;
    if (
      body.status === 'inbox' ||
      body.status === 'done' ||
      body.status === 'snoozed' ||
      body.status === 'sent'
    ) {
      patch.status = body.status;
    }
    if (body.snoozedUntil !== undefined) {
      patch.snoozedUntil =
        typeof body.snoozedUntil === 'string' ? body.snoozedUntil : null;
    }
    if (typeof body.bundle === 'string' && body.bundle.trim()) {
      patch.bundle = body.bundle.trim();
    }
    if (Array.isArray(body.labels)) {
      patch.labels = body.labels.filter((l): l is string => typeof l === 'string');
    }

    const updated = updateThreadFields(id, patch);
    return res.json({ thread: updated });
  });

  app.post('/api/bundles/:bundleName/done', (req, res) => {
    const bundleName = decodeURIComponent(req.params.bundleName);
    const threads = getAllThreads().filter(
      (t) => t.status === 'inbox' && t.bundle === bundleName
    );
    for (const t of threads) {
      updateThreadFields(t.id, { status: 'done', isUnread: false });
    }
    res.json({ updatedCount: threads.length, threads: getAllThreads() });
  });

  app.post('/api/ai/summarize', async (req, res) => {
    const { threadId } = req.body as { threadId?: string };
    if (!threadId) {
      return res.status(400).json({ error: 'threadId is required' });
    }
    const thread = getThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    const result = await summarizeThread(thread);
    const updated = updateThreadFields(thread.id, {
      aiSummary: result.summary,
      aiActionItems: result.actionItems,
      detectedMeeting: result.detectedMeeting,
    });
    return res.json({
      thread: updated,
      usedLocalAi: result.usedLocalAi,
      providerUsed: result.providerUsed,
    });
  });

  app.post('/api/ai/assist', async (req, res) => {
    const body = req.body as {
      action?: 'draft' | 'shorten' | 'translate' | 'proofread' | 'reply';
      draftText?: string;
      subject?: string;
      targetLanguage?: string;
      replyToThreadId?: string;
      instruction?: string;
      accountId?: string;
    };

    if (!body.action) {
      return res.status(400).json({ error: 'action is required' });
    }

    const account = getAccounts().find((a) => a.id === body.accountId) || getAccounts()[0];
    let replyToContext = '';
    if (body.replyToThreadId) {
      const t = getThreadById(body.replyToThreadId);
      if (t) {
        replyToContext = t.messages
          .map((m) => `${m.fromName}: ${m.bodyText}`)
          .join('\n---\n');
      }
    }

    const result = await assistWriting({
      action: body.action,
      draftText: body.draftText ?? '',
      subject: body.subject,
      targetLanguage: body.targetLanguage,
      writingStyle: account?.writingStyle,
      replyToContext,
      instruction: body.instruction,
    });

    res.json(result);
  });

  // Plain-English AI Filters CRUD & Execution
  app.get('/api/filters', (_req, res) => {
    res.json({ filters: getFilters() });
  });

  app.post('/api/filters', (req, res) => {
    const body = req.body as Partial<AIFilterRule>;
    if (!body.name?.trim() || !body.prompt?.trim()) {
      return res.status(400).json({ error: 'Filter name and plain-English prompt are required.' });
    }
    const filter: AIFilterRule = {
      id: body.id || `flt-${Date.now()}`,
      name: body.name.trim(),
      prompt: body.prompt.trim(),
      enabled: body.enabled ?? true,
      autoApplyOnSync: body.autoApplyOnSync ?? true,
      targetBundle: body.targetBundle?.trim() || null,
      lastRunAt: body.lastRunAt ?? null,
      matchCount: body.matchCount ?? 0,
      createdAt: body.createdAt || new Date().toISOString(),
    };
    const saved = upsertFilter(filter);
    res.json({ filter: saved });
  });

  app.delete('/api/filters/:id', (req, res) => {
    deleteFilter(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/filters/:id/run', async (req, res) => {
    const filter = getFilters().find((f) => f.id === req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Filter not found' });
    }
    const dryRun = Boolean((req.body as { dryRun?: boolean })?.dryRun);
    const targetThreads = getAllThreads().filter((t) => t.status !== 'sent');
    const { results, usedLocalAi, providerUsed } = await evaluateAiFilter(
      filter,
      targetThreads
    );

    if (!dryRun) {
      for (const match of results) {
        const current = getThreadById(match.threadId);
        if (!current) continue;
        const nextLabels = Array.from(
          new Set([...current.labels, ...(match.actionsApplied.addLabels ?? [])])
        );
        updateThreadFields(current.id, {
          bundle: match.actionsApplied.bundle || current.bundle,
          labels: nextLabels,
          isStarred: match.actionsApplied.star ? true : current.isStarred,
          isImportant: match.actionsApplied.markImportant
            ? true
            : current.isImportant,
          status: match.actionsApplied.archive ? 'done' : current.status,
        });

        if (match.actionsApplied.createTodoTitle) {
          upsertTodo({
            id: `todo-flt-${current.id}`,
            threadId: current.id,
            threadSubject: current.subject,
            title: match.actionsApplied.createTodoTitle,
            dueDate: null,
            completed: false,
            priority: 'normal',
            createdAt: new Date().toISOString(),
          });
        }
      }

      upsertFilter({
        ...filter,
        lastRunAt: new Date().toISOString(),
        matchCount: results.length,
      });
    }

    res.json({
      results,
      usedLocalAi,
      providerUsed,
      dryRun,
      threads: getAllThreads(),
      filters: getFilters(),
      todos: getTodos(),
    });
  });

  // To-Do endpoints
  app.post('/api/todos', (req, res) => {
    const body = req.body as {
      id?: string;
      title?: string;
      threadId?: string | null;
      threadSubject?: string | null;
      dueDate?: string | null;
      completed?: boolean;
      priority?: 'high' | 'normal' | 'low';
    };

    if (!body.title?.trim()) {
      return res.status(400).json({ error: 'To-Do title is required.' });
    }

    const existing = body.id ? getTodos().find((t) => t.id === body.id) : null;
    const saved = upsertTodo({
      id: body.id || `todo-${Date.now()}`,
      threadId: body.threadId ?? existing?.threadId ?? null,
      threadSubject: body.threadSubject ?? existing?.threadSubject ?? null,
      title: body.title.trim(),
      dueDate: body.dueDate ?? existing?.dueDate ?? null,
      completed: body.completed ?? existing?.completed ?? false,
      priority: body.priority ?? existing?.priority ?? 'normal',
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    res.json({ todo: saved, todos: getTodos() });
  });

  app.delete('/api/todos/:id', (req, res) => {
    deleteTodo(req.params.id);
    res.json({ todos: getTodos() });
  });

  // Calendar endpoints
  app.post('/api/calendar', (req, res) => {
    const body = req.body as {
      title?: string;
      startTime?: string;
      endTime?: string;
      attendees?: string[];
      location?: string;
      sourceThreadId?: string | null;
    };
    if (!body.title?.trim() || !body.startTime) {
      return res.status(400).json({ error: 'Title and startTime are required.' });
    }
    const endTime =
      body.endTime ||
      new Date(new Date(body.startTime).getTime() + 30 * 60000).toISOString();
    const saved = upsertCalendarEvent({
      id: `cal-${Date.now()}`,
      title: body.title.trim(),
      startTime: body.startTime,
      endTime,
      attendees: body.attendees ?? [],
      location: body.location || 'Video Call',
      sourceThreadId: body.sourceThreadId ?? null,
    });
    res.json({ event: saved, calendarEvents: getCalendarEvents() });
  });

  // Send Email / Reply (SMTP or local persistence)
  app.post('/api/send', async (req, res) => {
    const body = req.body as {
      accountId?: string;
      threadId?: string;
      to?: string[];
      cc?: string[];
      subject?: string;
      bodyText?: string;
    };

    const recipients = (body.to ?? []).map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0 || !body.bodyText?.trim()) {
      return res
        .status(400)
        .json({ error: 'At least one recipient and message body are required.' });
    }

    const account =
      getAccountWithSecrets(body.accountId || 'acc-primary') ||
      getAccountWithSecrets(getAccounts()[0]?.id || 'acc-primary');

    if (!account) {
      return res.status(404).json({ error: 'No configured account found.' });
    }

    const delivery = await sendSmtpEmail(account, {
      to: recipients,
      cc: body.cc,
      subject: body.subject?.trim() || '(No Subject)',
      bodyText: body.bodyText.trim(),
    });

    if (!delivery.ok) {
      return res.status(502).json({ error: delivery.error });
    }

    const now = new Date().toISOString();
    if (body.threadId) {
      const existing = getThreadById(body.threadId);
      if (existing) {
        const updatedThread: EmailThread = {
          ...existing,
          lastMessageAt: now,
          snippet: body.bodyText.trim().slice(0, 140),
          isUnread: false,
          messages: [
            ...existing.messages,
            {
              id: `msg-${Date.now()}`,
              threadId: existing.id,
              fromName: account.displayName,
              fromEmail: account.email,
              to: recipients,
              cc: body.cc,
              date: now,
              bodyText: body.bodyText.trim(),
              attachments: [],
              isFromMe: true,
            },
          ],
        };
        upsertThread(updatedThread);
        return res.json({
          ok: true,
          deliveredVia: delivery.deliveredVia,
          thread: getThreadById(existing.id),
          threads: getAllThreads(),
        });
      }
    }

    const newThreadId = `thr-${Date.now()}`;
    const newThread: EmailThread = {
      id: newThreadId,
      accountId: account.id,
      subject: body.subject?.trim() || '(No Subject)',
      snippet: body.bodyText.trim().slice(0, 140),
      participants: [
        { name: account.displayName, email: account.email },
        ...recipients.map((email) => ({ name: email.split('@')[0], email })),
      ],
      lastMessageAt: now,
      isUnread: false,
      isStarred: false,
      isImportant: false,
      status: 'sent',
      bundle: 'Updates',
      labels: ['Sent'],
      messages: [
        {
          id: `msg-${Date.now()}`,
          threadId: newThreadId,
          fromName: account.displayName,
          fromEmail: account.email,
          to: recipients,
          cc: body.cc,
          date: now,
          bodyText: body.bodyText.trim(),
          attachments: [],
          isFromMe: true,
        },
      ],
    };
    upsertThread(newThread);
    return res.json({
      ok: true,
      deliveredVia: delivery.deliveredVia,
      thread: getThreadById(newThreadId),
      threads: getAllThreads(),
    });
  });

  // IMAP Account Configuration & Sync
  app.post('/api/accounts', (req, res) => {
    const body = req.body as Partial<ImapAccountConfig>;
    if (!body.email?.trim() || !body.displayName?.trim()) {
      return res.status(400).json({ error: 'Display name and email are required.' });
    }
    const existing = getAccounts().find((a) => a.id === body.id);
    const saved = saveAccount({
      id: body.id || existing?.id || 'acc-primary',
      label: body.label?.trim() || 'Primary',
      email: body.email.trim(),
      displayName: body.displayName.trim(),
      mode: body.mode === 'imap' ? 'imap' : 'demo',
      imapHost: body.imapHost?.trim() || 'imap.fastmail.com',
      imapPort: Number(body.imapPort || 993),
      imapSecure: body.imapSecure ?? true,
      imapUser: body.imapUser?.trim() || body.email.trim(),
      imapPass: body.imapPass,
      smtpHost: body.smtpHost?.trim() || 'smtp.fastmail.com',
      smtpPort: Number(body.smtpPort || 465),
      smtpSecure: body.smtpSecure ?? true,
      smtpUser: body.smtpUser?.trim() || body.email.trim(),
      smtpPass: body.smtpPass,
      writingStyle:
        body.writingStyle?.trim() ||
        'Direct, crisp, warm-professional. Short paragraphs, bullet points for action items.',
      lastSyncAt: existing?.lastSyncAt ?? null,
    });
    res.json({ account: saved, accounts: getAccounts() });
  });

  app.post('/api/accounts/test', async (req, res) => {
    const body = req.body as {
      imapHost?: string;
      imapPort?: number;
      imapSecure?: boolean;
      imapUser?: string;
      imapPass?: string;
      accountId?: string;
    };

    const stored = body.accountId ? getAccountWithSecrets(body.accountId) : null;
    const pass =
      body.imapPass && body.imapPass !== '••••••••'
        ? body.imapPass
        : stored?.imapPass || '';

    if (!body.imapHost || !body.imapUser || !pass) {
      return res
        .status(400)
        .json({ ok: false, error: 'IMAP host, username, and password are required.' });
    }

    const result = await testImapConnection({
      imapHost: body.imapHost,
      imapPort: Number(body.imapPort || 993),
      imapSecure: body.imapSecure ?? true,
      imapUser: body.imapUser,
      imapPass: pass,
    });

    res.json(result);
  });

  app.post('/api/accounts/sync', async (req, res) => {
    const { accountId } = req.body as { accountId?: string };
    const id = accountId || getAccounts()[0]?.id || 'acc-primary';
    const result = await syncImapAccount(id);

    // Run enabled auto-apply AI filters on inbox threads after sync
    if (result.syncedCount > 0) {
      const autoFilters = getFilters().filter((f) => f.enabled && f.autoApplyOnSync);
      const inboxThreads = getAllThreads().filter((t) => t.status === 'inbox');
      for (const filter of autoFilters) {
        const { results } = await evaluateAiFilter(filter, inboxThreads);
        for (const match of results) {
          const current = getThreadById(match.threadId);
          if (!current) continue;
          updateThreadFields(current.id, {
            bundle: match.actionsApplied.bundle || current.bundle,
            labels: Array.from(
              new Set([...current.labels, ...(match.actionsApplied.addLabels ?? [])])
            ),
            isStarred: match.actionsApplied.star ? true : current.isStarred,
            isImportant: match.actionsApplied.markImportant
              ? true
              : current.isImportant,
            status: match.actionsApplied.archive ? 'done' : current.status,
          });
        }
      }
    }

    res.json({
      ...result,
      threads: getAllThreads(),
      accounts: getAccounts(),
    });
  });

  app.post('/api/import/mbox/commit', async (req, res) => {
    const body = req.body as Partial<MboxCommitOptions>;
    if (!body.importId) {
      return res.status(400).json({ error: 'importId is required.' });
    }
    try {
      const outcome = await commitMboxImport({
        importId: body.importId,
        mappings: Array.isArray(body.mappings) ? body.mappings : [],
        skipSpamTrash: body.skipSpamTrash ?? true,
        preserveStatus: body.preserveStatus ?? true,
        defaultBundle: body.defaultBundle || 'Updates',
        autoRunAiFilters: Boolean(body.autoRunAiFilters),
      });
      return res.json(outcome);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to commit MBOX import.',
      });
    }
  });

  app.delete('/api/import/mbox/:importId', (req, res) => {
    discardStagedMboxImport(req.params.importId);
    res.json({ ok: true });
  });

  const httpServer = http.createServer(app);

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Tarsel Mail server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
