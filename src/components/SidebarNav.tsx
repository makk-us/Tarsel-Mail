import React from 'react';
import {
  Bookmark,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileArchive,
  Inbox,
  Layers,
  Moon,
  PenSquare,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
} from 'lucide-react';
import type { AppSection, ImapAccountConfig, SplitViewTab } from '../types/mail.ts';

interface SidebarNavProps {
  activeSection: AppSection;
  activeTab: SplitViewTab;
  onSelectMailTab: (tab: SplitViewTab) => void;
  onSelectSection: (section: AppSection) => void;
  onOpenCompose: () => void;
  onOpenSettings: () => void;
  onOpenMboxImport: () => void;
  counts: {
    inbox: number;
    important: number;
    bundles: number;
    todo: number;
    readLater: number;
    snoozed: number;
    done: number;
    sent: number;
    filters: number;
  };
  account: ImapAccountConfig | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  width?: number;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeSection,
  activeTab,
  onSelectMailTab,
  onSelectSection,
  onOpenCompose,
  onOpenSettings,
  onOpenMboxImport,
  counts,
  account,
  darkMode,
  onToggleDarkMode,
  width,
}) => {
  const mailTabs: Array<{
    id: SplitViewTab;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }> = [
    {
      id: 'inbox',
      label: 'Inbox',
      icon: <Inbox className="w-4 h-4 shrink-0" />,
      count: counts.inbox,
    },
    {
      id: 'important',
      label: 'Important',
      icon: <Star className="w-4 h-4 shrink-0" />,
      count: counts.important,
    },
    {
      id: 'bundles',
      label: 'Bundles',
      icon: <Layers className="w-4 h-4 shrink-0" />,
      count: counts.bundles,
    },
    {
      id: 'todo',
      label: 'To-Do',
      icon: <CheckSquare className="w-4 h-4 shrink-0" />,
      count: counts.todo,
    },
    {
      id: 'readLater',
      label: 'Read Later',
      icon: <Bookmark className="w-4 h-4 shrink-0" />,
      count: counts.readLater,
    },
    {
      id: 'snoozed',
      label: 'Snoozed',
      icon: <Clock className="w-4 h-4 shrink-0" />,
      count: counts.snoozed,
    },
    {
      id: 'done',
      label: 'Done',
      icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
      count: counts.done,
    },
    {
      id: 'sent',
      label: 'Sent',
      icon: <Send className="w-4 h-4 shrink-0" />,
      count: counts.sent,
    },
  ];

  return (
    <aside
      aria-label="Primary Sidebar"
      style={
        width
          ? ({ '--sidebar-width': `${width}px` } as React.CSSProperties)
          : undefined
      }
      className="w-[232px] md:w-[var(--sidebar-width,232px)] shrink-0 h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-[#F4F6F9] dark:bg-[#0E131D] select-none"
    >
      {/* Brand Lockup */}
      <div className="h-[52px] px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-sky-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="M4 6h16v12H4z" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </div>
          <span className="font-display font-semibold text-[15px] tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
            Tarsel Mail
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          title={darkMode ? 'Light mode' : 'Dark mode'}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Compose Primary CTA */}
      <div className="p-3">
        <button
          type="button"
          onClick={onOpenCompose}
          className="w-full h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 font-medium text-sm flex items-center justify-between transition-colors shadow-xs cursor-pointer"
        >
          <span className="flex items-center gap-2 whitespace-nowrap">
            <PenSquare className="w-4 h-4 shrink-0" />
            Compose
          </span>
          <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/15 dark:bg-slate-950/20 text-white/90 dark:text-slate-950">
            C
          </kbd>
        </button>
      </div>

      {/* Navigation Sections */}
      <nav aria-label="Mailboxes and Tools" className="flex-1 overflow-y-auto px-2.5 space-y-5">
        <div className="space-y-0.5">
          {mailTabs.map((tab) => {
            const isActive = activeSection === 'mail' && activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onSelectSection('mail');
                  onSelectMailTab(tab.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full h-8 px-2.5 rounded-md text-[13px] font-medium flex items-center justify-between transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-800/90 text-slate-900 dark:text-white shadow-2xs ring-1 ring-slate-200/80 dark:ring-slate-700/80'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
                }`}
              >
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <span
                    className={
                      isActive
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }
                  >
                    {tab.icon}
                  </span>
                  {tab.label}
                </span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      isActive
                        ? 'text-slate-700 dark:text-slate-200 font-semibold'
                        : 'text-slate-500 dark:text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Intelligence & Planning */}
        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/70 space-y-0.5">
          <div className="px-2.5 pb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Automation & Planning
          </div>
          <button
            type="button"
            onClick={() => onSelectSection('filters')}
            aria-current={activeSection === 'filters' ? 'page' : undefined}
            className={`w-full h-8 px-2.5 rounded-md text-[13px] font-medium flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'filters'
                ? 'bg-white dark:bg-slate-800/90 text-slate-900 dark:text-white shadow-2xs ring-1 ring-slate-200/80 dark:ring-slate-700/80'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Sparkles
                className={`w-4 h-4 shrink-0 ${
                  activeSection === 'filters'
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              AI Filters
            </span>
            <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {counts.filters}
            </span>
          </button>

          <button
            type="button"
            onClick={onSelectSection ? () => onSelectSection('calendar') : undefined}
            aria-current={activeSection === 'calendar' ? 'page' : undefined}
            className={`w-full h-8 px-2.5 rounded-md text-[13px] font-medium flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'calendar'
                ? 'bg-white dark:bg-slate-800/90 text-slate-900 dark:text-white shadow-2xs ring-1 ring-slate-200/80 dark:ring-slate-700/80'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <Calendar
                className={`w-4 h-4 shrink-0 ${
                  activeSection === 'calendar'
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              Schedule
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenMboxImport}
            className="w-full h-8 px-2.5 rounded-md text-[13px] font-medium flex items-center justify-between text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5 whitespace-nowrap">
              <FileArchive className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
              Import Takeout
            </span>
          </button>
        </div>
      </nav>

      {/* Account & IMAP / Docker Settings Footer */}
      <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full px-2.5 py-2 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800/60 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-slate-900 dark:text-slate-100 truncate">
              {account?.displayName || 'Alex Mercer'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {account?.mode === 'imap' ? account.imapHost : 'Local Mailbox'}
            </div>
          </div>
          <Settings className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full h-7 px-2.5 rounded text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">IMAP & Docker Config</span>
        </button>
      </div>
    </aside>
  );
};
