/** @file Xing and VBRI VBR header parser for MPEG audio files, used to determine total frame count and stream size. */
import { ByteVector, StringType } from "../byteVector.js";

// =============================================================================
// Enums
// =============================================================================

/**
 * Identifies the type of VBR header found in the first MPEG frame.
 */
export enum XingHeaderType {
  /** No valid VBR header was found. */
  Invalid = 0,
  /** A Xing or Info VBR header was found. */
  Xing = 1,
  /** A VBRI VBR header (Fraunhofer) was found. */
  VBRI = 2,
}

// =============================================================================
// XingHeader
// =============================================================================

/**
 * Parser for Xing and VBRI VBR headers found inside the first MPEG frame.
 */
export class XingHeader {
  /** The type of VBR header detected. */
  private _type: XingHeaderType = XingHeaderType.Invalid;
  /** Total number of MPEG frames in the stream, as reported by the VBR header. */
  private _totalFrames: number = 0;
  /** Total byte size of the audio stream, as reported by the VBR header. */
  private _totalSize: number = 0;

  /**
   * Constructs an `XingHeader` by attempting to parse a Xing/Info or VBRI
   * header from the first frame's data.
   *
   * @param data - The raw bytes of the first MPEG audio frame (header + side information + payload).
   */
  constructor(data: ByteVector) {
    this.parse(data);
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Gets whether this is a valid, usable VBR header (type is not `Invalid`
   * and both `totalFrames` and `totalSize` are non-zero).
   */
  get isValid(): boolean {
    return this._type !== XingHeaderType.Invalid &&
           this._totalFrames > 0 &&
           this._totalSize > 0;
  }

  /** Gets the total number of MPEG frames in the stream. */
  get totalFrames(): number { return this._totalFrames; }
  /** Gets the total byte size of the audio data. */
  get totalSize(): number { return this._totalSize; }
  /** Gets the type of VBR header detected (`Xing`, `VBRI`, or `Invalid`). */
  get type(): XingHeaderType { return this._type; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Attempts to locate and parse a Xing/Info or VBRI header in `data`.
   * @param data - The first MPEG frame's raw bytes.
   */
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

  /**
   * Parses a Xing or Info VBR header starting at `offset` within `data`.
   * Both the frame-count flag (0x01) and the size flag (0x02) must be set.
   *
   * @param data - The first MPEG frame's raw bytes.
   * @param offset - Byte offset of the "Xing"/"Info" magic within `data`.
   */
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

  /**
   * Parses a VBRI (Fraunhofer) VBR header starting at `offset` within `data`.
   * The total size is read at offset+10 and total frames at offset+14.
   *
   * @param data - The first MPEG frame's raw bytes.
   * @param offset - Byte offset of the "VBRI" magic within `data`.
   */
  private parseVBRI(data: ByteVector, offset: number): void {
    if (data.length < offset + 32) return;

    // VBRI layout: size at offset+10, frames at offset+14
    this._totalSize = data.toUInt(offset + 10, true);
    this._totalFrames = data.toUInt(offset + 14, true);
    this._type = XingHeaderType.VBRI;
  }
}
