import type { Shop, Product } from './types';

// Dati di esempio, solo per progettare l'interfaccia.
// In futuro questo file verra' sostituito da chiamate al database Neon
// (alimentato dalla pipeline Discord -> GitHub Action). Il catalogo
// oggetti invece resta statico: vedi src/lib/items.ts + src/data/items.json.

const CURRENCY = 'Essence';

export const shops: Shop[] = [
  {
    slug: 'emporio-redcliff',
    name: 'Emporio di Redcliff',
    owner: 'Steve_IT',
    x: 245,
    z: -1023,
    dimension: 'overworld',
    description:
      "Il negozio generalista piu' fornito del server: dai blocchi da costruzione base ai materiali per l'incantamento. Steve rifornisce lo shop ogni sera dopo le 21:00.",
    directions:
      "Dallo spawn, segui la strada di quarzo verso ovest per circa 900 blocchi. Il negozio e' la struttura in pietra rossa con l'insegna a forma di incudine, subito dopo il ponte sul fiume.",
    online: true,
    lastUpdated: '2026-09-27T07:40:00Z',
  },
  {
    slug: 'bazaar-nether',
    name: 'Bazaar del Nether',
    owner: 'xXPigliaXx',
    x: -812,
    z: 340,
    dimension: 'nether',
    description:
      'Specializzato in materiali del Nether: quarzo, ghisa di netherite e blaze rod. Prezzi che oscillano con il rischio del viaggio.',
    directions:
      "Prendi il portale pubblico vicino allo spawn, esci e vai a nord seguendo i binari sopraelevati. Attenzione ai ghast nell'ultimo tratto.",
    online: true,
    lastUpdated: '2026-09-27T06:55:00Z',
  },
  {
    slug: 'magazzino-ender',
    name: "Magazzino dell'Ender",
    owner: 'EnderTrader',
    x: 100,
    z: 100,
    dimension: 'end',
    description:
      "Oggetti rari da fine gioco: elitre, perle dell'ender e totem. Stock limitato, si consiglia di controllare prima di partire.",
    directions:
      "Raggiungibile solo via portale privato: chiedi le coordinate del portale in chat #negozi su Discord prima di partire.",
    online: false,
    lastUpdated: '2026-09-26T22:10:00Z',
  },
  {
    slug: 'fattoria-grano-oro',
    name: "Fattoria del Grano d'Oro",
    owner: 'ContadinoMax',
    x: 50,
    z: 780,
    dimension: 'overworld',
    description:
      'Prodotti agricoli freschi ogni giorno: grano, canna da zucchero, cacao e carote. Sconti sugli acquisti a stack pieno.',
    directions:
      "A sud dello spawn, segui il fiume fino ai campi terrazzati visibili dal ponte principale. Campana all'ingresso per chiamare il venditore.",
    online: true,
    lastUpdated: '2026-09-27T08:05:00Z',
  },
  {
    slug: 'ferramenta-deepslate',
    name: 'Ferramenta di Deepslate',
    owner: 'MinatoreJoe',
    x: -300,
    z: -50,
    dimension: 'overworld',
    description:
      'Minerali grezzi e lingotti a prezzo di miniera: ferro, rame, oro e un rifornimento occasionale di diamante grezzo.',
    directions:
      "Ingresso della miniera principale a ovest dello spawn, scendi la scala a chiocciola fino al livello -40.",
    online: true,
    lastUpdated: '2026-09-27T05:20:00Z',
  },
  {
    slug: 'empireo-incantesimi',
    name: 'Empireo degli Incantesimi',
    owner: 'ArcanoLuna',
    x: 900,
    z: -400,
    dimension: 'overworld',
    description:
      "Libri incantati e materiali per l'incantamento: lapislazuli, occhi dell'ender e libri su ordinazione.",
    directions:
      "Torre viola visibile dallo spawn a est, in cima alla collina. Usa la rampa di elytra o sali per la scala esterna.",
    online: true,
    lastUpdated: '2026-09-27T07:15:00Z',
  },
];

