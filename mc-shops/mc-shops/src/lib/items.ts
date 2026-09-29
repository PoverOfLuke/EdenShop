import itemsData from '@/data/items.json';
import type { CatalogItem } from './types';

// Catalogo statico Minecraft 1.21.11 (items.json).
// NON contiene dati di negozio: solo anagrafica oggetto.
export const catalogItems = itemsData as CatalogItem[];

export function getCatalogItem(minecraftId: string): CatalogItem | undefined {
  return catalogItems.find((i) => i.minecraft_id === minecraftId);
}
