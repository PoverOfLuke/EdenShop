# EdenShop — gestione negozi Minecraft

Progetto Astro (statico) con un Worker Cloudflare che fa da API: le pagine
sono HTML statico, ma tutti i dati di negozi e prodotti arrivano da **Neon**
via endpoint JSON del Worker. Il **catalogo oggetti Minecraft**
(`src/data/items.json` + `public/items/*.png`) resta statico e non viene
duplicato su Neon.

> Nota: l'interfaccia del sito (testi, pagine, URL) è in inglese; questo
> README resta in italiano perché è documentazione di sviluppo, non
> contenuto del sito.

## Struttura

```
src/
  layouts/BaseLayout.astro     layout con navbar orizzontale in cima
  components/                  Navbar, Topbar
  data/items.json              catalogo statico Minecraft (1505 item)
  pages/
    index.astro                Home con i widget
    login.astro                accesso venditori via Discord
    shops/index.astro          elenco negozi
    shops/detail.astro         dettaglio negozio + suoi prodotti (?slug=)
    products/index.astro       elenco prodotti con ricerca e filtri
    products/detail.astro      dettaglio prodotto, con link al negozio (?id=)
    dashboard.astro            i miei negozi (crea/modifica)
    dashboard/products.astro   gestione prodotti di un negozio (?shop=)
  styles/global.css
worker/
  index.ts                     router: /api/* + fallback agli asset statici
  db.ts                        query Neon (merchants, shops, shop_items)
  catalog.ts                   lettura di src/data/items.json
  discord.ts                   OAuth2 Discord
  session.ts                   cookie di sessione firmato (HMAC)
  env.d.ts                     tipo Env con i secret richiesti
public/
  items/*.png                  icone del catalogo, una per oggetto
astro.config.mjs
wrangler.jsonc                 deploy Worker + asset da dist/
```

> Le pagine `detail` non sono route dinamiche: `detail.astro` è un file
> statico che legge `?slug=` / `?id=` e chiama l'API lato browser. Quindi
> i dettagli restano accessibili anche senza rebuild quando i dati cambiano.

## Modello dati

Tre tabelle su Neon:

- `merchants` — `discord_user_id`, `discord_username`, `display_name`,
  `approved`. Al primo login la riga viene creata con `approved = false`;
  finché un admin non la approva l'accesso al dashboard resta negato.
- `shops` — `merchant_id`, `name`, `slug` (univoco), `x`, `z`,
  `description`, `directions`.
- `shop_items` — i prodotti di un negozio, univochi su
  `(shop_id, minecraft_id)`. La tabella viene creata automaticamente da
  `ensureShopItemsTable()` al primo accesso, quindi non serve una migration
  manuale.

Ogni `shop_items` memorizza solo il `minecraft_id` (es.
`minecraft:diamond`); nome, categoria e immagine vengono risolti al momento
della lettura contro il catalogo statico.

Ogni prodotto ha due direzioni indipendenti, ciascuna nella versione
**non compattata** e **compattata**:

- `sell_amount` / `sell_price` — il negozio **vende** ai giocatori
  (con `quantity` e `compacted_quantity` come scorte disponibili)
- `buy_amount` / `buy_price` — il negozio **compra** dai giocatori, entro
  il budget condiviso `essence_quantity`

Una direzione vale solo se **sia** amount **sia** price sono valorizzati: un
campo isolato viene trattato come non configurato. Un prodotto richiede
almeno una delle quattro coppie. I prezzi sono `NUMERIC(12,2)` e la valuta
è **Essence**.

## Pagine e funzioni

- **Home** (`/`): widget di riepilogo (negozi registrati, prodotti
  configurati, valore totale in vendita, prodotti esauriti) più i negozi più
  recenti e le scorte basse.
- **Negozi** (`/shops`, `/shops/detail?slug=`): elenco dei negozi; ogni
  negozio ha coordinate (X/Z), descrizione, indicazioni per raggiungerlo e
  la sua lista prodotti.
