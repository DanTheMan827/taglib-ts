import { ByteVector } from "../byteVector.js";
import { IOStream } from "./ioStream.js";
import { type offset_t, Position } from "./types.js";

/**
 * An in-memory IOStream backed by an array of Uint8Array chunks.
 * Efficient for chunked operations and large data.
 */

export class ChunkedByteVectorStream extends IOStream {
  private _chunks: Uint8Array[];
  private _position: offset_t = 0;
  private _length: offset_t = 0;

  constructor(...data: Uint8Array[]) {
    super();
    this._chunks = data;
    this._length = this._chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  static fromChunks(chunks: Uint8Array[]): ChunkedByteVectorStream {
    const stream = new ChunkedByteVectorStream(new Uint8Array());
    stream._chunks = chunks;
    stream._length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    return stream;
  }

  name(): string {
    return "";
  }

  // Read up to 'length' bytes from current position, spanning chunks, returns ByteVector
  readBlock(length: number): ByteVector {
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

  // Write a ByteVector at current position, possibly splitting chunks
  writeBlock(data: ByteVector): void {
    if (!data || data.length === 0) return;
    let remaining = data.length;
    let dataPos = 0;
    let pos = this._position;
    let chunkIdx = 0;
    let offset = 0;

    // Find chunk and offset for current position
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
        // Append new chunk
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

  // Insert a ByteVector at a given position, replacing 'replace' bytes
  insert(data: ByteVector, start: offset_t, replace: number = 0): void {
    if (!data || data.length === 0) return;
    let pos = start;
    let chunkIdx = 0;
    let offset = 0;

    // Find chunk and offset for start position
    for (; chunkIdx < this._chunks.length; chunkIdx++) {
      const chunk = this._chunks[chunkIdx];
      if (pos < chunk.length) {
        offset = pos;
        break;
      }
      pos -= chunk.length;
    }

    // Remove 'replace' bytes, possibly spanning multiple chunks
    let remainingReplace = replace;
    let removeIdx = chunkIdx;
    let removeOffset = offset;
    while (remainingReplace > 0 && removeIdx < this._chunks.length) {
      const chunk = this._chunks[removeIdx];
      const toRemove = Math.min(remainingReplace, chunk.length - removeOffset);
      if (toRemove === chunk.length) {
        this._chunks.splice(removeIdx, 1);
      } else {
        const before = chunk.subarray(0, removeOffset);
        const after = chunk.subarray(removeOffset + toRemove, chunk.length);
        if (before.length && after.length) {
          this._chunks.splice(removeIdx, 1, before, after);
          removeIdx++;
        } else if (before.length) {
          this._chunks.splice(removeIdx, 1, before);
          removeIdx++;
        } else if (after.length) {
          this._chunks.splice(removeIdx, 1, after);
        } else {
          this._chunks.splice(removeIdx, 1);
        }
      }
      remainingReplace -= toRemove;
      removeOffset = 0;
    }

    // Insert new data
    if (chunkIdx < this._chunks.length) {
      const chunk = this._chunks[chunkIdx];
      const before = chunk.subarray(0, offset);
      const after = chunk.subarray(offset, chunk.length);
      const insertArr = [];
      if (before.length) insertArr.push(before);
      insertArr.push(data.data);
      if (after.length) insertArr.push(after);
      this._chunks.splice(chunkIdx, 1, ...insertArr);
    } else {
      // Insert at end
      this._chunks.push(data.data);
    }
    this._length += data.length - replace;
    this._position = start + data.length;
  }

  // Remove a block of bytes starting at 'start', length 'length'
  removeBlock(start: offset_t, length: number): void {
    if (length <= 0 || start >= this._length) return;
    let pos = start;
    let chunkIdx = 0;
    let offset = 0;

    // Find chunk and offset for start position
    for (; chunkIdx < this._chunks.length; chunkIdx++) {
      const chunk = this._chunks[chunkIdx];
      if (pos < chunk.length) {
        offset = pos;
        break;
      }
      pos -= chunk.length;
    }

    let remaining = length;
    while (remaining > 0 && chunkIdx < this._chunks.length) {
      const chunk = this._chunks[chunkIdx];
      const toRemove = Math.min(remaining, chunk.length - offset);
      if (toRemove === chunk.length) {
        this._chunks.splice(chunkIdx, 1);
      } else {
        const before = chunk.subarray(0, offset);
        const after = chunk.subarray(offset + toRemove, chunk.length);
        this._chunks.splice(chunkIdx, 1, before, after);
        chunkIdx++;
      }
      remaining -= toRemove;
      offset = 0;
    }
    this._length -= length;
    if (this._position > start && this._position < start + length) {
      this._position = start;
    } else if (this._position >= start + length) {
      this._position -= length;
    }
  }

  readOnly(): boolean {
    return false;
  }

  isOpen(): boolean {
    return true;
  }

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

  clear(): void {
    this._position = 0;
  }

  tell(): offset_t {
    return this._position;
  }

  length(): offset_t {
    return this._length;
  }

  truncate(length: offset_t): void {
    if (length < this._length) {
      // Remove chunks beyond length
      let total = 0;
      for (let i = 0; i < this._chunks.length; i++) {
        total += this._chunks[i].length;
        if (total > length) {
          this._chunks[i] = this._chunks[i].subarray(0, this._chunks[i].length - (total - length));
          this._chunks.length = i + 1;
          break;
        }
      }
      this._length = length;
      if (this._position > length) this._position = length;
    } else if (length > this._length) {
      // Pad with zeros
      const pad = new Uint8Array(length - this._length);
      this._chunks.push(pad);
      this._length = length;
    }
  }

  /** Returns a copy of all chunks concatenated as ByteVector. */
  data(): ByteVector {
    return new ByteVector(this._concat(this._chunks));
  }

  blob(mime?: string): Blob {
    return new Blob(this._chunks as BlobPart[], { type: mime });
  }

  /** Returns the array of chunks (Blob parts). */
  chunkParts(): Uint8Array[] {
    return this._chunks.map(chunk => chunk.slice());
  }

  // Helper: concatenate array of Uint8Arrays
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
