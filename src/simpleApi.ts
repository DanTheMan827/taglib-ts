/**
 * @file Simple high-level API for reading and writing audio file tags.
 *
 * Provides two convenience functions — {@link readTags} and {@link writeTags} —
 * that accept `File`, `Blob`, or `Uint8Array` inputs and return/accept plain
 * JavaScript objects, making common tag operations easy without needing to work
 * with the lower-level {@link FileRef} class directly.
 *
 * @example Read tags from a browser File
 * ```ts
 * const tags = await readTags(inputFile);
 * console.log(tags.title, tags.artist, tags.album);
 * console.log(`Duration: ${tags.audioProperties?.lengthInSeconds}s`);
 * ```
 *
 * @example Write tags back to a browser File
 * ```ts
 * const updated = await writeTags(inputFile, { title: 'New Title', artist: 'New Artist' });
 * // updated is a Uint8Array containing the modified audio data
 * ```
 */

import { FileRef } from "./fileRef.js";
import { ByteVectorStream } from "./toolkit/byteVectorStream.js";

/**
 * Plain-object representation of audio file tags.
 * All string fields default to an empty string, numeric fields default to `0`.
 */
export interface Tags {
  /** Track title. */
  title: string;
  /** Primary artist or performer. */
  artist: string;
  /** Album name. */
  album: string;
  /** Free-form comment. */
  comment: string;
  /** Genre string (may be an ID3v1 genre name or a custom string). */
  genre: string;
  /** Release year (0 if not set). */
  year: number;
  /** Track number within the album (0 if not set). */
  track: number;
  /**
   * Audio properties extracted from the stream, or `null` if the format does
   * not provide them or they were not requested.
   */
  audioProperties: AudioPropertiesInfo | null;
}

/**
 * Plain-object representation of audio stream properties.
 */
export interface AudioPropertiesInfo {
  /** Duration in whole seconds. */
  lengthInSeconds: number;
  /** Duration in milliseconds. */
  lengthInMilliseconds: number;
  /** Average bitrate in kb/s. */
  bitrate: number;
  /** Sample rate in Hz. */
  sampleRate: number;
  /** Number of audio channels. */
  channels: number;
}

/**
 * Fields accepted by {@link writeTags}.  All fields are optional; any field
 * that is `undefined` is left unchanged in the tag.
 */
export interface TagsToWrite {
  /** Track title. */
  title?: string;
  /** Primary artist or performer. */
  artist?: string;
  /** Album name. */
  album?: string;
  /** Free-form comment. */
  comment?: string;
  /** Genre string. */
  genre?: string;
  /** Release year (use `0` to clear). */
  year?: number;
  /** Track number (use `0` to clear). */
  track?: number;
}

/**
 * Input types accepted by {@link readTags} and {@link writeTags}.
 *
 * - `File` — a browser `File` object (filename used for format detection)
 * - `Blob` — a `Blob` object (content-based format detection)
 * - `Uint8Array` — raw byte array (content-based format detection)
 * - `{ data: Uint8Array; filename: string }` — byte array with an explicit
 *   filename for extension-based format detection
 */
export type AudioInput =
  | File
  | Blob
  | Uint8Array
  | { data: Uint8Array; filename: string };

/**
 * Read tags and audio properties from an audio file.
 *
 * Format detection is automatic: the filename extension is tried first, then
 * content-based magic-byte detection.
 *
 * @param input  The audio data to read.  Accepts `File`, `Blob`, `Uint8Array`,
 *               or `{ data, filename }`.
 * @param readAudioProperties  When `true` (default), audio properties such as
 *                             bitrate and duration are also extracted.
 * @returns A {@link Tags} object.  If the format is not recognised or the file
 *          is invalid, all string fields are empty strings and `audioProperties`
 *          is `null`.
 *
 * @example
 * ```ts
 * import { readTags } from 'taglib';
 *
 * // Browser File input
 * const tags = await readTags(file);
 * console.log(tags.title, tags.artist);
 *
 * // Raw Uint8Array with filename hint
 * const tags2 = await readTags({ data: buffer, filename: 'track.mp3' });
 * ```
 */
