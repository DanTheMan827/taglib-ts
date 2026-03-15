import { ByteVector } from "../byteVector.js";
import { type offset_t, Position } from "./types.js";

/**
 * Abstract base class for I/O streams. Concrete subclasses provide
 * byte-level read/write access to a backing store (file, memory, etc.).
 */
export abstract class IOStream {
  abstract name(): string;
  abstract readBlock(length: number): ByteVector;
  abstract writeBlock(data: ByteVector): void;
  abstract insert(data: ByteVector, start: offset_t, replace?: number): void;
  abstract removeBlock(start: offset_t, length: number): void;
  abstract readOnly(): boolean;
  abstract isOpen(): boolean;
  abstract seek(offset: offset_t, position?: Position): void;
  abstract clear(): void;
  abstract tell(): offset_t;
  abstract length(): offset_t;
  abstract truncate(length: offset_t): void;
}
