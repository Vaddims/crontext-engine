import { CacheManager, Cache } from "../cache-manager";

const uncomputedCache: typeof CacheManager['uncomputed'] = CacheManager['uncomputed']
export class MemoizationPlugin implements Cache.Entry.Plugin {
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