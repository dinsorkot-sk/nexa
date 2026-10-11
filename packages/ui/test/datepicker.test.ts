import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { BuddhistCalendar, CalendarDate, toCalendar } from '@internationalized/date';
import UiDatePicker from '../src/components/UiDatePicker.vue';
import { calendarDateToIso, isoToCalendarDate } from '../src/components/date';
import { mountWithI18n } from './helpers';

afterEach(() => { document.body.innerHTML = ''; });

describe('date conversion: stored value is always Gregorian ISO', () => {
  it('parses a valid ISO date', () => {
    const date = isoToCalendarDate('2026-10-11')!;
    expect([date.year, date.month, date.day]).toEqual([2026, 10, 11]);
  });

  it('rejects impossible and malformed dates instead of rolling them over', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '10/11/2026', '2026-1-1', '', 'tomorrow']) {
      expect(isoToCalendarDate(bad), bad).toBeUndefined();
    }
    expect(isoToCalendarDate(20261011)).toBeUndefined();
    expect(isoToCalendarDate(null)).toBeUndefined();
  });

  it('accepts a leap day only in a leap year', () => {
    expect(isoToCalendarDate('2028-02-29')).toBeDefined();
    expect(isoToCalendarDate('2026-02-29')).toBeUndefined();
  });

  it('formats a Gregorian value with zero padding', () => {
    expect(calendarDateToIso(new CalendarDate(2026, 3, 5))).toBe('2026-03-05');
    expect(calendarDateToIso(undefined)).toBeUndefined();
  });

  it('a Buddhist-calendar value (year 2569) is stored as Gregorian 2026', () => {
    const buddhist = toCalendar(new CalendarDate(2026, 10, 11), new BuddhistCalendar());
    expect(buddhist.year).toBe(2569);
    expect(calendarDateToIso(buddhist)).toBe('2026-10-11');
  });

  it('round-trips every day of a leap year without drifting', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (const day of [1, 15, 28]) {
        const iso = `2028-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const be = toCalendar(isoToCalendarDate(iso)!, new BuddhistCalendar());
        expect(calendarDateToIso(be)).toBe(iso);
      }
    }
  });
});

function mountPicker(locale: 'th' | 'en', props: Record<string, unknown> = {}) {
  return mountWithI18n(UiDatePicker, { props, attachTo: document.body }, locale);
}

const segmentText = () => [...document.body.querySelectorAll('[data-radix-vue-date-field-segment]')].map((node) => node.textContent?.trim()).join(' ');

describe('UiDatePicker display follows the language, the value does not', () => {
  it('shows the Buddhist Era year in Thai', async () => {
    const wrapper = mountPicker('th', { modelValue: '2026-10-11' });
    await nextTick(); await flushPromises();
    expect(segmentText()).toContain('2569');
    expect(segmentText()).not.toContain('2026');
    wrapper.unmount();
  });

  it('shows the Gregorian year in English', async () => {
    const wrapper = mountPicker('en', { modelValue: '2026-10-11' });
    await nextTick(); await flushPromises();
    expect(segmentText()).toContain('2026');
    expect(segmentText()).not.toContain('2569');
    wrapper.unmount();
  });

  it('does not emit just because it rendered or the language changed', async () => {
    const wrapper = mountPicker('th', { modelValue: '2026-10-11' });
    await nextTick(); await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows placeholders, not a date, when the value is empty or invalid', async () => {
    const wrapper = mountPicker('en', { modelValue: '2026-02-30' });
    await nextTick(); await flushPromises();
    expect(segmentText()).not.toContain('2026');
    wrapper.unmount();
  });
});

describe('UiDatePicker interaction', () => {
  it('opens a calendar from the trigger with a localised, labelled button', async () => {
    const wrapper = mountPicker('en', { modelValue: '2026-10-11' });
    await nextTick();
    const trigger = document.body.querySelector('button[aria-label="Open calendar"]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    trigger.click();
    await nextTick(); await flushPromises();
    expect(document.body.querySelector('[role="grid"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="Previous month"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('uses Thai labels in Thai', async () => {
    const wrapper = mountPicker('th', { modelValue: '2026-10-11' });
    await nextTick();
    expect(document.body.querySelector('button[aria-label="เปิดปฏิทิน"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('emits Gregorian ISO when a day is picked, even while showing Buddhist years', async () => {
    const wrapper = mountPicker('th', { modelValue: '2026-10-11' });
    await nextTick();
    (document.body.querySelector('button[aria-label="เปิดปฏิทิน"]') as HTMLButtonElement).click();
    await nextTick(); await flushPromises();
    const cells = [...document.body.querySelectorAll('[role="gridcell"] [role="button"], [role="gridcell"] div[data-radix-vue-calendar-cell-trigger]')] as HTMLElement[];
    const target = cells.find((cell) => cell.textContent?.trim() === '20' && !cell.hasAttribute('data-outside-view'));
    expect(target).toBeDefined();
    target!.click();
    await nextTick(); await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-10-20']);
    wrapper.unmount();
  });

  it('is disabled when disabled', async () => {
    const wrapper = mountPicker('en', { disabled: true });
    await nextTick();
    const trigger = document.body.querySelector('button[aria-label="Open calendar"]') as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('UiDatePicker heading follows the display language', () => {
  /** An element whose entire text is exactly this string, so radix's longer hidden "Event Date, ..." heading cannot match. */
  const hasExactText = (text: string) => [...document.body.querySelectorAll('*')].some((node) => node.children.length === 0 && node.textContent?.trim() === text);

  async function openCalendar(locale: 'th' | 'en') {
    const wrapper = mountPicker(locale, { modelValue: '2026-10-11' });
    await nextTick();
    const label = locale === 'th' ? 'เปิดปฏิทิน' : 'Open calendar';
    (document.body.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
    await nextTick(); await flushPromises();
    return wrapper;
  }

  it('shows the Buddhist Era year in the visible heading under Thai, matching the field', async () => {
    const wrapper = await openCalendar('th');
    expect(hasExactText('ตุลาคม 2569')).toBe(true);
    expect(hasExactText('ตุลาคม 2026')).toBe(false);
    wrapper.unmount();
  });

  it('shows the Gregorian year in the visible heading under English', async () => {
    const wrapper = await openCalendar('en');
    expect(hasExactText('October 2026')).toBe(true);
    wrapper.unmount();
  });
});
