<script setup lang="ts">
import { ref } from 'vue';
import UiLinkField from './UiLinkField.vue';

const file = ref<string | undefined>('https://example.com/report.pdf');
const image = ref<string | undefined>(`${location.origin}/sample.svg`);
const unsafe = ref<string | undefined>('javascript:alert(1)');
</script>

<template>
  <Story title="Fields/Link fields (file and image)">
    <Variant title="File (URL only; upload is not supported)">
      <div class="max-w-md p-4">
        <UiLinkField
          v-model="file"
          kind="file"
        />
      </div>
    </Variant>
    <Variant title="Image with preview">
      <div class="max-w-md p-4">
        <UiLinkField
          v-model="image"
          kind="image"
        />
      </div>
    </Variant>
    <Variant title="Unsafe address is refused, with no preview">
      <div class="max-w-md p-4">
        <UiLinkField
          v-model="unsafe"
          kind="image"
        />
      </div>
    </Variant>
  </Story>
</template>
