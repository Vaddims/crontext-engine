import { Cache, CacheManager } from "../cache-manager";
import { SimulationCache } from "../simulation-cache-manager";

export class TickRestorePlugin implements SimulationCache.Entry.Plugin {
  onUpdate(metadata: Cache.Entry): void {
    metadata.value = CacheManager['uncomputed'];
  }
}