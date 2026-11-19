import type { EmailThread } from '../types/mail.ts';

export interface ParsedSearchQuery {
  textTerms: string[];
  from?: string;
  bundle?: string;
  label?: string;
  hasAttachment: boolean;
  isStarred: boolean;
  isUnread: boolean;
  isImportant: boolean;
  isReadLater: boolean;
}

/**
 * Parses a Superhuman / Shortwave style search query supporting operators:
 * from:, bundle:, label:, has:attachment, is:starred, is:unread, is:important, is:readlater
 */
export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    textTerms: [],
    hasAttachment: false,
    isStarred: false,
    isUnread: false,
    isImportant: false,
    isReadLater: false,
  };

  const trimmed = rawQuery.trim();
  if (!trimmed) return result;

  // Match quoted phrases or non-whitespace tokens
  const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const rawToken of tokens) {
    const token = rawToken.replace(/^"|"$/g, '');
    const lower = token.toLowerCase();

    if (lower.startsWith('from:') && token.length > 5) {
      result.from = token.slice(5).toLowerCase();
    } else if (lower.startsWith('bundle:') && token.length > 7) {
      result.bundle = token.slice(7).toLowerCase();
    } else if (lower.startsWith('label:') && token.length > 6) {
      result.label = token.slice(6).toLowerCase();
    } else if (lower === 'has:attachment' || lower === 'has:attachments') {
      result.hasAttachment = true;
    } else if (lower === 'is:starred') {
      result.isStarred = true;
    } else if (lower === 'is:unread') {
      result.isUnread = true;
    } else if (lower === 'is:important') {
      result.isImportant = true;
    } else if (lower === 'is:readlater' || lower === 'is:read-later') {
      result.isReadLater = true;
    } else if (token.length > 0) {
      result.textTerms.push(token.toLowerCase());
    }
  }

  return result;
}

/**
 * Builds a safe SQLite FTS5 MATCH query from free-text terms using prefix matching.
 */
export function buildFtsMatchQuery(terms: string[]): string {
  const cleaned = terms
    .map((t) => t.replace(/[^\p{L}\p{N}_@-]/gu, '').trim())
    .filter((t) => t.length > 0);
  if (cleaned.length === 0) return '';
  return cleaned.map((t) => `"${t}"*`).join(' AND ');
}

/**
 * Fast client-side / fallback in-memory search filter matching parsed query operators + terms.
 */
export function filterThreadsByParsedQuery(
  threads: EmailThread[],
  parsed: ParsedSearchQuery
): EmailThread[] {
  return threads.filter((thread) => {
    if (parsed.isStarred && !thread.isStarred) return false;
    if (parsed.isUnread && !thread.isUnread) return false;
    if (parsed.isImportant && !thread.isImportant) return false;
    if (parsed.isReadLater && !thread.isReadLater) return false;

    if (parsed.hasAttachment) {
      const hasAnyAttachment = thread.messages.some(
        (m) => m.attachments && m.attachments.length > 0
      );
      if (!hasAnyAttachment) return false;
    }

    if (parsed.from) {
      const matchesSender =
        thread.participants.some(
          (p) =>
            p.email.toLowerCase().includes(parsed.from!) ||
            p.name.toLowerCase().includes(parsed.from!)
        ) ||
        thread.messages.some(
          (m) =>
            m.fromEmail.toLowerCase().includes(parsed.from!) ||
            m.fromName.toLowerCase().includes(parsed.from!)
        );
      if (!matchesSender) return false;
    }

    if (parsed.bundle) {
      if (!thread.bundle.toLowerCase().includes(parsed.bundle)) return false;
    }

    if (parsed.label) {
      const matchesLabel = thread.labels.some((l) =>
        l.toLowerCase().includes(parsed.label!)
      );
      if (!matchesLabel) return false;
    }

    if (parsed.textTerms.length > 0) {
      const haystack = [
        thread.subject,
        thread.snippet,
        thread.bundle,
        ...thread.labels,
        ...thread.participants.flatMap((p) => [p.name, p.email]),
        ...thread.messages.flatMap((m) => [
          m.fromName,
          m.fromEmail,
          m.bodyText,
          ...m.attachments.map((a) => a.filename),
        ]),
      ]
        .join(' ')
        .toLowerCase();

      for (const term of parsed.textTerms) {
        if (!haystack.includes(term)) return false;
      }
    }

    return true;
  });
}
