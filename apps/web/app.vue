<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
    <div class="max-w-xl w-full border border-slate-800 rounded-xl bg-slate-900/50 p-8 shadow-2xl backdrop-blur">
      <div class="flex items-center space-x-3 mb-6">
        <div class="w-4 h-4 rounded-full bg-emerald-500 animate-pulse"></div>
        <h1 class="text-2xl font-bold tracking-tight">Nexa Platform</h1>
        <span class="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">v0.0.1</span>
      </div>

      <p class="text-slate-400 text-sm mb-6 leading-relaxed">
        Metadata-driven business application platform. Nuxt 4 + Hono + shadcn-vue + PostgreSQL / PGlite.
      </p>

      <div class="space-y-3 font-mono text-xs">
        <div class="flex justify-between items-center p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span class="text-slate-400">API Runtime</span>
          <span class="text-emerald-400">Hono on Nitro (/api/v1)</span>
        </div>
        <div class="flex justify-between items-center p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span class="text-slate-400">Source of Truth</span>
          <span class="text-blue-400">@nexa/meta (Zod)</span>
        </div>
        <div class="flex justify-between items-center p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span class="text-slate-400">Persistence</span>
          <span class="text-purple-400">Drizzle + PGlite / Postgres</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Basic setup for Nexa web application
</script>
