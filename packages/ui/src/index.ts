import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export interface UiComponentProps {
  class?: string;
  disabled?: boolean;
}

export { default as UiButton } from './components/UiButton.vue';
export { default as UiInput } from './components/UiInput.vue';
export { default as UiTextarea } from './components/UiTextarea.vue';
export { default as UiLabel } from './components/UiLabel.vue';
export { default as UiCard } from './components/UiCard.vue';
export { default as UiBadge } from './components/UiBadge.vue';
export { default as UiSelect } from './components/UiSelect.vue';
export { default as UiDialog } from './components/UiDialog.vue';

export {};