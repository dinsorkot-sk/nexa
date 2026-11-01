<script setup lang="ts">
import { VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';

export interface WorkflowNode {
  id: string;
  type: 'start' | 'step' | 'end';
  label: string;
  count?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  guard?: string | null;
  guardReason?: string | null;
}

const props = defineProps<{
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}>();

const colorByType: Record<string, string> = {
  start: 'border-[--ui-primary] bg-[--ui-primary-soft] text-[--ui-primary-text]',
  step: 'border-default bg-default text-default',
  end: 'border-[--ui-neutral] bg-[--ui-bg-accented] text-default',
};

const flowNodes = computed(() =>
  props.nodes.map((n, i) => ({
    id: n.id,
    position: { x: i * 220, y: 0 },
    type: 'default',
    class: `rounded-lg border px-3 py-2 text-nexa-small-medium ${colorByType[n.type]}`,
    data: { label: n.label },
  })),
);

const flowEdges = computed(() =>
  props.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.guard ?? '',
    labelStyle: { fill: 'var(--ui-text-muted)', fontSize: 11 },
    style: { stroke: 'var(--ui-border-accented)' },
  })),
);
</script>

<template>
  <div class="h-full w-full overflow-hidden rounded-xl border border-default bg-default">
    <VueFlow v-model:nodes="flowNodes" v-model:edges="flowEdges" fit-view-on-init :min-zoom="0.25" :max-zoom="2" class="bg-default">
      <template #node-label="nodeData">
        <span class="text-nexa-small-medium">{{ nodeData.label }}</span>
      </template>
    </VueFlow>
  </div>
</template>
