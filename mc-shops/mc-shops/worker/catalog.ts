import itemsData from '../src/data/items.json';

export interface StaticCatalogItem {
  name: string;
  minecraft_id: string;
  category: string;
  image_url: string;
}

/**
 * The original bundled Minecraft 1.21.11 registry. Used ONLY as the source
 * for the one-time import into the `catalog_items` Neon table (see
 * db.ts#importStaticCatalog). Once imported, the database — not this file —
 * is the live source of truth, so the Admin panel can add/edit/disable
 * items at runtime (a bundled JSON file can't be mutated by a Worker).
 */
export const staticCatalogItems = itemsData as StaticCatalogItem[];
