import { Cache, CacheManager } from "../cache-manager";
import { TickCache, TickCacheManager } from "../tick-cache-manager";

export class TickRestorePlugin implements TickCache.Entry.Plugin {
  readonly compatibleCacheManager = TickCacheManager;

  onTick(metadata: Cache.Entry): void {
    metadata.value = CacheManager['uncomputed'];
  }
}