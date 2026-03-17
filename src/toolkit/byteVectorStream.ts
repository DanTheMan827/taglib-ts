/**
 * @file In-memory IOStream backed by a ByteVector.
 */

import { ByteVector } from "../byteVector.js";
import { type offset_t, Position } from "./types.js";
import { IOStream } from "./ioStream.js";

/**
 * An in-memory {@link IOStream} backed by a {@link ByteVector}. Useful for
 * reading and writing tag metadata without touching the filesystem, or for
 * constructing binary payloads in memory.
 *
 * All operations are synchronous under the hood; the async signatures exist
 * solely to satisfy the {@link IOStream} contract.
 */
export class ByteVectorStream extends IOStream {
  /** The underlying buffer. */
  private _data: ByteVector;

  /** Current read/write position (bytes from the start). */
  private _position: offset_t = 0;

  /**
   * Creates a new ByteVectorStream.
   *
   * @param data - Initial content. If a `Uint8Array` is provided it is
   *   wrapped in a new {@link ByteVector}. If a {@link ByteVector} is
   *   provided a copy is made. Defaults to an empty buffer.
   */
  constructor(data: ByteVector | Uint8Array = new ByteVector()) {
    super();
    if (data instanceof Uint8Array) {
      this._data = ByteVector.fromUint8Array(data);
    } else {
      this._data = ByteVector.fromByteVector(data);
    }
  }

  // ---------------------------------------------------------------------------
  // IOStream implementation
  // ---------------------------------------------------------------------------

  /**
   * Returns an empty string — in-memory streams have no meaningful name.
   */
  name(): string {
    return "";
  }

  /**
   * Reads up to `length` bytes from the current position and advances the
   * position by the number of bytes actually read.
   *
   * @param length - Maximum number of bytes to read.
   * @returns Resolves with a {@link ByteVector} containing the bytes read.
   */
  async readBlock(length: number): Promise<ByteVector> {
    if (length <= 0) {
      return new ByteVector();
    }

    const available = this._data.length - this._position;
    if (available <= 0) {
      return new ByteVector();
    }

    const toRead = Math.min(length, available);
    const result = this._data.mid(this._position, toRead);
    this._position += toRead;
    return result;
  }

  /**
   * Writes `data` at the current position, extending the buffer if necessary,
   * and advances the position by `data.length`.
   *
   * @param data - The bytes to write.
   */
  async writeBlock(data: ByteVector): Promise<void> {
    if (data.length === 0) {
      return;
    }

    const end = this._position + data.length;
    if (end > this._data.length) {
      // Extend the buffer to fit the write
      this._data.resize(end);
    }

    // Use Uint8Array.set() for efficient bulk copy
    this._data.data.set(data.data, this._position);
    this._position = end;
  }

  /**
   * Inserts `data` at byte offset `start`, optionally replacing `replace`
   * bytes of existing content.
   *
   * @param data    - The bytes to insert.
   * @param start   - Byte offset at which to begin the insertion.
   * @param replace - Number of existing bytes to overwrite. Defaults to 0.
   */
  async insert(data: ByteVector, start: offset_t, replace: number = 0): Promise<void> {
    if (start > this._data.length) {
      // Pad with zeros up to start, then append data
      this._data.resize(start);
    }

    const beforeLen = start;
    const afterStart = start + replace;
    const afterLen = Math.max(0, this._data.length - afterStart);
    const newSize = beforeLen + data.length + afterLen;

    const newArr = new Uint8Array(newSize);
    // Copy "before" section
    if (beforeLen > 0) {
      newArr.set(this._data.data.subarray(0, beforeLen), 0);
    }
    // Copy inserted data
    if (data.length > 0) {
      newArr.set(data.data, beforeLen);
    }
    // Copy "after" section
    if (afterLen > 0) {
      newArr.set(this._data.data.subarray(afterStart, afterStart + afterLen), beforeLen + data.length);
    }

    this._data = new ByteVector(newArr);
    this._position = start + data.length;
  }

  /**
   * Removes `length` bytes beginning at byte offset `start`.
   *
   * @param start  - Byte offset of the first byte to remove.
   * @param length - Number of bytes to remove.
   */
  async removeBlock(start: offset_t, length: number): Promise<void> {
    if (start >= this._data.length || length <= 0) {
      return;
    }

    const beforeLen = start;
    const afterStart = start + length;
    const afterLen = Math.max(0, this._data.length - afterStart);
    const newSize = beforeLen + afterLen;

    const newArr = new Uint8Array(newSize);
    if (beforeLen > 0) {
      newArr.set(this._data.data.subarray(0, beforeLen), 0);
    }
    if (afterLen > 0) {
      newArr.set(this._data.data.subarray(afterStart, afterStart + afterLen), beforeLen);
    }

    this._data = new ByteVector(newArr);

    if (this._position > start && this._position < start + length) {
      this._position = start;
    } else if (this._position >= start + length) {
      this._position -= length;
    }
  }

  /** Returns `false` — ByteVectorStream is always writable. */
  readOnly(): boolean {
    return false;
  }

  /** Returns `true` — ByteVectorStream is always open. */
  isOpen(): boolean {
    return true;
  }

  /**
   * Moves the read/write position.
   *
   * @param offset   - Number of bytes to move.
   * @param position - Reference point. Defaults to {@link Position.Beginning}.
   */
  seek(offset: offset_t, position: Position = Position.Beginning): void {
    switch (position) {
      case Position.Beginning:
        this._position = Math.max(0, offset);
        break;
      case Position.Current:
        this._position = Math.max(0, this._position + offset);
        break;
      case Position.End:
        this._position = Math.max(0, this._data.length + offset);
        break;
    }
  }

  /** Resets the stream position to the beginning. */
  clear(): void {
    this._position = 0;
  }

  /** Returns the current read/write position in bytes. */
  tell(): offset_t {
    return this._position;
  }

  /** Returns the total number of bytes in the stream. */
  length(): offset_t {
    return this._data.length;
  }

  /**
   * Truncates or zero-extends the stream to exactly `length` bytes. If the
   * current position exceeds the new length, it is clamped.
   *
   * @param length - The desired stream length in bytes.
   */
  async truncate(length: offset_t): Promise<void> {
    this._data.resize(length);
    if (this._position > length) {
      this._position = length;
    }
  }

  // ---------------------------------------------------------------------------
  // ByteVectorStream-specific
  // ---------------------------------------------------------------------------

  /** Returns a copy of the underlying {@link ByteVector}. */
  data(): ByteVector {
    return ByteVector.fromByteVector(this._data);
  }
}
