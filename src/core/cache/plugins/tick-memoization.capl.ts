import { CacheManager, Cache } from "../cache-manager";
import { TickCache } from "../tick-cache-manager";

const uncomputedCache: typeof CacheManager['uncomputed'] = CacheManager['uncomputed']
export class TickMemoizationPlugin implements TickCache.Entry.Plugin {
  readonly useOnlyPluginAccessors = true;
  private readonly computeValue: () => unknown;
  constructor(computeValue: () => unknown) {
    this.computeValue = computeValue;
  }

  onGet(metadata: Cache.Entry) {
    if (metadata.value === uncomputedCache) {
      return metadata.value = this.computeValue();
    }

    return metadata.value;
  }

  onClear(metadata: Cache.Entry): boolean {
    metadata.value = uncomputedCache;
    return true;
  }

  onUpdate(metadata: Cache.Entry): void {
    metadata.value = CacheManager['uncomputed'];
  }
}