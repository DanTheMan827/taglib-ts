import { File } from "../file.js";
import { IOStream } from "../toolkit/ioStream.js";
import { Position, ReadStyle } from "../toolkit/types.js";
import { PropertyMap } from "../toolkit/propertyMap.js";
import type { VariantMap } from "../toolkit/variant.js";
import { MatroskaTag } from "./matroskaTag.js";
import { MatroskaProperties } from "./matroskaProperties.js";
import {
  EbmlId,
  readElement,
  skipElement,
  findElement,
  readChildElements,
  readUintValue,
  readFloatValue,
  readStringValue,
  type EbmlElement,
} from "./ebml/ebmlElement.js";

/**
 * An implementation of TagLib::File for Matroska containers
 * (MKV, MKA, WebM).
 */
export class MatroskaFile extends File {
  private _tag: MatroskaTag | null = null;
  private _properties: MatroskaProperties | null = null;
  private _readStyle: ReadStyle;

  constructor(
    stream: IOStream,
    readProperties: boolean = true,
    readStyle: ReadStyle = ReadStyle.Average,
  ) {
    super(stream);
    this._readStyle = readStyle;
    if (this.isOpen) {
      this.read(readProperties, readStyle);
    }
  }

  tag(): MatroskaTag | null {
    return this._tag;
  }

  audioProperties(): MatroskaProperties | null {
    return this._properties;
  }

  save(): boolean {
    // Read-only implementation for now
    return false;
  }

  override properties(): PropertyMap {
    return this._tag?.properties() ?? new PropertyMap();
  }

  override setProperties(properties: PropertyMap): PropertyMap {
    if (!this._tag) {
      this._tag = new MatroskaTag();
    }
    return this._tag.setProperties(properties);
  }

  override removeUnsupportedProperties(properties: string[]): void {
    this._tag?.removeUnsupportedProperties(properties);
  }

  override complexPropertyKeys(): string[] {
    return this._tag?.complexPropertyKeys() ?? [];
  }

  override complexProperties(key: string): VariantMap[] {
    return this._tag?.complexProperties(key) ?? [];
  }

