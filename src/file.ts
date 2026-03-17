/**
 * @file Abstract base class for audio file format implementations.
 *
 * Provides async I/O helpers that delegate to an {@link IOStream}, along with
 * metadata access via the format-specific {@link Tag} and
 * {@link AudioProperties} objects returned by the concrete subclass.
 */

import { ByteVector } from "./byteVector.js";
import { type offset_t, Position } from "./toolkit/types.js";
import { IOStream } from "./toolkit/ioStream.js";
import type { Tag } from "./tag.js";
import type { AudioProperties } from "./audioProperties.js";
import { PropertyMap } from "./toolkit/propertyMap.js";
import type { VariantMap } from "./toolkit/variant.js";

/**
 * Abstract base class for file format implementations. Provides common async
 * I/O helpers and delegates metadata access to the format-specific {@link Tag}
 * and {@link AudioProperties} objects.
 *
 * Concrete subclasses must implement {@link tag}, {@link audioProperties}, and
 * {@link save}.
 */
export abstract class File {
  /** The underlying I/O stream. */
  protected _stream: IOStream;

  /**
   * Whether the file was parsed successfully. Subclasses set this to `false`
   * when a fatal parse error is encountered.
   */
  protected _valid: boolean = true;

  /**
   * Constructs a `File` around the given stream.
   *
   * @param stream - The I/O stream to read from and write to.
   */
  constructor(stream: IOStream) {
    this._stream = stream;
  }

  // ---------------------------------------------------------------------------
  // Abstract interface
  // ---------------------------------------------------------------------------

  /**
   * The name (path) of the underlying stream, as reported by the stream
   * itself. Synchronous.
   */
  get name(): string {
    return this._stream.name();
  }

  /**
   * Returns the underlying {@link IOStream} used by this file.
   *
   * @returns The raw I/O stream.
   */
  stream(): IOStream {
    return this._stream;
  }

  /**
   * Returns the format-specific tag, or `null` if unavailable.
   *
   * @returns The tag object, or `null`.
   */
  abstract tag(): Tag | null;

  /**
   * Returns the format-specific audio properties, or `null` if unavailable.
   *
   * @returns The audio properties object, or `null`.
   */
  abstract audioProperties(): AudioProperties | null;

  /**
   * Writes all pending tag and metadata changes back to the stream.
   *
   * @returns A promise that resolves to `true` on success, `false` on failure.
   */
  abstract save(): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // PropertyMap delegation
  // ---------------------------------------------------------------------------

  /**
   * Returns a {@link PropertyMap} containing all tag fields exposed by this
   * file's tag. Returns an empty map if no tag is present.
   *
   * @returns The property map.
   */
  properties(): PropertyMap {
    const t = this.tag();
    return t ? t.properties() : new PropertyMap();
  }

  /**
   * Replaces the tag's properties with the supplied map and returns a map of
   * properties that could not be set (unsupported keys).
   *
   * @param properties - The new property map to apply.
   * @returns A map of properties that were not applied.
   */
  setProperties(properties: PropertyMap): PropertyMap {
    const t = this.tag();
    return t ? t.setProperties(properties) : new PropertyMap();
  }

  /**
   * Removes unsupported properties from the tag.
   *
   * @param properties - The list of property keys to remove.
   */
  removeUnsupportedProperties(properties: string[]): void {
    this.tag()?.removeUnsupportedProperties(properties);
  }

  /**
   * Returns the list of complex-property keys supported by the tag.
   *
   * @returns An array of key strings (e.g. `"PICTURE"`).
   */
  complexPropertyKeys(): string[] {
    const t = this.tag();
    return t ? t.complexPropertyKeys() : [];
  }

  /**
   * Returns all complex property values for the given key.
   *
   * @param key - The complex property key.
   * @returns An array of {@link VariantMap} objects.
   */
  complexProperties(key: string): VariantMap[] {
    const t = this.tag();
    return t ? t.complexProperties(key) : [];
  }

  /**
   * Sets complex property values for the given key.
   *
   * @param key - The complex property key.
   * @param value - The array of {@link VariantMap} objects to store.
   * @returns `true` if the property was set, `false` if not supported.
   */
  setComplexProperties(key: string, value: VariantMap[]): boolean {
    const t = this.tag();
    return t ? t.setComplexProperties(key, value) : false;
  }

  // ---------------------------------------------------------------------------
  // I/O delegation
  // ---------------------------------------------------------------------------

