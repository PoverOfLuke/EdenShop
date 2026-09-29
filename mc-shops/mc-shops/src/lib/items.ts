import itemsData from '@/data/items.json';
import type { CatalogItem } from './types';

// Static Minecraft 1.21.11 catalog (items.json).
// Contains no shop data: item registry only.
export const catalogItems = itemsData as CatalogItem[];

export function getCatalogItem(minecraftId: string): CatalogItem | undefined {
  return catalogItems.find((i) => i.minecraft_id === minecraftId);
}
