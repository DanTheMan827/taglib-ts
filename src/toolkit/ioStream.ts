/**
 * @packageDocumentation Abstract IOStream interface for byte-level I/O.
 */

import { ByteVector } from "../byteVector.js";
import { type offset_t, Position } from "./types.js";

/**
 * Abstract base class for I/O streams. Concrete subclasses provide
 * byte-level read/write access to a backing store (file, memory, network, etc.).
 *
 * All I/O and position methods are async to support backends such as
 * `Blob`/`File`, `FileSystemFileHandle`, and the Deno native FS API where
 * operations like seeking and querying length are genuinely asynchronous.
 *
 * Only identity/flag queries ({@link name}, {@link readOnly}, {@link isOpen})
 * remain synchronous.
 */
export abstract class IOStream {
  /** Returns the name or identifier of the stream (e.g., a file path). */
  abstract name(): string;

  /**
   * Reads up to `length` bytes from the current stream position and advances
   * the position by the number of bytes actually read.
   *
   * @param length - Maximum number of bytes to read.
   * @returns A `ByteVector` containing the bytes read. May be shorter than
   *   `length` if the end of the stream is reached.
   */
  abstract readBlock(length: number): Promise<ByteVector>;

  /**
   * Writes `data` at the current stream position, overwriting existing content
   * and extending the stream if necessary. Advances the position by
   * `data.length`.
   *
   * @param data - The bytes to write.
   */
  abstract writeBlock(data: ByteVector): Promise<void>;

  /**
   * Inserts `data` at byte offset `start`, optionally replacing `replace`
   * bytes of existing content. The position is set to `start + data.length`
   * after the operation.
   *
   * @param data    - The bytes to insert.
   * @param start   - Byte offset at which to begin the insertion.
   * @param replace - Number of existing bytes to overwrite starting at
   *   `start`. Defaults to 0 (pure insertion).
   */
  abstract insert(data: ByteVector, start: offset_t, replace?: number): Promise<void>;

  /**
   * Removes `length` bytes beginning at byte offset `start`, shifting all
   * subsequent bytes towards the beginning of the stream.
   *
   * @param start  - Byte offset of the first byte to remove.
   * @param length - Number of bytes to remove.
   */
  abstract removeBlock(start: offset_t, length: number): Promise<void>;

  /** Returns `true` if the stream does not support write operations. */
  abstract readOnly(): boolean;

  /** Returns `true` if the stream is currently open and available for I/O. */
  abstract isOpen(): boolean;

  /**
   * Moves the read/write position within the stream.
   *
   * @param offset   - Number of bytes to move relative to `position`.
   * @param position - Reference point for the seek. Defaults to
   *   {@link Position.Beginning}.
   */
  abstract seek(offset: offset_t, position?: Position): Promise<void>;

  /**
   * Resets the stream position to the beginning (equivalent to
   * `seek(0, Position.Beginning)`).
   */
  abstract clear(): Promise<void>;

  /**
   * Returns the current read/write position in bytes from the start of the
   * stream.
   */
  abstract tell(): Promise<offset_t>;

  /** Returns the total length of the stream in bytes. */
  abstract length(): Promise<offset_t>;

  /**
   * Truncates or extends the stream to exactly `length` bytes. If the new
   * length is greater than the current length, the extension is zero-filled.
   * If the current position exceeds the new length, it is clamped.
   *
   * @param length - The desired stream length in bytes.
   */
  abstract truncate(length: offset_t): Promise<void>;
}
