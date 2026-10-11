import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import UiCombobox from '../src/components/UiCombobox.vue';
import { comboboxMaxLimit, type ComboboxOption, type LoadOptions } from '../src/components/combobox';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

const opt = (value: string, label = value.toUpperCase()): ComboboxOption => ({ value, label });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function mountBox(loadOptions: LoadOptions, props: Record<string, unknown> = {}) {
  return mountWithI18n(UiCombobox, { props: { loadOptions, debounceMs: 0, ...props }, attachTo: document.body }, 'en');
}

async function typeInto(term: string) {
  const input = document.body.querySelector('input') as HTMLInputElement;
  input.focus();
  input.value = term;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await flushPromises();
}

const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((node) => node.textContent?.trim());

describe('UiCombobox: server-side search', () => {
  it('loads options when opened and shows labels, not ids', async () => {
    const loadOptions = vi.fn<LoadOptions>(async () => [opt('id-1', 'Alice'), opt('id-2', 'Bob')]);
    const wrapper = mountBox(loadOptions);
    await typeInto('a');
    expect(loadOptions).toHaveBeenCalled();
    expect(optionTexts()).toEqual(['Alice', 'Bob']);
    wrapper.unmount();
  });

  it('never asks for or shows more than 100 options', async () => {
    const many = Array.from({ length: 250 }, (_, i) => opt(`id-${i}`, `Item ${i}`));
    const loadOptions = vi.fn<LoadOptions>(async () => many);
    const wrapper = mountBox(loadOptions);
    await typeInto('item');
    expect(loadOptions.mock.calls.at(-1)?.[1].limit).toBe(comboboxMaxLimit);
    expect(comboboxMaxLimit).toBe(100);
    expect(optionTexts().length).toBeLessThanOrEqual(100);
    wrapper.unmount();
  });

  it('shows an empty state when the server returns nothing', async () => {
    const wrapper = mountBox(async () => []);
    await typeInto('zzz');
    expect(document.body.textContent).toContain('No results');
    wrapper.unmount();
  });

  it('shows an error with a working retry when loading fails', async () => {
    let calls = 0;
    const loadOptions: LoadOptions = async () => { calls += 1; if (calls === 1) throw new Error('boom'); return [opt('id-1', 'Alice')]; };
    const wrapper = mountBox(loadOptions);
    await typeInto('a');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Could not load options');
    (document.body.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPromises();
    expect(optionTexts()).toEqual(['Alice']);
    wrapper.unmount();
  });

  it('shows a loading state while a request is pending', async () => {
    const pending = deferred<ComboboxOption[]>();
    const wrapper = mountBox(() => pending.promise);
    await typeInto('a');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('Searching');
    pending.resolve([]);
    await flushPromises();
    wrapper.unmount();
  });
});

describe('UiCombobox: out-of-order responses', () => {
  it('ignores a slow earlier response that arrives after a newer one', async () => {
    const first = deferred<ComboboxOption[]>();
    const second = deferred<ComboboxOption[]>();
    const loadOptions = vi.fn<LoadOptions>((term) => (term === 'a' ? first.promise : second.promise));
    const wrapper = mountBox(loadOptions);

    await typeInto('a');
    await typeInto('ab');
    second.resolve([opt('new', 'Newer result')]);
    await flushPromises();
    expect(optionTexts()).toEqual(['Newer result']);

    first.resolve([opt('old', 'Stale result')]);
    await flushPromises();
    expect(optionTexts()).toEqual(['Newer result']);
    expect(document.body.textContent).not.toContain('Stale result');
    wrapper.unmount();
  });

  it('aborts the superseded request', async () => {
    const signals: AbortSignal[] = [];
    const loadOptions: LoadOptions = (_term, { signal }) => { signals.push(signal); return new Promise(() => {}); };
    const wrapper = mountBox(loadOptions);
    await typeInto('a');
    await typeInto('ab');
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals.at(-1)!.aborted).toBe(false);
    wrapper.unmount();
  });

  it('aborts the pending request and ignores its result after unmount', async () => {
    const pending = deferred<ComboboxOption[]>();
    let signal!: AbortSignal;
    const wrapper = mountBox((_term, ctx) => { signal = ctx.signal; return pending.promise; });
    await typeInto('a');
    wrapper.unmount();
    expect(signal.aborted).toBe(true);
    // Resolving after unmount must neither throw nor touch the destroyed component.
    expect(() => pending.resolve([opt('x')])).not.toThrow();
    await flushPromises();
    expect(document.body.querySelector('[role="option"]')).toBeNull();
  });

  it('does not let a stale failure replace newer good results with an error', async () => {
    const first = deferred<ComboboxOption[]>();
    const second = deferred<ComboboxOption[]>();
    const wrapper = mountBox((term) => (term === 'a' ? first.promise : second.promise));
    await typeInto('a');
    await typeInto('ab');
    second.resolve([opt('ok', 'Good')]);
    await flushPromises();
    first.reject(new Error('late failure'));
    await flushPromises();
    expect(optionTexts()).toEqual(['Good']);
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    wrapper.unmount();
  });
});

describe('UiCombobox: value handling', () => {
  it('emits the id, not the label, when an option is chosen', async () => {
    const wrapper = mountBox(async () => [opt('id-1', 'Alice'), opt('id-2', 'Bob')]);
    await typeInto('a');
    (document.body.querySelectorAll('[role="option"]')[1] as HTMLElement).click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['id-2']);
    wrapper.unmount();
  });

  it('shows the label of an already-chosen value without any search', async () => {
    const wrapper = mountBox(async () => [], { modelValue: 'id-9', selected: [opt('id-9', 'Zara')] });
    // radix-vue syncs the shown text from the value after two ticks.
    await nextTick();
    await nextTick();
    await flushPromises();
    expect((document.body.querySelector('input') as HTMLInputElement).value).toBe('Zara');
    wrapper.unmount();
  });

  it('multiple: renders chips with labels, emits an array of ids, and removes by id', async () => {
    const wrapper = mountBox(async () => [opt('a', 'Alpha'), opt('b', 'Beta')], {
      multiple: true, modelValue: ['a', 'b'], selected: [opt('a', 'Alpha'), opt('b', 'Beta')],
    });
    await nextTick();
    expect(document.body.textContent).toContain('Alpha');
    expect(document.body.textContent).toContain('Beta');
    (document.body.querySelector('button[aria-label="Remove Alpha"]') as HTMLButtonElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['b']]);
    wrapper.unmount();
  });

  it('is disabled when disabled', async () => {
    const wrapper = mountBox(async () => [], { disabled: true });
    await nextTick();
    expect((document.body.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('UiCombobox: keyboard and accessibility', () => {
  it('exposes combobox semantics on the input', async () => {
    const wrapper = mountBox(async () => [opt('a', 'Alpha')], { describedBy: 'hint-1', invalid: true });
    await nextTick();
    const input = document.body.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-describedby')).toBe('hint-1');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    wrapper.unmount();
  });

  it('opens on typing, moves with ArrowDown, and selects with Enter', async () => {
    const wrapper = mountBox(async () => [opt('id-1', 'Alice'), opt('id-2', 'Bob')]);
    await typeInto('a');
    const input = document.body.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-expanded')).toBe('true');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.length).toBeGreaterThan(0);
    expect(typeof (wrapper.emitted('update:modelValue')!.at(-1)![0])).toBe('string');
    wrapper.unmount();
  });

  it('closes on Escape without selecting', async () => {
    const wrapper = mountBox(async () => [opt('id-1', 'Alice')]);
    await typeInto('a');
    const input = document.body.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});
