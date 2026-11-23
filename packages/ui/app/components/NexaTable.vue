<script setup lang="ts" generic="T extends TableData">
import type { TableColumn, TableData } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  data: T[]
  columns: TableColumn<T>[]
  loading?: boolean
  empty?: string
}>(), {
  empty: 'No records found.',
})
</script>

<template>
  <UTable
    :data="props.data"
    :columns="props.columns"
    :loading="props.loading"
    :empty="props.empty"
    class="rounded-lg ring ring-default"
  >
    <template v-if="$slots.caption" #caption>
      <slot name="caption" />
    </template>
    <template v-if="$slots.empty" #empty>
      <slot name="empty" />
    </template>
  </UTable>
</template>
