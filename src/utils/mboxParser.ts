import type {
  MboxBundleAction,
  MboxLabelMappingRule,
} from '../types/mail.ts';

export interface ParsedGmailLabels {
  systemFlags: {
    inInbox: boolean;
    isUnread: boolean;
    isStarred: boolean;
    isImportant: boolean;
    isSent: boolean;
    isArchived: boolean;
    isSpamOrTrash: boolean;
  };
  userLabels: string[];
}

const SYSTEM_LABELS = new Set([
  'inbox',
  'unread',
  'opened',
  'starred',
  'important',
  'sent',
  'drafts',
  'draft',
  'archived',
  'archive',
  'all mail',
  'spam',
  'trash',
  'bin',
  'chat',
  'muted',
]);

const GENERIC_TAKEOUT_FILENAMES = new Set([
  'all mail including spam and trash',
  'all mail',
  'mail',
  'inbox',
  'sent',
  'starred',
  'important',
  'drafts',
  'archived',
  'spam',
  'trash',
  'unread',
]);

/**
 * Splits a raw MBOX file buffer or string into individual RFC 822 message blocks.
 * Handles CRLF/LF line endings and unescapes RFC 4155 `>From ` body lines.
 */
export function splitMboxMessages(rawInput: string | Buffer): string[] {
  const text = Buffer.isBuffer(rawInput) ? rawInput.toString('utf8') : rawInput;
  if (!text || !text.trim()) return [];

  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const messages: string[] = [];
  let current: string[] = [];
  let insideMessage = false;

  // Standard MBOX separator: "From <addr-or-dash> <date...>"
  const mboxFromRegex = /^From\s+\S+\s+.+\d{4}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (mboxFromRegex.test(line)) {
      if (insideMessage && current.length > 0) {
        const msg = current.join('\n').trim();
        if (msg) messages.push(msg);
      }
      current = [];
      insideMessage = true;
      continue;
    }

    if (!insideMessage) {
      // Fallback: if file doesn't start with an MBOX "From " line (single .eml-style), still collect headers
      if (line.trim() === '') continue;
      insideMessage = true;
    }

    // Unescape RFC 4155 ">From " -> "From "
    if (/^>+From\s/.test(line)) {
      current.push(line.slice(1));
    } else {
      current.push(line);
    }
  }

  if (insideMessage && current.length > 0) {
    const msg = current.join('\n').trim();
    if (msg) messages.push(msg);
  }

  return messages;
}

/**
 * Parses Gmail's X-Gmail-Labels header into system flags and clean user labels.
 * Supports quoted values containing commas, e.g. `"Finance, 2025",Inbox,Unread`.
 */
