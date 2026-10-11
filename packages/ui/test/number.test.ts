import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import UiNumberInput from '../src/components/UiNumberInput.vue';
import { formatDecimal, formatNumberForDisplay, parseNumberInput, stepFor } from '../src/components/number';

describe('parseNumberInput: an empty or partial box is never 0 and never NaN', () => {
  it('returns undefined for empty and partial entries', () => {
    for (const raw of ['', '   ', '-', '.', '+', 'e', '1e', 'abc', 'NaN', 'Infinity', '-Infinity']) {
      expect(parseNumberInput(raw), JSON.stringify(raw)).toBeUndefined();
    }
  });

  it('parses ordinary numbers including zero and negatives', () => {
    expect(parseNumberInput('0')).toBe(0);
    expect(parseNumberInput('-3.5')).toBe(-3.5);
    expect(parseNumberInput('1e3')).toBe(1000);
    expect(parseNumberInput(' 42 ')).toBe(42);
  });

  it('keeps zero distinct from empty', () => {
    expect(parseNumberInput('0')).not.toBe(parseNumberInput(''));
  });

  it('rounds to the field precision', () => {
    expect(parseNumberInput('1.005', 2)).toBe(1.01);
    expect(parseNumberInput('2.345', 2)).toBe(2.35);
    expect(parseNumberInput('7.9', 0)).toBe(8);
    expect(parseNumberInput('-1.5', 0)).toBe(-2);
    expect(parseNumberInput('0.1', 2)).toBe(0.1);
  });
});

describe('number formatting helpers', () => {
  it('step follows precision', () => {
    expect(stepFor(0)).toBe(1);
    expect(stepFor(2)).toBe(0.01);
    expect(stepFor(3)).toBe(0.001);
    expect(stepFor(undefined)).toBe('any');
  });

  it('formatDecimal pads to precision and yields empty for no value', () => {
    expect(formatDecimal(12, 2)).toBe('12.00');
    expect(formatDecimal(null)).toBe('');
    expect(formatDecimal(undefined, 2)).toBe('');
    expect(formatDecimal(Number.NaN)).toBe('');
  });

  it('formats for display by locale without changing the stored number', () => {
    expect(formatNumberForDisplay(1234.5, 'en-US', { precision: 2 })).toBe('1,234.50');
    expect(formatNumberForDisplay(1234.5, 'th-TH', { currency: 'THB', precision: 2 })).toBe('฿1,234.50');
    expect(formatNumberForDisplay(12.5, 'en-US', { percent: true })).toBe('12.5%');
  });
});

describe('UiNumberInput', () => {
  it('emits a number, and undefined when cleared, never 0 or NaN', async () => {
    const wrapper = mount(UiNumberInput, { props: { modelValue: 5 } });
    const input = wrapper.get('input');
    await input.setValue('12');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([12]);
    await input.setValue('');
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0];
    expect(last).toBeUndefined();
    expect(Object.is(last, 0)).toBe(false);
    expect(Number.isNaN(last as number)).toBe(false);
  });

  it('keeps the user\'s text while typing and tidies it on blur', async () => {
    const wrapper = mount(UiNumberInput, { props: { modelValue: undefined, precision: 2 } });
    const input = wrapper.get('input');
    await input.setValue('1.5');
    expect((input.element as HTMLInputElement).value).toBe('1.5');
    await input.trigger('blur');
    expect((input.element as HTMLInputElement).value).toBe('1.50');
  });

  it('follows an outside change to the model', async () => {
    const wrapper = mount(UiNumberInput, { props: { modelValue: 1 } });
    await wrapper.setProps({ modelValue: 9 });
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('9');
    await wrapper.setProps({ modelValue: undefined });
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
  });

  it('shows 0 as 0, not as empty', () => {
    expect((mount(UiNumberInput, { props: { modelValue: 0 } }).get('input').element as HTMLInputElement).value).toBe('0');
  });

  it('passes min, max, step, and accessibility attributes', () => {
    const wrapper = mount(UiNumberInput, { props: { modelValue: 1, min: 0, max: 10, precision: 2, invalid: true, describedBy: 'hint', id: 'qty' } });
    const input = wrapper.get('input');
    expect(input.attributes()).toMatchObject({ min: '0', max: '10', step: '0.01', 'aria-invalid': 'true', 'aria-describedby': 'hint', id: 'qty', type: 'number' });
  });

  it('is disabled when disabled', () => {
    expect(mount(UiNumberInput, { props: { disabled: true } }).get('input').attributes('disabled')).toBeDefined();
  });
});
