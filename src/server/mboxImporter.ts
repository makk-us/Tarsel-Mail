import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import type {
  EmailAttachment,
  EmailMessage,
  EmailThread,
  MboxCommitOptions,
  MboxCommitResponse,
  MboxDiscoveredLabel,
  MboxInspectResponse,
} from '../types/mail.ts';
import {
  inferDefaultBundleSuggestion,
  normalizeFolderNameToLabel,
  parseGmailLabelsHeader,
  resolveThreadBundleAndStatus,
  splitMboxMessages,
  type ParsedGmailLabels,
} from '../utils/mboxParser.ts';
import { evaluateAiFilter } from './aiService.ts';
import {
  getAllThreads,
  getFilters,
  getThreadById,
  getTodos,
  updateThreadFields,
  upsertFilter,
  upsertThread,
  upsertTodo,
} from './db.ts';

interface StagedMessage {
  messageIdHeader: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc: string[];
  date: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
  isFromMe: boolean;
}

interface StagedThread {
  groupKey: string;
  accountId: string;
  subject: string;
  participants: Map<string, { name: string; email: string }>;
  systemFlags: ParsedGmailLabels['systemFlags'];
  gmailLabels: Set<string>;
  folderLabels: Set<string>;
  messages: StagedMessage[];
}

interface StagedImport {
  importId: string;
  createdAt: number;
  accountId: string;
  filename: string;
  folderLabel: string | null;
  totalMessages: number;
  skippedSpamTrash: number;
  threads: StagedThread[];
}

const STAGING_TTL_MS = 30 * 60 * 1000;
const stagedImports = new Map<string, StagedImport>();

function cleanupExpiredImports() {
  const now = Date.now();
  for (const [id, entry] of stagedImports.entries()) {
    if (now - entry.createdAt > STAGING_TTL_MS) {
      stagedImports.delete(id);
    }
  }
}

const STANDARD_BUNDLES = [
  'Priority',
  'Finance & Receipts',
  'DevOps',
  'Travel',
  'Updates',
  'Newsletters',
];

function getExistingWorkspaceBundles(): string[] {
  const set = new Set<string>(STANDARD_BUNDLES);
  for (const t of getAllThreads()) {
    if (t.bundle && t.bundle.trim()) {
      set.add(t.bundle.trim());
    }
  }
  return Array.from(set);
}

function normalizeSubjectForGrouping(subject: string): string {
  return subject.replace(/^(?:re|fwd?|aw|wg)\s*:\s*/gi, '').trim().toLowerCase();
}

function extractAddressList(field: unknown): { name: string; email: string }[] {
  if (!field || typeof field !== 'object') return [];
  const val = (field as { value?: Array<{ name?: string; address?: string }> }).value;
  if (!Array.isArray(val)) return [];
  return val
    .filter((entry) => Boolean(entry.address))
    .map((entry) => ({
      name: entry.name?.trim() || entry.address!.split('@')[0],
      email: entry.address!.trim().toLowerCase(),
    }));
}

function readStringHeader(headers: Map<string, unknown>, key: string): string {
  const raw = headers.get(key);
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String).join(',');
  if (raw && typeof raw === 'object' && 'text' in raw) {
    return String((raw as { text?: unknown }).text || '');
  }
  return '';
}

