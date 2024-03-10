import { CacheManager, Cache } from "../cache-manager";

// Capl stand for: CAche PLugin
const uncomputedCache: typeof CacheManager['uncomputed'] = CacheManager['uncomputed']
export class MemoizationPlugin implements Cache.Entry.Plugin {
  readonly compatibleCacheManager = CacheManager;
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
}