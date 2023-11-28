import { Cache, CacheManager } from "../cache-manager";
import { SimulationCache } from "../cache-systems/simulation-cache-manager";

export class RestoreCacheOnUpdatePlugin implements SimulationCache.Entry.Plugin {
  onUpdate(metadata: Cache.Entry): void {
    metadata.value = CacheManager['uncomputed'];
  }
}