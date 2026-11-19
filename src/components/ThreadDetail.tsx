import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  CalendarPlus,
  Check,
  CheckSquare,
  Clock,
  Languages,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react';
import type { EmailThread, WritingAssistAction } from '../types/mail.ts';
import {
  formatBytes,
  formatCompactTimestamp,
  getAvatarTone,
  getInitials,
} from '../utils/mailHelpers.ts';
import {
  DEFAULT_PANE_SIZES,
  clampPaneSize,
  computeReplyFormBounds,
} from '../utils/paneLayout.ts';
import { SplitResizer } from './SplitResizer.tsx';

interface ThreadDetailProps {
  thread: EmailThread | null;
  onMarkDone: (threadId: string) => void;
  onReopenInbox: (threadId: string) => void;
  onToggleStar: (threadId: string, nextStarred: boolean) => void;
  onToggleReadLater?: (threadId: string, nextReadLater: boolean) => void;
  onSnooze: (threadId: string) => void;
  onConvertToTodo: (thread: EmailThread, customTitle?: string) => void;
  onAddMeetingToCalendar: (thread: EmailThread) => void;
  onSummarizeThread: (threadId: string) => Promise<void>;
  isSummarizing: boolean;
  onSendReply: (thread: EmailThread, bodyText: string) => Promise<void>;
  onAiAssistReply: (
    action: WritingAssistAction,
    draftText: string,
    thread: EmailThread,
    targetLanguage?: string
  ) => Promise<string>;
  replyInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onBackToList?: () => void;
  replyFormHeight?: number;
  onChangeReplyFormHeight?: (height: number) => void;
  onResetReplyFormHeight?: () => void;
}

