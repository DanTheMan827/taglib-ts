import { ByteVector, StringType } from "../../byteVector.js";
import { SynchData } from "./id3v2SynchData.js";

/**
 * ID3v2 frame header.
 *
 * - v2.2: 3-byte frame ID + 3-byte size (big-endian, NOT synchsafe)
 * - v2.3: 4-byte frame ID + 4-byte size (big-endian, NOT synchsafe) + 2-byte flags
 * - v2.4: 4-byte frame ID + 4-byte size (synchsafe) + 2-byte flags
 */
export class Id3v2FrameHeader {
  private _frameId: ByteVector;
  private _frameSize: number = 0;
  private _version: number = 4;

  // Status flags
  private _tagAlterPreservation: boolean = false;
  private _fileAlterPreservation: boolean = false;
  private _readOnly: boolean = false;

  // Format flags
  private _compression: boolean = false;
  private _encryption: boolean = false;
  private _groupIdentity: boolean = false;
  private _dataLengthIndicator: boolean = false;
  private _unsynchronisation: boolean = false;

  constructor(data?: ByteVector, version?: number) {
    this._frameId = new ByteVector();
    if (data !== undefined && version !== undefined) {
      this._version = version;
      this._parseHeader(data, version);
    } else if (data !== undefined) {
      // data is used as a frame ID
      this._frameId = ByteVector.fromByteVector(data);
    }
  }

  private _parseHeader(data: ByteVector, version: number): void {
    if (version < 3) {
      // v2.2: 3-byte ID + 3-byte size
      if (data.length < 6) return;
      this._frameId = data.mid(0, 3);
      this._frameSize =
        (data.get(3) << 16) | (data.get(4) << 8) | data.get(5);
    } else {
      // v2.3 / v2.4: 4-byte ID + 4-byte size + 2-byte flags
      if (data.length < 10) return;
      this._frameId = data.mid(0, 4);

      if (version === 4) {
        this._frameSize = SynchData.toUInt(data.mid(4, 4));
      } else {
        this._frameSize = data.mid(4, 4).toUInt();
      }

      this._parseFlags(data.mid(8, 2), version);
    }
  }

  private _parseFlags(flagsData: ByteVector, version: number): void {
    const byte0 = flagsData.get(0);
    const byte1 = flagsData.get(1);

    if (version === 3) {
      this._tagAlterPreservation = (byte0 & 0x80) !== 0;
      this._fileAlterPreservation = (byte0 & 0x40) !== 0;
      this._readOnly = (byte0 & 0x20) !== 0;
      this._compression = (byte1 & 0x80) !== 0;
      this._encryption = (byte1 & 0x40) !== 0;
      this._groupIdentity = (byte1 & 0x20) !== 0;
    } else if (version === 4) {
      this._tagAlterPreservation = (byte0 & 0x40) !== 0;
      this._fileAlterPreservation = (byte0 & 0x20) !== 0;
      this._readOnly = (byte0 & 0x10) !== 0;
      this._groupIdentity = (byte1 & 0x40) !== 0;
      this._compression = (byte1 & 0x08) !== 0;
      this._encryption = (byte1 & 0x04) !== 0;
      this._unsynchronisation = (byte1 & 0x02) !== 0;
      this._dataLengthIndicator = (byte1 & 0x01) !== 0;
    }
  }

  // -- Frame ID ---------------------------------------------------------------

  get frameId(): ByteVector {
    return this._frameId;
  }

  set frameId(id: ByteVector) {
    this._frameId = ByteVector.fromByteVector(id);
  }

  // -- Size -------------------------------------------------------------------

  get frameSize(): number {
    return this._frameSize;
  }

  set frameSize(size: number) {
    this._frameSize = size;
  }

  // -- Version ----------------------------------------------------------------

  get version(): number {
    return this._version;
  }

  set version(v: number) {
    this._version = v;
  }

  // -- Status flags -----------------------------------------------------------

  get tagAlterPreservation(): boolean {
    return this._tagAlterPreservation;
  }

  set tagAlterPreservation(v: boolean) {
    this._tagAlterPreservation = v;
  }

  get fileAlterPreservation(): boolean {
    return this._fileAlterPreservation;
  }

  set fileAlterPreservation(v: boolean) {
    this._fileAlterPreservation = v;
  }

  get readOnly(): boolean {
    return this._readOnly;
  }

  // -- Format flags -----------------------------------------------------------

  get compression(): boolean {
    return this._compression;
  }

  set compression(v: boolean) {
    this._compression = v;
  }

  get encryption(): boolean {
    return this._encryption;
  }

  set encryption(v: boolean) {
    this._encryption = v;
  }

  get groupIdentity(): boolean {
    return this._groupIdentity;
  }

  set groupIdentity(v: boolean) {
    this._groupIdentity = v;
  }

  get dataLengthIndicator(): boolean {
    return this._dataLengthIndicator;
  }

  set dataLengthIndicator(v: boolean) {
    this._dataLengthIndicator = v;
  }

  get unsynchronisation(): boolean {
    return this._unsynchronisation;
  }

  set unsynchronisation(v: boolean) {
    this._unsynchronisation = v;
  }

  // -- Render -----------------------------------------------------------------

