import { ByteVector, StringType } from "../byteVector.js";
import { File } from "../file.js";
import { Tag } from "../tag.js";
import { Position, ReadStyle } from "../toolkit/types.js";
import type { IOStream } from "../toolkit/ioStream.js";
import { ModTag } from "../mod/modTag.js";
import { XmProperties } from "./xmProperties.js";

/**
 * Helper: read a Latin1 string, trimming at the first NUL and replacing 0xFF with space.
 */
function readString(data: ByteVector, maxLen: number): string {
  let raw = data.mid(0, maxLen).toString(StringType.Latin1);
  raw = raw.replace(/\xff/g, " ");
  const nul = raw.indexOf("\0");
  return nul >= 0 ? raw.substring(0, nul) : raw;
}

/**
 * Extended Module (XM) file format handler.
 *
 * Magic "Extended Module: " at offset 0. Title at offset 17 (20 bytes).
 * Tracker name at offset 38 (20 bytes). Instrument and sample names form the comment.
 */
export class XmFile extends File {
  private _tag: ModTag;
  private _properties: XmProperties | null = null;

  private constructor(stream: IOStream) {
    super(stream);
    this._tag = new ModTag();
  }

  static async open(
    stream: IOStream,
    readProperties: boolean = true,
    readStyle: ReadStyle = ReadStyle.Average,
  ): Promise<XmFile> {
    const f = new XmFile(stream);
    if (f.isOpen) {
      await f.read(readProperties, readStyle);
    }
    return f;
  }

  // ---------------------------------------------------------------------------
  // Static
  // ---------------------------------------------------------------------------

  static async isSupported(stream: IOStream): Promise<boolean> {
    await stream.seek(0);
    const header = await stream.readBlock(17);
    if (header.length < 17) return false;
    const magic = header.toString(StringType.Latin1);
    return magic === "Extended Module: ";
  }

  // ---------------------------------------------------------------------------
  // File interface
  // ---------------------------------------------------------------------------

  tag(): Tag {
    return this._tag;
  }

  audioProperties(): XmProperties | null {
    return this._properties;
  }

