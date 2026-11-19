import React from 'react';
import {
  Command,
  HelpCircle,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchMode: 'fts' | 'ai';
  onToggleSearchMode: () => void;
  searchMeta?: { latencyMs?: number; explanation?: string; count?: number } | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSyncImap: () => void;
  isSyncing: boolean;
  onRunAllFilters: () => void;
  isRunningFilters: boolean;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
  onToggleMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  searchMode,
  onToggleSearchMode,
  searchMeta,
  searchInputRef,
  onSyncImap,
  isSyncing,
  onRunAllFilters,
  isRunningFilters,
  onOpenCommandPalette,
  onOpenShortcuts,
  onToggleMobileMenu,
}) => {
  return (
    <header className="h-[52px] shrink-0 px-3 md:px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-3">
      {/* Left: Mobile drawer button + Blazing Fast Search Bar */}
      <div className="flex items-center gap-2 flex-1 max-w-2xl min-w-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Open navigation menu"
          className="md:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="relative flex-1 flex items-center min-w-0">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search emails"
            placeholder={
              searchMode === 'ai'
                ? 'Ask AI search (e.g. "invoices over $500" or "German DPA")'
                : 'Search index (try from:aws, has:attachment, is:starred)...'
            }
            className="w-full h-9 pl-9 pr-28 rounded-lg bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:bg-white dark:focus:bg-slate-900 transition-colors"
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleSearchMode}
              aria-pressed={searchMode === 'ai'}
              title="Toggle between SQLite FTS5 Index and AI Semantic Search"
              className={`h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                searchMode === 'ai'
                  ? 'bg-sky-600 text-white'
                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>{searchMode === 'ai' ? 'AI Search' : 'FTS5'}</span>
            </button>
          </div>
        </div>

        {searchQuery && searchMeta && (
          <span className="hidden lg:inline-block font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            {searchMeta.count ?? 0} hits
            {typeof searchMeta.latencyMs === 'number'
              ? ` · ${searchMeta.latencyMs}ms`
              : ''}
          </span>
        )}
      </div>

      {/* Right: Sync, AI Triage, Command Palette, Shortcuts */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRunAllFilters}
          disabled={isRunningFilters}
          className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-[12px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span className="hidden sm:inline">
            {isRunningFilters ? 'Applying...' : 'Run AI Filters'}
          </span>
        </button>

        <button
          type="button"
          onClick={onSyncImap}
          disabled={isSyncing}
          aria-label="Sync IMAP Inbox"
          className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-[12px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open Command Palette"
          className="h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-[12px] font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Command className="w-3 h-3" />
          <span>K</span>
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="h-8 w-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 cursor-pointer"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
