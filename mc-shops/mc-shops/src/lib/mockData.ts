import type { Shop, Product } from './types';

// Dati di esempio, solo per progettare l'interfaccia.
// In futuro questo file verra' sostituito da chiamate al database Neon
// (alimentato dalla pipeline Discord -> GitHub Action).

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
      "Libri incantati e materiali per l'incantamento: lapislazzuli, occhi dell'ender e libri su ordinazione.",
    directions:
      "Torre viola visibile dallo spawn a est, in cima alla collina. Usa la rampa di elytra o sali per la scala esterna.",
    online: true,
    lastUpdated: '2026-09-27T07:15:00Z',
  },
];

export const products: Product[] = [
  // Emporio di Redcliff
  { slug: 'assi-quercia', name: 'Assi di quercia', category: 'legno', stock: 4032, unitPrice: 0.2, stackPrice: 8, currency: 'smeraldi', shopSlug: 'emporio-redcliff' },
  { slug: 'vetro', name: 'Vetro', category: 'blocco', stock: 1728, unitPrice: 0.3, stackPrice: 12, currency: 'smeraldi', shopSlug: 'emporio-redcliff' },
  { slug: 'lana-rossa', name: 'Lana rossa', category: 'blocco', stock: 512, unitPrice: 0.5, stackPrice: 24, currency: 'smeraldi', shopSlug: 'emporio-redcliff' },
  { slug: 'rotaie', name: 'Rotaie', category: 'strumento', stock: 960, unitPrice: 0.4, stackPrice: null, currency: 'smeraldi', shopSlug: 'emporio-redcliff' },

  // Bazaar del Nether
  { slug: 'quarzo-nether', name: 'Quarzo del Nether', category: 'minerale', stock: 2240, unitPrice: 0.6, stackPrice: 28, currency: 'smeraldi', shopSlug: 'bazaar-nether' },
  { slug: 'blaze-rod', name: 'Blaze rod', category: 'raro', stock: 96, unitPrice: 3.5, stackPrice: 190, currency: 'smeraldi', shopSlug: 'bazaar-nether' },
  { slug: 'frammento-netherite', name: 'Frammento di netherite', category: 'raro', stock: 12, unitPrice: 18, stackPrice: null, currency: 'smeraldi', shopSlug: 'bazaar-nether' },
  { slug: 'ghisa-antica', name: 'Ghisa antica grezza', category: 'minerale', stock: 64, unitPrice: 9, stackPrice: 520, currency: 'smeraldi', shopSlug: 'bazaar-nether' },

  // Magazzino dell'Ender
  { slug: 'elitra', name: 'Elitra', category: 'raro', stock: 1, unitPrice: 260, stackPrice: null, currency: 'smeraldi', shopSlug: 'magazzino-ender' },
  { slug: 'perla-ender', name: "Perla dell'Ender", category: 'raro', stock: 48, unitPrice: 4.2, stackPrice: 250, currency: 'smeraldi', shopSlug: 'magazzino-ender' },
  { slug: 'totem-immortalita', name: "Totem dell'immortalita'", category: 'raro', stock: 3, unitPrice: 95, stackPrice: null, currency: 'smeraldi', shopSlug: 'magazzino-ender' },

  // Fattoria del Grano d'Oro
  { slug: 'frumento', name: 'Frumento', category: 'cibo', stock: 3200, unitPrice: 0.1, stackPrice: 4, currency: 'smeraldi', shopSlug: 'fattoria-grano-oro' },
  { slug: 'canna-zucchero', name: 'Canna da zucchero', category: 'cibo', stock: 1856, unitPrice: 0.15, stackPrice: 6, currency: 'smeraldi', shopSlug: 'fattoria-grano-oro' },
  { slug: 'fave-cacao', name: 'Fave di cacao', category: 'cibo', stock: 640, unitPrice: 0.3, stackPrice: 14, currency: 'smeraldi', shopSlug: 'fattoria-grano-oro' },
  { slug: 'carote', name: 'Carote', category: 'cibo', stock: 0, unitPrice: 0.1, stackPrice: 4, currency: 'smeraldi', shopSlug: 'fattoria-grano-oro' },

  // Ferramenta di Deepslate
  { slug: 'ferro-grezzo', name: 'Ferro grezzo', category: 'minerale', stock: 1280, unitPrice: 1.2, stackPrice: 60, currency: 'smeraldi', shopSlug: 'ferramenta-deepslate' },
  { slug: 'rame-grezzo', name: 'Rame grezzo', category: 'minerale', stock: 2048, unitPrice: 0.5, stackPrice: 22, currency: 'smeraldi', shopSlug: 'ferramenta-deepslate' },
  { slug: 'oro-grezzo', name: 'Oro grezzo', category: 'minerale', stock: 384, unitPrice: 2.4, stackPrice: 130, currency: 'smeraldi', shopSlug: 'ferramenta-deepslate' },
  { slug: 'diamante-grezzo', name: 'Diamante grezzo', category: 'gemma', stock: 18, unitPrice: 14, stackPrice: null, currency: 'smeraldi', shopSlug: 'ferramenta-deepslate' },

  // Empireo degli Incantesimi
  { slug: 'lapislazzuli', name: 'Lapislazzuli', category: 'gemma', stock: 960, unitPrice: 0.4, stackPrice: 20, currency: 'smeraldi', shopSlug: 'empireo-incantesimi' },
  { slug: 'occhio-ender', name: "Occhio dell'Ender", category: 'raro', stock: 32, unitPrice: 5, stackPrice: 300, currency: 'smeraldi', shopSlug: 'empireo-incantesimi' },
  { slug: 'libro-incantato', name: 'Libro incantato (su ordinazione)', category: 'raro', stock: 6, unitPrice: 40, stackPrice: null, currency: 'smeraldi', shopSlug: 'empireo-incantesimi' },
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
