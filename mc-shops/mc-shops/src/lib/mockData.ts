import type { Shop, Product } from './types';

// Sample data, only used to design the interface.
// This file will later be replaced by calls to Neon (fed by the
// Discord -> GitHub Action pipeline). The item catalog stays static:
// see src/lib/items.ts + src/data/items.json.

const CURRENCY = 'Essence';

export const shops: Shop[] = [
  {
    slug: 'redcliff-emporium',
    name: 'Redcliff Emporium',
    owner: 'Steve_IT',
    x: 245,
    z: -1023,
    dimension: 'overworld',
    description:
      "The best-stocked general store on the server: from basic building blocks to enchanting materials. Steve restocks every evening after 9pm.",
    directions:
      "From spawn, follow the quartz road west for about 900 blocks. The shop is the red stone building with the anvil-shaped sign, right after the river bridge.",
    online: true,
    lastUpdated: '2026-09-27T07:40:00Z',
  },
  {
    slug: 'nether-bazaar',
    name: 'Nether Bazaar',
    owner: 'xXPigliaXx',
    x: -812,
    z: 340,
    dimension: 'nether',
    description:
      'Specializes in Nether materials: quartz, netherite scrap and blaze rods. Prices fluctuate with the risk of the trip.',
    directions:
      "Take the public portal near spawn, head out and go north following the elevated rails. Watch out for ghasts on the last stretch.",
    online: true,
    lastUpdated: '2026-09-27T06:55:00Z',
  },
  {
    slug: 'ender-warehouse',
    name: 'Ender Warehouse',
    owner: 'EnderTrader',
    x: 100,
    z: 100,
    dimension: 'end',
    description:
      "Rare end-game items: elytra, ender pearls and totems. Limited stock, check before you make the trip.",
    directions:
      "Only reachable via a private portal: ask for the portal coordinates in the #shops Discord channel before heading out.",
    online: false,
    lastUpdated: '2026-09-26T22:10:00Z',
  },
  {
    slug: 'golden-wheat-farm',
    name: 'Golden Wheat Farm',
    owner: 'ContadinoMax',
    x: 50,
    z: 780,
    dimension: 'overworld',
    description:
      'Fresh farm produce every day: wheat, sugar cane, cocoa and carrots. Discounts on full-stack purchases.',
    directions:
      "South of spawn, follow the river to the terraced fields visible from the main bridge. Ring the bell at the entrance to call the seller.",
    online: true,
    lastUpdated: '2026-09-27T08:05:00Z',
  },
  {
    slug: 'deepslate-hardware',
    name: 'Deepslate Hardware',
    owner: 'MinatoreJoe',
    x: -300,
    z: -50,
    dimension: 'overworld',
    description:
      'Raw ores and ingots at mine prices: iron, copper, gold and the occasional raw diamond restock.',
    directions:
      "Main mine entrance west of spawn, go down the spiral staircase to level -40.",
    online: true,
    lastUpdated: '2026-09-27T05:20:00Z',
  },
  {
    slug: 'enchantment-empyrean',
    name: 'Enchantment Empyrean',
    owner: 'ArcanoLuna',
    x: 900,
    z: -400,
    dimension: 'overworld',
    description:
      "Enchanted books and enchanting materials: lapis lazuli, eyes of ender, and books made to order.",
    directions:
      "Purple tower visible from spawn to the east, atop the hill. Use an elytra ramp or climb the outer staircase.",
    online: true,
    lastUpdated: '2026-09-27T07:15:00Z',
  },
];

