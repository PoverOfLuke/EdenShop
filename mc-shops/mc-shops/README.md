# EdenShop — gestione negozi Minecraft

Progetto Astro (statico) che disegna struttura ed estetica del pannello di
gestione dei negozi del server. I dati dei negozi/prodotti sono ancora
di esempio in `src/lib/mockData.ts`; il **catalogo oggetti Minecraft**
(`src/data/items.json` + `public/items/*.png`) è invece già reale.

## Struttura

```
src/
  layouts/BaseLayout.astro     layout con navbar orizzontale in cima
  components/                  Navbar, Topbar, ShopCard, ProductCard
  lib/types.ts                 tipi CatalogItem / Shop / Product
  lib/items.ts                 helper per leggere src/data/items.json
  lib/mockData.ts              dati di esempio negozi/prodotti (da sostituire con Neon)
  data/items.json              catalogo statico Minecraft 1.21.11
  pages/
    index.astro                Home con i widget
    login.astro                accesso venditori (solo form, non collegato)
    negozi/index.astro         elenco negozi
    negozi/[slug].astro        dettaglio negozio + suoi prodotti
    prodotti/index.astro       elenco prodotti con ricerca e filtri
    prodotti/[slug].astro      dettaglio prodotto, con link al negozio
public/
  items/*.png                  icone del catalogo, una per oggetto
```

> Nota sul catalogo: `src/data/items.json` in questo pacchetto contiene
> solo un piccolo **estratto dimostrativo** (gli oggetti usati nei dati di
> esempio). Nel repository reale questo file contiene i 1505 item ufficiali
> con le loro immagini in `public/items/` — **non sovrascriverlo**, ha già
> lo stesso formato (`name`, `minecraft_id`, `category`, `image_url`).

## Modello dati prodotto

Ogni prodotto collega un negozio a un oggetto del catalogo tramite
`minecraftId` (es. `minecraft:diamond`) e può avere due direzioni,
indipendenti tra loro:

- `sell` — il negozio **vende** l'oggetto ai giocatori (prezzo a unità
  e/o a stack da 64, quantità disponibile)
- `buy` — il negozio **compra** l'oggetto dai giocatori (prezzo a unità
  e/o a stack da 64, quantità richiesta)

Un prodotto è pubblicabile solo se almeno una delle due direzioni è
presente (non serve che ci siano entrambe). La valuta attuale è
**Essence**.

## Pagine e funzioni

- **Home** (`/`): widget di riepilogo (negozi attivi, prodotti totali,
  valore stimato in vendita, prodotti esauriti) più attività recente e
  scorte basse. Navbar orizzontale in cima, con "Login venditori" sempre
  visibile a destra.
- **Negozi** (`/negozi`, `/negozi/[slug]`): elenco negozi; ogni negozio ha
  coordinate (X/Z), descrizione, indicazioni per raggiungerlo e la sua
  lista prodotti.
- **Prodotti** (`/prodotti`, `/prodotti/[slug]`): elenco di tutti i
  prodotti, con ricerca testuale e filtri per categoria, negozio e tipo
  di offerta (vende/compra). Ogni prodotto mostra l'icona reale
  dell'oggetto (da `items.json`), i prezzi di vendita e/o acquisto, e un
  link diretto al negozio.
- **Login** (`/login`): form per l'accesso dei venditori (solo interfaccia).

## Prossimi passi (collegamento dati reali)

1. Sostituire le funzioni in `src/lib/mockData.ts` con chiamate a un
   endpoint che legge da Neon i dati dinamici dei negozi (chi vende/compra
   cosa, prezzo, quantità), collegati agli oggetti del catalogo tramite
   `minecraft_id`. Il catalogo (`items.json`) resta statico e non va
   duplicato su Neon.
2. Se serve rendering dinamico (dati sempre aggiornati senza rebuild),
   valutare `output: 'server'` in `astro.config.mjs` con un adapter
   compatibile — non necessario adesso.
3. Il login venditori andrà collegato a un sistema di autenticazione reale.

## Sviluppo locale

```
npm install
npm run dev
```

## Deploy

Il progetto è pensato per Cloudflare Workers (static assets), con
`wrangler.jsonc` che punta alla cartella `dist` generata da `npm run build`.
