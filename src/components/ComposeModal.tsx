import React, { useState } from 'react';
import {
  CheckCheck,
  Languages,
  Minimize2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { WritingAssistAction } from '../types/mail.ts';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: {
    to: string[];
    cc?: string[];
    subject: string;
    bodyText: string;
  }) => Promise<void>;
  onAiAssist: (payload: {
    action: WritingAssistAction;
    draftText: string;
    subject?: string;
    targetLanguage?: string;
    instruction?: string;
  }) => Promise<string>;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSend,
  onAiAssist,
}) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [targetLang, setTargetLang] = useState('German');
  const [isAssisting, setIsAssisting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const runAssist = async (action: WritingAssistAction) => {
    setIsAssisting(true);
    setError('');
    try {
      const next = await onAiAssist({
        action,
        draftText: bodyText,
        subject,
        targetLanguage: targetLang,
        instruction: aiPrompt || undefined,
      });
      setBodyText(next);
    } finally {
      setIsAssisting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      setError('Enter at least one recipient email address.');
      return;
    }
    if (!bodyText.trim()) {
      setError('Message body cannot be empty.');
      return;
    }
    setError('');
    setIsSending(true);
    try {
      await onSend({
        to: recipients,
        subject: subject.trim() || '(No Subject)',
        bodyText: bodyText.trim(),
      });
      setTo('');
      setSubject('');
      setBodyText('');
      setAiPrompt('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compose Email"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-4"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            New Message
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Recipients"
              placeholder="To: name@company.com (comma separated)"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          <div>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Subject"
              placeholder="Subject"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          {/* Shortwave AI Writing Assistant Toolbar */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                aria-label="AI writing instruction"
                placeholder="Ask AI to draft in your style (e.g. 'Confirm Thursday 2pm meeting and ask for agenda')..."
                className="flex-1 h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
              <button
                type="button"
                onClick={() => runAssist('draft')}
                disabled={isAssisting}
                className="h-8 px-2.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[12px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAssisting ? 'Writing...' : 'Draft'}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => runAssist('shorten')}
                disabled={isAssisting || !bodyText.trim()}
                className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <Minimize2 className="w-3 h-3" />
                <span>Shorten</span>
              </button>

              <button
                type="button"
                onClick={() => runAssist('proofread')}
                disabled={isAssisting || !bodyText.trim()}
                className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <CheckCheck className="w-3 h-3" />
                <span>Proofread</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => runAssist('translate')}
                  disabled={isAssisting || !bodyText.trim()}
                  className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <Languages className="w-3 h-3" />
                  <span>Translate</span>
                </button>
                <select
                  aria-label="Target language"
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="h-7 px-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-200"
                >
                  <option value="German">German</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Japanese">Japanese</option>
                </select>
              </div>
            </div>
          </div>

          <textarea
            rows={8}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            aria-label="Email body"
            placeholder="Write your message..."
            className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />

          {error && (
            <p role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[13px] font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : 'Send Email'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
