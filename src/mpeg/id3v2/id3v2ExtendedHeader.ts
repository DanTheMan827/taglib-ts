import { ByteVector } from "../../byteVector.js";
import { SynchData } from "./id3v2SynchData.js";

/**
 * ID3v2 extended header (optional, indicated by header flags).
 *
 * For v2.3: 4-byte big-endian size (excludes itself) + 2-byte flags + padding
 * For v2.4: 4-byte synchsafe size (includes itself) + 1-byte flag count + flags
 *
 * The C++ TagLib implementation always uses SynchData.toUInt for the size,
 * which also handles buggy software that writes normal big-endian integers.
 */
export class Id3v2ExtendedHeader {
  private _size: number = 0;

  constructor() {}

  /**
   * Parse the extended header from data.
   *
   * @param data - The raw extended header bytes.
   * @param version - The ID3v2 major version (3 or 4). Currently the C++
   *   implementation reads the first 4 bytes as a synchsafe integer
   *   regardless of version.
   */
  parse(data: ByteVector, _version: number): void {
    this._size = SynchData.toUInt(data.mid(0, 4));
  }

  /** Total size of the extended header. */
  get size(): number {
    return this._size;
  }
}
