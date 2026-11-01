import { cn } from '@nexa/utils';
import type { JSX } from 'solid-js';
import type { MetaField } from '@nexa/types';

export interface FieldProps {
  field: MetaField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}

export function TextField(props: FieldProps) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">{props.field.label}</label>
      <input
        class={cn('rounded-md border px-3 py-2 text-sm', props.error && 'border-red-500')}
        type="text"
        value={String(props.value ?? '')}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
      {props.error && <span class="text-xs text-red-500">{props.error}</span>}
    </div>
  );
}

export function NumberField(props: FieldProps) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">{props.field.label}</label>
      <input
        class={cn('rounded-md border px-3 py-2 text-sm', props.error && 'border-red-500')}
        type="number"
        value={props.value != null ? String(props.value) : ''}
        onInput={(e) => props.onChange(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
      />
      {props.error && <span class="text-xs text-red-500">{props.error}</span>}
    </div>
  );
}

export function BooleanField(props: FieldProps) {
  return (
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        checked={Boolean(props.value)}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <label class="text-sm font-medium">{props.field.label}</label>
    </div>
  );
}

export function DateField(props: FieldProps) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">{props.field.label}</label>
      <input
        class={cn('rounded-md border px-3 py-2 text-sm', props.error && 'border-red-500')}
        type="date"
        value={props.value ? String(props.value).slice(0, 10) : ''}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
      {props.error && <span class="text-xs text-red-500">{props.error}</span>}
    </div>
  );
}

export function SelectField(props: FieldProps & { options: { value: string; label: string }[] }) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">{props.field.label}</label>
      <select
        class={cn('rounded-md border px-3 py-2 text-sm', props.error && 'border-red-500')}
        value={String(props.value ?? '')}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        {props.options.map((o) => <option value={o.value}>{o.label}</option>)}
      </select>
      {props.error && <span class="text-xs text-red-500">{props.error}</span>}
    </div>
  );
}

export function JsonField(props: FieldProps) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">{props.field.label}</label>
      <textarea
        class={cn('rounded-md border px-3 py-2 text-sm font-mono', props.error && 'border-red-500')}
        rows={4}
        value={typeof props.value === 'string' ? props.value : JSON.stringify(props.value ?? '', null, 2)}
        onInput={(e) => {
          try { props.onChange(JSON.parse(e.currentTarget.value)); }
          catch { props.onChange(e.currentTarget.value); }
        }}
      />
      {props.error && <span class="text-xs text-red-500">{props.error}</span>}
    </div>
  );
}

export function LookupSelectField(props: FieldProps & { options: { value: string; label: string }[] }) {
  return (
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">{props.field.label}</label>
      <select
        class="rounded-md border px-3 py-2 text-sm"
        value={String(props.value ?? '')}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <option value="">— select —</option>
        {props.options.map((o) => <option value={o.value}>{o.label}</option>)}
      </select>
      {props.error && <span class="text-xs text-red-500">{props.error}</span>}
    </div>
  );
}

export function renderField(props: FieldProps & { options?: { value: string; label: string }[] }) {
  switch (props.field.logicalType) {
    case 'boolean':
      return <BooleanField {...props} />;
    case 'integer':
    case 'bigint':
    case 'decimal':
      return <NumberField {...props} />;
    case 'datetime':
      return <DateField {...props} />;
    case 'json':
      return <JsonField {...props} />;
    default:
      if (props.field.referenceEntity) {
        return <LookupSelectField {...props} options={props.options ?? []} />;
      }
      if (props.options && props.options.length > 0) {
        return <SelectField {...props} options={props.options} />;
      }
      return <TextField {...props} />;
  }
}