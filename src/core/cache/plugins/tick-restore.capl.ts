import { Cache, CacheManager } from "../cache-manager";
import { TickCache } from "../tick-cache-manager";

export class TickRestorePlugin implements TickCache.Entry.Plugin {
  onUpdate(metadata: Cache.Entry): void {
    metadata.value = CacheManager['uncomputed'];
  }
}