<script setup lang="ts">
import UiPagination from './UiPagination.vue';
</script>

<template>
  <Story
    title="Pagination"
    group="Primitives"
  >
    <Variant title="First page">
      <div class="p-4">
        <UiPagination
          :total="300"
          :limit="50"
          :offset="0"
        />
      </div>
    </Variant>
    <Variant title="Middle page">
      <div class="p-4">
        <UiPagination
          :total="300"
          :limit="50"
          :offset="100"
        />
      </div>
    </Variant>
    <Variant title="Last page">
      <div class="p-4">
        <UiPagination
          :total="300"
          :limit="50"
          :offset="250"
        />
      </div>
    </Variant>
    <Variant title="Single page">
      <div class="p-4">
        <UiPagination
          :total="12"
          :limit="50"
          :offset="0"
        />
      </div>
    </Variant>
  </Story>
</template>
