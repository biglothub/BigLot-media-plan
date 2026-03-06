import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function add(type: ToastType, message: string, duration = 3500) {
    const id = crypto.randomUUID();
    update((toasts) => [...toasts, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }

  function dismiss(id: string) {
    update((toasts) => toasts.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    success: (message: string, duration?: number) => add('success', message, duration),
    error:   (message: string, duration?: number) => add('error', message, duration),
    warning: (message: string, duration?: number) => add('warning', message, duration),
    info:    (message: string, duration?: number) => add('info', message, duration),
    dismiss,
  };
}

export const toast = createToastStore();
