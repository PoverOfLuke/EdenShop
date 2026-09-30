import itemsData from '../src/data/items.json';

export interface CatalogItem {
  name: string;
  minecraft_id: string;
  category: string;
  image_url: string;
}

const catalogItems = itemsData as CatalogItem[];
const byId = new Map(catalogItems.map((item) => [item.minecraft_id, item]));

export function getCatalogItem(minecraftId: string): CatalogItem | undefined {
  return byId.get(minecraftId);
}

export function catalogItemExists(minecraftId: string): boolean {
  return byId.has(minecraftId);
}

/** Simple substring search over name + minecraft_id, capped for the dashboard picker. */
export function searchCatalog(query: string, limit = 30): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalogItems.slice(0, limit);
  return catalogItems
    .filter((item) => item.name.toLowerCase().includes(q) || item.minecraft_id.includes(q))
    .slice(0, limit);
}
