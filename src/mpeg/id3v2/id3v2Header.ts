import { ByteVector } from '../../byteVector.js';
import { SynchData } from './id3v2SynchData.js';

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
  private _majorVersion: number = 4;
  private _revisionNumber: number = 0;
  private _unsynchronisation: boolean = false;
  private _extendedHeader: boolean = false;
  private _experimentalIndicator: boolean = false;
  private _footerPresent: boolean = false;
  private _tagSize: number = 0;

  /** Header is always 10 bytes. */
  static readonly size: number = 10;

  /** The file identifier "ID3". */
  static readonly fileIdentifier: ByteVector = ByteVector.fromString('ID3');

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

  get majorVersion(): number {
    return this._majorVersion;
  }

  set majorVersion(v: number) {
    this._majorVersion = v;
  }

  get revisionNumber(): number {
    return this._revisionNumber;
  }

  get tagSize(): number {
    return this._tagSize;
  }

  set tagSize(v: number) {
    this._tagSize = v;
  }

  get unsynchronisation(): boolean {
    return this._unsynchronisation;
  }

  get extendedHeader(): boolean {
    return this._extendedHeader;
  }

  get experimentalIndicator(): boolean {
    return this._experimentalIndicator;
  }

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
