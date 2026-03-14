import { Tag } from "../tag.js";
import { PropertyMap } from "../toolkit/propertyMap.js";
import { Variant } from "../toolkit/variant.js";
import type { VariantMap } from "../toolkit/variant.js";
import { AsfAttribute, AsfAttributeType } from "./asfAttribute.js";
import { AsfPicture, pictureTypeToString, pictureTypeFromString } from "./asfPicture.js";

// ---------------------------------------------------------------------------
// Key translation table: ASF attribute name → standard property key
// ---------------------------------------------------------------------------

const keyTranslation: [string, string][] = [
  ["WM/AlbumTitle", "ALBUM"],
  ["WM/AlbumArtist", "ALBUMARTIST"],
  ["WM/AuthorURL", "ARTISTWEBPAGE"],
  ["WM/Composer", "COMPOSER"],
  ["WM/Writer", "LYRICIST"],
  ["WM/Conductor", "CONDUCTOR"],
  ["WM/ModifiedBy", "REMIXER"],
  ["WM/Year", "DATE"],
  ["WM/OriginalAlbumTitle", "ORIGINALALBUM"],
  ["WM/OriginalArtist", "ORIGINALARTIST"],
  ["WM/OriginalFilename", "ORIGINALFILENAME"],
  ["WM/OriginalLyricist", "ORIGINALLYRICIST"],
  ["WM/OriginalReleaseYear", "ORIGINALDATE"],
  ["WM/Producer", "PRODUCER"],
  ["WM/ContentGroupDescription", "WORK"],
  ["WM/SubTitle", "SUBTITLE"],
  ["WM/SetSubTitle", "DISCSUBTITLE"],
  ["WM/TrackNumber", "TRACKNUMBER"],
  ["WM/PartOfSet", "DISCNUMBER"],
  ["WM/Genre", "GENRE"],
  ["WM/BeatsPerMinute", "BPM"],
  ["WM/Mood", "MOOD"],
  ["WM/InitialKey", "INITIALKEY"],
  ["WM/ISRC", "ISRC"],
  ["WM/Lyrics", "LYRICS"],
  ["WM/Media", "MEDIA"],
  ["WM/Publisher", "LABEL"],
  ["WM/CatalogNo", "CATALOGNUMBER"],
  ["WM/Barcode", "BARCODE"],
  ["WM/EncodedBy", "ENCODEDBY"],
  ["WM/EncodingSettings", "ENCODING"],
  ["WM/EncodingTime", "ENCODINGTIME"],
  ["WM/AudioFileURL", "FILEWEBPAGE"],
  ["WM/AlbumSortOrder", "ALBUMSORT"],
  ["WM/AlbumArtistSortOrder", "ALBUMARTISTSORT"],
  ["WM/ArtistSortOrder", "ARTISTSORT"],
  ["WM/TitleSortOrder", "TITLESORT"],
  ["WM/Script", "SCRIPT"],
  ["WM/Language", "LANGUAGE"],
  ["WM/ARTISTS", "ARTISTS"],
  ["ASIN", "ASIN"],
  ["MusicBrainz/Track Id", "MUSICBRAINZ_TRACKID"],
  ["MusicBrainz/Artist Id", "MUSICBRAINZ_ARTISTID"],
  ["MusicBrainz/Album Id", "MUSICBRAINZ_ALBUMID"],
  ["MusicBrainz/Album Artist Id", "MUSICBRAINZ_ALBUMARTISTID"],
  ["MusicBrainz/Album Release Country", "RELEASECOUNTRY"],
  ["MusicBrainz/Album Status", "RELEASESTATUS"],
  ["MusicBrainz/Album Type", "RELEASETYPE"],
  ["MusicBrainz/Release Group Id", "MUSICBRAINZ_RELEASEGROUPID"],
  ["MusicBrainz/Release Track Id", "MUSICBRAINZ_RELEASETRACKID"],
  ["MusicBrainz/Work Id", "MUSICBRAINZ_WORKID"],
  ["MusicIP/PUID", "MUSICIP_PUID"],
  ["Acoustid/Id", "ACOUSTID_ID"],
  ["Acoustid/Fingerprint", "ACOUSTID_FINGERPRINT"],
];

