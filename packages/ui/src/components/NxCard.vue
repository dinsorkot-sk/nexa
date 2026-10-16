<template>
  <div class="overflow-hidden rounded-ui border border-ui-border bg-ui-bg">
    <div
      v-if="$slots.header"
      class="border-b border-ui-border px-4 py-3"
    >
      <slot name="header" />
    </div>
    <div class="p-4">
      <slot />
    </div>
    <div
      v-if="$slots.footer"
      class="border-t border-ui-border bg-ui-bg-muted px-4 py-3"
    >
      <slot name="footer" />
    </div>
  </div>
</template>
