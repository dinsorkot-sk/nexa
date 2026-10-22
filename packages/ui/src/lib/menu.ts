import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

/** A row a menu offers: what both menus in the library draw. */
export interface MenuEntry {
  value: string;
  label: string;
  disabled?: boolean;
  selected?: boolean;
}

export interface MenuKeyboardOptions {
  /** The rows the menu offers, in the order they are drawn. */
  entries: () => MenuEntry[];
  /** Whether the menu is open. */
  isOpen: () => boolean;
  /** Opens the menu. */
  open: () => void;
  /** Closes the menu, optionally giving the focus back to the trigger. */
  close: (restoreFocus?: boolean) => void;
  /** The element that wraps the trigger and the menu; a click outside it closes the menu. */
  rootRef: Ref<HTMLElement | null>;
  /** The element that carries the rows. */
  menuRef: Ref<HTMLElement | null>;
  /** The button that opens the menu. */
  triggerRef: Ref<HTMLElement | null>;
}

/** How long a run of typed letters stays a single search. */
const TYPEAHEAD_RESET_MS = 500;

/**
 * The keyboard contract the library's menus share.
 *
 * The rows take the focus in turn (`tabindex="-1"` plus `focus()` rather than `aria-activedescendant`, so a screen
 * reader announces the row), the arrow keys step over the disabled ones, Home and End go to the ends, the letters
 * typed in a row pick the row whose label starts with them, Escape closes and gives the focus back to the trigger,
 * and a click outside or a focus that leaves the component closes it.
 */
export function useMenuKeyboard(options: MenuKeyboardOptions) {
  /** The row the keyboard is on, by value. */
  const activeValue = ref<string | undefined>();

  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where the focus goes when the menu opens; the trigger's arrow keys ask for an end. */
  let openFocus: 'selected' | 'first' | 'last' = 'selected';

  /** The rows a person can reach, in the order they are drawn. */
  function enabledEntries(): MenuEntry[] {
    return options.entries().filter((entry) => !entry.disabled);
  }

  function focusAt(position: number) {
    const rows = options.menuRef.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])');
    if (!rows?.length) return;
    rows[(position + rows.length) % rows.length]?.focus();
  }

  /** Moves the focus by so many rows, skipping the disabled ones. */
  function moveFocus(delta: number) {
    const entries = enabledEntries();
    if (!entries.length) return;
    const current = entries.findIndex((entry) => entry.value === activeValue.value);
    focusAt(current < 0 ? (delta > 0 ? 0 : entries.length - 1) : current + delta);
  }

  /** The letters typed in a row pick the row whose label starts with them. */
  function onTypeahead(event: KeyboardEvent) {
    if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
    typeahead += event.key.toLowerCase();
    clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => { typeahead = ''; }, TYPEAHEAD_RESET_MS);
    const index = enabledEntries().findIndex((entry) => entry.label.toLowerCase().startsWith(typeahead));
    if (index >= 0) focusAt(index);
  }

  function onMenuKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); moveFocus(1); break;
      case 'ArrowUp': event.preventDefault(); moveFocus(-1); break;
      case 'Home': event.preventDefault(); focusAt(0); break;
      case 'End': event.preventDefault(); focusAt(enabledEntries().length - 1); break;
      case 'Escape': event.preventDefault(); options.close(true); break;
      default: onTypeahead(event);
    }
  }

  /** The trigger opens the menu with the arrow keys; the first or the last row takes the focus. */
  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const position = event.key === 'ArrowDown' ? 0 : enabledEntries().length - 1;
    if (!options.isOpen()) {
      openFocus = event.key === 'ArrowDown' ? 'first' : 'last';
      options.open();
      return;
    }
    focusAt(position);
  }

  /** A click outside the menu closes it. */
  function onPointerdown(event: PointerEvent) {
    if (!options.rootRef.value?.contains(event.target as Node)) options.close();
  }

  /** The focus leaving the component closes it, so it cannot be left open behind. */
  function onFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && options.rootRef.value?.contains(next)) return;
    options.close();
  }

  watch(options.isOpen, (open) => {
    if (open) document.addEventListener('pointerdown', onPointerdown, true);
    else document.removeEventListener('pointerdown', onPointerdown, true);
  }, { immediate: true });

  watch(options.isOpen, (open) => {
    if (!open) return;
    const target = openFocus;
    openFocus = 'selected';
    nextTick(() => {
      if (!options.isOpen()) return;
      if (target === 'first') focusAt(0);
      else if (target === 'last') focusAt(enabledEntries().length - 1);
      else {
        const selected = enabledEntries().find((entry) => entry.selected);
        focusAt(selected ? enabledEntries().findIndex((entry) => entry.value === selected.value) : 0);
      }
    });
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerdown, true);
    clearTimeout(typeaheadTimer);
  });

  return { activeValue, onMenuKeydown, onTriggerKeydown, onPointerdown, onFocusout };
}
