<script setup lang="ts">
defineOptions({ name: 'LandingRedirectPage' })

await navigateTo('/studio', { replace: true })
</script>

<template>
  <UProgress animation="carousel" aria-label="Opening Studio" />
</template>
