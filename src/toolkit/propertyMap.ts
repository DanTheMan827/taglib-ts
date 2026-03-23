/**
 * @file Case-insensitive key-value container for audio metadata properties.
 */

/**
 * A case-insensitive key-value container for audio metadata properties.
 * Keys are normalised to uppercase (e.g. `"TITLE"`, `"ARTIST"`).
 *
 * Mirrors the TagLib `PropertyMap` API. Each key maps to an ordered list of
 * string values, allowing multi-valued tags such as multiple artists.
 */
export class PropertyMap {
  /** Internal storage — keys are always stored in uppercase. */
  private _map: Map<string, string[]> = new Map();

  /** Keys from the original tag that this map does not know how to represent. */
  private _unsupported: string[] = [];

  // ---------------------------------------------------------------------------
  // Core accessors
  // ---------------------------------------------------------------------------

  /** Converts `key` to its canonical uppercase form used for storage. */
  private static normalizeKey(key: string): string {
    return key.toUpperCase();
  }

  /** The number of distinct keys in the map. */
  get size(): number {
    return this._map.size;
  }

  /** Insert (append) values for a key. */
  insert(key: string, values: string[]): void {
    const k = PropertyMap.normalizeKey(key);
    const existing = this._map.get(k);
    if (existing) {
      existing.push(...values);
    } else {
      this._map.set(k, [...values]);
    }
  }

  /** Replace all values for a key. */
  replace(key: string, values: string[]): void {
    this._map.set(PropertyMap.normalizeKey(key), [...values]);
  }

  /** Check whether a key exists (case-insensitive). */
  contains(key: string): boolean {
    return this._map.has(PropertyMap.normalizeKey(key));
  }

  /** Get values for a key, or undefined if not present. */
  get(key: string): string[] | undefined {
    return this._map.get(PropertyMap.normalizeKey(key));
  }

  /** Remove a key. Returns true if the key existed. */
  erase(key: string): boolean {
    return this._map.delete(PropertyMap.normalizeKey(key));
  }

  /** Iterate over all entries. */
  entries(): IterableIterator<[string, string[]]> {
    return this._map.entries();
  }

  /** Iterate over all keys. */
  keys(): IterableIterator<string> {
    return this._map.keys();
  }

  /** Remove all entries. */
  clear(): void {
    this._map.clear();
    this._unsupported = [];
  }

  // ---------------------------------------------------------------------------
  // Merge / cleanup
  // ---------------------------------------------------------------------------

  /** Merge another PropertyMap into this one (concatenating values). */
  merge(other: PropertyMap): void {
    for (const [key, values] of other._map) {
      const existing = this._map.get(key);
      if (existing) {
        existing.push(...values);
      } else {
        this._map.set(key, [...values]);
      }
    }
  }

  /** Remove entries whose value arrays are empty. */
  removeEmpty(): void {
    for (const [key, values] of this._map) {
      if (values.length === 0) {
        this._map.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Unsupported data tracking
  // ---------------------------------------------------------------------------

  /**
   * Returns a copy of the list of keys that could not be mapped to a
   * standard property name.
   */
  unsupportedData(): string[] {
    return [...this._unsupported];
  }

  /**
   * Records `key` as an unsupported tag field that this map cannot represent.
   *
   * @param key - The raw tag key to mark as unsupported.
   */
  addUnsupportedData(key: string): void {
    this._unsupported.push(key);
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  /** Returns a human-readable representation of the map and unsupported keys. */
  toString(): string {
    const parts: string[] = [];
    for (const [key, values] of this._map) {
      parts.push(`${key}=${values.join(", ")}`);
    }
    if (this._unsupported.length > 0) {
      parts.push(`[unsupported: ${this._unsupported.join(", ")}]`);
    }
    return `PropertyMap{${parts.join("; ")}}`;
  }
}