  override setComplexProperties(key: string, value: VariantMap[]): boolean {
    return this._tag?.setComplexProperties(key, value) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------

  private read(readProperties: boolean, readStyle: ReadStyle): void {
    const fileLength = this.fileLength;
    this._stream.seek(0, Position.Beginning);

    // Read EBML header element
    const header = readElement(this._stream);
    if (!header || header.id !== EbmlId.EBMLHeader) {
      this._valid = false;
      return;
    }

    // Parse EBML header children for DocType info
    let docType = "";
    let docTypeVersion = 0;
    if (readProperties) {
      const headerChildren = readChildElements(
        this._stream,
        header.offset + header.headSize,
        header.dataSize,
      );
      for (const child of headerChildren) {
        switch (child.id) {
          case EbmlId.DocType:
            docType = readStringValue(this._stream, child);
            break;
          case EbmlId.DocTypeVersion:
            docTypeVersion = readUintValue(this._stream, child);
            break;
        }
      }
    }

    // Skip past header to find Segment
    this._stream.seek(header.offset + header.headSize + header.dataSize, Position.Beginning);

    // Find the Segment element
    const segment = findElement(this._stream, EbmlId.Segment, fileLength);
    if (!segment) {
      this._valid = false;
      return;
    }

    const segmentDataOffset = segment.offset + segment.headSize;
    const segmentEnd = segmentDataOffset + segment.dataSize;

    // Parse segment children, using SeekHead to find major elements
    this._stream.seek(segmentDataOffset, Position.Beginning);

    // Collect positions of major elements from SeekHead
    const elementPositions = new Map<number, number>();
    let foundTags = false;
    let foundTracks = false;
    let foundInfo = false;
    let foundAttachments = false;

    // First pass: scan for SeekHead and any directly-encountered major elements
    const maxScanOffset = Math.min(segmentEnd, segmentDataOffset + 1048576); // Scan up to 1MB
    while (this._stream.tell() < maxScanOffset) {
      const el = readElement(this._stream);
      if (!el) break;

      if (el.id === EbmlId.SeekHead) {
        this.parseSeekHead(segmentDataOffset, el, elementPositions);
        skipElement(this._stream, el);
        continue;
      }

      // Process elements we encounter directly
      if (el.id === EbmlId.Tags || el.id === EbmlId.Tracks ||
          el.id === EbmlId.Info || el.id === EbmlId.Attachments) {
        elementPositions.set(el.id, el.offset);
      }

      // Stop scanning at Cluster (media data) to avoid slow full-file scan
      if (el.id === EbmlId.Cluster) break;

      skipElement(this._stream, el);
    }

    // Now process elements by their IDs, either from direct encounters or SeekHead
    // Parse Info
    const infoOffset = elementPositions.get(EbmlId.Info);
    if (infoOffset !== undefined && readProperties) {
      this._stream.seek(infoOffset, Position.Beginning);
      const infoEl = readElement(this._stream);
      if (infoEl && infoEl.id === EbmlId.Info) {
        foundInfo = true;
        this.parseInfo(infoEl, readProperties);
      }
    }

    // Parse Tracks
    const tracksOffset = elementPositions.get(EbmlId.Tracks);
    if (tracksOffset !== undefined && readProperties) {
      this._stream.seek(tracksOffset, Position.Beginning);
      const tracksEl = readElement(this._stream);
      if (tracksEl && tracksEl.id === EbmlId.Tracks) {
        foundTracks = true;
        this.parseTracks(tracksEl);
      }
    }

    // Parse Tags
    const tagsOffset = elementPositions.get(EbmlId.Tags);
    if (tagsOffset !== undefined) {
      this._stream.seek(tagsOffset, Position.Beginning);
      const tagsEl = readElement(this._stream);
      if (tagsEl && tagsEl.id === EbmlId.Tags) {
        foundTags = true;
        this._tag = MatroskaTag.parseFromStream(this._stream, tagsEl);
      }
    }

    // Parse Attachments
    const attachmentsOffset = elementPositions.get(EbmlId.Attachments);
    if (attachmentsOffset !== undefined) {
      this._stream.seek(attachmentsOffset, Position.Beginning);
      const attachmentsEl = readElement(this._stream);
      if (attachmentsEl && attachmentsEl.id === EbmlId.Attachments) {
        foundAttachments = true;
        if (!this._tag) this._tag = new MatroskaTag();
        this._tag.parseAttachments(this._stream, attachmentsEl);
      }
    }

    // Set properties
    if (readProperties) {
      if (!this._properties) {
        this._properties = new MatroskaProperties(readStyle);
      }
      this._properties.setDocType(docType);
      this._properties.setDocTypeVersion(docTypeVersion);
      this._properties.setFileLength(fileLength);

      if (this._tag) {
        this._tag.segmentTitle = this._properties.title;
      }
    }

    this._valid = true;
  }

  private parseSeekHead(
    segmentDataOffset: number,
    seekHeadEl: EbmlElement,
    positions: Map<number, number>,
  ): void {
    const dataOffset = seekHeadEl.offset + seekHeadEl.headSize;
    const children = readChildElements(this._stream, dataOffset, seekHeadEl.dataSize);

    for (const child of children) {
      if (child.id === EbmlId.Seek) {
        this.parseSeekEntry(segmentDataOffset, child, positions);
      }
    }
  }

  private parseSeekEntry(
    segmentDataOffset: number,
    seekEl: EbmlElement,
    positions: Map<number, number>,
  ): void {
    const dataOffset = seekEl.offset + seekEl.headSize;
    const children = readChildElements(this._stream, dataOffset, seekEl.dataSize);

    let seekId = 0;
    let seekPosition = 0;

    for (const child of children) {
      switch (child.id) {
        case EbmlId.SeekID:
          // SeekID is a binary element containing the element ID bytes
          seekId = readUintValue(this._stream, child);
          break;
        case EbmlId.SeekPosition:
          seekPosition = readUintValue(this._stream, child);
          break;
      }
    }

    if (seekId) {
      positions.set(seekId, segmentDataOffset + seekPosition);
    }
  }

  private parseInfo(infoEl: EbmlElement, readProperties: boolean): void {
    if (!readProperties) return;
    if (!this._properties) {
      this._properties = new MatroskaProperties(this._readStyle);
    }

    const dataOffset = infoEl.offset + infoEl.headSize;
    const children = readChildElements(this._stream, dataOffset, infoEl.dataSize);

    let timestampScale = 1000000; // Default: 1ms in nanoseconds
    let duration = 0;
    let title = "";

    for (const child of children) {
      switch (child.id) {
        case EbmlId.TimestampScale:
          timestampScale = readUintValue(this._stream, child);
          break;
        case EbmlId.Duration:
          duration = readFloatValue(this._stream, child);
          break;
        case EbmlId.Title:
          title = readStringValue(this._stream, child);
          break;
      }
    }

    // Duration is in TimestampScale units; convert to milliseconds
    if (duration > 0) {
      const durationMs = Math.round(duration * timestampScale / 1000000);
      this._properties.setLengthInMilliseconds(durationMs);
    }
    if (title) {
      this._properties.setTitle(title);
    }
  }

  private parseTracks(tracksEl: EbmlElement): void {
    if (!this._properties) {
      this._properties = new MatroskaProperties(this._readStyle);
    }

    const dataOffset = tracksEl.offset + tracksEl.headSize;
    const children = readChildElements(this._stream, dataOffset, tracksEl.dataSize);

    let foundAudioTrack = false;

    for (const child of children) {
      if (child.id === EbmlId.TrackEntry) {
        this.parseTrackEntry(child, foundAudioTrack);
        if (!foundAudioTrack && this._properties!.codecName) {
          foundAudioTrack = true;
        }
      }
    }
  }

  private parseTrackEntry(trackEntryEl: EbmlElement, audioAlreadyFound: boolean): void {
    const dataOffset = trackEntryEl.offset + trackEntryEl.headSize;
    const children = readChildElements(this._stream, dataOffset, trackEntryEl.dataSize);

    let trackType = 0;
    let codecId = "";

    for (const child of children) {
      switch (child.id) {
        case EbmlId.TrackType:
          trackType = readUintValue(this._stream, child);
          break;
        case EbmlId.CodecID:
          codecId = readStringValue(this._stream, child);
          break;
      }
    }

    // Only set audio properties from the first audio track (trackType === 2)
    if (trackType === 2 && !audioAlreadyFound) {
      this._properties!.setCodecName(codecId);

      // Parse Audio sub-element
      for (const child of children) {
        if (child.id === EbmlId.Audio) {
          this.parseAudioElement(child);
          break;
        }
      }
    }
  }

  private parseAudioElement(audioEl: EbmlElement): void {
    const dataOffset = audioEl.offset + audioEl.headSize;
    const children = readChildElements(this._stream, dataOffset, audioEl.dataSize);

    for (const child of children) {
      switch (child.id) {
        case EbmlId.SamplingFrequency: {
          const freq = readFloatValue(this._stream, child);
          this._properties!.setSampleRate(Math.round(freq));
          break;
        }
        case EbmlId.Channels:
          this._properties!.setChannels(readUintValue(this._stream, child));
          break;
        case EbmlId.BitDepth:
          this._properties!.setBitsPerSample(readUintValue(this._stream, child));
          break;
      }
    }
  }
}
