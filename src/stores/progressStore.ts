import { create } from 'zustand';

/** A long computation in progress, shown by the bar under the view toolbars */
export interface ProgressTask {
  /** i18n key (common namespace) naming what runs */
  labelKey: string;
  /** 0–100, or null when the progress is not known */
  percent: number | null;
}

interface ProgressState {
  tasks: Record<string, ProgressTask>;
  /** Start (or restart) a task */
  start: (id: string, labelKey: string, percent?: number | null) => void;
  update: (id: string, percent: number | null) => void;
  end: (id: string) => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  tasks: {},
  start: (id, labelKey, percent = null) =>
    set((s) => ({ tasks: { ...s.tasks, [id]: { labelKey, percent } } })),
  update: (id, percent) =>
    set((s) => (s.tasks[id] ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], percent } } } : s)),
  end: (id) =>
    set((s) => {
      if (!s.tasks[id]) return s;
      const tasks = { ...s.tasks };
      delete tasks[id];
      return { tasks };
    }),
}));
