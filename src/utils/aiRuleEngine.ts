import type { AIFilterRule, EmailThread, FilterMatchResult } from '../types/mail.ts';

export interface BundleGroup {
  bundleName: string;
  threads: EmailThread[];
  unreadCount: number;
  latestAt: string;
}

const BUNDLE_ORDER: Record<string, number> = {
  Priority: 0,
  'Finance & Receipts': 1,
  DevOps: 2,
  Travel: 3,
  Updates: 4,
  Newsletters: 5,
};

/**
 * Groups inbox threads into Google Inbox-style Bundles, keeping 'Priority' threads
 * at the top or grouped cleanly with deterministic ordering.
 */
export function groupThreadsIntoBundles(threads: EmailThread[]): BundleGroup[] {
  const map = new Map<string, EmailThread[]>();

  for (const thread of threads) {
    const key = thread.bundle || 'Updates';
    const existing = map.get(key);
    if (existing) {
      existing.push(thread);
    } else {
      map.set(key, [thread]);
    }
  }

  const groups: BundleGroup[] = [];
  for (const [bundleName, groupThreads] of map.entries()) {
    const sorted = [...groupThreads].sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
    groups.push({
      bundleName,
      threads: sorted,
      unreadCount: sorted.filter((t) => t.isUnread).length,
      latestAt: sorted[0]?.lastMessageAt ?? '',
    });
  }

  return groups.sort((a, b) => {
    const orderA = BUNDLE_ORDER[a.bundleName] ?? 50;
    const orderB = BUNDLE_ORDER[b.bundleName] ?? 50;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
  });
}

/**
 * Extracts structured keywords & actions from a plain-English AI filter prompt
 * for deterministic fallback evaluation (when offline or without Gemini key)
 * and instant rule previewing.
 */
export function evaluateFilterHeuristically(
  rule: AIFilterRule,
  threads: EmailThread[]
): FilterMatchResult[] {
  const prompt = rule.prompt.toLowerCase();
  const results: FilterMatchResult[] = [];

  // Infer target actions from plain-English prompt
  const wantsStar = /\b(star|flag|highlight)\b/.test(prompt);
  const wantsArchive = /\b(archive|mark done|skip inbox|auto-archive)\b/.test(prompt);
  const wantsImportant = /\b(important|priority|urgent)\b/.test(prompt);
  const wantsTodo = /\b(to-do|todo|task|action item)\b/.test(prompt);

  // Extract explicit label e.g. "label receipts as Finance" or "label as Finance"
  const labelMatch = rule.prompt.match(
    /\blabel\b[^,.]*?\b(?:as|with)\s+["']?([A-Za-z0-9 &_-]{2,24}?)(?=["']?(?:\s*(?:,|\band\b|$)))/i
  );
  const inferredLabel = labelMatch ? labelMatch[1].trim() : undefined;

  // Extract explicit bundle e.g. "bundle into Receipts" or rule.targetBundle
  const bundleMatch = rule.prompt.match(
    /\bbundle\b[^,.]*?\b(?:into|in|under|as)\s+["']?([A-Za-z0-9 &_-]{2,28}?)(?=["']?(?:\s*(?:,|\band\b|$)))/i
  );
  const inferredBundle =
    rule.targetBundle?.trim() || (bundleMatch ? bundleMatch[1].trim() : undefined);

  // Check for dollar threshold e.g. "over $500"
  const amountThresholdMatch = prompt.match(/(?:over|above|>)\s*[$€]?\s*(\d+(?:\.\d+)?)/);
  const amountThreshold = amountThresholdMatch ? Number(amountThresholdMatch[1]) : null;

  // Extract condition keywords (remove common stop/action words and threshold expressions)
  const stopWords = new Set([
    'automatically', 'label', 'star', 'archive', 'mark', 'done', 'bundle',
    'into', 'emails', 'email', 'messages', 'message', 'from', 'about', 'that',
    'with', 'mention', 'mentions', 'mentioning', 'containing', 'contains',
    'anything', 'everything', 'over', 'above', 'more', 'than', 'and', 'the',
    'for', 'are', 'under', 'then', 'also', 'turn', 'create', 'todo', 'to-do',
    'task', 'flag', 'important', 'priority', 'unless', 'they', 'when', 'where',
    'if', 'as', 'to', 'in', 'of', 'on', 'or', 'is', 'be', 'it', 'them', 'any',
  ]);

  const cleanedPromptForKeywords = prompt
    .replace(/(?:over|above|>)\s*[$€]?\s*\d+(?:\.\d+)?/g, ' ')
    .replace(/\b(?:as|into)\s+[a-z0-9 &_-]{2,24}/g, ' ');

  const rawKeywords = cleanedPromptForKeywords
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  const actionWords = new Set(
    [inferredLabel, inferredBundle]
      .filter(Boolean)
      .flatMap((s) => s!.toLowerCase().split(/\s+/))
  );

  // Normalize simple plural endings so "invoices" matches "invoice" and "receipts" matches "receipt"
  const matchKeywords = rawKeywords
    .filter((w) => !actionWords.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));

  for (const thread of threads) {
    const fullText = [
      thread.subject,
      thread.snippet,
      ...thread.participants.flatMap((p) => [p.name, p.email]),
      ...thread.messages.map((m) => m.bodyText),
    ]
      .join(' ')
      .toLowerCase();

    const matchedWords = matchKeywords.filter((kw) => fullText.includes(kw));

    let thresholdHit = false;
    if (amountThreshold !== null) {
      const moneyMatches = [...fullText.matchAll(/[$€]\s*(\d[\d,]*(?:\.\d+)?)/g)];
      for (const m of moneyMatches) {
        const val = Number(m[1].replace(/,/g, ''));
        if (!Number.isNaN(val) && val > amountThreshold) {
          thresholdHit = true;
          break;
        }
      }
    }

    const matched =
      matchedWords.length > 0 && (amountThreshold === null || thresholdHit);

    if (matched) {
      results.push({
        threadId: thread.id,
        subject: thread.subject,
        from: thread.participants[0]?.name || thread.participants[0]?.email || 'Unknown',
        matched: true,
        reason: `Matched keywords: ${matchedWords.slice(0, 4).join(', ')}${
          thresholdHit ? ` (amount > ${amountThreshold})` : ''
        }`,
        actionsApplied: {
          ...(inferredBundle ? { bundle: inferredBundle } : {}),
          ...(inferredLabel ? { addLabels: [inferredLabel] } : {}),
          ...(wantsStar && (amountThreshold === null || thresholdHit) ? { star: true } : {}),
          ...(wantsArchive ? { archive: true } : {}),
          ...(wantsImportant ? { markImportant: true } : {}),
          ...(wantsTodo ? { createTodoTitle: `Follow up: ${thread.subject}` } : {}),
        },
      });
    }
  }

  return results;
}
