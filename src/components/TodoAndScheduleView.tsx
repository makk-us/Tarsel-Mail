import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import type { CalendarEvent, TodoItem } from '../types/mail.ts';

interface TodoAndScheduleViewProps {
  mode: 'todo' | 'calendar';
  todos: TodoItem[];
  calendarEvents: CalendarEvent[];
  onAddTodo: (title: string, priority: 'high' | 'normal' | 'low', dueDate?: string) => Promise<void>;
  onToggleTodo: (todo: TodoItem) => Promise<void>;
  onDeleteTodo: (id: string) => Promise<void>;
  onAddEvent: (event: {
    title: string;
    startTime: string;
    location: string;
  }) => Promise<void>;
  onJumpToThread: (threadId: string) => void;
}

export const TodoAndScheduleView: React.FC<TodoAndScheduleViewProps> = ({
  mode,
  todos,
  calendarEvents,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onAddEvent,
  onJumpToThread,
}) => {
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('2026-11-13T14:00');
  const [newEventLocation, setNewEventLocation] = useState('Video Call');

  const handleTodoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;
    await onAddTodo(newTodoTitle.trim(), newTodoPriority);
    setNewTodoTitle('');
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventStart) return;
    await onAddEvent({
      title: newEventTitle.trim(),
      startTime: new Date(newEventStart).toISOString(),
      location: newEventLocation.trim() || 'Video Call',
    });
    setNewEventTitle('');
  };

  if (mode === 'todo') {
    const openTodos = todos.filter((t) => !t.completed);
    const doneTodos = todos.filter((t) => t.completed);

    return (
      <main className="flex-1 h-full overflow-y-auto bg-[#FAFAFB] dark:bg-[#0B0F17] p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Email To-Do List
            </h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
              Turn any email or AI-extracted action item into a focused task linked directly back to its thread.
            </p>
          </div>

          <form
            onSubmit={handleTodoSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              aria-label="New to-do title"
              placeholder="Add a task or press T on any email thread..."
              className="flex-1 h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            <select
              aria-label="Task priority"
              value={newTodoPriority}
              onChange={(e) =>
                setNewTodoPriority(e.target.value as 'high' | 'normal' | 'low')
              }
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[12px] text-slate-700 dark:text-slate-200"
            >
              <option value="high">High Priority</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <button
              type="submit"
              className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Task</span>
            </button>
          </form>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] divide-y divide-slate-200/70 dark:divide-slate-800">
            {openTodos.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
                All email tasks completed.
              </div>
            ) : (
              openTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleTodo(todo)}
                      aria-label={`Complete "${todo.title}"`}
                      className="mt-0.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                        {todo.title}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {todo.priority === 'high' && (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            High Priority
                          </span>
                        )}
                        {todo.dueDate && (
                          <span className="font-mono tabular-nums">
                            Due {todo.dueDate}
                          </span>
                        )}
                        {todo.threadId && todo.threadSubject && (
                          <button
                            type="button"
                            onClick={() => onJumpToThread(todo.threadId!)}
                            className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span className="truncate max-w-[260px]">
                              {todo.threadSubject}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteTodo(todo.id)}
                    aria-label={`Delete task "${todo.title}"`}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </section>

          {doneTodos.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                Completed ({doneTodos.length})
              </h2>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-[#111827]/60 divide-y divide-slate-200/60 dark:divide-slate-800">
                {doneTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onToggleTodo(todo)}
                        aria-label={`Reopen "${todo.title}"`}
                        className="text-emerald-600 dark:text-emerald-400 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <span className="text-[13px] text-slate-400 line-through truncate">
                        {todo.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteTodo(todo.id)}
                      aria-label={`Delete completed task "${todo.title}"`}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full overflow-y-auto bg-[#FAFAFB] dark:bg-[#0B0F17] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Integrated Schedule
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            Upcoming blocks and meetings detected directly from your email threads.
          </p>
        </div>

        <form
          onSubmit={handleEventSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label
              htmlFor="cal-title"
              className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Event Title
            </label>
            <input
              id="cal-title"
              type="text"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              placeholder="e.g., IMAP Sync Architecture Review"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label
              htmlFor="cal-start"
              className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Start Time
            </label>
            <input
              id="cal-start"
              type="datetime-local"
              value={newEventStart}
              onChange={(e) => setNewEventStart(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] font-mono text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Event location"
              value={newEventLocation}
              onChange={(e) => setNewEventLocation(e.target.value)}
              placeholder="Location"
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[12px] text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="h-9 px-3.5 rounded-lg bg-slate-900 dark:bg-sky-500 text-white dark:text-slate-950 text-[13px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Add
            </button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] divide-y divide-slate-200 dark:divide-slate-800">
          {calendarEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-[14px] font-semibold text-slate-900 dark:text-white truncate">
                    {evt.title}
                  </h3>
                  <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-mono tabular-nums">
                      {new Date(evt.startTime).toLocaleString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{evt.location}</span>
                    {evt.attendees.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{evt.attendees.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {evt.sourceThreadId && (
                <button
                  type="button"
                  onClick={() => onJumpToThread(evt.sourceThreadId!)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[12px] font-medium text-sky-600 dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Thread
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};
