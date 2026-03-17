/**
 * @file In-memory IOStream backed by an array of Uint8Array chunks.
 */

import { ByteVector } from "../byteVector.js";
import { IOStream } from "./ioStream.js";
import { type offset_t, Position } from "./types.js";

/**
 * An in-memory {@link IOStream} backed by an array of `Uint8Array` chunks.
 *
 * Unlike {@link ByteVectorStream}, data is never stored as one contiguous
 * buffer. This is efficient when working with large media files where only
 * specific regions need to be modified — existing chunks can be sliced and
 * reused without copying the whole buffer.
 *
 * Additionally, the chunk array can be passed directly to a
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Blob Blob}
 * constructor, enabling zero-copy export for browser environments.
 *
 * All I/O methods are async to satisfy the {@link IOStream} contract;
 * the underlying operations are synchronous in-memory computations.
 */
export class ChunkedByteVectorStream extends IOStream {
  /** The ordered list of data chunks. Empty chunks are never stored. */
  private _chunks: Uint8Array[];

  /** Current read/write position (bytes from the start). */
  private _position: offset_t = 0;

  /** Total byte length across all chunks. */
  private _length: offset_t = 0;

  /**
   * Creates a new ChunkedByteVectorStream.
   *
   * @param data - Zero or more `Uint8Array` chunks that form the initial
   *   content. Empty chunks are silently discarded.
   */
  constructor(...data: Uint8Array[]) {
    super();
    this._chunks = data.filter(c => c.length > 0);
    this._length = this._chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  /**
   * Creates a ChunkedByteVectorStream from an existing array of chunks.
   *
   * This factory avoids the overhead of the spread-argument constructor when
   * the chunk array is already available. Empty chunks are silently discarded.
   *
   * @param chunks - The initial chunk array.
   */
  static fromChunks(chunks: Uint8Array[]): ChunkedByteVectorStream {
    const stream = new ChunkedByteVectorStream();
    stream._chunks = chunks.filter(c => c.length > 0);
    stream._length = stream._chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    return stream;
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
   * Reads up to `length` bytes starting from the current position, spanning
   * chunk boundaries as needed, and advances the position.
   *
   * @param length - Maximum number of bytes to read.
   * @returns Resolves with a {@link ByteVector} containing the bytes read.
   */
  async readBlock(length: number): Promise<ByteVector> {
    if (length <= 0 || this._position >= this._length) return new ByteVector();
    const result: Uint8Array[] = [];
    let remaining = length;
    let pos = this._position;
    for (const chunk of this._chunks) {
      if (pos >= chunk.length) {
        pos -= chunk.length;
        continue;
      }
      const toRead = Math.min(remaining, chunk.length - pos);
      result.push(chunk.subarray(pos, pos + toRead));
      remaining -= toRead;
      pos = 0;
      if (remaining <= 0) break;
    }
    this._position += length - remaining;
    return new ByteVector(this._concat(result));
  }

  /**
   * Writes `data` at the current position, overwriting existing content byte
   * by byte across chunk boundaries and appending a new chunk if the write
   * extends past the end. Advances the position by `data.length`.
   *
   * @param data - The bytes to write.
   */
  async writeBlock(data: ByteVector): Promise<void> {
    if (!data || data.length === 0) return;
    let remaining = data.length;
    let dataPos = 0;
    let pos = this._position;
    let chunkIdx = 0;
    let offset = 0;

    // Find the chunk and intra-chunk offset for the current position
    for (; chunkIdx < this._chunks.length; chunkIdx++) {
      const chunk = this._chunks[chunkIdx];
      if (pos < chunk.length) {
        offset = pos;
        break;
      }
      pos -= chunk.length;
    }

    while (remaining > 0) {
      if (chunkIdx >= this._chunks.length) {
        // Append remaining bytes as a new chunk
        const newChunk = data.data.subarray(dataPos, dataPos + remaining);
        this._chunks.push(newChunk);
        this._length += newChunk.length;
        this._position += newChunk.length;
        break;
      }
      const chunk = this._chunks[chunkIdx];
      const toWrite = Math.min(remaining, chunk.length - offset);
      chunk.set(data.data.subarray(dataPos, dataPos + toWrite), offset);
      dataPos += toWrite;
      remaining -= toWrite;
      offset = 0;
      chunkIdx++;
      this._position += toWrite;
    }
    this._length = Math.max(this._length, this._position);
  }

  /**
   * Inserts `data` at byte offset `start`, optionally replacing `replace`
   * bytes of existing content. Builds a new chunk array from slices of
   * existing chunks to avoid unnecessary data copies.
   *
   * @param data    - The bytes to insert.
   * @param start   - Byte offset at which to begin the insertion.
   * @param replace - Number of existing bytes to overwrite. Defaults to 0.
   */
  async insert(data: ByteVector, start: offset_t, replace: number = 0): Promise<void> {
    if (!data || data.length === 0) return;

    const { before, after: fromStart } = this._splitAt(start);
    const after = this._skipBytes(fromStart, replace);

    this._chunks = [...before, data.data, ...after].filter(c => c.length > 0);
    this._length = this._chunks.reduce((sum, c) => sum + c.length, 0);
    this._position = start + data.length;
  }

  /**
   * Removes `length` bytes beginning at byte offset `start`. Builds a new
   * chunk array from slices of the existing chunks on either side of the
   * removed region.
   *
   * @param start  - Byte offset of the first byte to remove.
   * @param length - Number of bytes to remove.
   */
  async removeBlock(start: offset_t, length: number): Promise<void> {
    if (length <= 0 || start >= this._length) return;

    const { before } = this._splitAt(start);
    const { after } = this._splitAt(start + length);

    this._chunks = [...before, ...after].filter(c => c.length > 0);
    this._length = Math.max(0, this._length - length);

    if (this._position > start && this._position < start + length) {
      this._position = start;
    } else if (this._position >= start + length) {
      this._position -= length;
    }
  }

  /** Returns `false` — ChunkedByteVectorStream is always writable. */
  readOnly(): boolean {
    return false;
  }

  /** Returns `true` — ChunkedByteVectorStream is always open. */
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
        this._position = Math.max(0, this._length + offset);
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

  /** Returns the total number of bytes across all chunks. */
  length(): offset_t {
    return this._length;
  }

  /**
   * Truncates or zero-extends the stream to exactly `length` bytes. If the
   * current position exceeds the new length, it is clamped.
   *
   * @param length - The desired stream length in bytes.
   */
  async truncate(length: offset_t): Promise<void> {
    if (length < this._length) {
      // Drop or trim chunks beyond the new length
      let total = 0;
      for (let i = 0; i < this._chunks.length; i++) {
        total += this._chunks[i].length;
        if (total > length) {
          this._chunks[i] = this._chunks[i].subarray(0, this._chunks[i].length - (total - length));
          this._chunks.length = i + 1;
          break;
        }
      }
      this._chunks = this._chunks.filter(c => c.length > 0);
      this._length = length;
      if (this._position > length) this._position = length;
    } else if (length > this._length) {
      // Zero-pad to the new length
      const pad = new Uint8Array(length - this._length);
      this._chunks.push(pad);
      this._length = length;
    }
  }

  // ---------------------------------------------------------------------------
  // ChunkedByteVectorStream-specific public API
  // ---------------------------------------------------------------------------

  /** Returns a copy of all chunks concatenated as a {@link ByteVector}. */
  data(): ByteVector {
    return new ByteVector(this._concat(this._chunks));
  }

  /**
   * Returns a {@link Blob} whose parts are the individual chunks, avoiding a
   * full buffer copy in browser environments.
   *
   * @param mime - Optional MIME type for the Blob.
   */
  blob(mime?: string): Blob {
    return new Blob(this._chunks as BlobPart[], { type: mime });
  }

  /**
   * Returns a copy of the internal chunk array. Each element is a copy of
   * the corresponding chunk.
   */
  chunkParts(): Uint8Array[] {
    return this._chunks.map(chunk => chunk.slice());
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Splits the chunk array at `pos` bytes from the start.
   *
   * Returns `before` (chunks whose content precedes `pos`) and `after`
   * (chunks from `pos` onward). The chunk that straddles `pos` is split into
   * two sub-arrays; either sub-array may be empty if the split falls exactly
   * at a chunk boundary.
   *
   * @param pos - Byte offset at which to split.
   */
  private _splitAt(pos: offset_t): { before: Uint8Array[]; after: Uint8Array[] } {
    const before: Uint8Array[] = [];
    const after: Uint8Array[] = [];
    let remaining = pos;
    let split = false;

    for (const chunk of this._chunks) {
      if (split) {
        after.push(chunk);
      } else if (remaining >= chunk.length) {
        before.push(chunk);
        remaining -= chunk.length;
      } else {
        // This chunk straddles the split point
        if (remaining > 0) {
          before.push(chunk.subarray(0, remaining));
        }
        after.push(chunk.subarray(remaining));
        split = true;
      }
    }

    return { before, after };
  }

  /**
   * Skips the first `n` bytes from `chunks`, returning the remaining content
   * as a new array of sub-array views.
   *
   * @param chunks - Source chunk array (not mutated).
   * @param n      - Number of bytes to skip from the front.
   */
  private _skipBytes(chunks: Uint8Array[], n: number): Uint8Array[] {
    if (n <= 0) return chunks;
    const result: Uint8Array[] = [];
    let remaining = n;
    for (const chunk of chunks) {
      if (remaining <= 0) {
        result.push(chunk);
      } else if (remaining >= chunk.length) {
        remaining -= chunk.length;
      } else {
        result.push(chunk.subarray(remaining));
        remaining = 0;
      }
    }
    return result;
  }

  /**
   * Concatenates an array of `Uint8Array` chunks into a single contiguous
   * `Uint8Array`.
   *
   * @param chunks - Chunks to concatenate.
   */
  private _concat(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
