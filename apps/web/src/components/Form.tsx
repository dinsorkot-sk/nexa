import { createSignal } from 'solid-js';
import { renderField } from '@nexa/ui';
import type { MetaField } from '@nexa/types';

export interface MetaFormProps {
  fields: MetaField[];
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  submitLabel?: string;
}

export function MetaForm(props: MetaFormProps) {
  const [values, setValues] = createSignal<Record<string, unknown>>(props.initial ?? {});
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [submitting, setSubmitting] = createSignal(false);

  const setValue = (name: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await props.onSubmit(values());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col gap-4">
      {props.fields
        .filter((f) => !f.deletedAt)
        .map((f) => (
          <div>
            {renderField({
              field: f,
              value: values()[f.name],
              onChange: (v) => setValue(f.name, v),
              error: errors()[f.name],
            })}
          </div>
        ))}
      <button
        type="submit"
        disabled={submitting()}
        class="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting() ? 'Submitting...' : (props.submitLabel ?? 'Save')}
      </button>
    </form>
  );
}