function translateKey(key: string): string | null {
  for (const [k, t] of keyTranslation) {
    if (key === k) return t;
  }
  return null;
}

// Build reverse map lazily
let reverseKeyMap: Map<string, string> | null = null;
function getReverseKeyMap(): Map<string, string> {
  if (!reverseKeyMap) {
    reverseKeyMap = new Map();
    for (const [k, t] of keyTranslation) {
      reverseKeyMap.set(t, k);
    }
  }
  return reverseKeyMap;
}

// ---------------------------------------------------------------------------
// AsfTag
// ---------------------------------------------------------------------------

export class AsfTag extends Tag {
  private _title = "";
  private _artist = "";
  private _copyright = "";
  private _comment = "";
  private _rating = "";
  private _attributeListMap: Map<string, AsfAttribute[]> = new Map();

  // -- Tag interface --

  get title(): string { return this._title; }
  set title(value: string) { this._title = value; }

  get artist(): string { return this._artist; }
  set artist(value: string) { this._artist = value; }

  get album(): string {
    const attrs = this._attributeListMap.get("WM/AlbumTitle");
    if (attrs && attrs.length > 0) {
      return Tag.joinTagValues(attrs.map((a) => a.toString()));
    }
    return "";
  }
  set album(value: string) { this.setAttribute("WM/AlbumTitle", AsfAttribute.fromString(value)); }

  get comment(): string { return this._comment; }
  set comment(value: string) { this._comment = value; }

  get genre(): string {
    const attrs = this._attributeListMap.get("WM/Genre");
    if (attrs && attrs.length > 0) {
      return Tag.joinTagValues(attrs.map((a) => a.toString()));
    }
    return "";
  }
  set genre(value: string) { this.setAttribute("WM/Genre", AsfAttribute.fromString(value)); }

  get year(): number {
    const attrs = this._attributeListMap.get("WM/Year");
    if (attrs && attrs.length > 0) {
      return parseInt(attrs[0].toString(), 10) || 0;
    }
    return 0;
  }
  set year(value: number) { this.setAttribute("WM/Year", AsfAttribute.fromString(String(value))); }

  get track(): number {
    const attrs = this._attributeListMap.get("WM/TrackNumber");
    if (attrs && attrs.length > 0) {
      const attr = attrs[0];
      if (attr.type === AsfAttributeType.DWordType) return attr.toUInt();
      return parseInt(attr.toString(), 10) || 0;
    }
    const trackAttrs = this._attributeListMap.get("WM/Track");
    if (trackAttrs && trackAttrs.length > 0) return trackAttrs[0].toUInt();
    return 0;
  }
  set track(value: number) { this.setAttribute("WM/TrackNumber", AsfAttribute.fromString(String(value))); }

  // -- ASF-specific --

  get copyright(): string { return this._copyright; }
  set copyright(value: string) { this._copyright = value; }

  get rating(): string { return this._rating; }
  set rating(value: string) { this._rating = value; }

  get attributeListMap(): Map<string, AsfAttribute[]> { return this._attributeListMap; }

  contains(key: string): boolean {
    return this._attributeListMap.has(key);
  }

  removeItem(key: string): void {
    this._attributeListMap.delete(key);
  }

  attribute(name: string): AsfAttribute[] {
    return this._attributeListMap.get(name) ?? [];
  }

  setAttribute(name: string, attribute: AsfAttribute): void {
    this._attributeListMap.set(name, [attribute]);
  }

  setAttributeList(name: string, values: AsfAttribute[]): void {
    this._attributeListMap.set(name, values);
  }

  addAttribute(name: string, attribute: AsfAttribute): void {
    const existing = this._attributeListMap.get(name);
    if (existing) {
      existing.push(attribute);
    } else {
      this._attributeListMap.set(name, [attribute]);
    }
  }

  override get isEmpty(): boolean {
    return (
      super.isEmpty &&
      this._copyright === "" &&
      this._rating === "" &&
      this._attributeListMap.size === 0
    );
  }

  // -- PropertyMap --