export const products: Product[] = [
  // Emporio di Redcliff — vende materiali da costruzione
  { slug: 'assi-quercia', minecraftId: 'minecraft:oak_planks', shopSlug: 'emporio-redcliff', currency: CURRENCY,
    sell: { unitPrice: 0.2, stackPrice: 8, quantity: 4032 }, buy: null },
  { slug: 'vetro', minecraftId: 'minecraft:glass', shopSlug: 'emporio-redcliff', currency: CURRENCY,
    sell: { unitPrice: 0.3, stackPrice: 12, quantity: 1728 }, buy: null },
  { slug: 'lana-rossa', minecraftId: 'minecraft:red_wool', shopSlug: 'emporio-redcliff', currency: CURRENCY,
    sell: { unitPrice: 0.5, stackPrice: 24, quantity: 512 }, buy: null },
  { slug: 'rotaie', minecraftId: 'minecraft:rail', shopSlug: 'emporio-redcliff', currency: CURRENCY,
    sell: { unitPrice: 0.4, stackPrice: null, quantity: 960 }, buy: null },

  // Bazaar del Nether — vende materiali rari, e ricompra i frammenti di netherite
  { slug: 'quarzo-nether', minecraftId: 'minecraft:quartz', shopSlug: 'bazaar-nether', currency: CURRENCY,
    sell: { unitPrice: 0.6, stackPrice: 28, quantity: 2240 }, buy: null },
  { slug: 'blaze-rod', minecraftId: 'minecraft:blaze_rod', shopSlug: 'bazaar-nether', currency: CURRENCY,
    sell: { unitPrice: 3.5, stackPrice: 190, quantity: 96 }, buy: null },
  { slug: 'frammento-netherite', minecraftId: 'minecraft:netherite_scrap', shopSlug: 'bazaar-nether', currency: CURRENCY,
    sell: { unitPrice: 22, stackPrice: null, quantity: 6 },
    buy: { unitPrice: 18, stackPrice: null, quantity: 64 } },
  { slug: 'ghisa-antica', minecraftId: 'minecraft:ancient_debris', shopSlug: 'bazaar-nether', currency: CURRENCY,
    sell: { unitPrice: 9, stackPrice: 520, quantity: 64 },
    buy: { unitPrice: 6.5, stackPrice: 380, quantity: 128 } },

  // Magazzino dell'Ender — solo vendita, oggetti rari
  { slug: 'elitra', minecraftId: 'minecraft:elytra', shopSlug: 'magazzino-ender', currency: CURRENCY,
    sell: { unitPrice: 260, stackPrice: null, quantity: 1 }, buy: null },
  { slug: 'perla-ender', minecraftId: 'minecraft:ender_pearl', shopSlug: 'magazzino-ender', currency: CURRENCY,
    sell: { unitPrice: 4.2, stackPrice: 250, quantity: 48 },
    buy: { unitPrice: 3, stackPrice: 180, quantity: 320 } },
  { slug: 'totem-immortalita', minecraftId: 'minecraft:totem_of_undying', shopSlug: 'magazzino-ender', currency: CURRENCY,
    sell: { unitPrice: 95, stackPrice: null, quantity: 3 }, buy: null },

  // Fattoria del Grano d'Oro — vende e ricompra prodotti agricoli
  { slug: 'frumento', minecraftId: 'minecraft:wheat', shopSlug: 'fattoria-grano-oro', currency: CURRENCY,
    sell: { unitPrice: 0.1, stackPrice: 4, quantity: 3200 },
    buy: { unitPrice: 0.05, stackPrice: 2, quantity: 5000 } },
  { slug: 'canna-zucchero', minecraftId: 'minecraft:sugar_cane', shopSlug: 'fattoria-grano-oro', currency: CURRENCY,
    sell: { unitPrice: 0.15, stackPrice: 6, quantity: 1856 }, buy: null },
  { slug: 'fave-cacao', minecraftId: 'minecraft:cocoa_beans', shopSlug: 'fattoria-grano-oro', currency: CURRENCY,
    sell: { unitPrice: 0.3, stackPrice: 14, quantity: 640 }, buy: null },
  { slug: 'carote', minecraftId: 'minecraft:carrot', shopSlug: 'fattoria-grano-oro', currency: CURRENCY,
    sell: { unitPrice: 0.1, stackPrice: 4, quantity: 0 },
    buy: { unitPrice: 0.05, stackPrice: 2, quantity: 2000 } },

  // Ferramenta di Deepslate — vende e ricompra minerali grezzi
  { slug: 'ferro-grezzo', minecraftId: 'minecraft:raw_iron', shopSlug: 'ferramenta-deepslate', currency: CURRENCY,
    sell: { unitPrice: 1.2, stackPrice: 60, quantity: 1280 },
    buy: { unitPrice: 0.9, stackPrice: 45, quantity: 3000 } },
  { slug: 'rame-grezzo', minecraftId: 'minecraft:raw_copper', shopSlug: 'ferramenta-deepslate', currency: CURRENCY,
    sell: { unitPrice: 0.5, stackPrice: 22, quantity: 2048 }, buy: null },
  { slug: 'oro-grezzo', minecraftId: 'minecraft:raw_gold', shopSlug: 'ferramenta-deepslate', currency: CURRENCY,
    sell: { unitPrice: 2.4, stackPrice: 130, quantity: 384 }, buy: null },
  { slug: 'diamante-grezzo', minecraftId: 'minecraft:diamond', shopSlug: 'ferramenta-deepslate', currency: CURRENCY,
    sell: { unitPrice: 14, stackPrice: null, quantity: 18 },
    buy: { unitPrice: 11, stackPrice: null, quantity: 200 } },

  // Empireo degli Incantesimi — vende materiali da incantamento
  { slug: 'lapislazuli', minecraftId: 'minecraft:lapis_lazuli', shopSlug: 'empireo-incantesimi', currency: CURRENCY,
    sell: { unitPrice: 0.4, stackPrice: 20, quantity: 960 }, buy: null },
  { slug: 'occhio-ender', minecraftId: 'minecraft:ender_eye', shopSlug: 'empireo-incantesimi', currency: CURRENCY,
    sell: { unitPrice: 5, stackPrice: 300, quantity: 32 }, buy: null },
  { slug: 'libro-incantato', minecraftId: 'minecraft:enchanted_book', shopSlug: 'empireo-incantesimi', currency: CURRENCY,
    sell: { unitPrice: 40, stackPrice: null, quantity: 6 }, buy: null },
];

export function getShopBySlug(slug: string): Shop | undefined {
  return shops.find((s) => s.slug === slug);
}

export function getProductsByShop(shopSlug: string): Product[] {
  return products.filter((p) => p.shopSlug === shopSlug);
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}