  /**
   * Reads up to `length` bytes from the current stream position.
   *
   * @param length - The maximum number of bytes to read.
   * @returns A promise resolving to the bytes read as a {@link ByteVector}.
   */
  async readBlock(length: number): Promise<ByteVector> {
    return await this._stream.readBlock(length);
  }

  /**
   * Writes `data` at the current stream position.
   *
   * @param data - The bytes to write.
   * @returns A promise that resolves when the write is complete.
   */
  async writeBlock(data: ByteVector): Promise<void> {
    await this._stream.writeBlock(data);
  }

  /**
   * Inserts `data` into the stream at `start`, optionally replacing `replace`
   * bytes.
   *
   * @param data - The bytes to insert.
   * @param start - Byte offset at which to insert. Defaults to `0`.
   * @param replace - Number of bytes to overwrite. Defaults to `0`.
   * @returns A promise that resolves when the operation is complete.
   */
  async insert(
    data: ByteVector,
    start: offset_t = 0,
    replace: number = 0,
  ): Promise<void> {
    await this._stream.insert(data, start, replace);
  }

  /**
   * Removes `length` bytes from the stream starting at `start`.
   *
   * @param start - Byte offset of the first byte to remove. Defaults to `0`.
   * @param length - Number of bytes to remove. Defaults to `0`.
   * @returns A promise that resolves when the operation is complete.
   */
  async removeBlock(start: offset_t = 0, length: number = 0): Promise<void> {
    await this._stream.removeBlock(start, length);
  }

  /**
   * Whether the underlying stream is read-only. Synchronous.
   */
  get readOnly(): boolean {
    return this._stream.readOnly();
  }

  /**
   * Whether the underlying stream is currently open. Synchronous.
   */
  get isOpen(): boolean {
    return this._stream.isOpen();
  }

  /**
   * Whether this file was parsed successfully.
   */
  get isValid(): boolean {
    return this._valid;
  }

  /**
   * Moves the stream's read/write cursor to `offset` relative to `position`.
   *
   * @param offset - The byte offset to seek to.
   * @param position - The seek origin. Defaults to {@link Position.Beginning}.
   * @returns A promise that resolves when the seek is complete.
   */
  async seek(
    offset: offset_t,
    position: Position = Position.Beginning,
  ): Promise<void> {
    await this._stream.seek(offset, position);
  }

  /**
   * Resets the stream position to the beginning (equivalent to
   * `seek(0, Position.Beginning)`).
   *
   * @returns A promise that resolves when the operation is complete.
   */
  async clear(): Promise<void> {
    await this._stream.clear();
  }

  /**
   * Returns the current byte offset of the stream cursor.
   *
   * @returns A promise resolving to the cursor position.
   */
  async tell(): Promise<offset_t> {
    return await this._stream.tell();
  }

  /**
   * Returns the total length of the stream in bytes.
   *
   * Note: this is an async method rather than a getter because getters cannot
   * be `async`.
   *
   * @returns A promise resolving to the stream length in bytes.
   */
  async fileLength(): Promise<number> {
    return await this._stream.length();
  }

  /**
   * Truncates (or extends) the stream to exactly `length` bytes.
   *
   * @param length - The desired stream length in bytes.
   * @returns A promise that resolves when the truncation is complete.
   */
  async truncate(length: offset_t): Promise<void> {
    await this._stream.truncate(length);
  }

  // ---------------------------------------------------------------------------
  // Pattern search
  // ---------------------------------------------------------------------------

