export type SplitViewTab =
  | 'inbox'
  | 'important'
  | 'bundles'
  | 'todo'
  | 'readLater'
  | 'snoozed'
  | 'done'
  | 'sent';

export type AppSection = 'mail' | 'filters' | 'calendar';

export type AIProviderType = 'ollama';

export interface AIConfig {
  provider: AIProviderType;
  baseUrl: string;
  model: string;
  apiKeyEnvVar: string;
}

export interface AIStatus {
  configured: boolean;
  activeProvider: AIProviderType;
  activeModel: string;
  localOnly: boolean;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  date: string; // ISO string
  bodyText: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
  isFromMe?: boolean;
}

export interface EmailThread {
  id: string;
  accountId: string;
  subject: string;
  snippet: string;
  participants: { name: string; email: string }[];
  lastMessageAt: string; // ISO string
  isUnread: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isReadLater?: boolean;
  status: 'inbox' | 'done' | 'snoozed' | 'sent';
  snoozedUntil?: string | null;
  bundle: string; // e.g., 'Priority' | 'Finance & Receipts' | 'Updates' | 'Newsletters' | 'Travel' | 'DevOps'
  labels: string[];
  aiSummary?: string | null;
  aiActionItems?: string[];
  detectedMeeting?: {
    title: string;
    proposedTime: string;
    durationMinutes: number;
  } | null;
  messages: EmailMessage[];
  searchSnippet?: string;
}

export interface AIFilterRule {
  id: string;
  name: string;
  prompt: string; // Plain English instruction
  enabled: boolean;
  autoApplyOnSync: boolean;
  targetBundle?: string | null;
  lastRunAt?: string | null;
  matchCount: number;
  createdAt: string;
}

export interface FilterMatchResult {
  threadId: string;
  subject: string;
  from: string;
  matched: boolean;
  reason: string;
  actionsApplied: {
    bundle?: string;
    addLabels?: string[];
    star?: boolean;
    archive?: boolean;
    markImportant?: boolean;
    createTodoTitle?: string;
  };
}

export interface TodoItem {
  id: string;
  threadId?: string | null;
  threadSubject?: string | null;
  title: string;
  dueDate?: string | null;
  completed: boolean;
  priority: 'high' | 'normal' | 'low';
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO
  endTime: string; // ISO
  attendees: string[];
  location: string;
  sourceThreadId?: string | null;
}

export interface ImapAccountConfig {
  id: string;
  label: string;
  email: string;
  displayName: string;
  mode: 'demo' | 'imap';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass?: string;
  writingStyle: string;
  lastSyncAt?: string | null;
}

export type WritingAssistAction =
  | 'draft'
  | 'shorten'
  | 'translate'
  | 'proofread'
  | 'reply';

export interface BootstrapPayload {
  accounts: ImapAccountConfig[];
  activeAccountId: string;
  threads: EmailThread[];
  filters: AIFilterRule[];
  todos: TodoItem[];
  calendarEvents: CalendarEvent[];
  aiConfig: AIConfig;
  aiStatus: AIStatus;
}

export type MboxBundleAction = 'merge' | 'create' | 'ignore';

export interface MboxDiscoveredLabel {
  label: string;
  source: 'gmail-label' | 'folder';
  count: number;
  suggestedAction: MboxBundleAction;
  suggestedBundle: string;
  sampleSubjects: string[];
}

export interface MboxLabelMappingRule {
  label: string;
  action: MboxBundleAction;
  targetBundle: string;
}

export interface MboxInspectResponse {
  importId: string;
  filename: string;
  folderLabel: string | null;
  totalMessages: number;
  skippedSpamTrash: number;
  threadCount: number;
  existingBundles: string[];
  discoveredLabels: MboxDiscoveredLabel[];
}

export interface MboxCommitOptions {
  importId: string;
  mappings: MboxLabelMappingRule[];
  skipSpamTrash: boolean;
  preserveStatus: boolean;
  defaultBundle: string;
  autoRunAiFilters: boolean;
}

export interface MboxCommitResponse {
  importedThreads: number;
  importedMessages: number;
  createdBundles: string[];
  mergedBundles: string[];
  threads: EmailThread[];
  filters: AIFilterRule[];
  todos: TodoItem[];
}