export async function inspectMboxFiles(params: {
  files: Array<{
    filename: string;
    content: Buffer | string;
    folderOverride?: string;
  }>;
  accountId: string;
  accountEmail?: string;
}): Promise<MboxInspectResponse> {
  cleanupExpiredImports();

  const { files, accountId, accountEmail } = params;
  const threadGroups = new Map<string, StagedThread>();
  const msgIdToGroupKey = new Map<string, string>();
  let totalMessages = 0;
  let skippedSpamTrash = 0;

  const labelStats = new Map<
    string,
    { source: 'gmail-label' | 'folder'; threadKeys: Set<string>; samples: Set<string> }
  >();

  for (const file of files) {
    const rawMessages = splitMboxMessages(file.content);
    const derivedFolder =
      file.folderOverride?.trim() || normalizeFolderNameToLabel(file.filename);

    for (const rawMsg of rawMessages) {
      totalMessages += 1;
      let parsed;
      try {
        parsed = await simpleParser(rawMsg);
      } catch {
        continue;
      }

      const headersMap = parsed.headers as unknown as Map<string, unknown>;
      const rawGmailLabels = readStringHeader(headersMap, 'x-gmail-labels');
      const gmailParsed = parseGmailLabelsHeader(rawGmailLabels);

      if (gmailParsed.systemFlags.isSpamOrTrash && !gmailParsed.systemFlags.inInbox) {
        skippedSpamTrash += 1;
      }

      const subject = parsed.subject?.trim() || '(No Subject)';
      const gmThrid = readStringHeader(headersMap, 'x-gm-thrid').trim();
      const messageId = (parsed.messageId || '').trim();
      const inReplyTo = (parsed.inReplyTo || '').trim();
      const refs = Array.isArray(parsed.references)
        ? parsed.references
        : typeof parsed.references === 'string'
          ? parsed.references.split(/\s+/)
          : [];

      // Determine thread grouping key
      let groupKey = '';
      if (gmThrid) {
        groupKey = `gm:${gmThrid}`;
      } else {
        for (const ref of [inReplyTo, ...refs].filter(Boolean)) {
          const hit = msgIdToGroupKey.get(ref);
          if (hit) {
            groupKey = hit;
            break;
          }
        }
        if (!groupKey) {
          const normSubj = normalizeSubjectForGrouping(subject) || `msg-${totalMessages}`;
          groupKey = `subj:${normSubj}`;
        }
      }

      if (messageId) {
        msgIdToGroupKey.set(messageId, groupKey);
      }

      const fromList = extractAddressList(parsed.from);
      const fromEntry = fromList[0] || {
        name: 'Unknown Sender',
        email: 'unknown@takeout.local',
      };
      const toList = extractAddressList(parsed.to).map((p) => p.email);
      const ccList = extractAddressList(parsed.cc).map((p) => p.email);

      const dateIso = (parsed.date && !Number.isNaN(parsed.date.getTime())
        ? parsed.date
        : new Date()
      ).toISOString();

      const bodyText = (
        parsed.text ||
        (typeof parsed.html === 'string'
          ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : '')
      ).trim();

      const attachments: EmailAttachment[] = (parsed.attachments || []).map(
        (att, idx) => ({
          id: `mbox-att-${totalMessages}-${idx}`,
          filename: att.filename || `attachment-${idx + 1}`,
          mimeType: att.contentType || 'application/octet-stream',
          sizeBytes: att.size || 0,
        })
      );

      let staged = threadGroups.get(groupKey);
      if (!staged) {
        staged = {
          groupKey,
          accountId,
          subject,
          participants: new Map(),
          systemFlags: { ...gmailParsed.systemFlags },
          gmailLabels: new Set(),
          folderLabels: new Set(),
          messages: [],
        };
        threadGroups.set(groupKey, staged);
      } else {
        staged.systemFlags.inInbox =
          staged.systemFlags.inInbox || gmailParsed.systemFlags.inInbox;
        staged.systemFlags.isUnread =
          staged.systemFlags.isUnread || gmailParsed.systemFlags.isUnread;
        staged.systemFlags.isStarred =
          staged.systemFlags.isStarred || gmailParsed.systemFlags.isStarred;
        staged.systemFlags.isImportant =
          staged.systemFlags.isImportant || gmailParsed.systemFlags.isImportant;
        staged.systemFlags.isSent =
          staged.systemFlags.isSent || gmailParsed.systemFlags.isSent;
        staged.systemFlags.isArchived =
          staged.systemFlags.isArchived || gmailParsed.systemFlags.isArchived;
        staged.systemFlags.isSpamOrTrash =
          staged.systemFlags.isSpamOrTrash && gmailParsed.systemFlags.isSpamOrTrash;
      }

      staged.participants.set(fromEntry.email, fromEntry);
      for (const lbl of gmailParsed.userLabels) {
        staged.gmailLabels.add(lbl);
        const stat = labelStats.get(lbl) || {
          source: 'gmail-label' as const,
          threadKeys: new Set<string>(),
          samples: new Set<string>(),
        };
        stat.source = 'gmail-label';
        stat.threadKeys.add(groupKey);
        if (stat.samples.size < 2) stat.samples.add(subject);
        labelStats.set(lbl, stat);
      }

      if (derivedFolder) {
        staged.folderLabels.add(derivedFolder);
        const stat = labelStats.get(derivedFolder) || {
          source: 'folder' as const,
          threadKeys: new Set<string>(),
          samples: new Set<string>(),
        };
        stat.threadKeys.add(groupKey);
        if (stat.samples.size < 2) stat.samples.add(subject);
        labelStats.set(derivedFolder, stat);
      }

      staged.messages.push({
        messageIdHeader: messageId,
        fromName: fromEntry.name,
        fromEmail: fromEntry.email,
        to: toList.length > 0 ? toList : [accountEmail || 'me@tarsel.local'],
        cc: ccList,
        date: dateIso,
        bodyText: bodyText || '(Empty message body)',
        bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
        attachments,
        isFromMe:
          gmailParsed.systemFlags.isSent ||
          (accountEmail
            ? fromEntry.email.toLowerCase() === accountEmail.toLowerCase()
            : false),
      });
    }
  }

  const existingBundles = getExistingWorkspaceBundles();
  const discoveredLabels: MboxDiscoveredLabel[] = Array.from(labelStats.entries())
    .map(([label, stat]) => {
      const suggestion = inferDefaultBundleSuggestion(label, existingBundles);
      return {
        label,
        source: stat.source,
        count: stat.threadKeys.size,
        suggestedAction: suggestion.action,
        suggestedBundle: suggestion.targetBundle,
        sampleSubjects: Array.from(stat.samples),
      };
    })
    .sort((a, b) => b.count - a.count);

  const importId = `mbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const primaryFilename =
    files.length === 1
      ? files[0].filename
      : `${files.length} MBOX files (${files.map((f) => f.filename).join(', ')})`;
  const primaryFolderLabel =
    files.length === 1
      ? files[0].folderOverride?.trim() || normalizeFolderNameToLabel(files[0].filename)
      : null;

  stagedImports.set(importId, {
    importId,
    createdAt: Date.now(),
    accountId,
    filename: primaryFilename,
    folderLabel: primaryFolderLabel,
    totalMessages,
    skippedSpamTrash,
    threads: Array.from(threadGroups.values()),
  });

  return {
    importId,
    filename: primaryFilename,
    folderLabel: primaryFolderLabel,
    totalMessages,
    skippedSpamTrash,
    threadCount: threadGroups.size,
    existingBundles,
    discoveredLabels,
  };
}

export async function commitMboxImport(
  options: MboxCommitOptions
): Promise<MboxCommitResponse> {
  cleanupExpiredImports();
  const staged = stagedImports.get(options.importId);
  if (!staged) {
    throw new Error('Staged MBOX import session expired or not found. Please re-select the file.');
  }

  const createdBundlesSet = new Set<string>();
  const mergedBundlesSet = new Set<string>();
  const importedThreadIds: string[] = [];
  let importedMessages = 0;

  for (const st of staged.threads) {
    if (
      options.skipSpamTrash &&
      st.systemFlags.isSpamOrTrash &&
      !st.systemFlags.inInbox
    ) {
      continue;
    }

    const sortedMsgs = [...st.messages].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (sortedMsgs.length === 0) continue;

    const allCandidateLabels = Array.from(
      new Set([...st.gmailLabels, ...st.folderLabels])
    );

    const resolved = resolveThreadBundleAndStatus({
      allCandidateLabels,
      systemFlags: st.systemFlags,
      mappings: options.mappings,
      preserveStatus: options.preserveStatus,
      defaultBundle: options.defaultBundle || 'Updates',
    });

    if (resolved.createdBundleUsed) {
      createdBundlesSet.add(resolved.createdBundleUsed);
    }
    if (resolved.mergedBundleUsed) {
      mergedBundlesSet.add(resolved.mergedBundleUsed);
    }

    const hashSeed = `${st.groupKey}:${sortedMsgs[0].messageIdHeader || st.subject}`;
    const threadHash = createHash('sha1').update(hashSeed).digest('hex').slice(0, 14);
    const threadId = `mbox-${threadHash}`;

    const existing = getThreadById(threadId);
    const mergedLabels = existing
      ? Array.from(new Set([...existing.labels, ...resolved.labels]))
      : resolved.labels;

    const latestMsg = sortedMsgs[sortedMsgs.length - 1];
    const messages: EmailMessage[] = sortedMsgs.map((m, idx) => ({
      id: `mbox-msg-${threadHash}-${idx}`,
      threadId,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      to: m.to,
      cc: m.cc,
      date: m.date,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      attachments: m.attachments,
      isFromMe: m.isFromMe,
    }));

    const threadRecord: EmailThread = {
      id: threadId,
      accountId: staged.accountId,
      subject: st.subject,
      snippet: latestMsg.bodyText.slice(0, 160),
      participants: Array.from(st.participants.values()),
      lastMessageAt: latestMsg.date,
      isUnread: st.systemFlags.isUnread,
      isStarred: st.systemFlags.isStarred,
      isImportant: st.systemFlags.isImportant,
      status: resolved.status,
      bundle: resolved.bundle,
      labels: mergedLabels,
      messages,
    };

    upsertThread(threadRecord);
    importedThreadIds.push(threadId);
    importedMessages += messages.length;
  }

  if (options.autoRunAiFilters && importedThreadIds.length > 0) {
    const idSet = new Set(importedThreadIds);
    const importedThreads = getAllThreads().filter((t) => idSet.has(t.id));
    const enabledFilters = getFilters().filter((f) => f.enabled);
    for (const filter of enabledFilters) {
      const { results } = await evaluateAiFilter(filter, importedThreads);
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
      if (results.length > 0) {
        upsertFilter({
          ...filter,
          lastRunAt: new Date().toISOString(),
          matchCount: filter.matchCount + results.length,
        });
      }
    }
  }

  stagedImports.delete(options.importId);

  return {
    importedThreads: importedThreadIds.length,
    importedMessages,
    createdBundles: Array.from(createdBundlesSet),
    mergedBundles: Array.from(mergedBundlesSet),
    threads: getAllThreads(),
    filters: getFilters(),
    todos: getTodos(),
  };
}

export function discardStagedMboxImport(importId: string): void {
  stagedImports.delete(importId);
}