- **Prodotti** (`/products`, `/products/detail?id=`): elenco di tutti i
  prodotti, con ricerca testuale e filtri per categoria, negozio e tipo di
  offerta (vende/compra). Ogni prodotto mostra l'icona reale dell'oggetto,
  i prezzi di vendita e/o acquisto, e un link diretto al negozio.
- **Login** (`/login`): accesso venditori tramite Discord OAuth2.
- **Dashboard** (`/dashboard`, `/dashboard/products?shop=`): area riservata
  al venditore approvato — crea e modifica i propri negozi e gestisce i
  prodotti di ciascuno (aggiunta, modifica, eliminazione).

## API

Endpoint pubblici, senza autenticazione (stessi dati già visibili nel sito):

| Metodo | Path | Descrizione |
| --- | --- | --- |
| GET | `/api/shops` | tutti i negozi |
| GET | `/api/shops/:slug` | un negozio |
| GET | `/api/shops/:slug/items` | un negozio con i suoi prodotti |
| GET | `/api/products` | tutti i prodotti, con dati del negozio |
| GET | `/api/products/:id` | un prodotto |
| GET | `/api/catalog/search?q=` | ricerca nel catalogo (max 30) |

Autenticazione:

| Metodo | Path | Descrizione |
| --- | --- | --- |
| GET | `/api/auth/discord` | avvia l'OAuth2 Discord |
| GET | `/api/auth/discord/callback` | callback: crea/aggiorna il merchant, imposta il cookie |
| GET | `/api/auth/me` | dati del venditore loggato |
| GET | `/api/auth/logout` | cancella il cookie |

Endpoint venditore (richiedono un merchant **approvato**; ogni shop
verificata anche la proprietà):

| Metodo | Path | Descrizione |
| --- | --- | --- |
| GET, POST | `/api/merchant/shops` | lista / crea i propri negozi |
| PUT | `/api/merchant/shops/:id` | aggiorna un negozio |
| GET, POST | `/api/merchant/shops/:id/items` | lista / aggiunge prodotti |
| PUT, DELETE | `/api/merchant/shops/:id/items/:itemId` | aggiorna / elimina un prodotto |

Tutte le richieste non gestite ricadono su `env.ASSETS.fetch(request)`,
cioè il sito statico.

## Variabili d'ambiente

Secret da configurare su Cloudflare
(`npx wrangler secret put <NAME>` per i nuovi):

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` —
  app OAuth2 Discord
- `SESSION_SECRET` — chiave HMAC per firmare il cookie di sessione
- `NEON_DATABASE_URL` — stringa di connessione Neon

## Catalogo

`src/data/items.json` contiene i 1505 item ufficiali e `public/items/` le
1505 immagini corrispondenti, entrambi **versionati nel repo** — non
sovrascriverli, il formato (`name`, `minecraft_id`, `category`,
`image_url`) è quello che si aspetta `worker/catalog.ts`.

## Sviluppo locale

```
npm install
npm run dev
```

Il Worker non gira con `astro dev`: per provare gli endpoint con dati reali
serve `npm run deploy` (build + `wrangler deploy`) e le variabili
d'ambiente sopra.

Typecheck (il worker ha un `tsconfig.json` separato ed è escluso da quello
principale):

```
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p worker/tsconfig.json
```

## Deploy

```
npm run deploy     # astro build && wrangler deploy
```

Il progetto è pensato per Cloudflare Workers: `wrangler.jsonc` dichiara
`worker/index.ts` come entrypoint e `dist/` come asset statici.

## Da fare

1. **Rimuovere `/api/debug/env`** in `worker/index.ts`. È un endpoint
   temporaneo, marcato come tale nel codice, che espone quali secret sono
   configurati. Va tolto una volta confermato il problema di binding delle
   variabili d'ambiente.
2. Gestire l'approvazione dei merchant: oggi `merchants.approved` va
   cambiata a mano su Neon, non c'è ancora un flusso admin.
3. Definire il ruolo "admin" per approvare i venditori, se serve.
