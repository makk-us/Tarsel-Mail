import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiFiltersStudio } from './components/AiFiltersStudio.tsx';
import { CommandPalette, type PaletteAction } from './components/CommandPalette.tsx';
import { ComposeModal } from './components/ComposeModal.tsx';
import { MboxImportModal } from './components/MboxImportModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ShortcutsModal } from './components/ShortcutsModal.tsx';
import { SidebarNav } from './components/SidebarNav.tsx';
import { SplitResizer } from './components/SplitResizer.tsx';
import { ThreadDetail } from './components/ThreadDetail.tsx';
import { ThreadList } from './components/ThreadList.tsx';
import { TodoAndScheduleView } from './components/TodoAndScheduleView.tsx';
import { TopBar } from './components/TopBar.tsx';
import type {
  AIConfig,
  AIFilterRule,
  AIStatus,
  AppSection,
  BootstrapPayload,
  CalendarEvent,
  EmailThread,
  FilterMatchResult,
  ImapAccountConfig,
  SplitViewTab,
  TodoItem,
  WritingAssistAction,
} from './types/mail.ts';
import { groupThreadsIntoBundles } from './utils/aiRuleEngine.ts';
import {
  DEFAULT_PANE_SIZES,
  PANE_BOUNDS,
  loadPaneSizes,
  savePaneSizes,
  type PaneSizes,
} from './utils/paneLayout.ts';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ImapAccountConfig[]>([]);
  const [activeAccountId, setActiveAccountId] = useState('acc-primary');
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [filters, setFilters] = useState<AIFilterRule[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);

  const [activeSection, setActiveSection] = useState<AppSection>('mail');
  const [activeTab, setActiveTab] = useState<SplitViewTab>('inbox');
  const [bundleViewMode, setBundleViewMode] = useState<'bundled' | 'flat'>('bundled');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'fts' | 'ai'>('fts');
  const [searchResults, setSearchResults] = useState<EmailThread[] | null>(null);
  const [searchMeta, setSearchMeta] = useState<{
    latencyMs?: number;
    explanation?: string;
    count?: number;
  } | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved =
        localStorage.getItem('tarsel_dark_mode') ??
        localStorage.getItem('kestrel_dark_mode');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mboxImportOpen, setMboxImportOpen] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRunningFilters, setIsRunningFilters] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(() => loadPaneSizes());

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Sync dark mode class on <html> and persist preference
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('tarsel_dark_mode', String(darkMode));
    } catch {
      // ignore storage quota errors
    }
  }, [darkMode]);

  useEffect(() => {
    savePaneSizes(paneSizes);
  }, [paneSizes]);

  // Bootstrap initial state
  useEffect(() => {
    fetch('/api/bootstrap')
      .then((res) => res.json())
      .then((data: BootstrapPayload) => {
        setAccounts(data.accounts);
        setActiveAccountId(data.activeAccountId);
        setThreads(data.threads);
        setFilters(data.filters);
        setTodos(data.todos);
        setCalendarEvents(data.calendarEvents);
        setAiConfig(data.aiConfig);
        setAiStatus(data.aiStatus);
        const firstInbox = data.threads.find((t) => t.status === 'inbox');
        if (firstInbox) setSelectedThreadId(firstInbox.id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Live debounced FTS5 / AI search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchMeta(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}&mode=${searchMode}`
      );
      const data = (await res.json()) as {
        threads: EmailThread[];
        latencyMs?: number;
        explanation?: string;
      };
      setSearchResults(data.threads);
      setSearchMeta({
        latencyMs: data.latencyMs,
        explanation: data.explanation,
        count: data.threads.length,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [searchQuery, searchMode]);

  const activeAccount =
    accounts.find((a) => a.id === activeAccountId) || accounts[0] || null;

  const visibleThreads = useMemo(() => {
    if (searchResults !== null) return searchResults;

    switch (activeTab) {
      case 'inbox':
      case 'bundles':
        return threads.filter((t) => t.status === 'inbox');
      case 'important':
        return threads.filter(
          (t) => t.status === 'inbox' && (t.isImportant || t.isStarred)
        );
      case 'readLater':
        return threads.filter((t) => Boolean(t.isReadLater));
      case 'snoozed':
        return threads.filter((t) => t.status === 'snoozed');
      case 'done':
        return threads.filter((t) => t.status === 'done');
      case 'sent':
        return threads.filter(
          (t) => t.status === 'sent' || t.messages.some((m) => m.isFromMe)
        );
      default:
        return threads;
    }
  }, [threads, activeTab, searchResults]);

  // Flat navigation order matching Bundle grouping when enabled
  const orderedNavThreads = useMemo(() => {
    const isBundled =
      searchResults === null &&
      (activeTab === 'bundles' ||
        (activeTab === 'inbox' && bundleViewMode === 'bundled'));
    if (!isBundled) return visibleThreads;
    return groupThreadsIntoBundles(visibleThreads).flatMap((g) => g.threads);
  }, [visibleThreads, activeTab, bundleViewMode, searchResults]);

  useEffect(() => {
    if (loading || activeSection !== 'mail' || activeTab === 'todo') return;
    if (orderedNavThreads.length === 0) {
      if (selectedThreadId !== null) setSelectedThreadId(null);
      return;
    }
    const stillVisible =
      selectedThreadId !== null &&
      orderedNavThreads.some((t) => t.id === selectedThreadId);
    if (!stillVisible) {
      setSelectedThreadId(orderedNavThreads[0].id);
      setFocusedIndex(0);
    }
  }, [loading, activeSection, activeTab, orderedNavThreads, selectedThreadId]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const counts = useMemo(
    () => ({
      inbox: threads.filter((t) => t.status === 'inbox' && t.isUnread).length,
      important: threads.filter(
        (t) => t.status === 'inbox' && (t.isImportant || t.isStarred)
      ).length,
      bundles: groupThreadsIntoBundles(
        threads.filter((t) => t.status === 'inbox')
      ).length,
      todo: todos.filter((t) => !t.completed).length,
      readLater: threads.filter((t) => Boolean(t.isReadLater)).length,
      snoozed: threads.filter((t) => t.status === 'snoozed').length,
      done: threads.filter((t) => t.status === 'done').length,
      sent: threads.filter(
        (t) => t.status === 'sent' || t.messages.some((m) => m.isFromMe)
      ).length,
      filters: filters.filter((f) => f.enabled).length,
    }),
    [threads, todos, filters]
  );

  // Thread Mutations
  const patchThread = useCallback(
    async (threadId: string, patch: Record<string, unknown>) => {
      const res = await fetch(`/api/threads/${threadId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { thread?: EmailThread };
      if (data.thread) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? data.thread! : t))
        );
        setSearchResults((prev) =>
          prev ? prev.map((t) => (t.id === threadId ? data.thread! : t)) : null
        );
      }
    },
    []
  );

  const handleSelectThread = useCallback(
    (thread: EmailThread, index: number) => {
      setSelectedThreadId(thread.id);
      setFocusedIndex(index);
      setMobileShowDetail(true);
      if (thread.isUnread) {
        patchThread(thread.id, { isUnread: false });
      }
    },
    [patchThread]
  );

  const handleMarkDone = useCallback(
    async (threadId: string) => {
      await patchThread(threadId, { status: 'done', isUnread: false });
      showToast('Marked Done');
      if (selectedThreadId === threadId) {
        const remaining = orderedNavThreads.filter((t) => t.id !== threadId);
        setSelectedThreadId(remaining[0]?.id ?? null);
      }
    },
    [patchThread, selectedThreadId, orderedNavThreads, showToast]
  );

  const handleSnooze = useCallback(
    async (threadId: string) => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await patchThread(threadId, {
        status: 'snoozed',
        snoozedUntil: tomorrow,
      });
      showToast('Snoozed until tomorrow');
      if (selectedThreadId === threadId && activeTab !== 'snoozed') {
        const remaining = orderedNavThreads.filter((t) => t.id !== threadId);
        setSelectedThreadId(remaining[0]?.id ?? null);
      }
    },
    [patchThread, showToast, selectedThreadId, activeTab, orderedNavThreads]
  );

  const handleToggleReadLater = useCallback(
    async (threadId: string, nextReadLater?: boolean) => {
      const target = threads.find((t) => t.id === threadId);
      const desired =
        typeof nextReadLater === 'boolean' ? nextReadLater : !target?.isReadLater;
      await patchThread(threadId, { isReadLater: desired });
      showToast(desired ? 'Saved to Read Later' : 'Removed from Read Later');
      if (activeTab === 'readLater' && !desired && selectedThreadId === threadId) {
        const remaining = orderedNavThreads.filter((t) => t.id !== threadId);
        setSelectedThreadId(remaining[0]?.id ?? null);
      }
    },
    [threads, patchThread, showToast, activeTab, selectedThreadId, orderedNavThreads]
  );

  const handleConvertToTodo = useCallback(
    async (thread: EmailThread, customTitle?: string) => {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle || `Follow up: ${thread.subject}`,
          threadId: thread.id,
          threadSubject: thread.subject,
          priority: thread.isImportant ? 'high' : 'normal',
        }),
      });
      const data = (await res.json()) as { todos: TodoItem[] };
      setTodos(data.todos);
      showToast('Added to To-Do list');
    },
    [showToast]
  );

  const handleSweepBundle = useCallback(
    async (bundleName: string) => {
      const res = await fetch(
        `/api/bundles/${encodeURIComponent(bundleName)}/done`,
        { method: 'POST' }
      );
      const data = (await res.json()) as {
        updatedCount: number;
        threads: EmailThread[];
      };
      setThreads(data.threads);
      showToast(`Swept ${data.updatedCount} threads in ${bundleName}`);
    },
    [showToast]
  );

  const handleRunAllFilters = useCallback(async () => {
    setIsRunningFilters(true);
    try {
      const enabled = filters.filter((f) => f.enabled);
      let latestThreads = threads;
      let latestFilters = filters;
      let latestTodos = todos;
      let totalMatches = 0;

      for (const f of enabled) {
        const res = await fetch(`/api/filters/${f.id}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun: false }),
        });
        const data = (await res.json()) as {
          results: FilterMatchResult[];
          threads: EmailThread[];
          filters: AIFilterRule[];
          todos: TodoItem[];
        };
        totalMatches += data.results.length;
        latestThreads = data.threads;
        latestFilters = data.filters;
        latestTodos = data.todos;
      }

      setThreads(latestThreads);
      setFilters(latestFilters);
      setTodos(latestTodos);
      showToast(`AI Filters applied (${totalMatches} matches)`);
    } finally {
      setIsRunningFilters(false);
    }
  }, [filters, threads, todos, showToast]);

  const handleSyncImap = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/accounts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: activeAccountId }),
      });
      const data = (await res.json()) as {
        syncedCount: number;
        mode: string;
        error?: string;
        threads: EmailThread[];
        accounts: ImapAccountConfig[];
      };
      setThreads(data.threads);
      setAccounts(data.accounts);
      if (data.error) {
        showToast(`Sync issue: ${data.error}`);
      } else {
        showToast(
          data.mode === 'imap'
            ? `Synced ${data.syncedCount} IMAP messages`
            : 'Local mailbox synced'
        );
      }
    } finally {
      setIsSyncing(false);
    }
  }, [activeAccountId, showToast]);

  // Global Superhuman-style Keyboard-First Navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (e.key === 'Escape') {
        setComposeOpen(false);
        setPaletteOpen(false);
        setShortcutsOpen(false);
        setSettingsOpen(false);
        setMboxImportOpen(false);
        setMobileMenuOpen(false);
        return;
      }

      if (
        isTyping ||
        composeOpen ||
        paletteOpen ||
        shortcutsOpen ||
        settingsOpen ||
        mboxImportOpen
      ) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setComposeOpen(true);
        return;
      }

      if (activeSection === 'mail' && activeTab !== 'todo') {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = Math.min(orderedNavThreads.length - 1, focusedIndex + 1);
          const nextThread = orderedNavThreads[nextIdx];
          if (nextThread) handleSelectThread(nextThread, nextIdx);
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIdx = Math.max(0, focusedIndex - 1);
          const prevThread = orderedNavThreads[prevIdx];
          if (prevThread) handleSelectThread(prevThread, prevIdx);
        } else if (
          (e.key === 'Enter' || e.key.toLowerCase() === 'o') &&
          orderedNavThreads[focusedIndex]
        ) {
          e.preventDefault();
          handleSelectThread(orderedNavThreads[focusedIndex], focusedIndex);
        } else if (e.key.toLowerCase() === 'e' && selectedThread) {
          e.preventDefault();
          handleMarkDone(selectedThread.id);
        } else if (e.key.toLowerCase() === 's' && selectedThread) {
          e.preventDefault();
          patchThread(selectedThread.id, { isStarred: !selectedThread.isStarred });
        } else if (e.key.toLowerCase() === 'l' && selectedThread) {
          e.preventDefault();
          handleToggleReadLater(selectedThread.id);
        } else if (e.key.toLowerCase() === 'h' && selectedThread) {
          e.preventDefault();
          handleSnooze(selectedThread.id);
        } else if (e.key.toLowerCase() === 't' && selectedThread) {
          e.preventDefault();
          handleConvertToTodo(selectedThread);
        } else if (e.key.toLowerCase() === 'r' && selectedThread) {
          e.preventDefault();
          replyInputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSection,
    activeTab,
    composeOpen,
    paletteOpen,
    shortcutsOpen,
    settingsOpen,
    mboxImportOpen,
    orderedNavThreads,
    focusedIndex,
    selectedThread,
    handleSelectThread,
    handleMarkDone,
    handleToggleReadLater,
    handleSnooze,
    handleConvertToTodo,
    patchThread,
  ]);

  const paletteActions: PaletteAction[] = [
    {
      id: 'compose',
      label: 'Compose New Email',
      category: 'Actions',
      shortcut: 'C',
      run: () => setComposeOpen(true),
    },
    {
      id: 'read-later-toggle',
      label: selectedThread?.isReadLater
        ? 'Read Later: Remove Selected Thread'
        : 'Save to Read Later',
      category: 'Actions',
      shortcut: 'L',
      run: () => {
        if (selectedThread) {
          void handleToggleReadLater(selectedThread.id);
        } else {
          showToast('Select a thread first');
        }
      },
    },
    {
      id: 'run-filters',
      label: 'Run All Plain-English AI Filters',
      category: 'AI',
      run: () => handleRunAllFilters(),
    },
    {
      id: 'go-inbox',
      label: 'Go to Inbox (Bundled)',
      category: 'Navigation',
      run: () => {
        setActiveSection('mail');
        setActiveTab('inbox');
      },
    },
    {
      id: 'go-read-later',
      label: 'Open Read Later List',
      category: 'Navigation',
      run: () => {
        setActiveSection('mail');
        setActiveTab('readLater');
      },
    },
    {
      id: 'go-filters',
      label: 'Open AI Filters Studio',
      category: 'Navigation',
      run: () => setActiveSection('filters'),
    },
    {
      id: 'go-todo',
      label: 'Open Email To-Do List',
      category: 'Navigation',
      run: () => {
        setActiveSection('mail');
        setActiveTab('todo');
      },
    },
    {
      id: 'go-calendar',
      label: 'Open Integrated Schedule',
      category: 'Navigation',
      run: () => setActiveSection('calendar'),
    },
    {
      id: 'toggle-theme',
      label: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      category: 'Appearance',
      run: () => setDarkMode((d) => !d),
    },
    {
      id: 'import-mbox',
      label: 'Import Google Takeout (.mbox) & Map Bundles',
      category: 'Actions',
      run: () => setMboxImportOpen(true),
    },
    {
      id: 'open-settings',
      label: 'Configure IMAP / SMTP & Docker Settings',
      category: 'Settings',
      run: () => setSettingsOpen(true),
    },
  ];

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-600 dark:text-slate-300 text-sm">
        Loading Tarsel Mail index...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <SidebarNav
          activeSection={activeSection}
          activeTab={activeTab}
          onSelectMailTab={(tab) => setActiveTab(tab)}
          onSelectSection={(sec) => setActiveSection(sec)}
          onOpenCompose={() => setComposeOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenMboxImport={() => setMboxImportOpen(true)}
          counts={counts}
          account={activeAccount}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          width={paneSizes.sidebarWidth}
        />
        <SplitResizer
          orientation="vertical"
          label="Resize navigation sidebar"
          testId="resizer-sidebar"
          value={paneSizes.sidebarWidth}
          min={PANE_BOUNDS.sidebar.min}
          max={PANE_BOUNDS.sidebar.max}
          onChangeValue={(sidebarWidth) =>
            setPaneSizes((prev) => ({ ...prev, sidebarWidth }))
          }
          onReset={() =>
            setPaneSizes((prev) => ({
              ...prev,
              sidebarWidth: DEFAULT_PANE_SIZES.sidebarWidth,
            }))
          }
        />
      </div>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden bg-slate-950/50 flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            <SidebarNav
              activeSection={activeSection}
              activeTab={activeTab}
              onSelectMailTab={(tab) => {
                setActiveTab(tab);
                setMobileMenuOpen(false);
              }}
              onSelectSection={(sec) => {
                setActiveSection(sec);
                setMobileMenuOpen(false);
              }}
              onOpenCompose={() => {
                setMobileMenuOpen(false);
                setComposeOpen(true);
              }}
              onOpenSettings={() => {
                setMobileMenuOpen(false);
                setSettingsOpen(true);
              }}
              onOpenMboxImport={() => {
                setMobileMenuOpen(false);
                setMboxImportOpen(true);
              }}
              counts={counts}
              account={activeAccount}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
            />
          </div>
        </div>
      )}

      {/* Right Main Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (activeSection !== 'mail') setActiveSection('mail');
          }}
          searchMode={searchMode}
          onToggleSearchMode={() =>
            setSearchMode((m) => (m === 'fts' ? 'ai' : 'fts'))
          }
          searchMeta={searchMeta}
          searchInputRef={searchInputRef}
          onSyncImap={handleSyncImap}
          isSyncing={isSyncing}
          onRunAllFilters={handleRunAllFilters}
          isRunningFilters={isRunningFilters}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Main Workspace Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {activeSection === 'filters' ? (
            <AiFiltersStudio
              filters={filters}
              onSaveFilter={async (filter) => {
                const res = await fetch('/api/filters', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(filter),
                });
                const data = (await res.json()) as { filter: AIFilterRule };
                setFilters((prev) => {
                  const exists = prev.some((f) => f.id === data.filter.id);
                  return exists
                    ? prev.map((f) => (f.id === data.filter.id ? data.filter : f))
                    : [data.filter, ...prev];
                });
                showToast(`Saved filter "${data.filter.name}"`);
              }}
              onDeleteFilter={async (id) => {
                await fetch(`/api/filters/${id}`, { method: 'DELETE' });
                setFilters((prev) => prev.filter((f) => f.id !== id));
                showToast('Filter removed');
              }}
              onRunFilter={async (id, dryRun) => {
                const res = await fetch(`/api/filters/${id}/run`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dryRun }),
                });
                const data = (await res.json()) as {
                  results: FilterMatchResult[];
                  usedLocalAi: boolean;
                  providerUsed?: string;
                  threads: EmailThread[];
                  filters: AIFilterRule[];
                  todos: TodoItem[];
                };
                if (!dryRun) {
                  setThreads(data.threads);
                  setFilters(data.filters);
                  setTodos(data.todos);
                }
                return {
                  results: data.results,
                  usedLocalAi: data.usedLocalAi,
                  providerUsed: data.providerUsed,
                };
              }}
              onJumpToThread={(threadId) => {
                setActiveSection('mail');
                setActiveTab('inbox');
                setSelectedThreadId(threadId);
              }}
            />
          ) : activeSection === 'calendar' ||
            (activeSection === 'mail' && activeTab === 'todo') ? (
            <TodoAndScheduleView
              mode={activeSection === 'calendar' ? 'calendar' : 'todo'}
              todos={todos}
              calendarEvents={calendarEvents}
              onAddTodo={async (title, priority, dueDate) => {
                const res = await fetch('/api/todos', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, priority, dueDate }),
                });
                const data = (await res.json()) as { todos: TodoItem[] };
                setTodos(data.todos);
              }}
              onToggleTodo={async (todo) => {
                const res = await fetch('/api/todos', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...todo, completed: !todo.completed }),
                });
                const data = (await res.json()) as { todos: TodoItem[] };
                setTodos(data.todos);
              }}
              onDeleteTodo={async (id) => {
                const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
                const data = (await res.json()) as { todos: TodoItem[] };
                setTodos(data.todos);
              }}
              onAddEvent={async (evt) => {
                const res = await fetch('/api/calendar', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(evt),
                });
                const data = (await res.json()) as {
                  calendarEvents: CalendarEvent[];
                };
                setCalendarEvents(data.calendarEvents);
                showToast('Added event to schedule');
              }}
              onJumpToThread={(threadId) => {
                setActiveSection('mail');
                setActiveTab('inbox');
                setSelectedThreadId(threadId);
              }}
            />
          ) : (
            <>
              <div
                className={`${
                  mobileShowDetail ? 'hidden md:flex' : 'flex'
                } h-full w-full md:w-auto shrink-0`}
              >
                <ThreadList
                  threads={visibleThreads}
                  activeTab={activeTab}
                  onSelectTab={(tab) => {
                    setActiveTab(tab);
                    setMobileShowDetail(false);
                  }}
                  selectedThreadId={selectedThreadId}
                  focusedIndex={focusedIndex}
                  onSelectThread={handleSelectThread}
                  onMarkDone={handleMarkDone}
                  onToggleStar={(id, nextStarred) =>
                    patchThread(id, { isStarred: nextStarred })
                  }
                  onToggleReadLater={handleToggleReadLater}
                  onSnooze={handleSnooze}
                  onConvertToTodo={handleConvertToTodo}
                  onSweepBundle={handleSweepBundle}
                  bundleViewMode={bundleViewMode}
                  onToggleBundleViewMode={(mode) => setBundleViewMode(mode)}
                  isSearchActive={searchResults !== null}
                  width={paneSizes.threadListWidth}
                />
              </div>

              <SplitResizer
                orientation="vertical"
                label="Resize thread list and email preview"
                testId="resizer-thread-list"
                className="hidden md:flex"
                value={paneSizes.threadListWidth}
                min={PANE_BOUNDS.threadList.min}
                max={PANE_BOUNDS.threadList.max}
                onChangeValue={(threadListWidth) =>
                  setPaneSizes((prev) => ({ ...prev, threadListWidth }))
                }
                onReset={() =>
                  setPaneSizes((prev) => ({
                    ...prev,
                    threadListWidth: DEFAULT_PANE_SIZES.threadListWidth,
                  }))
                }
              />

              <div
                className={`${
                  mobileShowDetail ? 'flex' : 'hidden md:flex'
                } flex-1 min-w-0 h-full`}
              >
                <ThreadDetail
                  thread={selectedThread}
                  onBackToList={() => setMobileShowDetail(false)}
                  replyFormHeight={paneSizes.replyFormHeight}
                  onChangeReplyFormHeight={(replyFormHeight) =>
                    setPaneSizes((prev) => ({ ...prev, replyFormHeight }))
                  }
                  onResetReplyFormHeight={() =>
                    setPaneSizes((prev) => ({
                      ...prev,
                      replyFormHeight: DEFAULT_PANE_SIZES.replyFormHeight,
                    }))
                  }
                  onMarkDone={handleMarkDone}
                  onReopenInbox={(id) => patchThread(id, { status: 'inbox' })}
                  onToggleStar={(id, nextStarred) =>
                    patchThread(id, { isStarred: nextStarred })
                  }
                  onToggleReadLater={handleToggleReadLater}
                  onSnooze={handleSnooze}
                  onConvertToTodo={handleConvertToTodo}
                  onAddMeetingToCalendar={async (thread) => {
                    if (!thread.detectedMeeting) return;
                    const start = thread.detectedMeeting.proposedTime;
                    const end = new Date(
                      new Date(start).getTime() +
                        thread.detectedMeeting.durationMinutes * 60000
                    ).toISOString();
                    const res = await fetch('/api/calendar', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: thread.detectedMeeting.title,
                        startTime: start,
                        endTime: end,
                        attendees: thread.participants.map((p) => p.email),
                        location: 'Video Call',
                        sourceThreadId: thread.id,
                      }),
                    });
                    const data = (await res.json()) as {
                      calendarEvents: CalendarEvent[];
                    };
                    setCalendarEvents(data.calendarEvents);
                    showToast('Meeting added to Schedule');
                  }}
                  onSummarizeThread={async (threadId) => {
                    setIsSummarizing(true);
                    try {
                      const res = await fetch('/api/ai/summarize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ threadId }),
                      });
                      const data = (await res.json()) as { thread?: EmailThread };
                      if (data.thread) {
                        setThreads((prev) =>
                          prev.map((t) => (t.id === threadId ? data.thread! : t))
                        );
                      }
                    } finally {
                      setIsSummarizing(false);
                    }
                  }}
                  isSummarizing={isSummarizing}
                  onSendReply={async (thread, bodyText) => {
                    const recipient =
                      thread.participants.find(
                        (p) => p.email !== activeAccount?.email
                      )?.email || thread.participants[0]?.email;
                    const res = await fetch('/api/send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        accountId: activeAccountId,
                        threadId: thread.id,
                        to: recipient ? [recipient] : [],
                        subject: thread.subject.startsWith('Re:')
                          ? thread.subject
                          : `Re: ${thread.subject}`,
                        bodyText,
                      }),
                    });
                    const data = (await res.json()) as {
                      threads: EmailThread[];
                      deliveredVia: string;
                    };
                    setThreads(data.threads);
                    showToast(`Reply sent (${data.deliveredVia})`);
                  }}
                  onAiAssistReply={async (action, draftText, thread, targetLanguage) => {
                    const res = await fetch('/api/ai/assist', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action,
                        draftText,
                        subject: thread.subject,
                        replyToThreadId: thread.id,
                        targetLanguage,
                        accountId: activeAccountId,
                      }),
                    });
                    const data = (await res.json()) as { text: string };
                    return data.text;
                  }}
                  replyInputRef={replyInputRef}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={async (payload) => {
          const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: activeAccountId,
              ...payload,
            }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            error?: string;
            threads?: EmailThread[];
            deliveredVia?: string;
          };
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Failed to send');
          }
          if (data.threads) setThreads(data.threads);
          showToast(`Email sent (${data.deliveredVia})`);
        }}
        onAiAssist={async (payload) => {
          const res = await fetch('/api/ai/assist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              accountId: activeAccountId,
            }),
          });
          const data = (await res.json()) as { text: string };
          return data.text;
        }}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />

      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        account={activeAccount}
        aiConfig={aiConfig}
        aiStatus={aiStatus}
        onSaveAiConfig={async (config) => {
          const res = await fetch('/api/ai/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          const data = (await res.json()) as {
            aiConfig?: AIConfig;
            aiStatus?: AIStatus;
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error || 'Failed to save AI settings');
          }
          if (data.aiConfig) setAiConfig(data.aiConfig);
          if (data.aiStatus) setAiStatus(data.aiStatus);
        }}
        onTestAi={async (config) => {
          const res = await fetch('/api/ai/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          return (await res.json()) as {
            ok: boolean;
            providerLabel: string;
            latencyMs: number;
            reply?: string;
            error?: string;
          };
        }}
        onListOllamaModels={async (baseUrl) => {
          const res = await fetch(
            `/api/ai/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`
          );
          return (await res.json()) as {
            ok: boolean;
            models: string[];
            error?: string;
          };
        }}
        onPullOllamaModel={async (baseUrl, model) => {
          const res = await fetch('/api/ai/ollama/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseUrl, model }),
          });
          return (await res.json()) as {
            ok: boolean;
            status?: string;
            error?: string;
          };
        }}
        onSaveAccount={async (config) => {
          const res = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          const data = (await res.json()) as { accounts: ImapAccountConfig[] };
          setAccounts(data.accounts);
          showToast('Configuration saved');
        }}
        onTestImap={async (config) => {
          const res = await fetch('/api/accounts/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          return (await res.json()) as {
            ok: boolean;
            mailboxes?: string[];
            error?: string;
          };
        }}
      />

      <MboxImportModal
        isOpen={mboxImportOpen}
        onClose={() => setMboxImportOpen(false)}
        accountId={activeAccountId}
        onCommitted={(result) => {
          setThreads(result.threads);
          setFilters(result.filters);
          setTodos(result.todos);
          setActiveSection('mail');
          setActiveTab('bundles');
          setBundleViewMode('bundled');
          const summaryParts = [
            `Imported ${result.importedThreads} threads`,
            result.createdBundles.length > 0
              ? `${result.createdBundles.length} new bundle${result.createdBundles.length === 1 ? '' : 's'}`
              : null,
            result.mergedBundles.length > 0
              ? `merged into ${result.mergedBundles.length}`
              : null,
          ].filter(Boolean);
          showToast(summaryParts.join(' · '));
        }}
      />

      {/* Ephemeral Action Confirmation Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 pointer-events-none px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[12px] font-medium shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
