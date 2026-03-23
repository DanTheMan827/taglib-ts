/** @file ID3v2 frame header and abstract base class for all ID3v2 frame types. */
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
  /** The four-byte (or three-byte for v2.2) frame identifier. */
  private _frameId: ByteVector;
  /** The size of the frame's payload in bytes, as decoded from the header. */
  private _frameSize: number = 0;
  /** The ID3v2 major version this header was parsed from or will be rendered for. */
  private _version: number = 4;

  // Status flags
  /** Whether the frame should be discarded when the tag is altered. */
  private _tagAlterPreservation: boolean = false;
  /** Whether the frame should be discarded when the file (but not the tag) is altered. */
  private _fileAlterPreservation: boolean = false;
  /** Whether the frame contents are read-only. */
  private _readOnly: boolean = false;

  // Format flags
  /** Whether the frame data is zlib-compressed. */
  private _compression: boolean = false;
  /** Whether the frame data is encrypted. */
  private _encryption: boolean = false;
  /** Whether the frame belongs to a group identified by a group byte. */
  private _groupIdentity: boolean = false;
  /** Whether a data-length indicator (4 bytes) precedes the frame payload. */
  private _dataLengthIndicator: boolean = false;
  /** Whether the frame payload has had unsynchronisation applied (v2.4 per-frame). */
  private _unsynchronisation: boolean = false;

  /**
   * Construct an `Id3v2FrameHeader`.
   *
   * - If both `data` and `version` are provided, the header is parsed from `data`.
   * - If only `data` is provided, it is used directly as the frame ID.
   * - If neither is provided, an empty header is created.
   *
   * @param data - Raw header bytes to parse, or a frame ID `ByteVector`.
   * @param version - ID3v2 major version (2, 3, or 4).
   */
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

  /**
   * Parse the raw header bytes for the given version, populating all fields.
   *
   * @param data - The raw frame header bytes (at least 6 or 10 bytes).
   * @param version - ID3v2 major version (2, 3, or 4).
   */
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

  /**
   * Parse the two status/format flag bytes for the given version.
   *
   * @param flagsData - The 2-byte flags data (bytes 8-9 of the frame header).
   * @param version - ID3v2 major version (3 or 4); other values are ignored.
   */
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

  /** Gets the frame identifier as a `ByteVector`. */
  get frameId(): ByteVector {
    return this._frameId;
  }

  /**
   * Sets the frame identifier.
   * @param id - The new frame ID (copied by value).
   */
  set frameId(id: ByteVector) {
    this._frameId = ByteVector.fromByteVector(id);
  }

  // -- Size -------------------------------------------------------------------

  /** Gets the payload size of the frame in bytes. */
  get frameSize(): number {
    return this._frameSize;
  }

  /**
   * Sets the payload size of the frame in bytes.
   * @param size - The new payload size.
   */
  set frameSize(size: number) {
    this._frameSize = size;
  }

  // -- Version ----------------------------------------------------------------

  /** Gets the ID3v2 major version associated with this header. */
  get version(): number {
    return this._version;
  }

  /**
   * Sets the ID3v2 major version associated with this header.
   * @param v - The major version number (2, 3, or 4).
   */
  set version(v: number) {
    this._version = v;
  }

  // -- Status flags -----------------------------------------------------------

  /** Gets whether the frame should be discarded when the tag is altered. */
  get tagAlterPreservation(): boolean {
    return this._tagAlterPreservation;
  }

  /**
   * Sets the tag-alter-preservation flag.
   * @param v - `true` if the frame should be discarded on tag alteration.
   */
  set tagAlterPreservation(v: boolean) {
    this._tagAlterPreservation = v;
  }

  /** Gets whether the frame should be discarded when the file is altered. */
  get fileAlterPreservation(): boolean {
    return this._fileAlterPreservation;
  }

  /**
   * Sets the file-alter-preservation flag.
   * @param v - `true` if the frame should be discarded on file alteration.
   */
  set fileAlterPreservation(v: boolean) {
    this._fileAlterPreservation = v;
  }

  /** Gets whether the frame contents are read-only. */
  get readOnly(): boolean {
    return this._readOnly;
  }

  // -- Format flags -----------------------------------------------------------

  /** Gets whether the frame data is zlib-compressed. */
  get compression(): boolean {
    return this._compression;
  }

  /**
   * Sets the compression flag.
   * @param v - `true` if the frame data is compressed.
   */
  set compression(v: boolean) {
    this._compression = v;
  }

  /** Gets whether the frame data is encrypted. */
  get encryption(): boolean {
    return this._encryption;
  }

  /**
   * Sets the encryption flag.
   * @param v - `true` if the frame data is encrypted.
   */
  set encryption(v: boolean) {
    this._encryption = v;
  }

  /** Gets whether the frame belongs to a group identified by a group byte. */
  get groupIdentity(): boolean {
    return this._groupIdentity;
  }

  /**
   * Sets the group identity flag.
   * @param v - `true` if a group-identity byte is present in the frame.
   */
  set groupIdentity(v: boolean) {
    this._groupIdentity = v;
  }

  /** Gets whether a 4-byte data-length indicator precedes the payload. */
  get dataLengthIndicator(): boolean {
    return this._dataLengthIndicator;
  }

  /**
   * Sets the data-length-indicator flag.
   * @param v - `true` if a data-length indicator is present.
   */
  set dataLengthIndicator(v: boolean) {
    this._dataLengthIndicator = v;
  }

  /** Gets whether per-frame unsynchronisation has been applied (v2.4 only). */
  get unsynchronisation(): boolean {
    return this._unsynchronisation;
  }

  /**
   * Sets the unsynchronisation flag.
   * @param v - `true` if the frame payload has been unsynchronised.
   */
  set unsynchronisation(v: boolean) {
    this._unsynchronisation = v;
  }

  // -- Render -----------------------------------------------------------------

  /**
   * Render the header to its binary representation.
   *
   * For v2.2 this produces 6 bytes; for v2.3/v2.4 it produces 10 bytes
   * (frame ID + size + two flag bytes).
   *
   * @returns The serialised header as a `ByteVector`.
   */
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

  /**
   * Build the two flag bytes for the current version.
   * @returns A 2-byte `ByteVector` representing the status and format flags.
   */
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

/**
 * Abstract base class for all ID3v2 frame types.
 *
 * Subclasses must implement {@link parseFields} and {@link renderFields} to
 * handle the frame-specific payload.  The common frame header is managed here.
 */
export abstract class Id3v2Frame {
  /** The parsed frame header, containing the frame ID, size, and flags. */
  protected _header: Id3v2FrameHeader;

  /**
   * Constructs the base frame with an optional pre-built header.
   * @param header - An existing `Id3v2FrameHeader`; a new empty one is used when omitted.
   */
  protected constructor(header?: Id3v2FrameHeader) {
    this._header = header ?? new Id3v2FrameHeader();
  }

  /** Gets the frame identifier from the header. */
  get frameId(): ByteVector {
    return this._header.frameId;
  }

  /** Gets the payload size in bytes from the header. */
  get size(): number {
    return this._header.frameSize;
  }

  /** Gets the frame's header object. */
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

/** Single-byte null terminator used for Latin-1 and UTF-8 encoded strings. */
const NULL_BYTE = ByteVector.fromSize(1, 0x00);
/** Two-byte null terminator used for UTF-16 encoded strings. */
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
