import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  FolderInput,
  Layers,
  Upload,
  X,
} from 'lucide-react';
import type {
  MboxBundleAction,
  MboxCommitOptions,
  MboxCommitResponse,
  MboxInspectResponse,
  MboxLabelMappingRule,
} from '../types/mail.ts';
import {
  SAMPLE_TAKEOUT_FILENAME,
  SAMPLE_TAKEOUT_MBOX,
} from '../utils/sampleTakeoutMbox.ts';

interface MboxImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  onCommitted: (result: MboxCommitResponse) => void;
}

export const MboxImportModal: React.FC<MboxImportModalProps> = ({
  isOpen,
  onClose,
  accountId,
  onCommitted,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<'select' | 'map'>('select');
  const [folderOverride, setFolderOverride] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [inspection, setInspection] = useState<MboxInspectResponse | null>(null);
  const [mappings, setMappings] = useState<Record<string, MboxLabelMappingRule>>({});
  const [skipSpamTrash, setSkipSpamTrash] = useState(true);
  const [preserveStatus, setPreserveStatus] = useState(true);
  const [defaultBundle, setDefaultBundle] = useState('Updates');
  const [autoRunAiFilters, setAutoRunAiFilters] = useState(false);

  const existingBundles = useMemo(
    () =>
      inspection?.existingBundles ?? [
        'Priority',
        'Finance & Receipts',
        'DevOps',
        'Travel',
        'Updates',
        'Newsletters',
      ],
    [inspection]
  );

  if (!isOpen) return null;

  const resetModal = async () => {
    if (inspection?.importId) {
      fetch(`/api/import/mbox/${encodeURIComponent(inspection.importId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    setStep('select');
    setInspection(null);
    setMappings({});
    setFolderOverride('');
    setError('');
    setIsInspecting(false);
    setIsCommitting(false);
    onClose();
  };

  const applyInspectionResult = (data: MboxInspectResponse) => {
    const initialMap: Record<string, MboxLabelMappingRule> = {};
    for (const item of data.discoveredLabels) {
      initialMap[item.label] = {
        label: item.label,
        action: item.suggestedAction,
        targetBundle: item.suggestedBundle,
      };
    }
    setInspection(data);
    setMappings(initialMap);
    setStep('map');
  };

  const inspectFileList = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setError('');
    setIsInspecting(true);
    try {
      if (list.length === 1) {
        // Stream single .mbox directly as octet-stream so large multi-100MB Takeouts upload fast
        const file = list[0];
        const params = new URLSearchParams({
          filename: file.name,
          accountId,
        });
        if (folderOverride.trim()) {
          params.set('folderOverride', folderOverride.trim());
        }
        const res = await fetch(`/api/import/mbox/inspect?${params.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        });
        const data = (await res.json()) as MboxInspectResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to parse MBOX file.');
        }
        applyInspectionResult(data);
        return;
      }

      // Multiple folder .mbox files (e.g. Receipts.mbox + Travel.mbox)
      const serialized = await Promise.all(
        list.map(async (f) => ({
          filename: f.name,
          content: await f.text(),
          folderOverride: folderOverride.trim() || undefined,
        }))
      );
      const res = await fetch('/api/import/mbox/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, files: serialized }),
      });
      const data = (await res.json()) as MboxInspectResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse MBOX files.');
      }
      applyInspectionResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read MBOX file.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleLoadSample = async () => {
    setError('');
    setIsInspecting(true);
    try {
      const res = await fetch('/api/import/mbox/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          files: [
            {
              filename: SAMPLE_TAKEOUT_FILENAME,
              content: SAMPLE_TAKEOUT_MBOX,
              folderOverride: folderOverride.trim() || undefined,
            },
          ],
        }),
      });
      const data = (await res.json()) as MboxInspectResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse sample Takeout MBOX.');
      }
      applyInspectionResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample MBOX.');
    } finally {
      setIsInspecting(false);
    }
  };

  const updateMapping = (
    label: string,
    patch: Partial<MboxLabelMappingRule>
  ) => {
    setMappings((prev) => {
      const current = prev[label] || {
        label,
        action: 'create' as MboxBundleAction,
        targetBundle: label,
      };
      const nextAction = patch.action ?? current.action;
      let nextBundle = patch.targetBundle ?? current.targetBundle;

      if (patch.action && patch.targetBundle === undefined) {
        if (patch.action === 'merge') {
          const item = inspection?.discoveredLabels.find((d) => d.label === label);
          nextBundle =
            item?.suggestedAction === 'merge'
              ? item.suggestedBundle
              : existingBundles[0] || 'Updates';
        } else if (patch.action === 'create') {
          nextBundle = label.replace(/\//g, ' · ');
        }
      }

      return {
        ...prev,
        [label]: {
          label,
          action: nextAction,
          targetBundle: nextBundle,
        },
      };
    });
  };

  const handleBulkPreset = (preset: 'smart' | 'create-all' | 'merge-updates') => {
    if (!inspection) return;
    const next: Record<string, MboxLabelMappingRule> = {};
    for (const item of inspection.discoveredLabels) {
      if (preset === 'smart') {
        next[item.label] = {
          label: item.label,
          action: item.suggestedAction,
          targetBundle: item.suggestedBundle,
        };
      } else if (preset === 'create-all') {
        next[item.label] = {
          label: item.label,
          action: 'create',
          targetBundle: item.label.replace(/\//g, ' · '),
        };
      } else {
        next[item.label] = {
          label: item.label,
          action: 'merge',
          targetBundle: defaultBundle || 'Updates',
        };
      }
    }
    setMappings(next);
  };

  const handleCommit = async () => {
    if (!inspection) return;
    setError('');
    setIsCommitting(true);
    try {
      const payload: MboxCommitOptions = {
        importId: inspection.importId,
        mappings: Object.values(mappings),
        skipSpamTrash,
        preserveStatus,
        defaultBundle,
        autoRunAiFilters,
      };
      const res = await fetch('/api/import/mbox/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as MboxCommitResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import MBOX threads.');
      }
      onCommitted(data);
      setStep('select');
      setInspection(null);
      setMappings({});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed.');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import Google Takeout MBOX"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4"
    >
      <div className="w-full max-w-3xl max-h-[90vh] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileArchive className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
              Import Google Takeout (.mbox) & Map Labels to Bundles
            </h2>
          </div>
          <button
            type="button"
            onClick={resetModal}
            aria-label="Close MBOX import modal"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'select' ? (
            <div className="space-y-4">
              <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Upload one or more <code className="font-mono text-[12px]">.mbox</code> files exported from Google Takeout (e.g.,{' '}
                <code className="font-mono text-[12px]">All mail Including Spam and Trash.mbox</code> or individual label exports like{' '}
                <code className="font-mono text-[12px]">Receipts.mbox</code>). Tarsel Mail reads <code className="font-mono text-[12px]">X-Gmail-Labels</code>,{' '}
                <code className="font-mono text-[12px]">X-GM-THRID</code>, and folder names so you can merge emails into existing bundles or create new bundles.
              </p>

              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) {
                    inspectFileList(e.dataTransfer.files);
                  }
                }}
                className={`rounded-xl border-2 border-dashed p-7 text-center transition-colors ${
                  dragOver
                    ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50'
                }`}
              >
                <Upload className="w-7 h-7 mx-auto text-slate-400 dark:text-slate-500 mb-2.5" />
                <div className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                  {isInspecting
                    ? 'Parsing MBOX headers and Gmail labels...'
                    : 'Drop .mbox Takeout file(s) here'}
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                  Supports single archives or multiple folder-exported .mbox files
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mbox,.mbx,.txt"
                  multiple
                  aria-label="Choose MBOX file"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      inspectFileList(e.target.files);
                    }
                  }}
                  className="sr-only"
                />

                <div className="mt-4 flex items-center justify-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    disabled={isInspecting}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[13px] font-medium cursor-pointer disabled:opacity-50"
                  >
                    Select .mbox File(s)
                  </button>

                  <button
                    type="button"
                    disabled={isInspecting}
                    onClick={handleLoadSample}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[13px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                  >
                    Try Sample Google Takeout
                  </button>
                </div>
              </div>

              {/* Optional Folder Label Override */}
              <div>
                <label
                  htmlFor="mbox-folder-override"
                  className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Optional Folder / Label Override
                </label>
                <input
                  id="mbox-folder-override"
                  type="text"
                  value={folderOverride}
                  onChange={(e) => setFolderOverride(e.target.value)}
                  placeholder="Leave blank to auto-detect from filename & X-Gmail-Labels (e.g. Client Work)"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          ) : (
            inspection && (
              <div className="space-y-4">
                {/* Summary Strip */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {inspection.filename}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                      {inspection.totalMessages} messages · {inspection.threadCount} threads ·{' '}
                      {inspection.discoveredLabels.length} labels/folders
                      {inspection.skippedSpamTrash > 0
                        ? ` · ${inspection.skippedSpamTrash} spam/trash`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('select');
                      setError('');
                    }}
                    className="text-[12px] font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer shrink-0"
                  >
                    Choose different file
                  </button>
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-display text-[13px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span>Map Discovered Labels & Folders to Bundles</span>
                  </h3>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleBulkPreset('smart')}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Smart Auto-Map
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkPreset('create-all')}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      New Bundle per Label
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkPreset('merge-updates')}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Merge All to Default
                    </button>
                  </div>
                </div>

                {/* Label Mapping Table */}
                {inspection.discoveredLabels.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 text-[12px] text-slate-600 dark:text-slate-400">
                    No <code className="font-mono">X-Gmail-Labels</code> headers or folder name detected in this archive. All threads will be placed into the fallback bundle selected below.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                    {inspection.discoveredLabels.map((item) => {
                      const rule = mappings[item.label] || {
                        label: item.label,
                        action: item.suggestedAction,
                        targetBundle: item.suggestedBundle,
                      };

                      return (
                        <div
                          key={item.label}
                          className="p-3 bg-white dark:bg-[#111827] grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                        >
                          {/* Source Label/Folder */}
                          <div className="md:col-span-4 min-w-0">
                            <div className="flex items-center gap-2">
                              <FolderInput className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                                {item.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-mono tabular-nums">
                              {item.count} {item.count === 1 ? 'thread' : 'threads'} ·{' '}
                              {item.source === 'folder' ? 'Folder' : 'Gmail Label'}
                              {item.sampleSubjects[0] ? ` · "${item.sampleSubjects[0]}"` : ''}
                            </div>
                          </div>

                          {/* Action Selector */}
                          <div className="md:col-span-4">
                            <label className="sr-only" htmlFor={`action-${item.label}`}>
                              Action for {item.label}
                            </label>
                            <select
                              id={`action-${item.label}`}
                              value={rule.action}
                              onChange={(e) =>
                                updateMapping(item.label, {
                                  action: e.target.value as MboxBundleAction,
                                })
                              }
                              className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] text-slate-800 dark:text-slate-200"
                            >
                              <option value="merge">Merge into existing</option>
                              <option value="create">Create new bundle</option>
                              <option value="ignore">Tag only (no bundle)</option>
                            </select>
                          </div>

                          {/* Target Bundle */}
                          <div className="md:col-span-4 flex items-center gap-2">
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden md:block" />
                            {rule.action === 'merge' ? (
                              <select
                                aria-label={`Target existing bundle for ${item.label}`}
                                value={rule.targetBundle}
                                onChange={(e) =>
                                  updateMapping(item.label, {
                                    targetBundle: e.target.value,
                                  })
                                }
                                className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] text-slate-900 dark:text-slate-100"
                              >
                                {existingBundles.map((b) => (
                                  <option key={b} value={b}>
                                    {b}
                                  </option>
                                ))}
                              </select>
                            ) : rule.action === 'create' ? (
                              <input
                                type="text"
                                aria-label={`New bundle name for ${item.label}`}
                                value={rule.targetBundle}
                                onChange={(e) =>
                                  updateMapping(item.label, {
                                    targetBundle: e.target.value,
                                  })
                                }
                                placeholder="New bundle name"
                                className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] text-slate-900 dark:text-slate-100"
                              />
                            ) : (
                              <span className="text-[12px] text-slate-400 dark:text-slate-500">
                                Kept as label tag only
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Import Options */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipSpamTrash}
                        onChange={(e) => setSkipSpamTrash(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600 text-sky-600"
                      />
                      <span>Skip Spam & Trash messages</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preserveStatus}
                        onChange={(e) => setPreserveStatus(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600 text-sky-600"
                      />
                      <span>Preserve Inbox / Archived (Done) / Sent status</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRunAiFilters}
                        onChange={(e) => setAutoRunAiFilters(e.target.checked)}
                        className="rounded border-slate-300 dark:border-slate-600 text-sky-600"
                      />
                      <span>Run Plain-English AI Filters on imported mail</span>
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="mbox-fallback-bundle"
                      className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                    >
                      Fallback Bundle (for unlabelled emails)
                    </label>
                    <select
                      id="mbox-fallback-bundle"
                      value={defaultBundle}
                      onChange={(e) => setDefaultBundle(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] text-slate-900 dark:text-slate-100"
                    >
                      {existingBundles.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
          )}

          {error && (
            <div
              role="alert"
              className="p-2.5 rounded-lg text-[12px] flex items-center gap-2 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={resetModal}
            className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[13px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          {step === 'map' && inspection && (
            <button
              type="button"
              disabled={isCommitting}
              onClick={handleCommit}
              className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[13px] font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isCommitting
                  ? 'Importing into SQLite FTS5...'
                  : `Import ${inspection.threadCount} Threads`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
