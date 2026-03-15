import { File } from "../file.js";
import { IOStream } from "../toolkit/ioStream.js";
import { Position, ReadStyle } from "../toolkit/types.js";
import { PropertyMap } from "../toolkit/propertyMap.js";
import type { VariantMap } from "../toolkit/variant.js";
import { ByteVector } from "../byteVector.js";
import { MatroskaTag } from "./matroskaTag.js";
import { MatroskaProperties } from "./matroskaProperties.js";
import {
  EbmlId,
  idSize,
  readElement,
  skipElement,
  findElement,
  readChildElements,
  readUintValue,
  readFloatValue,
  readStringValue,
  renderVoidElement,
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

  // Element locations saved during read, used during save
  private _tagsEl: EbmlElement | null = null;
  private _attachmentsEl: EbmlElement | null = null;
  // Segment size VINT location: byte offset right after the segment ID
  private _segmentSizeVintOffset: number = -1;
  private _segmentSizeVintLength: number = 0;

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
    if (this.readOnly) {
      return false;
    }

    if (!this._valid) {
      return false;
    }

    // Create empty tag if needed (so we can always serialize)
    if (!this._tag) {
      this._tag = new MatroskaTag();
    }

    // Render the new Tags element (null if empty)
    const newTagsData = this._tag.renderTags();
    const newAttachmentsData = this._tag.renderAttachments();

    // Replace or insert Tags element
    const tagsOk = this.replaceOrInsertElement(
      this._tagsEl,
      newTagsData,
      EbmlId.Tags,
    );

    // Replace or insert Attachments element
    const attachOk = this.replaceOrInsertElement(
      this._attachmentsEl,
      newAttachmentsData,
      EbmlId.Attachments,
    );

    return tagsOk && attachOk;
  }

  /**
   * Replace an existing EBML element with new data, or insert at end of segment.
   * Uses Void elements to fill any leftover space if the new data is smaller.
   */
  private replaceOrInsertElement(
    existing: EbmlElement | null,
    newData: ByteVector | null,
    elementId: number,
  ): boolean {
    void elementId; // reserved for future SeekHead updates
    if (!newData || newData.length === 0) {
      // If empty and no existing element, nothing to do
      if (!existing) return true;
      // If there's an existing element, replace with Void
      const voidEl = renderVoidElement(existing.headSize + existing.dataSize);
      this._stream.seek(existing.offset, Position.Beginning);
      this._stream.writeBlock(voidEl);
      return true;
    }

    if (existing) {
      const oldTotalSize = existing.headSize + existing.dataSize;
      const newTotalSize = newData.length;

      if (newTotalSize <= oldTotalSize) {
        // Write new element in place, pad with Void if needed
        this._stream.seek(existing.offset, Position.Beginning);
        this._stream.writeBlock(newData);
        const leftover = oldTotalSize - newTotalSize;
        if (leftover >= 2) {
          // Write a Void element to fill the gap
          const voidEl = renderVoidElement(leftover);
          this._stream.writeBlock(voidEl);
        } else if (leftover === 1) {
          // 1 byte gap: write a null byte (absorbed by surrounding elements)
          this._stream.writeBlock(new ByteVector(new Uint8Array([0x00])));
        }
        return true;
      } else {
        // New element is larger — replace existing with Void, append new at EOF
        const voidEl = renderVoidElement(oldTotalSize);
        this._stream.seek(existing.offset, Position.Beginning);
        this._stream.writeBlock(voidEl);
        this.appendAtEndOfSegment(newData);
        return true;
      }
    } else {
      // No existing element — append at end of segment
      this.appendAtEndOfSegment(newData);
      return true;
    }
  }

  /**
   * Append data at the end of the file.
   * If the segment has a fixed (known) size, convert it to "unknown" size first
   * so that the appended data is included within the segment.
   * In EBML, the "unknown" size VINT has all data bits set to 1.
   */
  private appendAtEndOfSegment(data: ByteVector): void {
    if (this._segmentSizeVintOffset >= 0 && this._segmentSizeVintLength > 0) {
      // Render an "unknown" size VINT of the same byte length.
      // For n bytes: first byte = (1 << (9-n)) - 1, rest = 0xFF
      const n = this._segmentSizeVintLength;
      const unknownVint = new Uint8Array(n);
      unknownVint[0] = (1 << (9 - n)) - 1;
      for (let i = 1; i < n; i++) unknownVint[i] = 0xFF;
      this._stream.seek(this._segmentSizeVintOffset, Position.Beginning);
      this._stream.writeBlock(new ByteVector(unknownVint));
      // Don't update segment size again on subsequent saves
      this._segmentSizeVintOffset = -1;
    }
    this._stream.seek(0, Position.End);
    this._stream.writeBlock(data);
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

    // Track where the segment size VINT is stored (for updating when we grow the file)
    this._segmentSizeVintOffset = segment.offset + idSize(EbmlId.Segment);
    this._segmentSizeVintLength = segment.headSize - idSize(EbmlId.Segment);

    const segmentDataOffset = segment.offset + segment.headSize;
    // Segment may have "unknown" EBML size (all 1-bits); use fileLength as cap
    const segmentEnd = Math.min(segmentDataOffset + segment.dataSize, fileLength);

    // Parse segment children, using SeekHead to find major elements
    this._stream.seek(segmentDataOffset, Position.Beginning);

    // Collect positions of major elements from SeekHead
    const elementPositions = new Map<number, number>();

    // First pass: scan for SeekHead and any directly-encountered major elements
    // For large files, scan at most 1MB before the first cluster.
    // After this pass, we also scan from the current position to end-of-segment
    // for Tags/Attachments, which may be appended after the cluster.
    const maxScanOffset = Math.min(segmentEnd, segmentDataOffset + 1048576); // up to 1MB
    let lastScanPosition = segmentDataOffset;

    while (this._stream.tell() < maxScanOffset) {
      const el = readElement(this._stream);
      if (!el) break;

      if (el.id === EbmlId.SeekHead) {
        this.parseSeekHead(segmentDataOffset, el, elementPositions);
        skipElement(this._stream, el);
        lastScanPosition = this._stream.tell();
        continue;
      }

      // Process elements we encounter directly
      if (el.id === EbmlId.Tags || el.id === EbmlId.Tracks ||
          el.id === EbmlId.Info || el.id === EbmlId.Attachments) {
        elementPositions.set(el.id, el.offset);
      }

      // Skip Cluster contents (media data) to avoid slow scan, but continue
      lastScanPosition = this._stream.tell();
      skipElement(this._stream, el);
    }

    // If Tags or Attachments were not found via SeekHead or before Cluster,
    // do a forward scan from where we stopped (or from 1MB mark) to end-of-file.
    // This handles the case where tags are appended at the end of the file.
    if (!elementPositions.has(EbmlId.Tags) || !elementPositions.has(EbmlId.Attachments)) {
      const scanFrom = Math.max(lastScanPosition, this._stream.tell());
      this._stream.seek(scanFrom, Position.Beginning);
      while (this._stream.tell() < segmentEnd) {
        const el = readElement(this._stream);
        if (!el) break;
        if (el.id === EbmlId.Tags || el.id === EbmlId.Attachments) {
          elementPositions.set(el.id, el.offset);
        }
        skipElement(this._stream, el);
      }
    }

    // Now process elements by their IDs, either from direct encounters or SeekHead
    // Parse Info
    const infoOffset = elementPositions.get(EbmlId.Info);
    if (infoOffset !== undefined && readProperties) {
      this._stream.seek(infoOffset, Position.Beginning);
      const infoEl = readElement(this._stream);
      if (infoEl && infoEl.id === EbmlId.Info) {
        this.parseInfo(infoEl, readProperties);
      }
    }

    // Parse Tracks
    const tracksOffset = elementPositions.get(EbmlId.Tracks);
    if (tracksOffset !== undefined && readProperties) {
      this._stream.seek(tracksOffset, Position.Beginning);
      const tracksEl = readElement(this._stream);
      if (tracksEl && tracksEl.id === EbmlId.Tracks) {
        this.parseTracks(tracksEl);
      }
    }

    // Parse Tags
    const tagsOffset = elementPositions.get(EbmlId.Tags);
    if (tagsOffset !== undefined) {
      this._stream.seek(tagsOffset, Position.Beginning);
      const tagsEl = readElement(this._stream);
      if (tagsEl && tagsEl.id === EbmlId.Tags) {
        this._tagsEl = tagsEl;
        this._tag = MatroskaTag.parseFromStream(this._stream, tagsEl);
      }
    }

    // Parse Attachments
    const attachmentsOffset = elementPositions.get(EbmlId.Attachments);
    if (attachmentsOffset !== undefined) {
      this._stream.seek(attachmentsOffset, Position.Beginning);
      const attachmentsEl = readElement(this._stream);
      if (attachmentsEl && attachmentsEl.id === EbmlId.Attachments) {
        this._attachmentsEl = attachmentsEl;
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

    // Ensure a tag object always exists (even if empty), so callers can always
    // set tags without checking for null (matches C TagLib behavior for create=true)
    if (!this._tag) {
      this._tag = new MatroskaTag();
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
