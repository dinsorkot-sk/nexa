<template>
  <main class="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
    <div class="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-400">
        Nexa ERP
      </p>
      <h1 class="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Business operations that fit your team.
      </h1>
      <p class="mt-6 max-w-2xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">
        An open-source ERP for wholesale and distribution, starting with sales, purchasing, and inventory.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton disabled>
          Project setup in progress
        </UButton>
        <UButton color="neutral" variant="outline" disabled>
          ERP workspace coming next
        </UButton>
      </div>
      <p class="mt-12 text-sm text-neutral-500 dark:text-neutral-400">
        Self-hosted first · Built with Nuxt · Powered by SQLite (integration in progress)
      </p>
    </div>
  </main>
</template>
