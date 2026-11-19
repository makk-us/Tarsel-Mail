import React, { useState } from 'react';
import {
  Bookmark,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Inbox,
  Layers,
  MailOpen,
  Newspaper,
  Paperclip,
  Plane,
  Server,
  Sparkles,
  Star,
} from 'lucide-react';
import type { EmailThread, SplitViewTab } from '../types/mail.ts';
import { groupThreadsIntoBundles } from '../utils/aiRuleEngine.ts';
import {
  formatCompactTimestamp,
  getAvatarTone,
  getInitials,
} from '../utils/mailHelpers.ts';

interface ThreadListProps {
  threads: EmailThread[];
  activeTab: SplitViewTab;
  onSelectTab: (tab: SplitViewTab) => void;
  selectedThreadId: string | null;
  focusedIndex: number;
  onSelectThread: (thread: EmailThread, index: number) => void;
  onMarkDone: (threadId: string) => void;
  onToggleStar: (threadId: string, nextStarred: boolean) => void;
  onToggleReadLater?: (threadId: string, nextReadLater: boolean) => void;
  onSnooze: (threadId: string) => void;
  onConvertToTodo: (thread: EmailThread) => void;
  onSweepBundle: (bundleName: string) => void;
  bundleViewMode: 'bundled' | 'flat';
  onToggleBundleViewMode: (mode: 'bundled' | 'flat') => void;
  isSearchActive: boolean;
  width?: number;
}

