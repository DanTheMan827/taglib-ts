/** @packageDocumentation CombinedTag — a priority-ordered union of multiple Tag instances. */

import { Tag } from "./tag.js";
import { PropertyMap } from "./toolkit/propertyMap.js";
import type { VariantMap } from "./toolkit/variant.js";

/**
 * A combined / union tag that delegates to multiple underlying tags in
 * priority order. Getters return the first non-empty value; setters write
 * to all non-null tags so that every format stays in sync.
 */
export class CombinedTag extends Tag {
  /** Internal list of tags, some of which may be `null` (absent). */
  private _tags: (Tag | null)[];

  /**
   * @param tags Ordered list of tags in descending priority. `null` entries
   *             are allowed and are simply skipped during reads.
   */
  constructor(tags: (Tag | null)[]) {
    super();
    this._tags = tags;
  }

  /** The underlying non-null tags in priority order. */
  get tags(): Tag[] {
    return this._tags.filter((t): t is Tag => t !== null);
  }

  /** Replace the internal tag list (used when tags are added/removed). */
  setTags(tags: (Tag | null)[]): void {
    this._tags = tags;
  }

  // ---------------------------------------------------------------------------
  // Tag interface – getters return first non-empty value
  // ---------------------------------------------------------------------------

  /** @inheritdoc */
  get title(): string { return this.firstString(t => t.title); }
  /** Writes `v` to every non-null tag in the list. */
  set title(v: string) { this.setOnAll(t => { t.title = v; }); }

  /** @inheritdoc */
  get artist(): string { return this.firstString(t => t.artist); }
  /** Writes `v` to every non-null tag in the list. */
  set artist(v: string) { this.setOnAll(t => { t.artist = v; }); }

  /** @inheritdoc */
  get album(): string { return this.firstString(t => t.album); }
  /** Writes `v` to every non-null tag in the list. */
  set album(v: string) { this.setOnAll(t => { t.album = v; }); }

  /** @inheritdoc */
  get comment(): string { return this.firstString(t => t.comment); }
  /** Writes `v` to every non-null tag in the list. */
  set comment(v: string) { this.setOnAll(t => { t.comment = v; }); }

  /** @inheritdoc */
  get genre(): string { return this.firstString(t => t.genre); }
  /** Writes `v` to every non-null tag in the list. */
  set genre(v: string) { this.setOnAll(t => { t.genre = v; }); }

  /** @inheritdoc */
  get year(): number { return this.firstNumber(t => t.year); }
  /** Writes `v` to every non-null tag in the list. */
  set year(v: number) { this.setOnAll(t => { t.year = v; }); }

  /** @inheritdoc */
  get track(): number { return this.firstNumber(t => t.track); }
  /** Writes `v` to every non-null tag in the list. */
  set track(v: number) { this.setOnAll(t => { t.track = v; }); }

  /** `true` when every non-null underlying tag reports itself as empty. */
  get isEmpty(): boolean {
    return this.tags.every(t => t.isEmpty);
  }

  // ---------------------------------------------------------------------------
  // PropertyMap
  // ---------------------------------------------------------------------------

  /**
   * Merge the property maps from all underlying tags, with higher-priority
   * tags overwriting duplicate keys from lower-priority ones.
   *
   * @returns A unified {@link PropertyMap}.
   */
  override properties(): PropertyMap {
    const map = new PropertyMap();
    // Merge in reverse priority so higher-priority tags overwrite
    const live = this.tags;
    for (let i = live.length - 1; i >= 0; i--) {
      map.merge(live[i].properties());
    }
    return map;
  }

  /**
   * Delegate to the highest-priority tag.
   *
   * @param props The property map to apply.
   * @returns Unsupported properties returned by the primary tag, or `props`
   *          unchanged when no tags are present.
   */
  override setProperties(props: PropertyMap): PropertyMap {
    const live = this.tags;
    if (live.length === 0) return props;
    return live[0].setProperties(props);
  }

  /**
   * Collect the union of complex property keys from all underlying tags.
   *
   * @returns Deduplicated array of complex property key strings.
   */
  override complexPropertyKeys(): string[] {
    const keys = new Set<string>();
    for (const t of this.tags) {
      for (const k of t.complexPropertyKeys()) keys.add(k);
    }
    return [...keys];
  }

  /**
   * Return complex properties for `key` from the first tag that has any.
   *
   * @param key The property key (e.g. `"PICTURE"`).
   * @returns The first non-empty result found, or an empty array.
   */
  override complexProperties(key: string): VariantMap[] {
    for (const t of this.tags) {
      const v = t.complexProperties(key);
      if (v.length > 0) return v;
    }
    return [];
  }

  /**
   * Delegate complex property writes to the highest-priority tag.
   *
   * @param key   The property key (e.g. `"PICTURE"`).
   * @param value The new values to store.
   * @returns `true` if stored successfully, `false` if no tags are present.
   */
  override setComplexProperties(key: string, value: VariantMap[]): boolean {
    const live = this.tags;
    if (live.length === 0) return false;
    return live[0].setComplexProperties(key, value);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the first non-empty string produced by `getter` across all non-null tags.
   *
   * @param getter A function that extracts a string from a tag.
   * @returns The first non-empty string, or `""` if all tags return empty strings.
   */
  private firstString(getter: (t: Tag) => string): string {
    for (const t of this._tags) {
      if (t !== null) {
        const v = getter(t);
        if (v !== "") return v;
      }
    }
    return "";
  }

  /**
   * Return the first non-zero number produced by `getter` across all non-null tags.
   *
   * @param getter A function that extracts a number from a tag.
   * @returns The first non-zero value, or `0` if all tags return zero.
   */
  private firstNumber(getter: (t: Tag) => number): number {
    for (const t of this._tags) {
      if (t !== null) {
        const v = getter(t);
        if (v !== 0) return v;
      }
    }
    return 0;
  }

  /**
   * Apply `setter` to every non-null tag in the list.
   *
   * @param setter A function that writes a value to the given tag.
   */
  private setOnAll(setter: (t: Tag) => void): void {
    for (const t of this._tags) {
      if (t !== null) setter(t);
    }
  }
}
