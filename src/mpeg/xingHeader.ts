import { ByteVector, StringType } from "../byteVector.js";

// =============================================================================
// Enums
// =============================================================================

export enum XingHeaderType {
  Invalid = 0,
  Xing = 1,
  VBRI = 2,
}

// =============================================================================
// XingHeader
// =============================================================================

/**
 * Parser for Xing and VBRI VBR headers found inside the first MPEG frame.
 */
export class XingHeader {
  private _type: XingHeaderType = XingHeaderType.Invalid;
  private _totalFrames: number = 0;
  private _totalSize: number = 0;

  constructor(data: ByteVector) {
    this.parse(data);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get isValid(): boolean {
    return this._type !== XingHeaderType.Invalid &&
           this._totalFrames > 0 &&
           this._totalSize > 0;
  }

  get totalFrames(): number { return this._totalFrames; }
  get totalSize(): number { return this._totalSize; }
  get type(): XingHeaderType { return this._type; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private parse(data: ByteVector): void {
    // Try Xing / Info header first
    const xingTag = ByteVector.fromString("Xing", StringType.Latin1);
    const infoTag = ByteVector.fromString("Info", StringType.Latin1);

    let offset = data.find(xingTag);
    if (offset < 0) {
      offset = data.find(infoTag);
    }

    if (offset >= 0) {
      this.parseXing(data, offset);
      return;
    }

    // Try VBRI header
    const vbriTag = ByteVector.fromString("VBRI", StringType.Latin1);
    offset = data.find(vbriTag);

    if (offset >= 0) {
      this.parseVBRI(data, offset);
    }
  }

  private parseXing(data: ByteVector, offset: number): void {
    // Need at least: 4 (magic) + 4 (flags) = 8 bytes minimum
    if (data.length < offset + 16) return;

    const flags = data.toUInt(offset + 4, true);

    // Both the frames flag (0x01) and the size flag (0x02) must be set
    if ((flags & 0x03) !== 0x03) return;

    this._totalFrames = data.toUInt(offset + 8, true);
    this._totalSize = data.toUInt(offset + 12, true);
    this._type = XingHeaderType.Xing;
  }

  private parseVBRI(data: ByteVector, offset: number): void {
    if (data.length < offset + 32) return;

    // VBRI layout: size at offset+10, frames at offset+14
    this._totalSize = data.toUInt(offset + 10, true);
    this._totalFrames = data.toUInt(offset + 14, true);
    this._type = XingHeaderType.VBRI;
  }
}