  /**
   * Searches the stream forward for `pattern` starting at `fromOffset`.
   *
   * The stream cursor is restored to its original position after the search.
   * If `before` is provided, the search stops (returning `-1`) as soon as
   * `before` is encountered.
   *
   * @param pattern - The byte sequence to search for.
   * @param fromOffset - Byte offset at which to start searching. Defaults to `0`.
   * @param before - Optional sentinel; if found before `pattern`, returns `-1`.
   * @returns A promise resolving to the byte offset of the first match, or
   *   `-1` if not found.
   */
  async find(
    pattern: ByteVector,
    fromOffset: offset_t = 0,
    before?: ByteVector,
  ): Promise<offset_t> {
    if (pattern.length === 0 || pattern.length > File.bufferSize()) {
      return -1;
    }

    const originalPos = await this._stream.tell();
    const fileLen = await this._stream.length();

    if (fromOffset < 0) {
      fromOffset = 0;
    }
    if (fromOffset >= fileLen) {
      return -1;
    }

    await this._stream.seek(fromOffset);
    const chunkSize = File.bufferSize();

    // Keep previous partial-match tail to handle patterns spanning chunks
    let previousPartial = new ByteVector();
    let absoluteOffset = fromOffset;

    while (absoluteOffset < fileLen) {
      const block = await this._stream.readBlock(chunkSize);
      if (block.length === 0) break;

      // Combine previous tail with current block for cross-boundary matches
      const combined = ByteVector.fromByteVector(previousPartial);
      combined.append(block);

      // Search for `before` in the combined buffer
      if (before && before.length > 0) {
        const beforeIdx = combined.find(before);
        if (beforeIdx >= 0) {
          // Only search up to where `before` was found
          const limited = combined.mid(0, beforeIdx);
          const idx = limited.find(pattern);
          if (idx >= 0) {
            await this._stream.seek(originalPos);
            return absoluteOffset - previousPartial.length + idx;
          }
          await this._stream.seek(originalPos);
          return -1;
        }
      }

      const idx = combined.find(pattern);
      if (idx >= 0) {
        await this._stream.seek(originalPos);
        return absoluteOffset - previousPartial.length + idx;
      }

      // Retain the last (pattern.length - 1) bytes for cross-boundary matching
      const tailLen = Math.min(pattern.length - 1, combined.length);
      previousPartial = combined.mid(combined.length - tailLen, tailLen);
      absoluteOffset += block.length;
    }

    await this._stream.seek(originalPos);
    return -1;
  }

  /**
   * Searches the stream backward for `pattern`, starting at `fromOffset`
   * (default: end of file).
   *
   * The stream cursor is restored to its original position after the search.
   * If `before` is provided, the search stops (returning `-1`) as soon as
   * `before` is encountered while scanning backward.
   *
   * @param pattern - The byte sequence to search for.
   * @param fromOffset - Upper bound for the search. `0` means end of file.
   *   Defaults to `0`.
   * @param before - Optional sentinel; if found before `pattern`, returns `-1`.
   * @returns A promise resolving to the byte offset of the match, or `-1` if
   *   not found.
   */
  async rfind(
    pattern: ByteVector,
    fromOffset: offset_t = 0,
    before?: ByteVector,
  ): Promise<offset_t> {
    if (pattern.length === 0 || pattern.length > File.bufferSize()) {
      return -1;
    }

    const originalPos = await this._stream.tell();
    const fileLen = await this._stream.length();

    if (fileLen === 0) {
      return -1;
    }

    // fromOffset === 0 means "search from the very end"
    let end =
      fromOffset > 0 && fromOffset < fileLen
        ? Math.min(fromOffset + pattern.length, fileLen)
        : fileLen;
    const chunkSize = File.bufferSize();

    let nextPartial = new ByteVector();

    while (end > 0) {
      const start = Math.max(0, end - chunkSize);
      const readLen = end - start;

      await this._stream.seek(start);
      const block = await this._stream.readBlock(readLen);
      if (block.length === 0) break;

      // Combine block with the start of the next chunk for boundary matching
      const combined = ByteVector.fromByteVector(block);
      combined.append(nextPartial);

      // If `before` appears in this chunk, limit search
      if (before && before.length > 0) {
        const beforeIdx = combined.rfind(before);
        if (beforeIdx >= 0) {
          // Search only after the `before` pattern
          const afterBefore = combined.mid(beforeIdx + before.length);
          const idx = afterBefore.rfind(pattern);
          if (idx >= 0) {
            await this._stream.seek(originalPos);
            return start + beforeIdx + before.length + idx;
          }
          await this._stream.seek(originalPos);
          return -1;
        }
      }

      const idx = combined.rfind(pattern);
      if (idx >= 0) {
        await this._stream.seek(originalPos);
        return start + idx;
      }

      // Keep the first (pattern.length - 1) bytes for cross-boundary matching
      const headLen = Math.min(pattern.length - 1, combined.length);
      nextPartial = combined.mid(0, headLen);
      end = start;
    }

    await this._stream.seek(originalPos);
    return -1;
  }

  // ---------------------------------------------------------------------------
  // Static
  // ---------------------------------------------------------------------------

  /**
   * The size of the read buffer used by {@link find} and {@link rfind}, in
   * bytes.
   *
   * @returns The buffer size (1024).
   */
  static bufferSize(): number {
    return 1024;
  }
}
