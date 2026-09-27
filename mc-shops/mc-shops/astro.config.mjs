import { defineConfig } from 'astro/config';

// Output statico: pensato per Cloudflare Pages.
// Quando collegheremo il database Neon (via un endpoint/API), si potrà
// passare a output: 'server' con l'adapter @astrojs/cloudflare senza
// riscrivere le pagine, solo lo strato dati in src/lib.
export default defineConfig({
  site: 'https://mc-shops.pages.dev',
  output: 'static',
  server: { port: 4321 },
});
