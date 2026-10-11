<template>
  <TooltipProvider :delay-duration="delay">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="6"
          :class="cn('z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg', props.class)"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'radix-vue';
import { cn } from '../cn';

const props = withDefaults(defineProps<{
  /** Short supplementary text. A tooltip must never be the only place essential information appears. */
  text: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  class?: string;
}>(), { side: 'top', delay: 300, class: undefined });
</script>
