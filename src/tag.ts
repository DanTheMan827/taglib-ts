/** @file Abstract Tag base class shared by all format-specific tag implementations. */

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

  /** Track title. An empty string indicates the field is not set. */
  abstract get title(): string;
  /** @param value The title to store, or an empty string to clear it. */
  abstract set title(value: string);

  /** Primary artist or performer. An empty string indicates the field is not set. */
  abstract get artist(): string;
  /** @param value The artist to store, or an empty string to clear it. */
  abstract set artist(value: string);

  /** Album name. An empty string indicates the field is not set. */
  abstract get album(): string;
  /** @param value The album name to store, or an empty string to clear it. */
  abstract set album(value: string);

  /** Free-form comment. An empty string indicates the field is not set. */
  abstract get comment(): string;
  /** @param value The comment to store, or an empty string to clear it. */
  abstract set comment(value: string);

  /** Genre string (may be an ID3v1 genre name or a custom string). An empty string indicates the field is not set. */
  abstract get genre(): string;
  /** @param value The genre to store, or an empty string to clear it. */
  abstract set genre(value: string);

  /** Release year. Returns `0` if not set. */
  abstract get year(): number;
  /** @param value The year to store, or `0` to clear it. */
  abstract set year(value: number);

  /** Track number within the album. Returns `0` if not set. */
  abstract get track(): number;
  /** @param value The track number to store, or `0` to clear it. */
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

  /**
   * Export the tag as a PropertyMap.
   *
   * @returns A {@link PropertyMap} populated with all non-empty tag fields.
   */
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

  /**
   * Apply a PropertyMap to the tag, returning unhandled properties.
   *
   * @param properties The property map to apply.
   * @returns A {@link PropertyMap} containing any keys that this tag does not
   *          support.
   */
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

  /**
   * Remove properties that are not supported by this tag format.
   * The default implementation is a no-op; subclasses may override.
   *
   * @param _properties Keys of the properties to remove.
   */
  removeUnsupportedProperties(_properties: string[]): void {
    // Default: no-op — subclasses may override.
  }

  /**
   * Return the keys of all complex (non-string) properties stored in this tag.
   * Complex properties include embedded pictures and similar structured data.
   *
   * @returns An array of property key strings, or an empty array if none.
   */
  complexPropertyKeys(): string[] {
    return [];
  }

  /**
   * Return all complex property values for the given key.
   *
   * @param _key The property key (e.g. `"PICTURE"`).
   * @returns An array of {@link VariantMap} objects, or an empty array if the
   *          key is not present.
   */
  complexProperties(_key: string): VariantMap[] {
    return [];
  }

  /**
   * Set complex property values for the given key, replacing any existing values.
   *
   * @param _key   The property key (e.g. `"PICTURE"`).
   * @param _value The new values to store.
   * @returns `true` if the property was stored, `false` if the format does not
   *          support complex properties.
   */
  setComplexProperties(_key: string, _value: VariantMap[]): boolean {
    return false;
  }

  // ---------------------------------------------------------------------------
  // Static utilities
  // ---------------------------------------------------------------------------

  /**
   * Copy tag fields from `source` to `target`. When `overwrite` is false,
   * only empty fields in the target are filled in.
   *
   * @param source    The tag to copy values from.
   * @param target    The tag to copy values into.
   * @param overwrite When `true`, all fields in `target` are overwritten;
   *                  when `false`, only unset fields are populated.
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

  /**
   * Join an array of tag values with " / ".
   *
   * @param values The string values to join.
   * @returns A single string with values separated by `" / "`.
   */
  static joinTagValues(values: string[]): string {
    return values.join(" / ");
  }
}
