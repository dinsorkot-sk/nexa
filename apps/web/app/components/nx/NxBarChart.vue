<script setup lang="ts">
import { Chart, registerables } from 'chart.js';
import { Bar } from 'vue-chartjs';

Chart.register(...registerables);

const props = defineProps<{
  labels: string[];
  values: number[];
  title?: string;
}>();

const colorMode = useColorMode();
const theme = computed(() => (colorMode.value === 'dark'
  ? { series: '#00dc82', text: '#cbd5e1', grid: '#1e293b' }
  : { series: '#00c16a', text: '#475569', grid: '#e2e8f0' }));

const data = computed(() => ({
  labels: props.labels,
  datasets: [{ label: props.title ?? '', data: props.values, backgroundColor: theme.value.series, borderRadius: 6, maxBarThickness: 40 }],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: theme.value.text }, grid: { display: false } },
    y: { ticks: { color: theme.value.text }, grid: { color: theme.value.grid } },
  },
}));
</script>

<template>
  <Bar :data="data" :options="options" />
</template>
