import { ByteVector } from "../byteVector.js";
import { type offset_t, Position } from "./types.js";
import { IOStream } from "./ioStream.js";

/**
 * An in-memory IOStream backed by a ByteVector. Useful for reading/writing
 * metadata without touching the filesystem.
 */
export class ByteVectorStream extends IOStream {
  private _data: ByteVector;
  private _position: offset_t = 0;

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

  name(): string {
    return "";
  }

  readBlock(length: number): ByteVector {
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

  writeBlock(data: ByteVector): void {
    if (data.length === 0) {
      return;
    }

    const end = this._position + data.length;
    if (end > this._data.length) {
      // Extend the buffer to fit the write
      this._data.resize(end);
    }

    for (let i = 0; i < data.length; i++) {
      this._data.set(this._position + i, data.get(i));
    }
    this._position = end;
  }

  insert(data: ByteVector, start: offset_t, replace: number = 0): void {
    if (start > this._data.length) {
      // Pad with zeros up to start, then append data
      this._data.resize(start);
    }

    const before = this._data.mid(0, start);
    const after = this._data.mid(start + replace);

    this._data = ByteVector.fromByteVector(before);
    this._data.append(data);
    this._data.append(after);

    this._position = start + data.length;
  }

  removeBlock(start: offset_t, length: number): void {
    if (start >= this._data.length || length <= 0) {
      return;
    }

    const before = this._data.mid(0, start);
    const after = this._data.mid(start + length);

    this._data = ByteVector.fromByteVector(before);
    this._data.append(after);

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
        this._position = Math.max(0, this._data.length + offset);
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
    return this._data.length;
  }

  truncate(length: offset_t): void {
    this._data.resize(length);
    if (this._position > length) {
      this._position = length;
    }
  }

  // ---------------------------------------------------------------------------
  // ByteVectorStream-specific
  // ---------------------------------------------------------------------------

  /** Returns a copy of the underlying ByteVector. */
  data(): ByteVector {
    return ByteVector.fromByteVector(this._data);
  }
}
