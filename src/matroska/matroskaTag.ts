import { Tag } from "../tag.js";
import { PropertyMap } from "../toolkit/propertyMap.js";
import type { VariantMap } from "../toolkit/variant.js";
import { Variant } from "../toolkit/variant.js";
import { ByteVector } from "../byteVector.js";
import { IOStream } from "../toolkit/ioStream.js";
import {
  EbmlId,
  readChildElements,
  readUintValue,
  readStringValue,
  readElementData,
  renderEbmlElement,
  renderStringElement,
  renderUintElement,
  combineByteVectors,
  type EbmlElement,
} from "./ebml/ebmlElement.js";

// TargetTypeValue matches the Matroska specification
export enum TargetTypeValue {
  None = 0,
  Shot = 10,
  Scene = 20,
  Track = 30,
  Part = 40,
  Album = 50,
  Edition = 60,
  Collection = 70,
}

export interface SimpleTag {
  name: string;
  value: string;
  binaryValue?: ByteVector;
  language: string;
  defaultLanguageFlag: boolean;
  targetTypeValue: TargetTypeValue;
  trackUid: number;
  editionUid: number;
  chapterUid: number;
  attachmentUid: number;
}

export interface AttachedFile {
  description: string;
  fileName: string;
  mediaType: string;
  data: ByteVector;
  uid: number;
}

/**
 * PropertyMap key ↔ Matroska tag name mapping table.
 * Format: [propertyKey, tagName, targetTypeValue, strict]
 * "strict" means the mapping only applies when the target type matches exactly.
 */
const SIMPLE_TAGS_TRANSLATION: readonly [string, string, TargetTypeValue, boolean][] = [
  ["TITLE", "TITLE", TargetTypeValue.Track, false],
  ["ALBUM", "TITLE", TargetTypeValue.Album, true],
  ["ARTIST", "ARTIST", TargetTypeValue.Track, false],
  ["ALBUMARTIST", "ARTIST", TargetTypeValue.Album, true],
  ["TRACKNUMBER", "PART_NUMBER", TargetTypeValue.Track, false],
  ["DISCNUMBER", "PART_NUMBER", TargetTypeValue.Album, true],
  ["TRACKTOTAL", "TOTAL_PARTS", TargetTypeValue.Track, false],
  ["DISCTOTAL", "TOTAL_PARTS", TargetTypeValue.Album, true],
  ["DATE", "DATE_RECORDED", TargetTypeValue.Track, false],
  ["TITLESORT", "TITLESORT", TargetTypeValue.Track, false],
  ["ALBUMSORT", "TITLESORT", TargetTypeValue.Album, true],
  ["ARTISTSORT", "ARTISTSORT", TargetTypeValue.Track, false],
  ["ALBUMARTISTSORT", "ARTISTSORT", TargetTypeValue.Album, true],
  ["MEDIA", "ORIGINAL_MEDIA_TYPE", TargetTypeValue.Track, false],
  ["LABEL", "LABEL_CODE", TargetTypeValue.Track, false],
  ["CATALOGNUMBER", "CATALOG_NUMBER", TargetTypeValue.Track, false],
  ["DJMIXER", "MIXED_BY", TargetTypeValue.Track, false],
  ["REMIXER", "REMIXED_BY", TargetTypeValue.Track, false],
  ["INITIALKEY", "INITIAL_KEY", TargetTypeValue.Track, false],
  ["RELEASEDATE", "DATE_RELEASED", TargetTypeValue.Album, false],
  ["ENCODINGTIME", "DATE_ENCODED", TargetTypeValue.Track, false],
  ["TAGGINGDATE", "DATE_TAGGED", TargetTypeValue.Track, false],
  ["ENCODEDBY", "ENCODER", TargetTypeValue.Track, false],
  ["ENCODING", "ENCODER_SETTINGS", TargetTypeValue.Track, false],
  ["OWNER", "PURCHASE_OWNER", TargetTypeValue.Track, false],
  ["COMMENT", "COMMENT", TargetTypeValue.Track, false],
  ["GENRE", "GENRE", TargetTypeValue.Track, false],
  ["REPLAYGAIN_TRACK_GAIN", "REPLAYGAIN_GAIN", TargetTypeValue.Track, false],
  ["REPLAYGAIN_ALBUM_GAIN", "REPLAYGAIN_GAIN", TargetTypeValue.Album, true],
  ["REPLAYGAIN_TRACK_PEAK", "REPLAYGAIN_PEAK", TargetTypeValue.Track, false],
  ["REPLAYGAIN_ALBUM_PEAK", "REPLAYGAIN_PEAK", TargetTypeValue.Album, true],
  ["MUSICBRAINZ_ALBUMARTISTID", "MUSICBRAINZ_ALBUMARTISTID", TargetTypeValue.Album, false],
  ["MUSICBRAINZ_ALBUMID", "MUSICBRAINZ_ALBUMID", TargetTypeValue.Album, false],
  ["MUSICBRAINZ_RELEASEGROUPID", "MUSICBRAINZ_RELEASEGROUPID", TargetTypeValue.Album, false],
];

