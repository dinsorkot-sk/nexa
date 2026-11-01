<script setup lang="ts">
import { Chart, registerables } from 'chart.js';
import { Doughnut } from 'vue-chartjs';

Chart.register(...registerables);

const props = defineProps<{
  labels: string[];
  values: number[];
  title?: string;
}>();

const colorMode = useColorMode();
const series = computed(() => (colorMode.value === 'dark'
  ? ['#00dc82', '#60a5fa', '#facc15', '#f87171', '#94a3b8', '#a78bfa']
  : ['#00c16a', '#3b82f6', '#eab308', '#ef4444', '#64748b', '#8b5cf6']));

const data = computed(() => ({
  labels: props.labels,
  datasets: [{ label: props.title ?? '', data: props.values, backgroundColor: series.value.slice(0, props.labels.length) }],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '60%',
  plugins: { legend: { position: 'right', labels: { color: themeText.value, boxWidth: 12 } } },
}));

const themeText = computed(() => (colorMode.value === 'dark' ? '#cbd5e1' : '#475569'));
</script>

<template>
  <Doughnut :data="data" :options="options" />
</template>
