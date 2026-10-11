<script setup lang="ts">
import { ref } from 'vue';
import UiDateTimeInput from './UiDateTimeInput.vue';
import UiDatePicker from './UiDatePicker.vue';
import UiNumberInput from './UiNumberInput.vue';
import UiTimeInput from './UiTimeInput.vue';

const date = ref<string | undefined>('2026-10-11');
const time = ref<string | undefined>('14:30');
const instant = ref<string | undefined>('2026-10-11T07:30:00.000Z');
const amount = ref<number | undefined>(1234.5);
</script>

<template>
  <Story title="Primitives/Date, time and number inputs">
    <Variant title="Date picker (Thai shows Buddhist Era; the value stays Gregorian)">
      <div class="grid max-w-sm gap-2 p-4">
        <UiDatePicker v-model="date" />
        <p class="text-xs text-foreground-muted">
          Stored value: {{ date ?? '(empty)' }}
        </p>
      </div>
    </Variant>
    <Variant title="Time of day">
      <div class="grid max-w-sm gap-2 p-4">
        <UiTimeInput v-model="time" />
        <p class="text-xs text-foreground-muted">
          Stored value: {{ time ?? '(empty)' }}
        </p>
      </div>
    </Variant>
    <Variant title="Date and time (shown local, stored UTC)">
      <div class="grid max-w-sm gap-2 p-4">
        <UiDateTimeInput v-model="instant" />
        <p class="text-xs text-foreground-muted">
          Stored value: {{ instant ?? '(empty)' }}
        </p>
      </div>
    </Variant>
    <Variant title="Number (empty stays empty)">
      <div class="grid max-w-sm gap-2 p-4">
        <UiNumberInput
          v-model="amount"
          :precision="2"
        />
        <p class="text-xs text-foreground-muted">
          Stored value: {{ amount === undefined ? '(empty)' : amount }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
