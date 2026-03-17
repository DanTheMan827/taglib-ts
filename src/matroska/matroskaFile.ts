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

  private constructor(stream: IOStream, readStyle: ReadStyle = ReadStyle.Average) {
    super(stream);
    this._readStyle = readStyle;
  }

  static async open(
    stream: IOStream,
    readProperties: boolean = true,
    readStyle: ReadStyle = ReadStyle.Average,
  ): Promise<MatroskaFile> {
    const f = new MatroskaFile(stream, readStyle);
    if (f.isOpen) {
      await f.read(readProperties, readStyle);
    }
    return f;
  }

  tag(): MatroskaTag | null {
    return this._tag;
  }

  audioProperties(): MatroskaProperties | null {
    return this._properties;
  }

  async save(): Promise<boolean> {
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
    const tagsOk = await this.replaceOrInsertElement(
      this._tagsEl,
      newTagsData,
      EbmlId.Tags,
    );

    // Replace or insert Attachments element
    const attachOk = await this.replaceOrInsertElement(
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
  private async replaceOrInsertElement(
    existing: EbmlElement | null,
    newData: ByteVector | null,
    elementId: number,
  ): Promise<boolean> {
    void elementId; // reserved for future SeekHead updates
    if (!newData || newData.length === 0) {
      // If empty and no existing element, nothing to do
      if (!existing) return true;
      // If there's an existing element, replace with Void
      const voidEl = renderVoidElement(existing.headSize + existing.dataSize);
      await this._stream.seek(existing.offset, Position.Beginning);
      await this._stream.writeBlock(voidEl);
      return true;
    }

    if (existing) {
      const oldTotalSize = existing.headSize + existing.dataSize;
      const newTotalSize = newData.length;

      if (newTotalSize <= oldTotalSize) {
        // Write new element in place, pad with Void if needed
        await this._stream.seek(existing.offset, Position.Beginning);
        await this._stream.writeBlock(newData);
        const leftover = oldTotalSize - newTotalSize;
        if (leftover >= 2) {
          // Write a Void element to fill the gap
          const voidEl = renderVoidElement(leftover);
          await this._stream.writeBlock(voidEl);
        } else if (leftover === 1) {
          // 1 byte gap: write a null byte (absorbed by surrounding elements)
          await this._stream.writeBlock(new ByteVector(new Uint8Array([0x00])));
        }
        return true;
      } else {
        // New element is larger — replace existing with Void, append new at EOF
        const voidEl = renderVoidElement(oldTotalSize);
        await this._stream.seek(existing.offset, Position.Beginning);
        await this._stream.writeBlock(voidEl);
        await this.appendAtEndOfSegment(newData);
        return true;
      }
    } else {
      // No existing element — append at end of segment
      await this.appendAtEndOfSegment(newData);
      return true;
    }
  }

  /**
   * Append data at the end of the file.
   * If the segment has a fixed (known) size, convert it to "unknown" size first
   * so that the appended data is included within the segment.
   * In EBML, the "unknown" size VINT has all data bits set to 1.
   */
  private async appendAtEndOfSegment(data: ByteVector): Promise<void> {
    if (this._segmentSizeVintOffset >= 0 && this._segmentSizeVintLength > 0) {
      // Render an "unknown" size VINT of the same byte length.
      // For n bytes: first byte = (1 << (9-n)) - 1, rest = 0xFF
      const n = this._segmentSizeVintLength;
      const unknownVint = new Uint8Array(n);
      unknownVint[0] = (1 << (9 - n)) - 1;
      for (let i = 1; i < n; i++) unknownVint[i] = 0xff;
      await this._stream.seek(this._segmentSizeVintOffset, Position.Beginning);
      await this._stream.writeBlock(new ByteVector(unknownVint));
      // Don't update segment size again on subsequent saves
      this._segmentSizeVintOffset = -1;
    }
    await this._stream.seek(0, Position.End);
    await this._stream.writeBlock(data);
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

  private async read(readProperties: boolean, readStyle: ReadStyle): Promise<void> {
    const fileLength = await this.fileLength();
    await this._stream.seek(0, Position.Beginning);

    // Read EBML header element
    const header = await readElement(this._stream);
    if (!header || header.id !== EbmlId.EBMLHeader) {
      this._valid = false;
      return;
    }

    // Parse EBML header children for DocType info
    let docType = "";
    let docTypeVersion = 0;
    if (readProperties) {
      const headerChildren = await readChildElements(
        this._stream,
        header.offset + header.headSize,
        header.dataSize,
      );
      for (const child of headerChildren) {
        switch (child.id) {
          case EbmlId.DocType:
            docType = await readStringValue(this._stream, child);
            break;
          case EbmlId.DocTypeVersion:
            docTypeVersion = await readUintValue(this._stream, child);
            break;
        }
      }
    }

    // Skip past header to find Segment
    await this._stream.seek(header.offset + header.headSize + header.dataSize, Position.Beginning);

    // Find the Segment element
    const segment = await findElement(this._stream, EbmlId.Segment, fileLength);
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
    await this._stream.seek(segmentDataOffset, Position.Beginning);

    // Collect positions of major elements from SeekHead
    const elementPositions = new Map<number, number>();

    // First pass: scan for SeekHead and any directly-encountered major elements
    const maxScanOffset = Math.min(segmentEnd, segmentDataOffset + 1048576); // up to 1MB
    let lastScanPosition = segmentDataOffset;

    while ((await this._stream.tell()) < maxScanOffset) {
      const el = await readElement(this._stream);
      if (!el) break;

      if (el.id === EbmlId.SeekHead) {
        await this.parseSeekHead(segmentDataOffset, el, elementPositions);
        await skipElement(this._stream, el);
        lastScanPosition = await this._stream.tell();
        continue;
      }

      // Process elements we encounter directly
      if (el.id === EbmlId.Tags || el.id === EbmlId.Tracks ||
          el.id === EbmlId.Info || el.id === EbmlId.Attachments) {
        elementPositions.set(el.id, el.offset);
      }

      lastScanPosition = await this._stream.tell();
      await skipElement(this._stream, el);
    }

    // If Tags or Attachments were not found via SeekHead or before Cluster,
    // do a forward scan from where we stopped to end-of-file.
    if (!elementPositions.has(EbmlId.Tags) || !elementPositions.has(EbmlId.Attachments)) {
      const scanFrom = Math.max(lastScanPosition, await this._stream.tell());
      await this._stream.seek(scanFrom, Position.Beginning);
      while ((await this._stream.tell()) < segmentEnd) {
        const el = await readElement(this._stream);
        if (!el) break;
        if (el.id === EbmlId.Tags || el.id === EbmlId.Attachments) {
          elementPositions.set(el.id, el.offset);
        }
        await skipElement(this._stream, el);
      }
    }

    // Parse Info
    const infoOffset = elementPositions.get(EbmlId.Info);
    if (infoOffset !== undefined && readProperties) {
      await this._stream.seek(infoOffset, Position.Beginning);
      const infoEl = await readElement(this._stream);
      if (infoEl && infoEl.id === EbmlId.Info) {
        await this.parseInfo(infoEl, readProperties);
      }
    }

    // Parse Tracks
    const tracksOffset = elementPositions.get(EbmlId.Tracks);
    if (tracksOffset !== undefined && readProperties) {
      await this._stream.seek(tracksOffset, Position.Beginning);
      const tracksEl = await readElement(this._stream);
      if (tracksEl && tracksEl.id === EbmlId.Tracks) {
        await this.parseTracks(tracksEl);
      }
    }

    // Parse Tags
    const tagsOffset = elementPositions.get(EbmlId.Tags);
    if (tagsOffset !== undefined) {
      await this._stream.seek(tagsOffset, Position.Beginning);
      const tagsEl = await readElement(this._stream);
      if (tagsEl && tagsEl.id === EbmlId.Tags) {
        this._tagsEl = tagsEl;
        this._tag = await MatroskaTag.parseFromStream(this._stream, tagsEl);
      }
    }

    // Parse Attachments
    const attachmentsOffset = elementPositions.get(EbmlId.Attachments);
    if (attachmentsOffset !== undefined) {
      await this._stream.seek(attachmentsOffset, Position.Beginning);
      const attachmentsEl = await readElement(this._stream);
      if (attachmentsEl && attachmentsEl.id === EbmlId.Attachments) {
        this._attachmentsEl = attachmentsEl;
        if (!this._tag) this._tag = new MatroskaTag();
        await this._tag.parseAttachments(this._stream, attachmentsEl);
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

    // Ensure a tag object always exists (even if empty)
    if (!this._tag) {
      this._tag = new MatroskaTag();
    }

    this._valid = true;
  }

  private async parseSeekHead(
    segmentDataOffset: number,
    seekHeadEl: EbmlElement,
    positions: Map<number, number>,
  ): Promise<void> {
    const dataOffset = seekHeadEl.offset + seekHeadEl.headSize;
    const children = await readChildElements(this._stream, dataOffset, seekHeadEl.dataSize);

    for (const child of children) {
      if (child.id === EbmlId.Seek) {
        await this.parseSeekEntry(segmentDataOffset, child, positions);
      }
    }
  }

  private async parseSeekEntry(
    segmentDataOffset: number,
    seekEl: EbmlElement,
    positions: Map<number, number>,
  ): Promise<void> {
    const dataOffset = seekEl.offset + seekEl.headSize;
    const children = await readChildElements(this._stream, dataOffset, seekEl.dataSize);

    let seekId = 0;
    let seekPosition = 0;

    for (const child of children) {
      switch (child.id) {
        case EbmlId.SeekID:
          seekId = await readUintValue(this._stream, child);
          break;
        case EbmlId.SeekPosition:
          seekPosition = await readUintValue(this._stream, child);
          break;
      }
    }

    if (seekId) {
      positions.set(seekId, segmentDataOffset + seekPosition);
    }
  }

  private async parseInfo(infoEl: EbmlElement, readProperties: boolean): Promise<void> {
    if (!readProperties) return;
    if (!this._properties) {
      this._properties = new MatroskaProperties(this._readStyle);
    }

    const dataOffset = infoEl.offset + infoEl.headSize;
    const children = await readChildElements(this._stream, dataOffset, infoEl.dataSize);

    let timestampScale = 1000000; // Default: 1ms in nanoseconds
    let duration = 0;
    let title = "";

    for (const child of children) {
      switch (child.id) {
        case EbmlId.TimestampScale:
          timestampScale = await readUintValue(this._stream, child);
          break;
        case EbmlId.Duration:
          duration = await readFloatValue(this._stream, child);
          break;
        case EbmlId.Title:
          title = await readStringValue(this._stream, child);
          break;
      }
    }

    // Duration is in TimestampScale units; convert to milliseconds
    if (duration > 0) {
      const durationMs = Math.round((duration * timestampScale) / 1000000);
      this._properties.setLengthInMilliseconds(durationMs);
    }
    if (title) {
      this._properties.setTitle(title);
    }
  }

  private async parseTracks(tracksEl: EbmlElement): Promise<void> {
    if (!this._properties) {
      this._properties = new MatroskaProperties(this._readStyle);
    }

    const dataOffset = tracksEl.offset + tracksEl.headSize;
    const children = await readChildElements(this._stream, dataOffset, tracksEl.dataSize);

    let foundAudioTrack = false;

    for (const child of children) {
      if (child.id === EbmlId.TrackEntry) {
        await this.parseTrackEntry(child, foundAudioTrack);
        if (!foundAudioTrack && this._properties!.codecName) {
          foundAudioTrack = true;
        }
      }
    }
  }

  private async parseTrackEntry(trackEntryEl: EbmlElement, audioAlreadyFound: boolean): Promise<void> {
    const dataOffset = trackEntryEl.offset + trackEntryEl.headSize;
    const children = await readChildElements(this._stream, dataOffset, trackEntryEl.dataSize);

    let trackType = 0;
    let codecId = "";

    for (const child of children) {
      switch (child.id) {
        case EbmlId.TrackType:
          trackType = await readUintValue(this._stream, child);
          break;
        case EbmlId.CodecID:
          codecId = await readStringValue(this._stream, child);
          break;
      }
    }

    // Only set audio properties from the first audio track (trackType === 2)
    if (trackType === 2 && !audioAlreadyFound) {
      this._properties!.setCodecName(codecId);

      // Parse Audio sub-element
      for (const child of children) {
        if (child.id === EbmlId.Audio) {
          await this.parseAudioElement(child);
          break;
        }
      }
    }
  }

  private async parseAudioElement(audioEl: EbmlElement): Promise<void> {
    const dataOffset = audioEl.offset + audioEl.headSize;
    const children = await readChildElements(this._stream, dataOffset, audioEl.dataSize);

    for (const child of children) {
      switch (child.id) {
        case EbmlId.SamplingFrequency: {
          const freq = await readFloatValue(this._stream, child);
          this._properties!.setSampleRate(Math.round(freq));
          break;
        }
        case EbmlId.Channels:
          this._properties!.setChannels(await readUintValue(this._stream, child));
          break;
        case EbmlId.BitDepth:
          this._properties!.setBitsPerSample(await readUintValue(this._stream, child));
          break;
      }
    }
  }
}
