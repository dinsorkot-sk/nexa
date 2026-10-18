<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui';

/**
 * Short hint on hover or focus, as the mockup's Tooltip section: an inverted surface with an optional keyboard
 * shortcut. `text` is required and is the tooltip's content; the trigger is the default slot.
 */
withDefaults(defineProps<{
  text: string;
  delayDuration?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Shortcut shown next to the text, for example "K". */
  kbd?: string;
}>(), {
  delayDuration: 300,
  side: 'top',
  kbd: undefined,
});
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
          class="z-50 flex items-center gap-2 rounded-ui-sm bg-ui-bg-inverted px-2 py-1 text-xs text-ui-text-inverted data-[state=closed]:animate-ui-pop-out data-[state=delayed-open]:animate-ui-pop-in data-[state=instant-open]:animate-ui-pop-in"
        >
          {{ text }}
          <kbd
            v-if="kbd"
            class="rounded-ui-xs border border-ui-text-muted px-1 font-mono text-[11px]"
          >{{ kbd }}</kbd>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
