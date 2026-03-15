import { Tag } from "../tag.js";
import { PropertyMap } from "../toolkit/propertyMap.js";

// =============================================================================
// DsdiffDiinTag
// =============================================================================

/**
 * DIIN (DSD Interchange Information) tag for DSDIFF files.
 *
 * This is a very limited tag format that only supports title and artist.
 * All other fields are ignored.
 */
export class DsdiffDiinTag extends Tag {
  private _title: string = "";
  private _artist: string = "";

  // ---------------------------------------------------------------------------
  // Tag interface
  // ---------------------------------------------------------------------------

  get title(): string {
    return this._title;
  }
  set title(value: string) {
    this._title = value;
  }

  get artist(): string {
    return this._artist;
  }
  set artist(value: string) {
    this._artist = value;
  }

  get album(): string {
    return "";
  }
  set album(_value: string) {
    // Unsupported by DIIN format
  }

  get comment(): string {
    return "";
  }
  set comment(_value: string) {
    // Unsupported by DIIN format
  }

  get genre(): string {
    return "";
  }
  set genre(_value: string) {
    // Unsupported by DIIN format
  }

  get year(): number {
    return 0;
  }
  set year(_value: number) {
    // Unsupported by DIIN format
  }

  get track(): number {
    return 0;
  }
  set track(_value: number) {
    // Unsupported by DIIN format
  }

  // ---------------------------------------------------------------------------
  // PropertyMap
  // ---------------------------------------------------------------------------

  override properties(): PropertyMap {
    const map = new PropertyMap();
    if (this._title !== "") map.replace("TITLE", [this._title]);
    if (this._artist !== "") map.replace("ARTIST", [this._artist]);
    return map;
  }

  override setProperties(properties: PropertyMap): PropertyMap {
    const unsupported = new PropertyMap();

    for (const [key, values] of properties.entries()) {
      const value = values.length > 0 ? values[0] : "";
      switch (key) {
        case "TITLE":
          this._title = value;
          break;
        case "ARTIST":
          this._artist = value;
          break;
        default:
          unsupported.replace(key, values);
          break;
      }
    }

    // Clear fields not present in the incoming properties
    if (!properties.contains("TITLE")) this._title = "";
    if (!properties.contains("ARTIST")) this._artist = "";

    return unsupported;
  }
}