export function parseGmailLabelsHeader(headerValue: string | string[] | undefined): ParsedGmailLabels {
  const rawList: string[] = [];
  const inputs = Array.isArray(headerValue) ? headerValue : headerValue ? [headerValue] : [];

  for (const input of inputs) {
    let token = '';
    let inQuotes = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        if (token.trim()) rawList.push(token.trim());
        token = '';
      } else {
        token += ch;
      }
    }
    if (token.trim()) rawList.push(token.trim());
  }

  const systemFlags = {
    inInbox: false,
    isUnread: false,
    isStarred: false,
    isImportant: false,
    isSent: false,
    isArchived: false,
    isSpamOrTrash: false,
  };

  const userLabels: string[] = [];
  const seenLabels = new Set<string>();

  for (const raw of rawList) {
    const cleaned = raw.replace(/^["']|["']$/g, '').trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();

    if (lower === 'inbox') {
      systemFlags.inInbox = true;
    } else if (lower === 'unread') {
      systemFlags.isUnread = true;
    } else if (lower === 'starred') {
      systemFlags.isStarred = true;
    } else if (lower === 'important') {
      systemFlags.isImportant = true;
    } else if (lower === 'sent') {
      systemFlags.isSent = true;
    } else if (lower === 'archived' || lower === 'archive') {
      systemFlags.isArchived = true;
    } else if (lower === 'spam' || lower === 'trash' || lower === 'bin') {
      systemFlags.isSpamOrTrash = true;
    }

    if (!SYSTEM_LABELS.has(lower)) {
      const pretty = normalizeCategoryLabel(cleaned);
      if (pretty && !seenLabels.has(pretty.toLowerCase())) {
        seenLabels.add(pretty.toLowerCase());
        userLabels.push(pretty);
      }
    }
  }

  return { systemFlags, userLabels };
}

function normalizeCategoryLabel(raw: string): string {
  // Google Takeout formats built-in categories as "Category Updates", "Category Promotions", etc.
  const catMatch = raw.match(/^Category\s+(.+)$/i);
  if (catMatch) {
    return catMatch[1].trim();
  }
  return raw.trim();
}

/**
 * Extracts a meaningful folder/label name from an uploaded MBOX filename or path,
 * returning null for generic Google Takeout names like "All mail Including Spam and Trash.mbox".
 */
export function normalizeFolderNameToLabel(filenameOrPath: string): string | null {
  const base = filenameOrPath.split(/[/\\]/).pop() || '';
  const withoutExt = base.replace(/\.(mbox|mbx|eml)$/i, '').trim();
  if (!withoutExt) return null;

  // Strip Takeout trailing counter like "Receipts (1)"
  const stripped = withoutExt.replace(/\s*\(\d+\)$/, '').trim();
  if (GENERIC_TAKEOUT_FILENAMES.has(stripped.toLowerCase())) {
    return null;
  }
  // Convert nested Takeout folder separators (e.g., "Work-Contracts" or "Work_Contracts" kept readable)
  return stripped.replace(/[_]+/g, ' ').trim();
}

/**
 * Suggests whether a discovered Gmail label/folder should merge into an existing bundle
 * or create a brand-new bundle based on label semantics and existing workspace bundles.
 */
export function inferDefaultBundleSuggestion(
  label: string,
  existingBundles: string[]
): { action: MboxBundleAction; targetBundle: string } {
  const lower = label.toLowerCase().trim();
  const exactExisting = existingBundles.find(
    (b) => b.toLowerCase().trim() === lower
  );
  if (exactExisting) {
    return { action: 'merge', targetBundle: exactExisting };
  }

  const findBundle = (keywords: string[]) =>
    existingBundles.find((b) =>
      keywords.some((kw) => b.toLowerCase().includes(kw))
    );

  // Finance / Receipts / Invoices
  if (/\b(finance|receipt|receipts|invoice|invoices|billing|bank|payment|payments|expense|expenses)\b/.test(lower)) {
    const match = findBundle(['finance', 'receipt']);
    if (match) return { action: 'merge', targetBundle: match };
  }

  // Travel
  if (/\b(travel|flight|flights|hotel|hotels|trip|trips|booking|itinerary)\b/.test(lower)) {
    const match = findBundle(['travel']);
    if (match) return { action: 'merge', targetBundle: match };
  }

  // DevOps / Engineering / Infrastructure
  if (/\b(devops|infra|infrastructure|github|gitlab|ci|deploy|aws|hetzner|docker|server|alerts)\b/.test(lower)) {
    const match = findBundle(['devops']);
    if (match) return { action: 'merge', targetBundle: match };
  }

  // Newsletters / Promotions / Forums / Digests
  if (/\b(newsletter|newsletters|promotion|promotions|digest|digests|substack|forum|forums|reading|social)\b/.test(lower)) {
    const match = findBundle(['newsletter']);
    if (match) return { action: 'merge', targetBundle: match };
  }

  // Updates
  if (/\b(update|updates|notification|notifications)\b/.test(lower)) {
    const match = findBundle(['update']);
    if (match) return { action: 'merge', targetBundle: match };
  }

  // Priority / VIP
  if (/\b(priority|urgent|vip)\b/.test(lower)) {
    const match = findBundle(['priority']);
    if (match) return { action: 'merge', targetBundle: match };
  }

  // Custom user label/folder -> create a new bundle named cleanly after the label
  const cleanBundleName = label.replace(/\//g, ' · ').trim();
  return {
    action: 'create',
    targetBundle: cleanBundleName,
  };
}

/**
 * Resolves the final bundle, label tags, and thread status for an imported MBOX thread
 * according to user mapping rules (merge into existing, create new bundle, or tag-only).
 */
export function resolveThreadBundleAndStatus(params: {
  allCandidateLabels: string[];
  systemFlags: ParsedGmailLabels['systemFlags'];
  mappings: MboxLabelMappingRule[];
  preserveStatus: boolean;
  defaultBundle: string;
}): {
  bundle: string;
  labels: string[];
  status: 'inbox' | 'done' | 'sent';
  createdBundleUsed: string | null;
  mergedBundleUsed: string | null;
} {
  const {
    allCandidateLabels,
    systemFlags,
    mappings,
    preserveStatus,
    defaultBundle,
  } = params;

  const mappingByLower = new Map(
    mappings.map((m) => [m.label.toLowerCase(), m])
  );

  let chosenBundle = defaultBundle || 'Updates';
  let createdBundleUsed: string | null = null;
  let mergedBundleUsed: string | null = null;

  // Prefer custom/specific non-generic labels over broad "Updates" when multiple labels are present
  const sortedCandidates = [...allCandidateLabels].sort((a, b) => {
    const mapA = mappingByLower.get(a.toLowerCase());
    const mapB = mappingByLower.get(b.toLowerCase());
    const score = (lbl: string, m?: MboxLabelMappingRule) => {
      if (!m || m.action === 'ignore') return 0;
      if (m.action === 'create') return 3;
      if (lbl.toLowerCase() === 'updates' || m.targetBundle.toLowerCase() === 'updates') return 1;
      return 2;
    };
    return score(b, mapB) - score(a, mapA);
  });

  for (const label of sortedCandidates) {
    const rule = mappingByLower.get(label.toLowerCase());
    if (!rule || rule.action === 'ignore') continue;
    const target = rule.targetBundle.trim();
    if (!target) continue;
    chosenBundle = target;
    if (rule.action === 'create') {
      createdBundleUsed = target;
    } else {
      mergedBundleUsed = target;
    }
    break;
  }

  let status: 'inbox' | 'done' | 'sent' = 'inbox';
  if (preserveStatus) {
    if (systemFlags.isSent && !systemFlags.inInbox) {
      status = 'sent';
    } else if (
      (systemFlags.isArchived || systemFlags.isSpamOrTrash) &&
      !systemFlags.inInbox
    ) {
      status = 'done';
    } else {
      status = 'inbox';
    }
  }

  const labels = Array.from(
    new Set(allCandidateLabels.map((l) => l.trim()).filter(Boolean))
  );

  return {
    bundle: chosenBundle,
    labels,
    status,
    createdBundleUsed,
    mergedBundleUsed,
  };
}
