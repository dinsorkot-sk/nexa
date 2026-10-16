import { reactive, readonly } from 'vue';

export type ToastColor = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  color: ToastColor;
  /** Milliseconds before the toast dismisses itself. 0 keeps it until the user closes it. */
  duration: number;
}

export interface ToastInput {
  title: string;
  description?: string;
  color?: ToastColor;
  duration?: number;
}

const queue = reactive<ToastItem[]>([]);
let nextId = 1;

/** Adds a toast to the shared queue rendered by NxToaster. Returns the id, for dismissToast. */
export function pushToast(input: ToastInput): number {
  const item: ToastItem = {
    id: nextId++,
    title: input.title,
    description: input.description,
    color: input.color ?? 'info',
    duration: input.duration ?? 5000,
  };
  queue.push(item);
  if (item.duration > 0) setTimeout(() => dismissToast(item.id), item.duration);
  return item.id;
}

export function dismissToast(id: number): void {
  const index = queue.findIndex((item) => item.id === id);
  if (index !== -1) queue.splice(index, 1);
}

/** The live queue, read-only for consumers. NxToaster renders it. */
export const toastQueue = readonly(queue);
