import { Tag } from "./tag.js";
import { PropertyMap } from "./toolkit/propertyMap.js";
import type { VariantMap } from "./toolkit/variant.js";

/**
 * A combined / union tag that delegates to multiple underlying tags in
 * priority order. Getters return the first non-empty value; setters write
 * to all non-null tags so that every format stays in sync.
 */
export class CombinedTag extends Tag {
  private _tags: (Tag | null)[];

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

  get title(): string { return this.firstString((t) => t.title); }
  set title(v: string) { this.setOnAll((t) => { t.title = v; }); }

  get artist(): string { return this.firstString((t) => t.artist); }
  set artist(v: string) { this.setOnAll((t) => { t.artist = v; }); }

  get album(): string { return this.firstString((t) => t.album); }
  set album(v: string) { this.setOnAll((t) => { t.album = v; }); }

  get comment(): string { return this.firstString((t) => t.comment); }
  set comment(v: string) { this.setOnAll((t) => { t.comment = v; }); }

  get genre(): string { return this.firstString((t) => t.genre); }
  set genre(v: string) { this.setOnAll((t) => { t.genre = v; }); }

  get year(): number { return this.firstNumber((t) => t.year); }
  set year(v: number) { this.setOnAll((t) => { t.year = v; }); }

  get track(): number { return this.firstNumber((t) => t.track); }
  set track(v: number) { this.setOnAll((t) => { t.track = v; }); }

  get isEmpty(): boolean {
    return this.tags.every((t) => t.isEmpty);
  }

  // ---------------------------------------------------------------------------
  // PropertyMap
  // ---------------------------------------------------------------------------

  override properties(): PropertyMap {
    const map = new PropertyMap();
    // Merge in reverse priority so higher-priority tags overwrite
    const live = this.tags;
    for (let i = live.length - 1; i >= 0; i--) {
      map.merge(live[i].properties());
    }
    return map;
  }

  override setProperties(props: PropertyMap): PropertyMap {
    const live = this.tags;
    if (live.length === 0) return props;
    return live[0].setProperties(props);
  }

  override complexPropertyKeys(): string[] {
    const keys = new Set<string>();
    for (const t of this.tags) {
      for (const k of t.complexPropertyKeys()) keys.add(k);
    }
    return [...keys];
  }

  override complexProperties(key: string): VariantMap[] {
    for (const t of this.tags) {
      const v = t.complexProperties(key);
      if (v.length > 0) return v;
    }
    return [];
  }

  override setComplexProperties(key: string, value: VariantMap[]): boolean {
    const live = this.tags;
    if (live.length === 0) return false;
    return live[0].setComplexProperties(key, value);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private firstString(getter: (t: Tag) => string): string {
    for (const t of this._tags) {
      if (t !== null) {
        const v = getter(t);
        if (v !== "") return v;
      }
    }
    return "";
  }

  private firstNumber(getter: (t: Tag) => number): number {
    for (const t of this._tags) {
      if (t !== null) {
        const v = getter(t);
        if (v !== 0) return v;
      }
    }
    return 0;
  }

  private setOnAll(setter: (t: Tag) => void): void {
    for (const t of this._tags) {
      if (t !== null) setter(t);
    }
  }
}