export const ThreadDetail: React.FC<ThreadDetailProps> = ({
  thread,
  onMarkDone,
  onReopenInbox,
  onToggleStar,
  onToggleReadLater,
  onSnooze,
  onConvertToTodo,
  onAddMeetingToCalendar,
  onSummarizeThread,
  isSummarizing,
  onSendReply,
  onAiAssistReply,
  replyInputRef,
  onBackToList,
  replyFormHeight,
  onChangeReplyFormHeight,
  onResetReplyFormHeight,
}) => {
  const [replyText, setReplyText] = useState('');
  const [isAssisting, setIsAssisting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [targetLang, setTargetLang] = useState('English');
  const [internalReplyHeight, setInternalReplyHeight] = useState(
    DEFAULT_PANE_SIZES.replyFormHeight
  );
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateHeight = () => {
      setContainerHeight(el.clientHeight);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [thread?.id]);

  const replyBounds = computeReplyFormBounds(containerHeight);
  const effectiveReplyHeight = clampPaneSize(
    replyFormHeight ?? internalReplyHeight,
    replyBounds.min,
    replyBounds.max
  );

  const handleReplyHeightChange = (nextHeight: number) => {
    if (onChangeReplyFormHeight) {
      onChangeReplyFormHeight(nextHeight);
    } else {
      setInternalReplyHeight(nextHeight);
    }
  };

  const handleResetReplyHeight = () => {
    if (onResetReplyFormHeight) {
      onResetReplyFormHeight();
    } else {
      setInternalReplyHeight(DEFAULT_PANE_SIZES.replyFormHeight);
    }
  };

  if (!thread) {
    return (
      <main className="flex-1 h-full hidden md:flex flex-col items-center justify-center bg-[#FAFAFB] dark:bg-[#0B0F17] px-8 text-center">
        <div className="max-w-sm">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Select a thread to read
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5">
            Use <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[11px]">j</kbd> /{' '}
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[11px]">k</kbd> to move,{' '}
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[11px]">e</kbd> to mark done, or{' '}
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-[11px]">/</kbd> to search across your index.
          </p>
        </div>
      </main>
    );
  }

  const handleAssist = async (action: WritingAssistAction) => {
    setIsAssisting(true);
    try {
      const result = await onAiAssistReply(action, replyText, thread, targetLang);
      setReplyText(result);
    } finally {
      setIsAssisting(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendReply(thread, replyText);
      setReplyText('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main
      ref={mainRef}
      className="flex-1 h-full flex flex-col bg-[#FAFAFB] dark:bg-[#0B0F17] min-w-0 overflow-hidden"
    >
      {/* Thread Action Toolbar */}
      <div className="px-4 md:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="md:hidden mb-1.5 text-[12px] font-medium text-sky-600 dark:text-sky-400 flex items-center gap-1 cursor-pointer"
            >
              ← Back to list
            </button>
          )}
          <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="font-medium text-sky-700 dark:text-sky-400">
              {thread.bundle}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {thread.messages.length}{' '}
              {thread.messages.length === 1 ? 'message' : 'messages'}
            </span>
            {thread.labels.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{thread.labels.join(', ')}</span>
              </>
            )}
          </div>
          <h1 className="font-display text-base md:text-lg font-semibold text-slate-900 dark:text-white truncate mt-0.5">
            {thread.subject}
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleStar(thread.id, !thread.isStarred)}
            aria-label={thread.isStarred ? 'Unstar thread' : 'Star thread'}
            className={`h-8 px-2.5 rounded-md border text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              thread.isStarred
                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Star
              className="w-3.5 h-3.5"
              fill={thread.isStarred ? 'currentColor' : 'none'}
            />
            <span className="hidden xl:inline">
              {thread.isStarred ? 'Starred' : 'Star'}
            </span>
          </button>

          {onToggleReadLater && (
            <button
              type="button"
              onClick={() => onToggleReadLater(thread.id, !thread.isReadLater)}
              aria-pressed={Boolean(thread.isReadLater)}
              aria-label={
                thread.isReadLater ? 'Remove from Read Later' : 'Save to Read Later'
              }
              title="Read Later (l)"
              className={`h-8 px-2.5 rounded-md border text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                thread.isReadLater
                  ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Bookmark
                className="w-3.5 h-3.5"
                fill={thread.isReadLater ? 'currentColor' : 'none'}
              />
              <span className="hidden lg:inline">
                {thread.isReadLater ? 'Saved' : 'Read Later'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onSnooze(thread.id)}
            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[12px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Snooze</span>
          </button>

          <button
            type="button"
            onClick={() => onConvertToTodo(thread)}
            className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[12px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>To-Do</span>
          </button>

          {thread.status === 'done' ? (
            <button
              type="button"
              onClick={() => onReopenInbox(thread.id)}
              className="h-8 px-3 rounded-md bg-slate-900 dark:bg-sky-500 text-white dark:text-slate-950 text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Move to Inbox</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onMarkDone(thread.id)}
              className="h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Thread Body + AI Brief */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {/* Shortwave-Style AI Summary & Action Items Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <h2 className="font-display text-[13px] font-semibold text-slate-900 dark:text-white">
                AI Thread Brief
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onSummarizeThread(thread.id)}
              disabled={isSummarizing}
              className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {isSummarizing
                ? 'Analyzing...'
                : thread.aiSummary
                  ? 'Refresh Brief'
                  : 'Summarize Thread'}
            </button>
          </div>

          {thread.aiSummary ? (
            <div className="mt-2.5 space-y-2.5">
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                {thread.aiSummary}
              </p>

              {thread.aiActionItems && thread.aiActionItems.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Extracted Action Items
                  </div>
                  {thread.aiActionItems.map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between gap-2 text-[12px] text-slate-700 dark:text-slate-300"
                    >
                      <span>• {item}</span>
                      <button
                        type="button"
                        onClick={() => onConvertToTodo(thread, item)}
                        className="text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        + Add To-Do
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {thread.detectedMeeting && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="text-[12px] text-slate-700 dark:text-slate-300">
                    <span className="font-medium text-slate-900 dark:text-white">
                      Detected Meeting:
                    </span>{' '}
                    {thread.detectedMeeting.title} ·{' '}
                    <span className="font-mono">
                      {new Date(thread.detectedMeeting.proposedTime).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    ({thread.detectedMeeting.durationMinutes}m)
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddMeetingToCalendar(thread)}
                    className="px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-sky-100 dark:hover:bg-sky-900/60 cursor-pointer"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Schedule</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
              Click Summarize Thread to generate a concise TL;DR, extract action items, and detect meeting times.
            </p>
          )}
        </div>

        {/* Messages */}
        <div className="space-y-3">
          {thread.messages.map((msg) => (
            <article
              key={msg.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-md text-xs font-semibold flex items-center justify-center shrink-0 ${getAvatarTone(
                      msg.fromEmail
                    )}`}
                    aria-hidden="true"
                  >
                    {getInitials(msg.fromName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                        {msg.fromName}
                      </span>
                      <span className="text-[12px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        &lt;{msg.fromEmail}&gt;
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      to {msg.to.join(', ')}
                    </div>
                  </div>
                </div>

                <time className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                  {formatCompactTimestamp(msg.date)}
                </time>
              </div>

              <div className="mt-3.5 text-[14px] leading-[1.65] text-slate-800 dark:text-slate-200 whitespace-pre-wrap max-w-[72ch]">
                {msg.bodyText}
              </div>

              {msg.attachments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
                  {msg.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2 text-[12px] text-slate-700 dark:text-slate-200"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium truncate max-w-[200px]">
                        {att.filename}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400">
                        {formatBytes(att.sizeBytes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {/* Draggable Border between Email Preview and Reply Form */}
      <SplitResizer
        orientation="horizontal"
        label="Resize reply form and email preview"
        testId="resizer-reply-form"
        value={effectiveReplyHeight}
        min={replyBounds.min}
        max={replyBounds.max}
        invertDelta
        onChangeValue={handleReplyHeightChange}
        onReset={handleResetReplyHeight}
      />

      {/* Inline Quick Reply + Shortwave AI Assistant Bar */}
      <form
        onSubmit={handleReplySubmit}
        style={{ height: `${effectiveReplyHeight}px`, minHeight: 'fit-content' }}
        className="shrink-0 flex flex-col gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleAssist('reply')}
              disabled={isAssisting}
              className="px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[12px] font-medium flex items-center gap-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/60 disabled:opacity-50 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI Draft Reply</span>
            </button>

            <button
              type="button"
              onClick={() => handleAssist('shorten')}
              disabled={isAssisting || !replyText.trim()}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              Shorten
            </button>

            <button
              type="button"
              onClick={() => handleAssist('proofread')}
              disabled={isAssisting || !replyText.trim()}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              Proofread
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAssist('translate')}
                disabled={isAssisting || !replyText.trim()}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5" />
                <span>Translate</span>
              </button>
              <select
                aria-label="Reply translation target language"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="h-7 px-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-200"
              >
                <option value="English">EN</option>
                <option value="German">DE</option>
                <option value="French">FR</option>
                <option value="Spanish">ES</option>
              </select>
            </div>
          </div>

          {isAssisting && (
            <span className="text-[12px] text-sky-600 dark:text-sky-400 font-medium">
              Drafting in your style...
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 flex items-stretch gap-2.5">
          <textarea
            ref={replyInputRef}
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            aria-label="Quick reply message"
            placeholder="Write a reply (press R to focus, or click AI Draft Reply)..."
            className="flex-1 h-full min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 resize-none"
          />
          <button
            type="submit"
            disabled={!replyText.trim() || isSending}
            className="self-end h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSending ? 'Sending...' : 'Reply'}</span>
          </button>
        </div>
      </form>
    </main>
  );
};
