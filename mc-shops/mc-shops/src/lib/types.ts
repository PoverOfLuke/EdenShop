// Shared types.
//
// The item catalog (src/data/items.json) is the static Minecraft 1.21.11
// registry: name, minecraft_id, category, image. It is NOT duplicated or
// stored in Neon.
//
// Neon holds the dynamic shop/merchant data instead (which shop sells or
// buys what, at what price, with what stock). The link between the two is
// always "minecraft_id".

export interface CatalogItem {
  name: string;
  minecraft_id: string;
  category: string;
  image_url: string;
}

/** Price + quantity for a single direction (selling or buying). */
export interface TradeOffer {
  /** Price per single unit, in Essence */
  unitPrice: number | null;
  /** Price per stack of 64, if the seller configures one */
  stackPrice: number | null;
  /** Selling: how many are available. Buying: how many are wanted. */
  quantity: number;
}

export interface Product {
  slug: string;
  /** Links the product to the static catalog (items.json) */
  minecraftId: string;
  shopSlug: string;
  currency: string;
  /** The shop sells this item to players. Null if it doesn't sell it. */
  sell: TradeOffer | null;
  /** The shop buys this item from players. Null if it doesn't buy it. */
  buy: TradeOffer | null;
  // Publishing rule: a product can only be published if at least one of
  // "sell" and "buy" is present (not both null).
}

export interface Shop {
  slug: string;
  name: string;
  owner: string;
  /** Coordinates in the Minecraft world */
  x: number;
  z: number;
  dimension: 'overworld' | 'nether' | 'end';
  description: string;
  directions: string;
  online: boolean;
  lastUpdated: string;
}
