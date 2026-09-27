# Ledger — gestione negozi Minecraft

Progetto Astro (statico) che disegna struttura ed estetica del pannello di
gestione dei negozi del server. Per ora **non è collegato a nessun database**:
tutti i dati vengono da `src/lib/mockData.ts`.

## Struttura

```
src/
  layouts/BaseLayout.astro     layout con sidebar + topbar
  components/                  Sidebar, Topbar, ShopCard, ProductCard
  lib/types.ts                 tipi Shop / Product
  lib/mockData.ts              dati di esempio (da sostituire con Neon)
  pages/
    index.astro                dashboard con i widget
    login.astro                accesso venditori (solo form, non collegato)
    negozi/index.astro         elenco negozi
    negozi/[slug].astro        dettaglio negozio + suoi prodotti
    prodotti/index.astro       elenco prodotti con ricerca e filtri
    prodotti/[slug].astro      dettaglio prodotto, con link al negozio
```

## Pagine e funzioni

- **Dashboard**: widget di riepilogo (negozi attivi, prodotti totali, valore
  stock stimato, prodotti esauriti) più attività recente e scorte basse.
  I widget definitivi sono da decidere insieme — questi sono un punto di
  partenza sensato da modificare.
- **Negozi**: elenco di tutti i negozi; ogni negozio ha coordinate (X/Z),
  descrizione e indicazioni per raggiungerlo, più la sua lista prodotti.
- **Prodotti**: elenco di tutti i prodotti di tutti i negozi, con ricerca
  testuale (client-side, in `prodotti/index.astro`) e filtri per categoria
  e negozio. Ogni prodotto porta a una pagina di dettaglio con link diretto
  al negozio che lo vende.
- **Login**: form per l'accesso dei venditori (solo interfaccia, nessuna
  autenticazione reale collegata).

## Prossimi passi (collegamento dati reali)

Quando si vorrà collegare Neon:
1. Sostituire le funzioni in `src/lib/mockData.ts` con chiamate a un endpoint
   (es. una API route o un piccolo backend) che legge dal database Neon.
2. Se serve rendering dinamico (dati sempre aggiornati senza rebuild), passare
   `output: 'server'` in `astro.config.mjs` e aggiungere l'adapter
   `@astrojs/cloudflare`.
3. Il login venditori andrà collegato a un sistema di sessioni/autenticazione
   reale (es. Cloudflare Access, o JWT emesso da un endpoint dedicato).

## Sviluppo locale

```
npm install
npm run dev
```

## Deploy su Cloudflare Pages

- Comando di build: `npm run build`
- Cartella di output: `dist`
- Framework preset: Astro
