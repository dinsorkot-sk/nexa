<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui';

withDefaults(defineProps<{
  text: string;
  delayDuration?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
}>(), { delayDuration: 300, side: 'top' });
</script>

<template>
  <TooltipProvider>
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="6"
          :delay-duration="delayDuration"
          class="z-50 rounded-ui bg-ui-bg-inverted px-2 py-1 text-xs text-ui-text-inverted"
        >
          {{ text }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