export const products: Product[] = [
  // Redcliff Emporium — sells building materials
  { slug: 'oak-planks', minecraftId: 'minecraft:oak_planks', shopSlug: 'redcliff-emporium', currency: CURRENCY,
    sell: { unitPrice: 0.2, stackPrice: 8, quantity: 4032 }, buy: null },
  { slug: 'glass', minecraftId: 'minecraft:glass', shopSlug: 'redcliff-emporium', currency: CURRENCY,
    sell: { unitPrice: 0.3, stackPrice: 12, quantity: 1728 }, buy: null },
  { slug: 'red-wool', minecraftId: 'minecraft:red_wool', shopSlug: 'redcliff-emporium', currency: CURRENCY,
    sell: { unitPrice: 0.5, stackPrice: 24, quantity: 512 }, buy: null },
  { slug: 'rail', minecraftId: 'minecraft:rail', shopSlug: 'redcliff-emporium', currency: CURRENCY,
    sell: { unitPrice: 0.4, stackPrice: null, quantity: 960 }, buy: null },

  // Nether Bazaar — sells rare materials, buys back netherite scrap
  { slug: 'quartz', minecraftId: 'minecraft:quartz', shopSlug: 'nether-bazaar', currency: CURRENCY,
    sell: { unitPrice: 0.6, stackPrice: 28, quantity: 2240 }, buy: null },
  { slug: 'blaze-rod', minecraftId: 'minecraft:blaze_rod', shopSlug: 'nether-bazaar', currency: CURRENCY,
    sell: { unitPrice: 3.5, stackPrice: 190, quantity: 96 }, buy: null },
  { slug: 'netherite-scrap', minecraftId: 'minecraft:netherite_scrap', shopSlug: 'nether-bazaar', currency: CURRENCY,
    sell: { unitPrice: 22, stackPrice: null, quantity: 6 },
    buy: { unitPrice: 18, stackPrice: null, quantity: 64 } },
  { slug: 'ancient-debris', minecraftId: 'minecraft:ancient_debris', shopSlug: 'nether-bazaar', currency: CURRENCY,
    sell: { unitPrice: 9, stackPrice: 520, quantity: 64 },
    buy: { unitPrice: 6.5, stackPrice: 380, quantity: 128 } },

  // Ender Warehouse — sell only, rare items
  { slug: 'elytra', minecraftId: 'minecraft:elytra', shopSlug: 'ender-warehouse', currency: CURRENCY,
    sell: { unitPrice: 260, stackPrice: null, quantity: 1 }, buy: null },
  { slug: 'ender-pearl', minecraftId: 'minecraft:ender_pearl', shopSlug: 'ender-warehouse', currency: CURRENCY,
    sell: { unitPrice: 4.2, stackPrice: 250, quantity: 48 },
    buy: { unitPrice: 3, stackPrice: 180, quantity: 320 } },
  { slug: 'totem-of-undying', minecraftId: 'minecraft:totem_of_undying', shopSlug: 'ender-warehouse', currency: CURRENCY,
    sell: { unitPrice: 95, stackPrice: null, quantity: 3 }, buy: null },

  // Golden Wheat Farm — sells and buys back farm produce
  { slug: 'wheat', minecraftId: 'minecraft:wheat', shopSlug: 'golden-wheat-farm', currency: CURRENCY,
    sell: { unitPrice: 0.1, stackPrice: 4, quantity: 3200 },
    buy: { unitPrice: 0.05, stackPrice: 2, quantity: 5000 } },
  { slug: 'sugar-cane', minecraftId: 'minecraft:sugar_cane', shopSlug: 'golden-wheat-farm', currency: CURRENCY,
    sell: { unitPrice: 0.15, stackPrice: 6, quantity: 1856 }, buy: null },
  { slug: 'cocoa-beans', minecraftId: 'minecraft:cocoa_beans', shopSlug: 'golden-wheat-farm', currency: CURRENCY,
    sell: { unitPrice: 0.3, stackPrice: 14, quantity: 640 }, buy: null },
  { slug: 'carrot', minecraftId: 'minecraft:carrot', shopSlug: 'golden-wheat-farm', currency: CURRENCY,
    sell: { unitPrice: 0.1, stackPrice: 4, quantity: 0 },
    buy: { unitPrice: 0.05, stackPrice: 2, quantity: 2000 } },

  // Deepslate Hardware — sells and buys back raw ores
  { slug: 'raw-iron', minecraftId: 'minecraft:raw_iron', shopSlug: 'deepslate-hardware', currency: CURRENCY,
    sell: { unitPrice: 1.2, stackPrice: 60, quantity: 1280 },
    buy: { unitPrice: 0.9, stackPrice: 45, quantity: 3000 } },
  { slug: 'raw-copper', minecraftId: 'minecraft:raw_copper', shopSlug: 'deepslate-hardware', currency: CURRENCY,
    sell: { unitPrice: 0.5, stackPrice: 22, quantity: 2048 }, buy: null },
  { slug: 'raw-gold', minecraftId: 'minecraft:raw_gold', shopSlug: 'deepslate-hardware', currency: CURRENCY,
    sell: { unitPrice: 2.4, stackPrice: 130, quantity: 384 }, buy: null },
  { slug: 'raw-diamond', minecraftId: 'minecraft:diamond', shopSlug: 'deepslate-hardware', currency: CURRENCY,
    sell: { unitPrice: 14, stackPrice: null, quantity: 18 },
    buy: { unitPrice: 11, stackPrice: null, quantity: 200 } },

  // Enchantment Empyrean — sells enchanting materials
  { slug: 'lapis-lazuli', minecraftId: 'minecraft:lapis_lazuli', shopSlug: 'enchantment-empyrean', currency: CURRENCY,
    sell: { unitPrice: 0.4, stackPrice: 20, quantity: 960 }, buy: null },
  { slug: 'ender-eye', minecraftId: 'minecraft:ender_eye', shopSlug: 'enchantment-empyrean', currency: CURRENCY,
    sell: { unitPrice: 5, stackPrice: 300, quantity: 32 }, buy: null },
  { slug: 'enchanted-book', minecraftId: 'minecraft:enchanted_book', shopSlug: 'enchantment-empyrean', currency: CURRENCY,
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
