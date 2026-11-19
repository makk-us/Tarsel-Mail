import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AIFilterRule, FilterMatchResult } from '../types/mail.ts';

interface AiFiltersStudioProps {
  filters: AIFilterRule[];
  onSaveFilter: (filter: Partial<AIFilterRule>) => Promise<void>;
  onDeleteFilter: (id: string) => Promise<void>;
  onRunFilter: (
    id: string,
    dryRun: boolean
  ) => Promise<{
    results: FilterMatchResult[];
    usedLocalAi: boolean;
    providerUsed?: string;
  }>;
  onJumpToThread: (threadId: string) => void;
}

const FILTER_TEMPLATES = [
  {
    name: 'Cloud & DevOps Alerts',
    targetBundle: 'DevOps',
    prompt:
      'Label emails mentioning AWS, Docker, Hetzner, or GitHub Actions as Infrastructure and bundle into DevOps.',
  },
  {
    name: 'VIP Contract Deadlines',
    targetBundle: 'Priority',
    prompt:
      'Mark emails mentioning contracts, DPA, or deadlines as Important, star them, and create a To-Do item.',
  },
  {
    name: 'Digest & Newsletter Organizer',
    targetBundle: 'Newsletters',
    prompt:
      'Bundle newsletters, Substack issues, and weekly digests into Newsletters and label as Reading.',
  },
];

export const AiFiltersStudio: React.FC<AiFiltersStudioProps> = ({
  filters,
  onSaveFilter,
  onDeleteFilter,
  onRunFilter,
  onJumpToThread,
}) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetBundle, setTargetBundle] = useState('');
  const [autoApplyOnSync, setAutoApplyOnSync] = useState(true);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastRunReport, setLastRunReport] = useState<{
    filterName: string;
    dryRun: boolean;
    usedLocalAi: boolean;
    providerUsed?: string;
    results: FilterMatchResult[];
  } | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      setFormError('Please provide both a filter name and a plain-English script.');
      return;
    }
    setFormError('');
    setIsSaving(true);
    try {
      await onSaveFilter({
        name: name.trim(),
        prompt: prompt.trim(),
        targetBundle: targetBundle.trim() || null,
        enabled: true,
        autoApplyOnSync,
      });
      setName('');
      setPrompt('');
      setTargetBundle('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecute = async (filter: AIFilterRule, dryRun: boolean) => {
    setRunningId(filter.id);
    try {
      const outcome = await onRunFilter(filter.id, dryRun);
      setLastRunReport({
        filterName: filter.name,
        dryRun,
        usedLocalAi: outcome.usedLocalAi,
        providerUsed: outcome.providerUsed,
        results: outcome.results,
      });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <main className="flex-1 h-full overflow-y-auto bg-[#FAFAFB] dark:bg-[#0B0F17] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Plain-English AI Filters
            </h1>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Take control of your inbox with custom scripts written in plain English. Automatically assign Google Inbox-style bundles, apply labels, star high-priority mail, archive noise, or extract to-dos.
            </p>
          </div>
        </div>

        {/* Create New Filter Script Card */}
        <section
          aria-label="Create AI Filter Script"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Write a New AI Filter Script</span>
            </h2>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                Templates:
              </span>
              {FILTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    setName(tpl.name);
                    setPrompt(tpl.prompt);
                    setTargetBundle(tpl.targetBundle);
                    setFormError('');
                  }}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="filter-name"
                  className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Filter Name
                </label>
                <input
                  id="filter-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., High-Value Cloud Invoices"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>

              <div>
                <label
                  htmlFor="filter-bundle"
                  className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Target Bundle (Optional)
                </label>
                <input
                  id="filter-bundle"
                  type="text"
                  value={targetBundle}
                  onChange={(e) => setTargetBundle(e.target.value)}
                  placeholder="e.g., Finance & Receipts"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="filter-prompt"
                className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Plain-English Instructions
              </label>
              <textarea
                id="filter-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what to match and what to do — e.g. 'Automatically label invoices and receipts as Finance, star anything over $500, and bundle into Finance & Receipts.'"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            {formError && (
              <p role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoApplyOnSync}
                  onChange={(e) => setAutoApplyOnSync(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500"
                />
                <span>Auto-apply automatically on new IMAP sync</span>
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save AI Filter'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Execution Output Report */}
        {lastRunReport && (
          <section
            aria-label="Filter Execution Results"
            className="rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/50 dark:bg-sky-950/20 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="font-display text-[13px] font-semibold text-slate-900 dark:text-white">
                  {lastRunReport.dryRun ? 'Preview' : 'Applied'}: {lastRunReport.filterName}
                </h3>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {lastRunReport.results.length} matched ·{' '}
                  {lastRunReport.providerUsed ||
                    (lastRunReport.usedLocalAi ? 'Local Ollama' : 'Local Rule Engine')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLastRunReport(null)}
                className="text-[12px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>

            {lastRunReport.results.length === 0 ? (
              <p className="text-[12px] text-slate-600 dark:text-slate-400">
                No inbox threads matched this instruction.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
                {lastRunReport.results.map((r) => (
                  <div
                    key={r.threadId}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onJumpToThread(r.threadId)}
                        className="text-[13px] font-medium text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 truncate block text-left cursor-pointer"
                      >
                        {r.subject}
                      </button>
                      <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {r.from} · {r.reason}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 shrink-0 text-right">
                      {[
                        r.actionsApplied.bundle
                          ? `Bundle:${r.actionsApplied.bundle}`
                          : null,
                        r.actionsApplied.addLabels?.length
                          ? `+${r.actionsApplied.addLabels.join(',')}`
                          : null,
                        r.actionsApplied.star ? 'Starred' : null,
                        r.actionsApplied.archive ? 'Archived' : null,
                        r.actionsApplied.createTodoTitle ? '+To-Do' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Active Filters List */}
        <section aria-label="Configured AI Filters" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Active Filter Scripts ({filters.length})
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            {filters.map((filter) => (
              <div
                key={filter.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-display text-[14px] font-semibold text-slate-900 dark:text-white">
                      {filter.name}
                    </span>
                    {filter.targetBundle && (
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        Bundle: {filter.targetBundle}
                      </span>
                    )}
                    <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      {filter.matchCount} matched
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    “{filter.prompt}”
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onSaveFilter({ ...filter, enabled: !filter.enabled })
                    }
                    className={`h-8 px-2.5 rounded-md border text-[12px] font-medium cursor-pointer ${
                      filter.enabled
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {filter.enabled ? 'Enabled' : 'Paused'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExecute(filter, true)}
                    disabled={runningId === filter.id}
                    className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[12px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExecute(filter, false)}
                    disabled={runningId === filter.id}
                    className="h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[12px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{runningId === filter.id ? 'Running...' : 'Apply'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteFilter(filter.id)}
                    aria-label={`Delete filter ${filter.name}`}
                    className="h-8 w-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};
