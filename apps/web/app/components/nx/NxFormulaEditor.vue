<script setup lang="ts">
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';

const props = withDefaults(defineProps<{
  modelValue: string;
  fields: { name: string; label: string; logicalType: string }[];
  resultType?: string;
  error?: string;
  readonly?: boolean;
}>(), { modelValue: '', fields: () => [], resultType: 'text', error: '', readonly: false });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const editorRef = ref<HTMLElement>();
let view: EditorView | undefined;

const FUNCTIONS = ['YEAR', 'TODAY', 'SUM', 'IF', 'ROUND', 'CONCAT', 'UPPER', 'LOWER', 'LENGTH', 'ABS', 'MIN', 'MAX', 'AVERAGE'];

function fieldCompleter(context: CompletionContext) {
  const match = context.matchBefore(/[{A-Za-z][A-Za-z0-9_]*/);
  if (!match || (match.from === match.to && !context.explicit)) return null;
  const fieldOptions = props.fields.map((f) => ({ label: `{${f.name}}`, detail: `${f.label} · ${f.logicalType}`, apply: `{${f.name}}` }));
  const fnOptions = FUNCTIONS.map((fn) => ({ label: `${fn}(`, detail: 'function', apply: `${fn}(` }));
  return { from: match.from, options: [...fieldOptions, ...fnOptions] };
}

onMounted(() => {
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(),
        autocompletion({ override: [fieldCompleter] }),
        EditorView.editable.of(!props.readonly),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent' },
          '.cm-content': { fontFamily: "'Consolas', monospace", padding: '8px 0' },
          '.cm-line': { padding: '0 8px' },
          '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--ui-text-dimmed)' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
    }),
    parent: editorRef.value,
    dispatch: (tr) => {
      view?.dispatch(tr);
      if (tr.docChanged) emit('update:modelValue', view.state.doc.toString());
    },
  });
});

onBeforeUnmount(() => view?.destroy());

watch(() => props.modelValue, (next) => {
  if (view && view.state.doc.toString() !== next) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }
});
</script>

<template>
  <div class="flex flex-col rounded-lg border" :class="error ? 'border-error/50' : 'border-default'">
    <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
      <span class="text-nexa-caption font-medium text-dimmed uppercase">formula</span>
      <UBadge v-if="resultType" color="info" variant="soft" size="sm">{{ resultType }}</UBadge>
    </div>
    <div ref="editorRef" class="h-64 overflow-auto text-nexa-mono text-default" />
    <div v-if="error" class="flex items-center gap-2 border-t border-default px-3 py-2 text-nexa-small text-error">
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
      {{ error }}
    </div>
    <div v-else class="flex items-center gap-2 border-t border-default px-3 py-2 text-nexa-caption text-dimmed">
      <UIcon name="i-lucide-function-square" class="size-3.5" />
      {{ t('fields.formulaHint') }}
    </div>
  </div>
</template>