function translateKey(key: string): [string, TargetTypeValue, boolean] {
  const upperKey = key.toUpperCase();
  for (const [propKey, tagName, ttv, strict] of SIMPLE_TAGS_TRANSLATION) {
    if (upperKey === propKey) {
      return [tagName, ttv, strict];
    }
  }
  if (key) return [key, TargetTypeValue.Track, false];
  return ["", TargetTypeValue.None, false];
}

function translateTag(name: string, targetTypeValue: TargetTypeValue): string {
  for (const [propKey, tagName, ttv, strict] of SIMPLE_TAGS_TRANSLATION) {
    if (name === tagName && (targetTypeValue === ttv ||
      (targetTypeValue === TargetTypeValue.None && !strict))) {
      return propKey;
    }
  }
  return (targetTypeValue === TargetTypeValue.Track || targetTypeValue === TargetTypeValue.None)
    ? name : "";
}

/**
 * Matroska tag implementation. Reads SimpleTag elements from Tags/Tag elements.
 */
export class MatroskaTag extends Tag {
  private _simpleTags: SimpleTag[] = [];
  private _attachedFiles: AttachedFile[] = [];
  private _segmentTitle: string = "";

  get title(): string {
    const s = this.getTag("TITLE");
    return s || this._segmentTitle;
  }
  set title(value: string) { this.setTag("TITLE", value); }

  get artist(): string { return this.getTag("ARTIST"); }
  set artist(value: string) { this.setTag("ARTIST", value); }

  get album(): string { return this.getTag("ALBUM"); }
  set album(value: string) { this.setTag("ALBUM", value); }

  get comment(): string { return this.getTag("COMMENT"); }
  set comment(value: string) { this.setTag("COMMENT", value); }

  get genre(): string { return this.getTag("GENRE"); }
  set genre(value: string) { this.setTag("GENRE", value); }

  get year(): number {
    const value = this.getTag("DATE");
    if (!value) return 0;
    return parseInt(value.split("-")[0], 10) || 0;
  }
  set year(value: number) {
    this.setTag("DATE", value !== 0 ? String(value) : "");
  }

  get track(): number {
    const value = this.getTag("TRACKNUMBER");
    if (!value) return 0;
    return parseInt(value.split("-")[0], 10) || 0;
  }
  set track(value: number) {
    this.setTag("TRACKNUMBER", value !== 0 ? String(value) : "");
  }

  get isEmpty(): boolean {
    return this._simpleTags.length === 0;
  }

  get simpleTags(): SimpleTag[] {
    return this._simpleTags;
  }

  get attachedFiles(): AttachedFile[] {
    return this._attachedFiles;
  }

  set segmentTitle(value: string) {
    this._segmentTitle = value;
  }

  // ---------------------------------------------------------------------------
  // PropertyMap
  // ---------------------------------------------------------------------------

  override properties(): PropertyMap {
    const props = new PropertyMap();
    for (const st of this._simpleTags) {
      if (!st.binaryValue && st.trackUid === 0 && st.editionUid === 0 &&
          st.chapterUid === 0 && st.attachmentUid === 0) {
        const key = translateTag(st.name, st.targetTypeValue);
        if (key) {
          props.insert(key, [st.value]);
        }
      }
    }
    return props;
  }

  override setProperties(propertyMap: PropertyMap): PropertyMap {
    // Remove existing simple tags that map to standard properties
    this._simpleTags = this._simpleTags.filter(st => {
      if (st.binaryValue || st.trackUid !== 0 || st.editionUid !== 0 ||
          st.chapterUid !== 0 || st.attachmentUid !== 0) {
        return true;
      }
      return !translateTag(st.name, st.targetTypeValue);
    });

    const unsupported = new PropertyMap();
    for (const [key, values] of propertyMap.entries()) {
      for (const value of values) {
        const [name, ttv] = translateKey(key);
        if (name) {
          this._simpleTags.push({
            name,
            value,
            language: "und",
            defaultLanguageFlag: true,
            targetTypeValue: ttv,
            trackUid: 0,
            editionUid: 0,
            chapterUid: 0,
            attachmentUid: 0,
          });
        } else {
          unsupported.insert(key, [value]);
        }
      }
    }
    return unsupported;
  }