  override properties(): PropertyMap {
    const props = new PropertyMap();

    if (this._title !== "") props.replace("TITLE", [this._title]);
    if (this._artist !== "") props.replace("ARTIST", [this._artist]);
    if (this._copyright !== "") props.replace("COPYRIGHT", [this._copyright]);
    if (this._comment !== "") props.replace("COMMENT", [this._comment]);

    for (const [k, attributes] of this._attributeListMap) {
      const key = translateKey(k);
      if (key) {
        for (const attr of attributes) {
          if (key === "TRACKNUMBER") {
            if (attr.type === AsfAttributeType.DWordType) {
              props.insert(key, [String(attr.toUInt())]);
            } else {
              props.insert(key, [attr.toString()]);
            }
          } else {
            props.insert(key, [attr.toString()]);
          }
        }
      } else {
        props.addUnsupportedData(k);
      }
    }
    return props;
  }

  override removeUnsupportedProperties(properties: string[]): void {
    for (const prop of properties) {
      this._attributeListMap.delete(prop);
    }
  }

  override setProperties(props: PropertyMap): PropertyMap {
    const reverse = getReverseKeyMap();
    const origProps = this.properties();

    // Remove properties that are no longer present
    for (const [prop] of origProps.entries()) {
      if (!props.contains(prop) || (props.get(prop)?.length ?? 0) === 0) {
        if (prop === "TITLE") this._title = "";
        else if (prop === "ARTIST") this._artist = "";
        else if (prop === "COMMENT") this._comment = "";
        else if (prop === "COPYRIGHT") this._copyright = "";
        else {
          const asfKey = reverse.get(prop);
          if (asfKey) this._attributeListMap.delete(asfKey);
        }
      }
    }

    const ignoredProps = new PropertyMap();
    for (const [prop, attributes] of props.entries()) {
      if (reverse.has(prop)) {
        const name = reverse.get(prop)!;
        this.removeItem(name);
        for (const attr of attributes) {
          this.addAttribute(name, AsfAttribute.fromString(attr));
        }
      } else if (prop === "TITLE") {
        this._title = attributes.join(" / ");
      } else if (prop === "ARTIST") {
        this._artist = attributes.join(" / ");
      } else if (prop === "COMMENT") {
        this._comment = attributes.join(" / ");
      } else if (prop === "COPYRIGHT") {
        this._copyright = attributes.join(" / ");
      } else {
        ignoredProps.replace(prop, attributes);
      }
    }

    return ignoredProps;
  }

  // -- Complex properties (pictures) --

  override complexPropertyKeys(): string[] {
    const keys: string[] = [];
    if (this._attributeListMap.has("WM/Picture")) {
      keys.push("PICTURE");
    }
    return keys;
  }

  override complexProperties(key: string): VariantMap[] {
    const result: VariantMap[] = [];
    if (key.toUpperCase() === "PICTURE") {
      const pictures = this._attributeListMap.get("WM/Picture") ?? [];
      for (const attr of pictures) {
        const picture = attr.toPicture();
        if (!picture.isValid) continue;
        const property: VariantMap = new Map();
        property.set("data", Variant.fromByteVector(picture.picture));
        property.set("mimeType", Variant.fromString(picture.mimeType));
        property.set("description", Variant.fromString(picture.description));
        property.set("pictureType", Variant.fromString(pictureTypeToString(picture.type)));
        result.push(property);
      }
    }
    return result;
  }

  override setComplexProperties(key: string, value: VariantMap[]): boolean {
    if (key.toUpperCase() === "PICTURE") {
      this.removeItem("WM/Picture");
      for (const property of value) {
        const picture = AsfPicture.create();
        picture.picture = property.get("data")?.toByteVector() ?? picture.picture;
        picture.mimeType = property.get("mimeType")?.toString() ?? "";
        picture.description = property.get("description")?.toString() ?? "";
        picture.type = pictureTypeFromString(property.get("pictureType")?.toString() ?? "");
        this.addAttribute("WM/Picture", AsfAttribute.fromPicture(picture));
      }
      return true;
    }
    return false;
  }
}
