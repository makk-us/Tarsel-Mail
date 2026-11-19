import React from 'react';
import { X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    items: [
      { keys: ['j', '↓'], desc: 'Move down thread list' },
      { keys: ['k', '↑'], desc: 'Move up thread list' },
      { keys: ['Enter', 'o'], desc: 'Open focused thread' },
      { keys: ['/'], desc: 'Focus instant FTS5 search' },
      { keys: ['⌘K', 'Ctrl+K'], desc: 'Open Command Palette' },
    ],
  },
  {
    title: 'Triage & Actions',
    items: [
      { keys: ['e'], desc: 'Mark thread Done / Archive' },
      { keys: ['s'], desc: 'Star / Unstar thread' },
      { keys: ['l'], desc: 'Save / Remove from Read Later' },
      { keys: ['h'], desc: 'Snooze until tomorrow morning' },
      { keys: ['t'], desc: 'Convert email into To-Do item' },
      { keys: ['r'], desc: 'Focus Quick Reply' },
      { keys: ['c'], desc: 'Compose new email' },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2.5">
              <h3 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.desc}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      {item.desc}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