  override removeUnsupportedProperties(properties: string[]): void {
    this._simpleTags = this._simpleTags.filter(
      st => !properties.includes(st.name),
    );
  }

  override complexPropertyKeys(): string[] {
    const keys: string[] = [];
    for (const st of this._simpleTags) {
      if ((st.binaryValue || st.trackUid !== 0 || st.editionUid !== 0 ||
           st.chapterUid !== 0 || st.attachmentUid !== 0 ||
           !translateTag(st.name, st.targetTypeValue)) &&
          !keys.includes(st.name)) {
        keys.push(st.name);
      }
    }
    // Add PICTURE key if there are image attachments
    if (this._attachedFiles.some(af => af.mediaType.startsWith("image/"))) {
      if (!keys.includes("PICTURE")) keys.push("PICTURE");
    }
    return keys;
  }

  override complexProperties(key: string): VariantMap[] {
    if (key.toUpperCase() === "PICTURE") {
      return this._attachedFiles
        .filter(af => af.mediaType.startsWith("image/"))
        .map(af => {
          const m: VariantMap = new Map();
          m.set("data", Variant.fromByteVector(af.data));
          m.set("mimeType", Variant.fromString(af.mediaType));
          m.set("description", Variant.fromString(af.description));
          m.set("fileName", Variant.fromString(af.fileName));
          m.set("uid", Variant.fromULongLong(BigInt(af.uid)));
          return m;
        });
    }

    // Return complex simple tags
    const results: VariantMap[] = [];
    for (const st of this._simpleTags) {
      if (st.name === key &&
          (st.binaryValue || st.trackUid !== 0 || st.editionUid !== 0 ||
           st.chapterUid !== 0 || st.attachmentUid !== 0 ||
           !translateTag(st.name, st.targetTypeValue))) {
        const m: VariantMap = new Map();
        if (st.binaryValue) {
          m.set("data", Variant.fromByteVector(st.binaryValue));
        } else {
          m.set("value", Variant.fromString(st.value));
        }
        m.set("name", Variant.fromString(st.name));
        if (st.targetTypeValue !== TargetTypeValue.None) {
          m.set("targetTypeValue", Variant.fromInt(st.targetTypeValue));
        }
        if (st.trackUid) m.set("trackUid", Variant.fromULongLong(BigInt(st.trackUid)));
        if (st.editionUid) m.set("editionUid", Variant.fromULongLong(BigInt(st.editionUid)));
        if (st.chapterUid) m.set("chapterUid", Variant.fromULongLong(BigInt(st.chapterUid)));
        if (st.attachmentUid) m.set("attachmentUid", Variant.fromULongLong(BigInt(st.attachmentUid)));
        m.set("language", Variant.fromString(st.language));
        m.set("defaultLanguage", Variant.fromBool(st.defaultLanguageFlag));
        results.push(m);
      }
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private getTag(key: string): string {
    const [name, ttv, strict] = translateKey(key);
    if (!name) return "";
    for (const st of this._simpleTags) {
      if (st.name === name && !st.binaryValue &&
          (st.targetTypeValue === ttv ||
           (st.targetTypeValue === TargetTypeValue.None && !strict)) &&
          st.trackUid === 0 && st.editionUid === 0 &&
          st.chapterUid === 0 && st.attachmentUid === 0) {
        return st.value;
      }
    }
    return "";
  }

  private setTag(key: string, value: string): void {
    const [name, ttv] = translateKey(key);
    if (!name) return;

    // Remove existing tag with same name and target
    this._simpleTags = this._simpleTags.filter(st =>
      !(st.name === name && st.targetTypeValue === ttv),
    );

    if (value) {
      this._simpleTags.push({
        name,
        value,
        language: "und",
        defaultLanguageFlag: true,
        targetTypeValue: ttv,
        trackUid: 0,
        editionUid: 0,
        chapterUid: 0,
        attachmentUid: 0,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Serialization (EBML rendering)
  // ---------------------------------------------------------------------------

  /**
   * Render the SimpleTag EBML element for a given tag entry.
   */
  private renderSimpleTag(st: SimpleTag): ByteVector {
    const children: ByteVector[] = [];
    children.push(renderStringElement(EbmlId.TagName, st.name));
    if (st.binaryValue) {
      children.push(renderEbmlElement(EbmlId.TagBinary, st.binaryValue));
    } else {
      children.push(renderStringElement(EbmlId.TagString, st.value));
    }
    if (st.language && st.language !== "und") {
      children.push(renderStringElement(EbmlId.TagLanguage, st.language));
    }
    if (!st.defaultLanguageFlag) {
      children.push(renderUintElement(EbmlId.TagLanguageDefault, 0));
    }
    return renderEbmlElement(EbmlId.SimpleTag, combineByteVectors(children));
  }

  /**
   * Render the Targets EBML element.
   */
  private renderTargets(
    ttv: TargetTypeValue,
    trackUid: number,
    editionUid: number,
    chapterUid: number,
    attachmentUid: number,
  ): ByteVector {
    const children: ByteVector[] = [];
    if (ttv !== TargetTypeValue.None) {
      children.push(renderUintElement(EbmlId.TargetTypeValue, ttv));
    }
    if (trackUid) children.push(renderUintElement(EbmlId.TagTrackUID, trackUid));
    if (editionUid) children.push(renderUintElement(EbmlId.TagEditionUID, editionUid));
    if (chapterUid) children.push(renderUintElement(EbmlId.TagChapterUID, chapterUid));
    if (attachmentUid) children.push(renderUintElement(EbmlId.TagAttachmentUID, attachmentUid));
    return renderEbmlElement(EbmlId.Targets, combineByteVectors(children));
  }

  /**
   * Render the entire Tags EBML element from the current tag state.
   * Returns null if the tag is empty.
   */
  renderTags(): ByteVector | null {
    if (this._simpleTags.length === 0 && this._attachedFiles.length === 0) {
      return null;
    }

    // Group simple tags by (targetTypeValue, trackUid, editionUid, chapterUid, attachmentUid)
    type GroupKey = string;
    const groups = new Map<GroupKey, { ttv: TargetTypeValue; trackUid: number; editionUid: number; chapterUid: number; attachmentUid: number; tags: SimpleTag[] }>();

    for (const st of this._simpleTags) {
      const key = `${st.targetTypeValue}:${st.trackUid}:${st.editionUid}:${st.chapterUid}:${st.attachmentUid}`;
      if (!groups.has(key)) {
        groups.set(key, {
          ttv: st.targetTypeValue,
          trackUid: st.trackUid,
          editionUid: st.editionUid,
          chapterUid: st.chapterUid,
          attachmentUid: st.attachmentUid,
          tags: [],
        });
      }
      groups.get(key)!.tags.push(st);
    }

    const tagElements: ByteVector[] = [];

    // Render each group as a Tag element
    for (const group of groups.values()) {
      const tagChildren: ByteVector[] = [];
      tagChildren.push(this.renderTargets(group.ttv, group.trackUid, group.editionUid, group.chapterUid, group.attachmentUid));
      for (const st of group.tags) {
        tagChildren.push(this.renderSimpleTag(st));
      }
      tagElements.push(renderEbmlElement(EbmlId.Tag, combineByteVectors(tagChildren)));
    }

    return renderEbmlElement(EbmlId.Tags, combineByteVectors(tagElements));
  }

  /**
   * Render the Attachments EBML element from the current attached files.
   * Returns null if there are no attachments.
   */
  renderAttachments(): ByteVector | null {
    if (this._attachedFiles.length === 0) return null;

    const fileElements: ByteVector[] = [];
    for (const af of this._attachedFiles) {
      const fileChildren: ByteVector[] = [];
      if (af.description) fileChildren.push(renderStringElement(EbmlId.AttachedFileDescription, af.description));
      fileChildren.push(renderStringElement(EbmlId.AttachedFileName, af.fileName));
      fileChildren.push(renderStringElement(EbmlId.AttachedFileMediaType, af.mediaType));
      fileChildren.push(renderEbmlElement(EbmlId.AttachedFileData, af.data));
      fileChildren.push(renderUintElement(EbmlId.AttachedFileUID, af.uid || 1));
      fileElements.push(renderEbmlElement(EbmlId.AttachedFile, combineByteVectors(fileChildren)));
    }

    return renderEbmlElement(EbmlId.Attachments, combineByteVectors(fileElements));
  }

  // ---------------------------------------------------------------------------
  // Parsing from EBML
  // ---------------------------------------------------------------------------

  /**
   * Parse Tags element (0x1254C367) from the stream.
   */
  static parseFromStream(stream: IOStream, tagsElement: EbmlElement): MatroskaTag {
    const tag = new MatroskaTag();
    const dataOffset = tagsElement.offset + tagsElement.headSize;
    const tagElements = readChildElements(stream, dataOffset, tagsElement.dataSize);

    for (const tagEl of tagElements) {
      if (tagEl.id === EbmlId.Tag) {
        tag.parseTagElement(stream, tagEl);
      }
    }
    return tag;
  }

  /**
   * Parse Attachments element (0x1941A469) from the stream.
   */
  parseAttachments(stream: IOStream, attachmentsElement: EbmlElement): void {
    const dataOffset = attachmentsElement.offset + attachmentsElement.headSize;
    const children = readChildElements(stream, dataOffset, attachmentsElement.dataSize);

    for (const child of children) {
      if (child.id === EbmlId.AttachedFile) {
        this.parseAttachedFile(stream, child);
      }
    }
  }

  private parseTagElement(stream: IOStream, tagElement: EbmlElement): void {
    const dataOffset = tagElement.offset + tagElement.headSize;
    const children = readChildElements(stream, dataOffset, tagElement.dataSize);

    let targetTypeValue = TargetTypeValue.None;
    let trackUid = 0;
    let editionUid = 0;
    let chapterUid = 0;
    let attachmentUid = 0;

    // First, parse the Targets element to get target info
    for (const child of children) {
      if (child.id === EbmlId.Targets) {
        const targetChildren = readChildElements(stream,
          child.offset + child.headSize, child.dataSize);
        for (const tc of targetChildren) {
          switch (tc.id) {
            case EbmlId.TargetTypeValue:
              targetTypeValue = readUintValue(stream, tc) as TargetTypeValue;
              break;
            case EbmlId.TagTrackUID:
              trackUid = readUintValue(stream, tc);
              break;
            case EbmlId.TagEditionUID:
              editionUid = readUintValue(stream, tc);
              break;
            case EbmlId.TagChapterUID:
              chapterUid = readUintValue(stream, tc);
              break;
            case EbmlId.TagAttachmentUID:
              attachmentUid = readUintValue(stream, tc);
              break;
          }
        }
      }
    }

    // Then parse SimpleTag elements
    for (const child of children) {
      if (child.id === EbmlId.SimpleTag) {
        this.parseSimpleTag(stream, child, targetTypeValue,
          trackUid, editionUid, chapterUid, attachmentUid);
      }
    }
  }

  private parseSimpleTag(
    stream: IOStream,
    simpleTagElement: EbmlElement,
    targetTypeValue: TargetTypeValue,
    trackUid: number,
    editionUid: number,
    chapterUid: number,
    attachmentUid: number,
  ): void {
    const dataOffset = simpleTagElement.offset + simpleTagElement.headSize;
    const children = readChildElements(stream, dataOffset, simpleTagElement.dataSize);

    let name = "";
    let value = "";
    let binaryValue: ByteVector | undefined;
    let language = "und";
    let defaultLanguageFlag = true;

    for (const child of children) {
      switch (child.id) {
        case EbmlId.TagName:
          name = readStringValue(stream, child);
          break;
        case EbmlId.TagString:
          value = readStringValue(stream, child);
          break;
        case EbmlId.TagBinary:
          binaryValue = readElementData(stream, child);
          break;
        case EbmlId.TagLanguage:
          language = readStringValue(stream, child);
          break;
        case EbmlId.TagLanguageDefault:
          defaultLanguageFlag = readUintValue(stream, child) !== 0;
          break;
      }
    }

    if (name) {
      this._simpleTags.push({
        name,
        value,
        binaryValue,
        language,
        defaultLanguageFlag,
        targetTypeValue,
        trackUid,
        editionUid,
        chapterUid,
        attachmentUid,
      });
    }
  }

  private parseAttachedFile(stream: IOStream, element: EbmlElement): void {
    const dataOffset = element.offset + element.headSize;
    const children = readChildElements(stream, dataOffset, element.dataSize);

    let description = "";
    let fileName = "";
    let mediaType = "";
    let data = new ByteVector();
    let uid = 0;

    for (const child of children) {
      switch (child.id) {
        case EbmlId.AttachedFileDescription:
          description = readStringValue(stream, child);
          break;
        case EbmlId.AttachedFileName:
          fileName = readStringValue(stream, child);
          break;
        case EbmlId.AttachedFileMediaType:
          mediaType = readStringValue(stream, child);
          break;
        case EbmlId.AttachedFileData:
          data = readElementData(stream, child);
          break;
        case EbmlId.AttachedFileUID:
          uid = readUintValue(stream, child);
          break;
      }
    }

    if (fileName || mediaType) {
      this._attachedFiles.push({ description, fileName, mediaType, data, uid });
    }
  }
}
