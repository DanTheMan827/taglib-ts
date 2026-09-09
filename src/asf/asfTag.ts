/** @packageDocumentation ASF tag implementation with PropertyMap and complex property (picture) support. */

import { Tag } from "../tag.js";
import { PropertyMap } from "../toolkit/propertyMap.js";
import { Variant } from "../toolkit/variant.js";
import type { VariantMap } from "../toolkit/variant.js";
import { guidFromString, guidToString } from "../toolkit/tagParsingUtils.js";
import { AsfAttribute, AsfAttributeType } from "./asfAttribute.js";
import { AsfPicture, pictureTypeToString, pictureTypeFromString } from "./asfPicture.js";

// ---------------------------------------------------------------------------
// Key translation table: ASF attribute name → standard property key
// ---------------------------------------------------------------------------

/**
 * Bidirectional mapping between ASF `WM/*` / `MusicBrainz/*` attribute names
 * and the standard property key strings used by {@link PropertyMap}.
 */
interface KeyTranslationEntry {
  /** Canonical ASF attribute name. */
  name: string;
  /** Canonical PropertyMap key. */
  property: string;
  /** Attribute type to use when writing from PropertyMap back to ASF. */
  type: AsfAttributeType;
}

const keyTranslation: KeyTranslationEntry[] = [
  { name: "WM/AlbumTitle", property: "ALBUM", type: AsfAttributeType.UnicodeType },
  { name: "WM/AlbumArtist", property: "ALBUMARTIST", type: AsfAttributeType.UnicodeType },
  { name: "WM/AuthorURL", property: "ARTISTWEBPAGE", type: AsfAttributeType.UnicodeType },
  { name: "WM/Composer", property: "COMPOSER", type: AsfAttributeType.UnicodeType },
  { name: "WM/Writer", property: "LYRICIST", type: AsfAttributeType.UnicodeType },
  { name: "WM/Conductor", property: "CONDUCTOR", type: AsfAttributeType.UnicodeType },
  { name: "WM/ModifiedBy", property: "REMIXER", type: AsfAttributeType.UnicodeType },
  { name: "WM/Year", property: "DATE", type: AsfAttributeType.UnicodeType },
  { name: "WM/OriginalAlbumTitle", property: "ORIGINALALBUM", type: AsfAttributeType.UnicodeType },
  { name: "WM/OriginalArtist", property: "ORIGINALARTIST", type: AsfAttributeType.UnicodeType },
  { name: "WM/OriginalFilename", property: "ORIGINALFILENAME", type: AsfAttributeType.UnicodeType },
  { name: "WM/OriginalLyricist", property: "ORIGINALLYRICIST", type: AsfAttributeType.UnicodeType },
  { name: "WM/OriginalReleaseYear", property: "ORIGINALDATE", type: AsfAttributeType.UnicodeType },
  { name: "WM/Producer", property: "PRODUCER", type: AsfAttributeType.UnicodeType },
  { name: "WM/ContentGroupDescription", property: "WORK", type: AsfAttributeType.UnicodeType },
  { name: "WM/SubTitle", property: "SUBTITLE", type: AsfAttributeType.UnicodeType },
  { name: "WM/SetSubTitle", property: "DISCSUBTITLE", type: AsfAttributeType.UnicodeType },
  { name: "WM/TrackNumber", property: "TRACKNUMBER", type: AsfAttributeType.UnicodeType },
  { name: "WM/PartOfSet", property: "DISCNUMBER", type: AsfAttributeType.UnicodeType },
  { name: "WM/Genre", property: "GENRE", type: AsfAttributeType.UnicodeType },
  { name: "WM/BeatsPerMinute", property: "BPM", type: AsfAttributeType.UnicodeType },
  { name: "WM/Mood", property: "MOOD", type: AsfAttributeType.UnicodeType },
  { name: "WM/InitialKey", property: "INITIALKEY", type: AsfAttributeType.UnicodeType },
  { name: "WM/ISRC", property: "ISRC", type: AsfAttributeType.UnicodeType },
  { name: "WM/Lyrics", property: "LYRICS", type: AsfAttributeType.UnicodeType },
  { name: "WM/Media", property: "MEDIA", type: AsfAttributeType.UnicodeType },
  { name: "WM/Publisher", property: "LABEL", type: AsfAttributeType.UnicodeType },
  { name: "WM/CatalogNo", property: "CATALOGNUMBER", type: AsfAttributeType.UnicodeType },
  { name: "WM/Barcode", property: "BARCODE", type: AsfAttributeType.UnicodeType },
  { name: "WM/EncodedBy", property: "ENCODEDBY", type: AsfAttributeType.UnicodeType },
  { name: "WM/EncodingSettings", property: "ENCODING", type: AsfAttributeType.UnicodeType },
  { name: "WM/EncodingTime", property: "ENCODINGTIME", type: AsfAttributeType.QWordType },
  { name: "WM/AudioFileURL", property: "FILEWEBPAGE", type: AsfAttributeType.UnicodeType },
  { name: "WM/AlbumSortOrder", property: "ALBUMSORT", type: AsfAttributeType.UnicodeType },
  { name: "WM/AlbumArtistSortOrder", property: "ALBUMARTISTSORT", type: AsfAttributeType.UnicodeType },
  { name: "WM/ArtistSortOrder", property: "ARTISTSORT", type: AsfAttributeType.UnicodeType },
  { name: "WM/TitleSortOrder", property: "TITLESORT", type: AsfAttributeType.UnicodeType },
  { name: "WM/Script", property: "SCRIPT", type: AsfAttributeType.UnicodeType },
  { name: "WM/Language", property: "LANGUAGE", type: AsfAttributeType.UnicodeType },
  { name: "WM/ARTISTS", property: "ARTISTS", type: AsfAttributeType.UnicodeType },
  { name: "ASIN", property: "ASIN", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Track Id", property: "MUSICBRAINZ_TRACKID", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Artist Id", property: "MUSICBRAINZ_ARTISTID", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Album Id", property: "MUSICBRAINZ_ALBUMID", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Album Artist Id", property: "MUSICBRAINZ_ALBUMARTISTID", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Album Release Country", property: "RELEASECOUNTRY", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Album Status", property: "RELEASESTATUS", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Album Type", property: "RELEASETYPE", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Release Group Id", property: "MUSICBRAINZ_RELEASEGROUPID", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Release Track Id", property: "MUSICBRAINZ_RELEASETRACKID", type: AsfAttributeType.UnicodeType },
  { name: "MusicBrainz/Work Id", property: "MUSICBRAINZ_WORKID", type: AsfAttributeType.UnicodeType },
  { name: "MusicIP/PUID", property: "MUSICIP_PUID", type: AsfAttributeType.UnicodeType },
  { name: "Acoustid/Id", property: "ACOUSTID_ID", type: AsfAttributeType.UnicodeType },
  { name: "Acoustid/Fingerprint", property: "ACOUSTID_FINGERPRINT", type: AsfAttributeType.UnicodeType },
  { name: "replaygain_track_gain", property: "REPLAYGAIN_TRACK_GAIN", type: AsfAttributeType.UnicodeType },
  { name: "replaygain_track_peak", property: "REPLAYGAIN_TRACK_PEAK", type: AsfAttributeType.UnicodeType },
  { name: "replaygain_album_gain", property: "REPLAYGAIN_ALBUM_GAIN", type: AsfAttributeType.UnicodeType },
  { name: "replaygain_album_peak", property: "REPLAYGAIN_ALBUM_PEAK", type: AsfAttributeType.UnicodeType },
  { name: "WM/MediaClassPrimaryID", property: "MEDIACLASSPRIMARYID", type: AsfAttributeType.GuidType },
  { name: "WM/MediaClassSecondaryID", property: "MEDIACLASSSECONDARYID", type: AsfAttributeType.GuidType },
  { name: "WM/WMCollectionGroupID", property: "COLLECTIONGROUPID", type: AsfAttributeType.GuidType },
  { name: "WM/WMCollectionID", property: "COLLECTIONID", type: AsfAttributeType.GuidType },
  { name: "WM/WMContentID", property: "CONTENTID", type: AsfAttributeType.GuidType },
  { name: "WM/ContentDistributor", property: "CONTENTDISTRIBUTOR", type: AsfAttributeType.UnicodeType },
  { name: "WM/ParentalRating", property: "PARENTALRATING", type: AsfAttributeType.UnicodeType },
  { name: "WM/Period", property: "PERIOD", type: AsfAttributeType.UnicodeType },
  { name: "WM/PromotionURL", property: "PROMOTIONURL", type: AsfAttributeType.UnicodeType },
  { name: "WM/ToolName", property: "TOOLNAME", type: AsfAttributeType.UnicodeType },
  { name: "WM/ToolVersion", property: "TOOLVERSION", type: AsfAttributeType.UnicodeType },
  { name: "WM/Provider", property: "PROVIDER", type: AsfAttributeType.UnicodeType },
  { name: "WM/UniqueFileIdentifier", property: "UNIQUEFILEIDENTIFIER", type: AsfAttributeType.UnicodeType },
  { name: "WMFSDKVersion", property: "WMFSDKVERSION", type: AsfAttributeType.UnicodeType },
  { name: "WMFSDKNeeded", property: "WMFSDKNEEDED", type: AsfAttributeType.UnicodeType },
  { name: "DeviceConformanceTemplate", property: "DEVICECONFORMANCETEMPLATE", type: AsfAttributeType.UnicodeType },
  { name: "MediaFoundationVersion", property: "MEDIAFOUNDATIONVERSION", type: AsfAttributeType.UnicodeType },
  { name: "IsVBR", property: "ISVBR", type: AsfAttributeType.BoolType },
  { name: "PeakValue", property: "PEAKVALUE", type: AsfAttributeType.DWordType },
  { name: "AverageLevel", property: "AVERAGELEVEL", type: AsfAttributeType.DWordType },
];

/**
 * Look up the standard property key for a given ASF attribute name.
 *
 * @param key - An ASF attribute name (e.g. `"WM/AlbumTitle"`).
 * @returns The corresponding property key, or `null` when not mapped.
 */
function translateKey(key: string): string | null {
  const upperKey = key.toUpperCase();
  for (const entry of keyTranslation) {
    if (entry.name.toUpperCase() === upperKey) return entry.property;
  }
  return null;
}

/** Lazily initialised reverse lookup (property key → ASF attribute metadata). */
let reverseKeyMap: Map<string, KeyTranslationEntry> | null = null;
/**
 * Return (and cache) the reverse mapping from standard property key to ASF
 * attribute name.
 */
function getReverseKeyMap(): Map<string, KeyTranslationEntry> {
  if (!reverseKeyMap) {
    reverseKeyMap = new Map();
    for (const entry of keyTranslation) {
      reverseKeyMap.set(entry.property, entry);
    }
  }
  return reverseKeyMap;
}

/**
 * Remove all attributes whose names match `name` case-insensitively.
 *
 * @param attributeListMap - The ASF attribute map to update.
 * @param name - Canonical attribute name to remove.
 */
function eraseAttribute(attributeListMap: Map<string, AsfAttribute[]>, name: string): void {
  const upperName = name.toUpperCase();
  for (const key of [...attributeListMap.keys()]) {
    if (key.toUpperCase() === upperName) {
      attributeListMap.delete(key);
    }
  }
}

/**
 * Convert an ASF attribute value to the PropertyMap string representation used by TagLib.
 *
 * @param attribute - Attribute to stringify.
 * @returns PropertyMap string value.
 */
function attributeToString(attribute: AsfAttribute): string {
  switch (attribute.type) {
    case AsfAttributeType.WordType:
    case AsfAttributeType.DWordType:
    case AsfAttributeType.QWordType:
    case AsfAttributeType.BoolType:
      return attribute.toULongLong().toString();
    case AsfAttributeType.GuidType:
      return guidToString(attribute.toByteVector());
    default:
      return attribute.toString();
  }
}

// ---------------------------------------------------------------------------
// AsfTag
// ---------------------------------------------------------------------------

/**
 * Represents the collection of metadata stored in an ASF file.
 *
 * Simple fields (title, artist, copyright, comment, rating) are stored
 * directly.  All other attributes are held in an attribute-list map keyed
 * by the ASF attribute name.
 */
export class AsfTag extends Tag {
  /** Track title from the Content Description Object. */
  private _title = "";
  /** Lead artist from the Content Description Object. */
  private _artist = "";
  /** Copyright notice from the Content Description Object. */
  private _copyright = "";
  /** User comment from the Content Description Object. */
  private _comment = "";
  /** Content rating from the Content Description Object. */
  private _rating = "";
  /** All other attributes keyed by ASF attribute name. */
  private _attributeListMap: Map<string, AsfAttribute[]> = new Map();

  // -- Tag interface --

  /** Track title (Content Description Object). */
  get title(): string { return this._title; }
  /** @param value - New title. */
  set title(value: string) { this._title = value; }

  /** Lead artist (Content Description Object). */
  get artist(): string { return this._artist; }
  /** @param value - New artist. */
  set artist(value: string) { this._artist = value; }

  /**
   * Album title, read from the `WM/AlbumTitle` attribute.
   * Returns `""` when not present.
   */
  get album(): string {
    const attrs = this._attributeListMap.get("WM/AlbumTitle");
    if (attrs && attrs.length > 0) {
      return Tag.joinTagValues(attrs.map(a => a.toString()));
    }
    return "";
  }
  /** @param value - New album title; sets the `WM/AlbumTitle` attribute. */
  set album(value: string) { this.setAttribute("WM/AlbumTitle", AsfAttribute.fromString(value)); }

  /** User comment (Content Description Object). */
  get comment(): string { return this._comment; }
  /** @param value - New comment. */
  set comment(value: string) { this._comment = value; }

  /**
   * Genre, read from the `WM/Genre` attribute.
   * Returns `""` when not present.
   */
  get genre(): string {
    const attrs = this._attributeListMap.get("WM/Genre");
    if (attrs && attrs.length > 0) {
      return Tag.joinTagValues(attrs.map(a => a.toString()));
    }
    return "";
  }
  /** @param value - New genre; sets the `WM/Genre` attribute. */
  set genre(value: string) { this.setAttribute("WM/Genre", AsfAttribute.fromString(value)); }

  /**
   * Release year, read from the `WM/Year` attribute.
   * Returns `0` when not present.
   */
  get year(): number {
    const attrs = this._attributeListMap.get("WM/Year");
    if (attrs && attrs.length > 0) {
      return parseInt(attrs[0].toString(), 10) || 0;
    }
    return 0;
  }
  /** @param value - New year; sets the `WM/Year` attribute. */
  set year(value: number) { this.setAttribute("WM/Year", AsfAttribute.fromString(String(value))); }

  /**
   * Track number, read from `WM/TrackNumber` (falling back to `WM/Track`).
   * Returns `0` when not present.
   */
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
  /** @param value - New track number; sets the `WM/TrackNumber` attribute. */
  set track(value: number) { this.setAttribute("WM/TrackNumber", AsfAttribute.fromString(String(value))); }

  // -- ASF-specific --

  /** Copyright notice (Content Description Object). */
  get copyright(): string { return this._copyright; }
  /** @param value - New copyright string. */
  set copyright(value: string) { this._copyright = value; }

  /** Content rating (Content Description Object). */
  get rating(): string { return this._rating; }
  /** @param value - New rating string. */
  set rating(value: string) { this._rating = value; }

  /** The full map of all ASF attributes, keyed by attribute name. */
  get attributeListMap(): Map<string, AsfAttribute[]> { return this._attributeListMap; }

  /**
   * Return `true` if `key` has at least one attribute in the map.
   * @param key - ASF attribute name.
   */
  contains(key: string): boolean {
    return this._attributeListMap.has(key);
  }

  /**
   * Remove all attributes stored under `key`.
   * @param key - ASF attribute name.
   */
  removeItem(key: string): void {
    this._attributeListMap.delete(key);
  }

  /**
   * Return the list of attributes stored under `name`, or `[]` when absent.
   * @param name - ASF attribute name.
   */
  attribute(name: string): AsfAttribute[] {
    return this._attributeListMap.get(name) ?? [];
  }

  /**
   * Replace all attributes for `name` with a single `attribute`.
   * @param name - ASF attribute name.
   * @param attribute - The attribute to store.
   */
  setAttribute(name: string, attribute: AsfAttribute): void {
    this._attributeListMap.set(name, [attribute]);
  }

  /**
   * Replace all attributes for `name` with the given list.
   * @param name - ASF attribute name.
   * @param values - The attribute list to store.
   */
  setAttributeList(name: string, values: AsfAttribute[]): void {
    this._attributeListMap.set(name, values);
  }

  /**
   * Append `attribute` to the list stored under `name`, creating the entry if
   * it doesn't exist.
   *
   * @param name - ASF attribute name.
   * @param attribute - The attribute to append.
   */
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
          const value = attributeToString(attr);
          if (value !== "" && !(props.get(key) ?? []).includes(value)) {
            props.insert(key, [value]);
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
          const entry = reverse.get(prop);
          if (entry) eraseAttribute(this._attributeListMap, entry.name);
        }
      }
    }

    const ignoredProps = new PropertyMap();
    for (const [prop, attributes] of props.entries()) {
      const entry = reverse.get(prop);
      if (entry) {
        eraseAttribute(this._attributeListMap, entry.name);
        for (const attr of attributes) {
          switch (entry.type) {
            case AsfAttributeType.WordType:
              this.addAttribute(entry.name, AsfAttribute.fromUShort(Number(BigInt(attr) & 0xffffn)));
              break;
            case AsfAttributeType.DWordType:
              this.addAttribute(entry.name, AsfAttribute.fromUInt(Number(BigInt(attr) & 0xffffffffn)));
              break;
            case AsfAttributeType.QWordType:
              this.addAttribute(entry.name, AsfAttribute.fromULongLong(BigInt(attr)));
              break;
            case AsfAttributeType.BoolType: {
              const upper = attr.toUpperCase();
              const value = attr !== "" && attr !== "0" && upper !== "FALSE";
              this.addAttribute(entry.name, AsfAttribute.fromBool(value));
              break;
            }
            case AsfAttributeType.GuidType:
              this.addAttribute(entry.name, AsfAttribute.fromGuid(guidFromString(attr)));
              break;
            default:
              this.addAttribute(entry.name, AsfAttribute.fromString(attr));
              break;
          }
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
