// Tipi condivisi.
//
// Il catalogo oggetti (src/data/items.json) e' l'anagrafica statica di
// Minecraft 1.21.11: nome, minecraft_id, categoria, immagine. Non va
// duplicato ne' salvato su Neon.
//
// Neon conterra' invece i dati dinamici dei negozi/mercanti (che negozio
// vende/compra cosa, a che prezzo, quanta disponibilita'). Il collegamento
// tra le due cose e' sempre "minecraft_id".

export interface CatalogItem {
  name: string;
  minecraft_id: string;
  category: string;
  image_url: string;
}

/** Prezzo + quantita' per una singola direzione (vendita oppure acquisto). */
export interface TradeOffer {
  /** Prezzo per singola unita', in Essence */
  unitPrice: number | null;
  /** Prezzo per stack da 64, se il venditore lo configura */
  stackPrice: number | null;
  /** Vendita: quanto ne ha disponibile. Acquisto: quanto ne vuole. */
  quantity: number;
}

export interface Product {
  slug: string;
  /** Collega il prodotto al catalogo statico (items.json) */
  minecraftId: string;
  shopSlug: string;
  currency: string;
  /** Il negozio vende questo oggetto ai giocatori. Null se non lo vende. */
  sell: TradeOffer | null;
  /** Il negozio compra questo oggetto dai giocatori. Null se non lo compra. */
  buy: TradeOffer | null;
  // Regola di pubblicazione: un prodotto e' pubblicabile solo se almeno
  // uno tra "sell" e "buy" e' presente (non entrambi null).
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
