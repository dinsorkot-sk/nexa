<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';
import NxNavItem from './NxNavItem.vue';

export interface NxSidebarItem {
  label: string;
  href?: string;
  icon?: import('vue').Component;
  active?: boolean;
  count?: string | number;
}

export interface NxSidebarGroup {
  label: string;
  items: NxSidebarItem[];
}

const props = withDefaults(defineProps<{
  groups: NxSidebarGroup[];
  collapsed?: boolean;
  label: string;
}>(), { collapsed: false });

const emit = defineEmits<{ 'update:collapsed': [collapsed: boolean] }>();
const toggleLabel = computed(() => props.collapsed ? 'Expand sidebar' : 'Collapse sidebar');
</script>

<template>
  <aside
    :aria-label="label"
    :class="[
      'flex h-full flex-col border-r border-ui-border bg-ui-bg-muted transition-[width] duration-ui-slow ease-ui-out',
      collapsed ? 'w-16' : 'w-62',
    ]"
  >
    <div class="flex min-h-14 items-center justify-between gap-2 border-b border-ui-border px-3">
      <slot name="brand">
        <span
          v-if="!collapsed"
          class="truncate text-sm font-semibold text-ui-text-highlighted"
        >Nexa</span>
      </slot>
      <button
        type="button"
        :aria-label="toggleLabel"
        :aria-expanded="!collapsed"
        class="rounded p-1.5 text-ui-text-muted outline-none transition-colors duration-ui-fast ease-ui-out hover:bg-ui-bg-elevated focus-visible:ring-2 focus-visible:ring-ui-primary"
        @click="emit('update:collapsed', !collapsed)"
      >
        <ChevronRight
          v-if="collapsed"
          class="size-4"
          aria-hidden="true"
        />
        <ChevronLeft
          v-else
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </div>
    <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <section
        v-for="group in groups"
        :key="group.label"
      >
        <h2
          v-if="!collapsed"
          class="mb-1 px-3 text-xs font-medium text-ui-text-muted"
        >
          {{ group.label }}
        </h2>
        <ul class="space-y-1">
          <li
            v-for="item in group.items"
            :key="item.label"
          >
            <NxNavItem
              :href="item.href"
              :active="item.active"
              :icon="item.icon"
              :aria-label="collapsed ? item.label : undefined"
              :title="collapsed ? item.label : undefined"
            >
              <span
                v-if="!collapsed"
                class="min-w-0 flex-1 truncate"
              >{{ item.label }}</span>
              <span
                v-if="!collapsed && item.count !== undefined"
                class="text-xs text-ui-text-muted"
              >{{ item.count }}</span>
            </NxNavItem>
          </li>
        </ul>
      </section>
    </nav>
    <div
      v-if="$slots.footer"
      class="border-t border-ui-border p-3"
    >
      <slot name="footer" />
    </div>
  </aside>
</template>
