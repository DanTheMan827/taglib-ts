import { PropertyMap } from "./toolkit/propertyMap.js";
import type { VariantMap } from "./toolkit/variant.js";

/**
 * Abstract base class for all tag implementations. Subclasses provide
 * format-specific reading/writing of metadata fields.
 */
export abstract class Tag {
  // ---------------------------------------------------------------------------
  // Abstract properties – must be implemented by every tag format
  // ---------------------------------------------------------------------------

  abstract get title(): string;
  abstract set title(value: string);

  abstract get artist(): string;
  abstract set artist(value: string);

  abstract get album(): string;
  abstract set album(value: string);

  abstract get comment(): string;
  abstract set comment(value: string);

  abstract get genre(): string;
  abstract set genre(value: string);

  abstract get year(): number;
  abstract set year(value: number);

  abstract get track(): number;
  abstract set track(value: number);

  // ---------------------------------------------------------------------------
  // Convenience
  // ---------------------------------------------------------------------------

  /** True when every field is empty / zero. */
  get isEmpty(): boolean {
    return (
      this.title === "" &&
      this.artist === "" &&
      this.album === "" &&
      this.comment === "" &&
      this.genre === "" &&
      this.year === 0 &&
      this.track === 0
    );
  }

  // ---------------------------------------------------------------------------
  // PropertyMap interface (default implementations)
  // ---------------------------------------------------------------------------

  /** Export the tag as a PropertyMap. */
  properties(): PropertyMap {
    const map = new PropertyMap();
    if (this.title !== "") map.replace("TITLE", [this.title]);
    if (this.artist !== "") map.replace("ARTIST", [this.artist]);
    if (this.album !== "") map.replace("ALBUM", [this.album]);
    if (this.comment !== "") map.replace("COMMENT", [this.comment]);
    if (this.genre !== "") map.replace("GENRE", [this.genre]);
    if (this.year !== 0) map.replace("DATE", [String(this.year)]);
    if (this.track !== 0) map.replace("TRACKNUMBER", [String(this.track)]);
    return map;
  }

  /** Apply a PropertyMap to the tag, returning unhandled properties. */
  setProperties(properties: PropertyMap): PropertyMap {
    const unsupported = new PropertyMap();

    for (const [key, values] of properties.entries()) {
      const value = values.length > 0 ? values[0] : "";
      switch (key) {
        case "TITLE":
          this.title = value;
          break;
        case "ARTIST":
          this.artist = value;
          break;
        case "ALBUM":
          this.album = value;
          break;
        case "COMMENT":
          this.comment = value;
          break;
        case "GENRE":
          this.genre = value;
          break;
        case "DATE":
          this.year = parseInt(value, 10) || 0;
          break;
        case "TRACKNUMBER":
          this.track = parseInt(value, 10) || 0;
          break;
        default:
          unsupported.replace(key, values);
          break;
      }
    }

    return unsupported;
  }

  removeUnsupportedProperties(_properties: string[]): void {
    // Default: no-op — subclasses may override.
  }

  complexPropertyKeys(): string[] {
    return [];
  }

  complexProperties(_key: string): VariantMap[] {
    return [];
  }

  setComplexProperties(_key: string, _value: VariantMap[]): boolean {
    return false;
  }

  // ---------------------------------------------------------------------------
  // Static utilities
  // ---------------------------------------------------------------------------

  /**
   * Copy tag fields from `source` to `target`. When `overwrite` is false,
   * only empty fields in the target are filled in.
   */
  static duplicate(source: Tag, target: Tag, overwrite: boolean): void {
    if (overwrite || target.title === "") target.title = source.title;
    if (overwrite || target.artist === "") target.artist = source.artist;
    if (overwrite || target.album === "") target.album = source.album;
    if (overwrite || target.comment === "") target.comment = source.comment;
    if (overwrite || target.genre === "") target.genre = source.genre;
    if (overwrite || target.year === 0) target.year = source.year;
    if (overwrite || target.track === 0) target.track = source.track;
  }

  /** Join an array of tag values with " / ". */
  static joinTagValues(values: string[]): string {
    return values.join(" / ");
  }
}
