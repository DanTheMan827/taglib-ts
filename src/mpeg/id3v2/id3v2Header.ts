/** @packageDocumentation ID3v2 tag header parser and renderer (the mandatory 10-byte header found at the start of every ID3v2 tag). */
import { ByteVector } from "../../byteVector.js";
import { SynchData } from "./id3v2SynchData.js";

/**
 * ID3v2 tag header (10 bytes).
 *
 * Structure (from the ID3v2.4.0 specification, section 3.1):
 *   Bytes 0-2: File identifier "ID3"
 *   Byte 3:    Major version (2, 3, or 4)
 *   Byte 4:    Revision number
 *   Byte 5:    Flags
 *     Bit 7 (0x80): Unsynchronisation
 *     Bit 6 (0x40): Extended header
 *     Bit 5 (0x20): Experimental indicator
 *     Bit 4 (0x10): Footer present (v2.4 only)
 *   Bytes 6-9: Tag size as synchsafe integer (excludes header and footer)
 */
export class Id3v2Header {
  /** The ID3v2 major version number (2, 3, or 4). */
  private _majorVersion: number = 4;
  /** The ID3v2 revision number (typically 0). */
  private _revisionNumber: number = 0;
  /** Whether the tag body has been unsynchronised (whole-tag, v2.3 style). */
  private _unsynchronisation: boolean = false;
  /** Whether an extended header follows the main header. */
  private _extendedHeader: boolean = false;
  /** Whether the tag is in an experimental stage. */
  private _experimentalIndicator: boolean = false;
  /** Whether a footer is appended at the end of the tag (v2.4 only). */
  private _footerPresent: boolean = false;
  /** Size of the tag body in bytes, encoded as a synchsafe integer (excludes header and footer). */
  private _tagSize: number = 0;

  /** Header is always 10 bytes. */
  static readonly size: number = 10;

  /** The file identifier "ID3". */
  static readonly fileIdentifier: ByteVector = ByteVector.fromString("ID3");

  /** Creates a new `Id3v2Header` with default values (version 4, no flags, zero size). */
  constructor() {}

  /**
   * Parse a 10-byte ByteVector into an Id3v2Header.
   * Returns null if the data is invalid.
   */
  static parse(data: ByteVector): Id3v2Header | null {
    if (data.length < Id3v2Header.size) {
      return null;
    }

    // Validate that all 4 size bytes are < 128 (synchsafe requirement).
    const sizeData = data.mid(6, 4);
    if (sizeData.length !== 4) {
      return null;
    }
    for (let i = 0; i < 4; i++) {
      if (sizeData.get(i) >= 128) {
        return null;
      }
    }

    // Version or revision must never be 0xFF.
    if (data.get(3) === 0xff || data.get(4) === 0xff) {
      return null;
    }

    const header = new Id3v2Header();
    header._majorVersion = data.get(3);
    header._revisionNumber = data.get(4);

    const flags = data.get(5);
    header._unsynchronisation = (flags & 0x80) !== 0;
    header._extendedHeader = (flags & 0x40) !== 0;
    header._experimentalIndicator = (flags & 0x20) !== 0;
    header._footerPresent = (flags & 0x10) !== 0;

    header._tagSize = SynchData.toUInt(sizeData);

    return header;
  }

  /**
   * Gets the ID3v2 major version number (2, 3, or 4).
   */
  get majorVersion(): number {
    return this._majorVersion;
  }

  /**
   * Sets the ID3v2 major version number.
   * @param v - The major version (2, 3, or 4).
   */
  set majorVersion(v: number) {
    this._majorVersion = v;
  }

  /**
   * Gets the ID3v2 revision number (typically 0).
   */
  get revisionNumber(): number {
    return this._revisionNumber;
  }

  /**
   * Gets the size of the tag body in bytes (excluding the header and footer).
   */
  get tagSize(): number {
    return this._tagSize;
  }

  /**
   * Sets the size of the tag body in bytes.
   * @param v - The tag body size.
   */
  set tagSize(v: number) {
    this._tagSize = v;
  }

  /**
   * Gets whether the tag body has been unsynchronised.
   */
  get unsynchronisation(): boolean {
    return this._unsynchronisation;
  }

  /**
   * Gets whether an extended header is present after the main header.
   */
  get extendedHeader(): boolean {
    return this._extendedHeader;
  }

  /**
   * Gets whether the experimental indicator flag is set.
   */
  get experimentalIndicator(): boolean {
    return this._experimentalIndicator;
  }

  /**
   * Gets whether a footer is present at the end of the tag (v2.4 only).
   */
  get footerPresent(): boolean {
    return this._footerPresent;
  }

  /**
   * Total tag size including the header and optional footer.
   */
  get completeTagSize(): number {
    if (this._footerPresent) {
      return this._tagSize + Id3v2Header.size + 10; // footer is also 10 bytes
    }
    return this._tagSize + Id3v2Header.size;
  }

  /**
   * Render the header to a 10-byte ByteVector.
   * Always renders as the current major version. Clears extended header,
   * footer, and unsynchronisation flags on write (matching C++ behavior).
   */
  render(): ByteVector {
    const v = new ByteVector();

    // File identifier "ID3"
    v.append(Id3v2Header.fileIdentifier);

    // Version
    v.append(this._majorVersion);
    v.append(0); // revision

    // Currently we don't support writing extended headers, footers, or
    // unsynchronized tags. Build flags byte with only experimentalIndicator,
    // then clear the unsupported flags (matching C++ TagLib behavior).
    let flags = 0;
    if (this._experimentalIndicator) flags |= 0x20;
    v.append(flags);

    this._extendedHeader = false;
    this._footerPresent = false;
    this._unsynchronisation = false;

    // Tag size as synchsafe integer
    v.append(SynchData.fromUInt(this._tagSize));

    return v;
  }
}
