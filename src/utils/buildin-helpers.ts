export function pushElementToMapValue<K, V>(map: Map<K, V[]>, key: K, element: V) {
  const array = map.get(key) ?? [];
  array.push(element);
  map.set(key, array);
  return map;
}