function getBundleIcon(bundleName: string) {
  const lower = bundleName.toLowerCase();
  if (lower.includes('priority')) return <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
  if (lower.includes('finance') || lower.includes('receipt'))
    return <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
  if (lower.includes('travel')) return <Plane className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
  if (lower.includes('newsletter'))
    return <Newspaper className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
  if (lower.includes('devops') || lower.includes('infra'))
    return <Server className="w-4 h-4 text-slate-600 dark:text-slate-300" />;
  return <Layers className="w-4 h-4 text-slate-500 dark:text-slate-400" />;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  activeTab,
  onSelectTab,
  selectedThreadId,
  focusedIndex,
  onSelectThread,
  onMarkDone,
  onToggleStar,
  onToggleReadLater,
  onSnooze,
  onConvertToTodo,
  onSweepBundle,
  bundleViewMode,
  onToggleBundleViewMode,
  isSearchActive,
  width,
}) => {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({});

  const toggleBundle = (bundleName: string) => {
    setCollapsedBundles((prev) => ({
      ...prev,
      [bundleName]: !prev[bundleName],
    }));
  };

  const showBundled =
    !isSearchActive &&
    (activeTab === 'bundles' || (activeTab === 'inbox' && bundleViewMode === 'bundled'));

  const bundleGroups = showBundled ? groupThreadsIntoBundles(threads) : [];

  // Map threadId -> flat keyboard index
  const flatOrderThreads = showBundled
    ? bundleGroups.flatMap((g) => (collapsedBundles[g.bundleName] ? [] : g.threads))
    : threads;

  const indexById = new Map(flatOrderThreads.map((t, i) => [t.id, i]));

  const renderThreadRow = (thread: EmailThread, nestedInBundle = false) => {
    const idx = indexById.get(thread.id) ?? -1;
    const isSelected = thread.id === selectedThreadId;
    const isFocused = idx === focusedIndex && idx >= 0;
    const sender = thread.participants[0] || {
      name: 'Unknown',
      email: 'unknown@local',
    };
    const hasAttachment = thread.messages.some((m) => m.attachments.length > 0);

    return (
      <div
        key={thread.id}
        data-thread-id={thread.id}
        className={`group relative border-b border-slate-200/70 dark:border-slate-800/70 transition-colors ${
          isSelected
            ? 'bg-sky-50/90 dark:bg-sky-950/35'
            : isFocused
              ? 'bg-slate-100/90 dark:bg-slate-800/70'
              : 'bg-white dark:bg-[#111827] hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
        } ${nestedInBundle ? 'pl-6 pr-3' : 'px-3.5'}`}
      >
        <div className="py-2.5 flex items-start gap-2.5">
          {/* Star Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(thread.id, !thread.isStarred);
            }}
            aria-label={
              thread.isStarred
                ? `Unstar "${thread.subject}"`
                : `Star "${thread.subject}"`
            }
            className={`mt-1 p-0.5 rounded shrink-0 transition-colors cursor-pointer ${
              thread.isStarred
                ? 'text-amber-500'
                : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
            }`}
          >
            <Star
              className="w-3.5 h-3.5"
              fill={thread.isStarred ? 'currentColor' : 'none'}
            />
          </button>

          {/* Avatar Monogram */}
          <div
            className={`w-7 h-7 rounded-md text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5 ${getAvatarTone(
              sender.email
            )}`}
            aria-hidden="true"
          >
            {getInitials(sender.name)}
          </div>

          {/* Primary Thread Button */}
          <button
            type="button"
            onClick={() => onSelectThread(thread, Math.max(0, idx))}
            className="flex-1 min-w-0 text-left focus:outline-none cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`text-[13px] truncate ${
                    thread.isUnread
                      ? 'font-semibold text-slate-950 dark:text-white'
                      : 'font-medium text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {sender.name}
                </span>
                {thread.messages.length > 1 && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                    ({thread.messages.length})
                  </span>
                )}
                {thread.isImportant && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                    Priority
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {thread.isReadLater && (
                  <Bookmark
                    className="w-3 h-3 text-sky-600 dark:text-sky-400"
                    fill="currentColor"
                    aria-label="Saved to Read Later"
                  />
                )}
                {hasAttachment && (
                  <Paperclip
                    className="w-3 h-3 text-slate-400 dark:text-slate-500"
                    aria-label="Has attachment"
                  />
                )}
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatCompactTimestamp(thread.lastMessageAt)}
                </span>
              </div>
            </div>

            <div
              className={`text-[13px] truncate mt-0.5 ${
                thread.isUnread
                  ? 'font-medium text-slate-900 dark:text-slate-100'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {thread.subject}
            </div>

            <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-slate-500 dark:text-slate-400 min-w-0">
              <span className="truncate">{thread.searchSnippet || thread.snippet}</span>
            </div>

            {thread.labels.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {thread.labels.slice(0, 3).map((label) => (
                  <span
                    key={label}
                    className="px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </button>

          {/* Hover / Keyboard-first Triage Actions */}
          <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 shrink-0 bg-white/95 dark:bg-slate-900/95 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
            {thread.status !== 'done' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkDone(thread.id);
                }}
                aria-label={`Mark "${thread.subject}" done`}
                title="Done (e)"
                className="p-1 rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSnooze(thread.id);
              }}
              aria-label={`Snooze "${thread.subject}"`}
              title="Snooze (h)"
              className="p-1 rounded text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-amber-950/50 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            {onToggleReadLater && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReadLater(thread.id, !thread.isReadLater);
                }}
                aria-label={
                  thread.isReadLater
                    ? `Remove "${thread.subject}" from Read Later`
                    : `Save "${thread.subject}" to Read Later`
                }
                title="Read Later (l)"
                className={`p-1 rounded cursor-pointer ${
                  thread.isReadLater
                    ? 'text-sky-600 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/50'
                    : 'text-slate-500 hover:text-sky-600 hover:bg-sky-50 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-sky-950/50'
                }`}
              >
                <Bookmark
                  className="w-3.5 h-3.5"
                  fill={thread.isReadLater ? 'currentColor' : 'none'}
                />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConvertToTodo(thread);
              }}
              aria-label={`Turn "${thread.subject}" into To-Do`}
              title="Turn into To-Do (t)"
              className="p-1 rounded text-slate-500 hover:text-sky-600 hover:bg-sky-50 dark:text-slate-400 dark:hover:text-sky-400 dark:hover:bg-sky-950/50 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Thread List"
      style={
        width
          ? ({ '--thread-list-width': `${width}px` } as React.CSSProperties)
          : undefined
      }
      className="w-full md:w-[var(--thread-list-width,420px)] shrink-0 h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]"
    >
      {/* Split Inbox Header Tabs + Bundled/Flat Toggle */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800">
          {(
            [
              { id: 'inbox', label: 'All' },
              { id: 'important', label: 'Important' },
              { id: 'bundles', label: 'Bundles' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`px-2.5 py-1 rounded-[5px] text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'inbox' && !isSearchActive && (
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onToggleBundleViewMode('bundled')}
              aria-pressed={bundleViewMode === 'bundled'}
              className={`px-2 py-1 rounded-[5px] text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                bundleViewMode === 'bundled'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Bundled
            </button>
            <button
              type="button"
              onClick={() => onToggleBundleViewMode('flat')}
              aria-pressed={bundleViewMode === 'flat'}
              className={`px-2 py-1 rounded-[5px] text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                bundleViewMode === 'flat'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Flat
            </button>
          </div>
        )}
      </div>

      {/* Threads / Google Inbox Bundles List */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
              {isSearchActive ? (
                <MailOpen className="w-5 h-5" />
              ) : activeTab === 'readLater' ? (
                <Bookmark className="w-5 h-5" />
              ) : (
                <Inbox className="w-5 h-5" />
              )}
            </div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isSearchActive
                ? 'No matching emails'
                : activeTab === 'readLater'
                  ? 'No saved threads yet'
                  : 'Inbox Zero achieved'}
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 max-w-[240px]">
              {isSearchActive
                ? 'Try clearing search operators or switching between FTS5 and AI Search.'
                : activeTab === 'readLater'
                  ? 'Press L on any thread or use the Command Palette to save emails for later reading.'
                  : 'Nothing left in this view. Press C to compose or check Done / Bundles.'}
            </p>
          </div>
        ) : showBundled ? (
          <div>
            {bundleGroups.map((group) => {
              const isCollapsed = Boolean(collapsedBundles[group.bundleName]);
              return (
                <div key={group.bundleName}>
                  {/* Google Inbox-Style Bundle Header */}
                  <div className="px-3.5 py-2 bg-slate-50/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleBundle(group.bundleName)}
                      aria-expanded={!isCollapsed}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      {getBundleIcon(group.bundleName)}
                      <span className="font-display text-[12px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {group.bundleName}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {group.threads.length}
                        {group.unreadCount > 0 ? ` · ${group.unreadCount} unread` : ''}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSweepBundle(group.bundleName)}
                      aria-label={`Mark bundle ${group.bundleName} done`}
                      title="Mark entire bundle done"
                      className="px-2 py-1 rounded text-[11px] font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/50 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Sweep</span>
                    </button>
                  </div>

                  {!isCollapsed &&
                    group.threads.map((thread) => renderThreadRow(thread, true))}
                </div>
              );
            })}
          </div>
        ) : (
          <div>{threads.map((thread) => renderThreadRow(thread, false))}</div>
        )}
      </div>
    </section>
  );
};
