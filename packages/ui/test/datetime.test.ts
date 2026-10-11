import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiDateTimeInput from '../src/components/UiDateTimeInput.vue';
import UiTimeInput from '../src/components/UiTimeInput.vue';
import { datetimeLocalToIso, isoToDatetimeLocal, timeOfDay } from '../src/components/date';

describe('the test run is pinned to Asia/Bangkok (UTC+7, no DST)', () => {
  it('has the expected offset', () => {
    expect(new Date('2026-10-11T00:00:00Z').getHours()).toBe(7);
    expect(new Date(2026, 5, 1).getTimezoneOffset()).toBe(-420);
  });
});

describe('datetime-local <-> stored instant', () => {
  it('reads the box as local time and stores UTC', () => {
    expect(datetimeLocalToIso('2026-10-11T14:30')).toBe('2026-10-11T07:30:00.000Z');
    expect(datetimeLocalToIso('2026-10-11T14:30:45')).toBe('2026-10-11T07:30:45.000Z');
  });

  it('crosses the date line correctly', () => {
    expect(datetimeLocalToIso('2026-10-11T02:00')).toBe('2026-10-10T19:00:00.000Z');
    expect(datetimeLocalToIso('2026-01-01T00:00')).toBe('2025-12-31T17:00:00.000Z');
  });

  it('shows a stored instant in local time', () => {
    expect(isoToDatetimeLocal('2026-10-11T07:30:00.000Z')).toBe('2026-10-11T14:30');
    expect(isoToDatetimeLocal('2026-10-10T19:00:00Z')).toBe('2026-10-11T02:00');
  });

  it('round-trips without drifting', () => {
    for (const local of ['2026-10-11T14:30', '2026-02-28T23:59', '2028-02-29T00:00', '2026-12-31T23:00']) {
      expect(isoToDatetimeLocal(datetimeLocalToIso(local))).toBe(local);
    }
  });

  it('returns nothing for an empty, partial, impossible or non-string value', () => {
    for (const bad of ['', '2026-10-11', '2026-10-11T', '14:30', '2026-13-01T10:00', 'soon']) {
      expect(datetimeLocalToIso(bad), bad).toBeUndefined();
    }
    for (const bad of ['', 'nope', 12, null, undefined]) expect(isoToDatetimeLocal(bad), String(bad)).toBe('');
  });

  it('shows a legacy value that has no timezone as local, without throwing', () => {
    expect(isoToDatetimeLocal('2026-10-11T14:30')).toBe('2026-10-11T14:30');
  });
});

describe('time of day', () => {
  it('matches exactly the engine rule: HH:mm or HH:mm:ss on a 24-hour clock', () => {
    for (const ok of ['00:00', '09:05', '14:30', '23:59', '14:30:45', '23:59:59']) expect(timeOfDay.test(ok), ok).toBe(true);
    for (const bad of ['24:00', '12:60', '12:30:60', '1:30', '14', '14:3', '', '14:30pm', ' 14:30', '2026-10-11T14:30:00Z']) expect(timeOfDay.test(bad), bad).toBe(false);
  });
});

describe('UiTimeInput', () => {
  it('emits the box value unchanged: no date, no timezone', async () => {
    const wrapper = mount(UiTimeInput, { props: { modelValue: undefined } });
    await wrapper.get('input').setValue('14:30');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['14:30']);
  });

  it('emits undefined when cleared', async () => {
    const wrapper = mount(UiTimeInput, { props: { modelValue: '14:30' } });
    await wrapper.get('input').setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([undefined]);
  });

  it('shows the stored value and supports seconds', () => {
    const wrapper = mount(UiTimeInput, { props: { modelValue: '08:05:09', withSeconds: true } });
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('08:05:09');
    expect(wrapper.get('input').attributes('step')).toBe('1');
  });
});

describe('UiDateTimeInput', () => {
  it('shows local time and emits UTC', async () => {
    const wrapper = mount(UiDateTimeInput, { props: { modelValue: '2026-10-11T07:30:00.000Z' } });
    const input = wrapper.get('input');
    expect((input.element as HTMLInputElement).value).toBe('2026-10-11T14:30');
    await input.setValue('2026-10-11T16:00');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-10-11T09:00:00.000Z']);
  });

  it('emits undefined when cleared', async () => {
    const wrapper = mount(UiDateTimeInput, { props: { modelValue: '2026-10-11T07:30:00.000Z' } });
    await wrapper.get('input').setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([undefined]);
  });

  it('passes accessibility attributes through', () => {
    const wrapper = mount(UiDateTimeInput, { props: { invalid: true, describedBy: 'hint', id: 'dt' } });
    expect(wrapper.get('input').attributes()).toMatchObject({ 'aria-invalid': 'true', 'aria-describedby': 'hint', id: 'dt', type: 'datetime-local' });
  });
});