  render(): ByteVector {
    const v = new ByteVector();

    if (this._version < 3) {
      // v2.2: 3-byte ID + 3-byte big-endian size
      v.append(this._frameId.mid(0, 3));
      v.append((this._frameSize >> 16) & 0xff);
      v.append((this._frameSize >> 8) & 0xff);
      v.append(this._frameSize & 0xff);
    } else {
      // v2.3/v2.4: 4-byte ID + 4-byte size + 2-byte flags
      v.append(this._frameId.mid(0, 4));

      if (this._version === 4) {
        v.append(SynchData.fromUInt(this._frameSize));
      } else {
        v.append(ByteVector.fromUInt(this._frameSize));
      }

      v.append(this._renderFlags());
    }

    return v;
  }

  private _renderFlags(): ByteVector {
    let byte0 = 0;
    let byte1 = 0;

    if (this._version === 3) {
      if (this._tagAlterPreservation) byte0 |= 0x80;
      if (this._fileAlterPreservation) byte0 |= 0x40;
      if (this._readOnly) byte0 |= 0x20;
      if (this._compression) byte1 |= 0x80;
      if (this._encryption) byte1 |= 0x40;
      if (this._groupIdentity) byte1 |= 0x20;
    } else if (this._version === 4) {
      if (this._tagAlterPreservation) byte0 |= 0x40;
      if (this._fileAlterPreservation) byte0 |= 0x20;
      if (this._readOnly) byte0 |= 0x10;
      if (this._groupIdentity) byte1 |= 0x40;
      if (this._compression) byte1 |= 0x08;
      if (this._encryption) byte1 |= 0x04;
      if (this._unsynchronisation) byte1 |= 0x02;
      if (this._dataLengthIndicator) byte1 |= 0x01;
    }

    const flags = ByteVector.fromSize(2);
    flags.set(0, byte0);
    flags.set(1, byte1);
    return flags;
  }

  // -- Static -----------------------------------------------------------------

  /** Header size: 10 bytes for v2.3/v2.4, 6 bytes for v2.2. */
  static size(version: number = 4): number {
    return version < 3 ? 6 : 10;
  }
}

// =============================================================================
// Abstract base class for all ID3v2 frames.
// =============================================================================

export abstract class Id3v2Frame {
  protected _header: Id3v2FrameHeader;

  protected constructor(header?: Id3v2FrameHeader) {
    this._header = header ?? new Id3v2FrameHeader();
  }

  get frameId(): ByteVector {
    return this._header.frameId;
  }

  get size(): number {
    return this._header.frameSize;
  }

  get header(): Id3v2FrameHeader {
    return this._header;
  }

  /** Render the complete frame (header + fields) for the given version. */
  render(version?: number): ByteVector {
    const ver = version ?? this._header.version;
    const fieldData = this.renderFields(ver);

    this._header.frameSize = fieldData.length;

    // Ensure frame ID length matches version
    const prevVersion = this._header.version;
    this._header.version = ver;

    const result = this._header.render();
    result.append(fieldData);

    this._header.version = prevVersion;

    return result;
  }

  /** Parse the frame-specific payload (after header decoding). */
  protected abstract parseFields(data: ByteVector, version: number): void;

  /** Render the frame-specific payload for the given version. */
  protected abstract renderFields(version: number): ByteVector;

  /**
   * Extract the raw field data from a complete frame blob.
   *
   * This handles unsynchronisation decoding, data-length indicators,
   * and (stubbed) decompression.
   */
  protected static fieldData(
    frameData: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): ByteVector {
    const headerSize = Id3v2FrameHeader.size(version);
    let data = frameData.mid(headerSize, header.frameSize);

    if (header.unsynchronisation && version >= 4) {
      data = SynchData.decode(data);
    }

    if (header.dataLengthIndicator) {
      // First 4 bytes encode the original (uncompressed) data length – skip them.
      data = data.mid(4);
    }

    // Compression is flagged but actual zlib decompression is not yet implemented;
    // return the data as-is so downstream parsers can still attempt best-effort reads.

    return data;
  }
}

// =============================================================================
// Encoding helpers shared by many frame types.
// =============================================================================

const NULL_BYTE = ByteVector.fromSize(1, 0x00);
const NULL_DOUBLE = ByteVector.fromSize(2, 0x00);

/** Return the null terminator for the given encoding. */
export function nullTerminator(encoding: StringType): ByteVector {
  return encoding === StringType.UTF16 ||
    encoding === StringType.UTF16BE ||
    encoding === StringType.UTF16LE
    ? NULL_DOUBLE
    : NULL_BYTE;
}

/** Size of the null terminator for the given encoding. */
export function nullTerminatorSize(encoding: StringType): number {
  return encoding === StringType.UTF16 ||
    encoding === StringType.UTF16BE ||
    encoding === StringType.UTF16LE
    ? 2
    : 1;
}

/**
 * Find the index of the first null terminator in `data` starting at `offset`
 * for the given encoding. Returns the byte offset into `data`, or -1.
 */
export function findNullTerminator(
  data: ByteVector,
  encoding: StringType,
  offset: number = 0,
): number {
  const nt = nullTerminator(encoding);
  const align = nullTerminatorSize(encoding);
  return data.find(nt, offset, align);
}
