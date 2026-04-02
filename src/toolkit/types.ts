/**
 * @packageDocumentation Core type definitions and enumerations used throughout taglib-ts.
 */

import { type IOStream } from "./ioStream";

type _IOStream = IOStream; // Used for type imports to prevent eslint warnings.

/** Byte offset within a stream or file, represented as a JavaScript number. */
export type offset_t = number;

/** Reference point for a {@link IOStream.seek} operation. */
export enum Position {
  /** Seek from the beginning of the stream. */
  Beginning = 0,
  /** Seek from the current position. */
  Current = 1,
  /** Seek from the end of the stream (use a negative offset to go backwards). */
  End = 2,
}

/** Controls how thoroughly audio properties are parsed when opening a file. */
export enum ReadStyle {
  /** Minimal parsing — reads only headers; fastest but least accurate. */
  Fast = 0,
  /** Balanced parsing — reads a representative sample of the file. */
  Average = 1,
  /** Full parsing — inspects the entire file for maximum accuracy. */
  Accurate = 2,
}

/** Specifies which tag types should be stripped when saving a file. */
export enum StripTags {
  /** Do not strip any tags. */
  StripNone = 0x0000,
  /** Strip all tag types other than the one being saved. */
  StripOthers = 0xffff,
}

/** Controls whether an existing tag type is duplicated into a new location. */
export enum DuplicateTags {
  /** Copy the tag data into the new tag type. */
  Duplicate = 0x0001,
  /** Leave the new tag type empty rather than copying. */
  DoNotDuplicate = 0x0000,
}