export async function readTags(
  input: AudioInput,
  readAudioProperties: boolean = true,
): Promise<Tags> {
  const ref = await openFileRef(input, readAudioProperties);

  const empty: Tags = {
    title: "",
    artist: "",
    album: "",
    comment: "",
    genre: "",
    year: 0,
    track: 0,
    audioProperties: null,
  };

  if (!ref || !ref.isValid) return empty;

  const tag = ref.tag();
  const ap = ref.audioProperties();

  return {
    title: tag?.title ?? "",
    artist: tag?.artist ?? "",
    album: tag?.album ?? "",
    comment: tag?.comment ?? "",
    genre: tag?.genre ?? "",
    year: tag?.year ?? 0,
    track: tag?.track ?? 0,
    audioProperties: ap
      ? {
        lengthInSeconds: ap.lengthInSeconds,
        lengthInMilliseconds: ap.lengthInMilliseconds,
        bitrate: ap.bitrate,
        sampleRate: ap.sampleRate,
        channels: ap.channels,
      }
      : null,
  };
}

/**
 * Write tags to an audio file and return the modified audio data as a
 * `Uint8Array`.
 *
 * The input data is copied into an in-memory buffer; the original `input` is
 * never mutated.  Only the fields present in `tags` are changed — any field
 * that is `undefined` keeps its existing value in the file.
 *
 * @param input   The audio data to modify.
 * @param tags    The tag fields to write.
 * @returns The modified audio data as a `Uint8Array`, or `null` if the format
 *          is not recognised, the file is invalid, or the save failed.
 *
 * @example
 * ```ts
 * import { writeTags } from 'taglib';
 *
 * const modified = await writeTags(file, {
 *   title: 'My Track',
 *   artist: 'My Artist',
 *   year: 2024,
 * });
 *
 * if (modified) {
 *   const blob = new Blob([modified], { type: 'audio/mpeg' });
 *   // offer blob for download, etc.
 * }
 * ```
 */
export async function writeTags(
  input: AudioInput,
  tags: TagsToWrite,
): Promise<Uint8Array | null> {
  const ref = await openFileRef(input, false);
  if (!ref || !ref.isValid) return null;

  const tag = ref.tag();
  if (!tag) return null;

  if (tags.title !== undefined) tag.title = tags.title;
  if (tags.artist !== undefined) tag.artist = tags.artist;
  if (tags.album !== undefined) tag.album = tags.album;
  if (tags.comment !== undefined) tag.comment = tags.comment;
  if (tags.genre !== undefined) tag.genre = tags.genre;
  if (tags.year !== undefined) tag.year = tags.year;
  if (tags.track !== undefined) tag.track = tags.track;

  const saved = await ref.save();
  if (!saved) return null;

  // Extract the (possibly modified) bytes from the underlying stream
  const file = ref.file();
  if (!file) return null;
  const stream = file.stream() as ByteVectorStream;
  return stream.data().data;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Open an {@link AudioInput} as a {@link FileRef}, handling all supported
 * input types.
 *
 * @param input          The audio data to open.
 * @param readProperties Whether to parse audio properties.
 * @returns A `FileRef`, or `null` if the input cannot be opened.
 */
async function openFileRef(
  input: AudioInput,
  readProperties: boolean,
): Promise<FileRef | null> {
  try {
    if (input instanceof Uint8Array) {
      return await FileRef.fromByteArray(input, "", readProperties);
    }
    if (typeof File !== "undefined" && input instanceof File) {
      return await FileRef.fromBlob(input, input.name, readProperties);
    }
    if (input instanceof Blob) {
      return await FileRef.fromBlob(input, undefined, readProperties);
    }
    // { data, filename }
    const typed = input as { data: Uint8Array; filename: string };
    return await FileRef.fromByteArray(typed.data, typed.filename, readProperties);
  } catch {
    return null;
  }
}
