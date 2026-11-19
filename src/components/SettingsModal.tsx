import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  Lock,
  RefreshCw,
  Server,
  X,
} from 'lucide-react';
import type {
  AIConfig,
  AIStatus,
  ImapAccountConfig,
} from '../types/mail.ts';
import {
  AI_PROVIDER_PRESETS,
  OLLAMA_ENDPOINT_PRESETS,
  formatProviderLabel,
  isLocalPrivateAiUrl,
} from '../utils/aiProviderConfig.ts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: ImapAccountConfig | null;
  aiConfig: AIConfig | null;
  aiStatus: AIStatus | null;
  onSaveAccount: (config: Partial<ImapAccountConfig>) => Promise<void>;
  onSaveAiConfig: (config: AIConfig) => Promise<void>;
  onTestAi: (config: AIConfig) => Promise<{
    ok: boolean;
    providerLabel: string;
    latencyMs: number;
    reply?: string;
    error?: string;
  }>;
  onListOllamaModels?: (baseUrl: string) => Promise<{
    ok: boolean;
    models: string[];
    error?: string;
  }>;
  onPullOllamaModel?: (
    baseUrl: string,
    model: string
  ) => Promise<{
    ok: boolean;
    status?: string;
    error?: string;
  }>;
  onTestImap: (config: {
    accountId: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPass: string;
  }) => Promise<{ ok: boolean; mailboxes?: string[]; error?: string }>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  account,
  aiConfig,
  aiStatus,
  onSaveAccount,
  onSaveAiConfig,
  onTestAi,
  onListOllamaModels,
  onPullOllamaModel,
  onTestImap,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'demo' | 'imap'>('demo');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUser, setImapUser] = useState('');
  const [imapPass, setImapPass] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [writingStyle, setWritingStyle] = useState('');

  // Local Ollama configuration only (zero external AI accounts or keys)
  const [aiBaseUrl, setAiBaseUrl] = useState(
    AI_PROVIDER_PRESETS.ollama.defaultBaseUrl
  );
  const [aiModel, setAiModel] = useState(
    AI_PROVIDER_PRESETS.ollama.defaultModel
  );

  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsNote, setOllamaModelsNote] = useState<string | null>(null);
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);
  const [isPullingModel, setIsPullingModel] = useState(false);

  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (account && isOpen) {
      setDisplayName(account.displayName);
      setEmail(account.email);
      setMode(account.mode);
      setImapHost(account.imapHost);
      setImapPort(account.imapPort);
      setImapSecure(account.imapSecure);
      setImapUser(account.imapUser);
      setImapPass(account.imapPass || '');
      setSmtpHost(account.smtpHost);
      setSmtpPort(account.smtpPort);
      setSmtpSecure(account.smtpSecure);
      setSmtpUser(account.smtpUser);
      setSmtpPass(account.smtpPass || '');
      setWritingStyle(account.writingStyle);
      setTestResult(null);
      setAiTestResult(null);
      setSaveError('');
    }
    if (aiConfig && isOpen) {
      setAiBaseUrl(aiConfig.baseUrl || AI_PROVIDER_PRESETS.ollama.defaultBaseUrl);
      setAiModel(aiConfig.model || AI_PROVIDER_PRESETS.ollama.defaultModel);
    }
  }, [account, aiConfig, isOpen]);

  const refreshOllamaModels = useCallback(
    async (baseUrl: string) => {
      if (!onListOllamaModels || !baseUrl.trim()) return;
      if (!isLocalPrivateAiUrl(baseUrl)) {
        setOllamaModels([]);
        setOllamaModelsNote(
          'External AI endpoints are blocked. Use a local container, localhost, or private LAN Ollama URL.'
        );
        return;
      }
      setIsLoadingOllamaModels(true);
      setOllamaModelsNote(null);
      try {
        const res = await onListOllamaModels(baseUrl);
        if (res.ok) {
          setOllamaModels(res.models);
          if (res.models.length === 0) {
            setOllamaModelsNote(
              'Local Ollama reachable — no models downloaded yet. Click "Pull Model" to download.'
            );
          }
        } else {
          setOllamaModels([]);
          setOllamaModelsNote(res.error || 'Local Ollama server unreachable.');
        }
      } finally {
        setIsLoadingOllamaModels(false);
      }
    },
    [onListOllamaModels]
  );

  useEffect(() => {
    if (isOpen) {
      void refreshOllamaModels(aiBaseUrl);
    }
  }, [isOpen, refreshOllamaModels]);

  if (!isOpen || !account) return null;

  const ollamaPreset = AI_PROVIDER_PRESETS.ollama;
  const isLocalUrlValid = isLocalPrivateAiUrl(aiBaseUrl);

  const handlePullOllamaModel = async () => {
    if (!onPullOllamaModel || !aiModel.trim()) return;
    if (!isLocalUrlValid) {
      setAiTestResult({
        ok: false,
        message: 'External AI endpoints are blocked. Use a local Ollama URL.',
      });
      return;
    }
    setIsPullingModel(true);
    setAiTestResult(null);
    try {
      const res = await onPullOllamaModel(aiBaseUrl, aiModel.trim());
      if (res.ok) {
        setAiTestResult({
          ok: true,
          message: `Downloaded "${aiModel.trim()}" into local Ollama storage.`,
        });
        await refreshOllamaModels(aiBaseUrl);
      } else {
        setAiTestResult({
          ok: false,
          message: res.error || `Failed to pull "${aiModel.trim()}".`,
        });
      }
    } finally {
      setIsPullingModel(false);
    }
  };

  const handleTestAi = async () => {
    if (!isLocalUrlValid) {
      setAiTestResult({
        ok: false,
        message:
          'External AI APIs are disabled. Only local container, localhost, or private LAN Ollama URLs are allowed.',
      });
      return;
    }
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await onTestAi({
        provider: 'ollama',
        baseUrl: aiBaseUrl,
        model: aiModel,
        apiKeyEnvVar: 'NONE',
      });
      if (res.ok) {
        setAiTestResult({
          ok: true,
          message: `Connected to ${res.providerLabel} (${res.latencyMs} ms)${
            res.reply ? ` · Reply: "${res.reply}"` : ''
          }`,
        });
      } else {
        setAiTestResult({
          ok: false,
          message: res.error || 'Local Ollama connection test failed.',
        });
      }
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestImap({
        accountId: account.id,
        imapHost,
        imapPort,
        imapSecure,
        imapUser,
        imapPass,
      });
      if (res.ok) {
        setTestResult({
          ok: true,
          message: `Connected. Found ${res.mailboxes?.length ?? 0} mailboxes (${(
            res.mailboxes ?? []
          )
            .slice(0, 4)
            .join(', ')}).`,
        });
      } else {
        setTestResult({ ok: false, message: res.error || 'Connection failed' });
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!isLocalUrlValid) {
      setSaveError(
        'External AI APIs are disabled. Enter a local container, localhost, or private LAN Ollama URL.'
      );
      return;
    }
    setIsSaving(true);
    try {
      await onSaveAiConfig({
        provider: 'ollama',
        baseUrl: aiBaseUrl,
        model: aiModel,
        apiKeyEnvVar: 'NONE',
      });
      await onSaveAccount({
        id: account.id,
        label: account.label,
        displayName,
        email,
        mode,
        imapHost,
        imapPort,
        imapSecure,
        imapUser,
        imapPass,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPass,
        writingStyle,
      });
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save configuration.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="IMAP and Self-Hosting Settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            IMAP / SMTP, Local Ollama AI & Docker Configuration
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Self-Hosting & Privacy Summary */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  SQLite FTS5 + Models
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  Persistent /data volume
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  All-in-One Container
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  Port 3000 · Built-in Ollama
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  {aiConfig
                    ? formatProviderLabel(aiConfig)
                    : 'Local Ollama (qwen2.5:3b)'}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {aiStatus?.localOnly
                    ? 'Local only · No external API'
                    : 'Local rule fallback active'}
                </div>
              </div>
            </div>
          </div>

          {/* Local Ollama AI Section (No External AI Accounts) */}
          <section
            aria-label="Local Ollama AI Configuration"
            className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-[13px] font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Built-In Local Ollama AI</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  All sorting, summaries, writing drafts, and semantic search stay 100% inside your local Docker container or private network. External AI accounts and cloud APIs are disabled.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestAi}
                disabled={isTestingAi}
                className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {isTestingAi ? 'Testing AI...' : 'Test Local AI'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ai-base-url"
                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  Local Ollama Base URL
                </label>
                <input
                  id="ai-base-url"
                  type="url"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder={ollamaPreset.defaultBaseUrl}
                  className={`w-full h-9 px-3 rounded-lg border bg-slate-50 dark:bg-slate-900 text-[12px] font-mono text-slate-900 dark:text-slate-100 ${
                    isLocalUrlValid
                      ? 'border-slate-200 dark:border-slate-700'
                      : 'border-rose-500 dark:border-rose-500'
                  }`}
                />
                {!isLocalUrlValid && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                    External cloud URLs are blocked. Use localhost, 127.0.0.1, or a private LAN host.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="ai-model-id"
                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  Local Model ID
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="ai-model-id"
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder={ollamaPreset.defaultModel}
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] font-mono text-slate-900 dark:text-slate-100"
                  />
                  {onPullOllamaModel && (
                    <button
                      type="button"
                      onClick={handlePullOllamaModel}
                      disabled={isPullingModel || !aiModel.trim() || !isLocalUrlValid}
                      title="Download this model inside the local Ollama container"
                      className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isPullingModel ? 'Pulling...' : 'Pull Model'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Local endpoints:
                  </span>
                  {OLLAMA_ENDPOINT_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => {
                        setAiBaseUrl(preset.url);
                        void refreshOllamaModels(preset.url);
                      }}
                      className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer ${
                        aiBaseUrl === preset.url
                          ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void refreshOllamaModels(aiBaseUrl)}
                  disabled={isLoadingOllamaModels}
                  className="text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isLoadingOllamaModels ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh Installed</span>
                </button>
              </div>

              {ollamaModels.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Installed locally:
                  </span>
                  {ollamaModels.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAiModel(m)}
                      className={`px-2 py-0.5 rounded border text-[11px] font-mono cursor-pointer ${
                        aiModel === m
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : ollamaModelsNote ? (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {ollamaModelsNote}
                </div>
              ) : null}
            </div>

            {/* Suggested Local Model Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Recommended local models:
              </span>
              {ollamaPreset.suggestedModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAiModel(m)}
                  className={`px-2 py-0.5 rounded border text-[11px] font-mono cursor-pointer ${
                    aiModel === m
                      ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {aiTestResult && (
              <div
                className={`p-2.5 rounded-lg text-[12px] flex items-center gap-2 ${
                  aiTestResult.ok
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {aiTestResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{aiTestResult.message}</span>
              </div>
            )}
          </section>

          {/* Mailbox Mode */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300">
              Mailbox Source
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('demo')}
                className={`px-3 py-1.5 rounded-md border text-[12px] font-medium cursor-pointer ${
                  mode === 'demo'
                    ? 'border-sky-600 bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Local Demo Mailbox
              </button>
              <button
                type="button"
                onClick={() => setMode('imap')}
                className={`px-3 py-1.5 rounded-md border text-[12px] font-medium cursor-pointer ${
                  mode === 'imap'
                    ? 'border-sky-600 bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Live IMAP / SMTP Server
              </button>
            </div>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Writing Style Profile */}
          <div>
            <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1">
              Personal Writing Style (Used by Local Ollama Draft & Reply Assistant)
            </label>
            <textarea
              rows={2}
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* IMAP Settings */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[13px] font-semibold text-slate-900 dark:text-white">
                Incoming IMAP Server
              </h3>
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {isTesting ? 'Testing...' : 'Test IMAP Connection'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  IMAP Host
                </label>
                <input
                  type="text"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={imapPort}
                  onChange={(e) => setImapPort(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  IMAP Username
                </label>
                <input
                  type="text"
                  value={imapUser}
                  onChange={(e) => setImapUser(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  IMAP Password / App Password
                </label>
                <input
                  type="password"
                  value={imapPass}
                  onChange={(e) => setImapPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-lg text-[12px] flex items-center gap-2 ${
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* SMTP Settings */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="font-display text-[13px] font-semibold text-slate-900 dark:text-white">
              Outgoing SMTP Server
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  SMTP Username
                </label>
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  SMTP Password
                </label>
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">
              {saveError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[13px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-9 px-4 rounded-lg bg-slate-900 dark:bg-sky-500 text-white dark:text-slate-950 text-[13px] font-medium cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
