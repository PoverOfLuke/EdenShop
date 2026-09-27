// Tipi condivisi. Quando il sito verra' collegato al database Neon,
// questi tipi dovrebbero coincidere (o derivare da) lo schema delle tabelle
// popolate dalla pipeline Discord -> GitHub Action -> Neon.

export type ProductCategory =
  | 'minerale'
  | 'gemma'
  | 'cibo'
  | 'legno'
  | 'redstone'
  | 'blocco'
  | 'raro'
  | 'strumento';

export interface Product {
  slug: string;
  name: string;
  category: ProductCategory;
  /** Quantita' disponibile, in singole unita' */
  stock: number;
  /** Prezzo per singola unita', in valuta del server */
  unitPrice: number | null;
  /** Prezzo per stack da 64, se il venditore lo configura */
  stackPrice: number | null;
  currency: string;
  shopSlug: string;
}

export interface Shop {
  slug: string;
  name: string;
  owner: string;
  /** Coordinate nel mondo Minecraft */
  x: number;
  z: number;
  dimension: 'overworld' | 'nether' | 'end';
  description: string;
  directions: string;
  online: boolean;
  lastUpdated: string;
}