  async save(): Promise<boolean> {
    if (this.readOnly) return false;

    // Write title
    await this.seek(17);
    await this.writeBlock(padString(this._tag.title, 20));

    // Write tracker name
    await this.seek(38);
    await this.writeBlock(padString(this._tag.trackerName, 20));

    // Read header size to navigate patterns and instruments
    await this.seek(60);
    const headerSizeData = await this.readBlock(4);
    if (headerSizeData.length < 4) return false;
    const headerSize = headerSizeData.toUInt(0, false); // little-endian

    await this.seek(70);
    const patternCountData = await this.readBlock(2);
    const instrumentCountData = await this.readBlock(2);
    if (patternCountData.length < 2 || instrumentCountData.length < 2) return false;
    const patternCount = patternCountData.toUShort(0, false);
    const instrumentCount = instrumentCountData.toUShort(0, false);

    let pos = 60 + headerSize;

    // Skip patterns
    for (let i = 0; i < patternCount; i++) {
      await this.seek(pos);
      const phlData = await this.readBlock(4);
      if (phlData.length < 4) return false;
      const patternHeaderLength = phlData.toUInt(0, false);
      if (patternHeaderLength < 4) return false;

      await this.seek(pos + 7);
      const dsData = await this.readBlock(2);
      if (dsData.length < 2) return false;
      const dataSize = dsData.toUShort(0, false);

      pos += patternHeaderLength + dataSize;
    }

    const lines = this._tag.comment.split("\n");
    let sampleNameIndex = instrumentCount;

    for (let i = 0; i < instrumentCount; i++) {
      await this.seek(pos);
      const ihsData = await this.readBlock(4);
      if (ihsData.length < 4) return false;
      const instrumentHeaderSize = ihsData.toUInt(0, false);
      if (instrumentHeaderSize < 4) return false;

      // Write instrument name
      await this.seek(pos + 4);
      const nameLen = Math.min(22, instrumentHeaderSize - 4);
      if (i < lines.length) {
        await this.writeBlock(padString(lines[i], nameLen));
      } else {
        await this.writeBlock(padString("", nameLen));
      }

      let sampleCount = 0;
      if (instrumentHeaderSize >= 29) {
        await this.seek(pos + 27);
        const scData = await this.readBlock(2);
        if (scData.length < 2) return false;
        sampleCount = scData.toUShort(0, false);
      }

      let sampleHeaderSize = 0;
      if (sampleCount > 0) {
        await this.seek(pos + 29);
        if (instrumentHeaderSize < 33) return false;
        const shsData = await this.readBlock(4);
        if (shsData.length < 4) return false;
        sampleHeaderSize = shsData.toUInt(0, false);
      }

      pos += instrumentHeaderSize;

      for (let j = 0; j < sampleCount; j++) {
        if (sampleHeaderSize > 4) {
          await this.seek(pos);
          const slData = await this.readBlock(4);
          if (slData.length < 4) return false;

          if (sampleHeaderSize > 18) {
            await this.seek(pos + 18);
            const sz = Math.min(sampleHeaderSize - 18, 22);
            if (sampleNameIndex < lines.length) {
              await this.writeBlock(padString(lines[sampleNameIndex++], sz));
            } else {
              await this.writeBlock(padString("", sz));
              sampleNameIndex++;
            }
          }
        }
        pos += sampleHeaderSize;
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Private – reading
  // ---------------------------------------------------------------------------

  private async read(readProperties: boolean, readStyle: ReadStyle): Promise<void> {
    await this.seek(0);
    const magicData = await this.readBlock(17);
    if (magicData.length < 17) { this._valid = false; return; }

    const magic = magicData.toString(StringType.Latin1);
    // Stripped XM files may have all zeros
    const isStripped = magicData.toString(StringType.Latin1) === "\0".repeat(17);
    if (magic !== "Extended Module: " && !isStripped) {
      this._valid = false; return;
    }

    // Title (20 bytes)
    const titleData = await this.readBlock(20);
    if (titleData.length < 20) { this._valid = false; return; }
    this._tag.title = readString(titleData, 20);

    // Escape byte (0x1A normally, 0x00 for stripped)
    const escapeData = await this.readBlock(1);
    if (escapeData.length < 1) { this._valid = false; return; }
    const escape = escapeData.get(0);
    if (escape !== 0x1a && escape !== 0x00) { this._valid = false; return; }

    // Tracker name (20 bytes)
    const trackerNameData = await this.readBlock(20);
    if (trackerNameData.length < 20) { this._valid = false; return; }
    this._tag.trackerName = readString(trackerNameData, 20);

    // Version (2 bytes LE)
    const versionData = await this.readBlock(2);
    if (versionData.length < 2) { this._valid = false; return; }
    const version = versionData.toUShort(0, false);

    // Header size (4 bytes LE)
    const headerSizeData = await this.readBlock(4);
    if (headerSizeData.length < 4) { this._valid = false; return; }
    const headerSize = headerSizeData.toUInt(0, false);
    if (headerSize < 4) { this._valid = false; return; }

    // Read structured header fields (up to headerSize - 4 bytes)
    const remainingSize = headerSize - 4;
    const headerFieldsData = await this.readBlock(Math.min(remainingSize, 16));
    if (headerFieldsData.length < Math.min(remainingSize, 16)) {
      this._valid = false; return;
    }

    let lengthInPatterns = 0;
    let restartPosition = 0;
    let channels = 0;
    let patternCount = 0;
    let instrumentCount = 0;
    let flags = 0;
    let tempo = 0;
    let bpmSpeed = 0;

    let offset = 0;
    if (offset + 2 <= headerFieldsData.length) {
      lengthInPatterns = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      restartPosition = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      channels = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      patternCount = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      instrumentCount = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      flags = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      tempo = headerFieldsData.toUShort(offset, false); offset += 2;
    }
    if (offset + 2 <= headerFieldsData.length) {
      bpmSpeed = headerFieldsData.toUShort(offset, false);
    }

    // Seek past the full header
    await this.seek(60 + headerSize);

    // Read patterns
    for (let i = 0; i < patternCount; i++) {
      const phlData = await this.readBlock(4);
      if (phlData.length < 4) { this._valid = false; return; }
      const patternHeaderLength = phlData.toUInt(0, false);
      if (patternHeaderLength < 4) { this._valid = false; return; }

      // Read packing type (1), row count (2), data size (2) - max 5 bytes
      const toRead = Math.min(patternHeaderLength - 4, 5);
      const patData = await this.readBlock(toRead);
      if (patData.length < toRead) { this._valid = false; return; }

      let dataSize = 0;
      if (patData.length >= 5) {
        dataSize = patData.toUShort(3, false);
      }

      // Skip remaining header + data
      const skipAmount = (patternHeaderLength - 4 - patData.length) + dataSize;
      if (skipAmount > 0) {
        await this.seek(skipAmount, Position.Current);
      }
    }

    // Read instruments and samples
    const instrumentNames: string[] = [];
    const sampleNames: string[] = [];
    let sumSampleCount = 0;

    for (let i = 0; i < instrumentCount; i++) {
      const ihsData = await this.readBlock(4);
      if (ihsData.length < 4) { this._valid = false; return; }
      const instrumentHeaderSize = ihsData.toUInt(0, false);
      if (instrumentHeaderSize < 4) { this._valid = false; return; }

      // Read instrument name (22 bytes), instrument type (1), sample count (2)
      const toRead = Math.min(instrumentHeaderSize - 4, 25);
      const instrData = await this.readBlock(toRead);
      if (instrData.length < toRead) { this._valid = false; return; }

      const instrumentName = readString(instrData, Math.min(22, instrData.length));

      let sampleCount = 0;
      if (instrData.length >= 25) {
        sampleCount = instrData.toUShort(23, false);
      }

      const inCnt = 4 + instrData.length;
      let dataOffset = 0;

      if (sampleCount > 0) {
        sumSampleCount += sampleCount;
        // Read sample header size
        if (instrumentHeaderSize < inCnt + 4) { this._valid = false; return; }
        const shsData = await this.readBlock(4);
        if (shsData.length < 4) { this._valid = false; return; }
        const sampleHeaderSize = shsData.toUInt(0, false);

        // Skip rest of instrument header
        const remaining = instrumentHeaderSize - inCnt - 4;
        if (remaining > 0) {
          await this.seek(remaining, Position.Current);
        }

        for (let j = 0; j < sampleCount; j++) {
          const smpToRead = Math.min(sampleHeaderSize, 40);
          const smpData = await this.readBlock(smpToRead);
          if (smpData.length < smpToRead) { this._valid = false; return; }

          let sampleLength = 0;
          if (smpData.length >= 4) {
            sampleLength = smpData.toUInt(0, false);
          }

          let sampleName = "";
          if (smpData.length >= 40) {
            sampleName = readString(smpData.mid(18, 22), 22);
          }

          // Skip rest of sample header
          const smpRemaining = sampleHeaderSize - smpData.length;
          if (smpRemaining > 0) {
            await this.seek(smpRemaining, Position.Current);
          }

          dataOffset += sampleLength;
          sampleNames.push(sampleName);
        }
      } else {
        dataOffset = instrumentHeaderSize - inCnt;
      }

      instrumentNames.push(instrumentName);
      if (dataOffset > 0) {
        await this.seek(dataOffset, Position.Current);
      }
    }

    // Build comment
    let comment = instrumentNames.join("\n");
    if (sampleNames.length > 0) {
      comment += "\n" + sampleNames.join("\n");
    }
    this._tag.comment = comment;

    if (readProperties) {
      const props = new XmProperties(readStyle);
      props.channels = channels;
      props.lengthInPatterns = lengthInPatterns;
      props.version = version;
      props.restartPosition = restartPosition;
      props.patternCount = patternCount;
      props.instrumentCount = instrumentCount;
      props.sampleCount = sumSampleCount;
      props.flags = flags;
      props.tempo = tempo;
      props.bpmSpeed = bpmSpeed;
      this._properties = props;
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function padString(s: string, len: number): ByteVector {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = i < s.length ? s.charCodeAt(i) & 0xff : 0;
  }
  return ByteVector.fromByteArray(arr);
}
