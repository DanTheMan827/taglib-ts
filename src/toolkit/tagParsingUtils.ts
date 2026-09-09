/** @packageDocumentation Shared helpers for validating metadata enums and GUIDs read from file bytes. */

import { StringType } from "../byteVector.js";
import { ByteVector } from "../byteVector.js";

/** Maximum value of the shared picture-type enums used by ID3v2, ASF, and FLAC. */
const MAX_PICTURE_TYPE = 0x14;

/**
 * Decode an ID3v2 text-encoding byte into a supported {@link StringType}.
 *
 * Unknown values fall back to Latin-1 to match TagLib's defensive behavior.
 *
 * @param value - Raw byte read from a file.
 * @returns A validated {@link StringType}.
 */
export function textEncodingFromByte(value: number): StringType {
  switch (value & 0xff) {
    case StringType.Latin1:
    case StringType.UTF16:
    case StringType.UTF16BE:
    case StringType.UTF8:
    case StringType.UTF16LE:
      return value as StringType;
    default:
      return StringType.Latin1;
  }
}

/**
 * Clamp a raw byte to a known inclusive enum range.
 *
 * @template T - Numeric enum type.
 * @param value - Raw byte read from a file.
 * @param maxValue - Highest recognised enum value.
 * @param fallback - Value to return when `value` is outside the range.
 * @returns The validated enum value.
 */
export function boundedByteEnum<T extends number>(
  value: number,
  maxValue: T,
  fallback: T,
): T {
  const normalized = value & 0xff;
  return normalized <= maxValue ? normalized as T : fallback;
}

/**
 * Clamp an unsigned integer to a known inclusive enum range.
 *
 * @template T - Numeric enum type.
 * @param value - Raw unsigned integer read from a file.
 * @param maxValue - Highest recognised enum value.
 * @param fallback - Value to return when `value` is outside the range.
 * @returns The validated enum value.
 */
export function boundedUIntEnum<T extends number>(
  value: number,
  maxValue: T,
  fallback: T,
): T {
  return Number.isInteger(value) && value >= 0 && value <= maxValue
    ? value as T
    : fallback;
}

/**
 * Decode a shared picture-type byte into a known picture enum value.
 *
 * Unknown values fall back to `Other` (`0`).
 *
 * @template T - Numeric picture enum type.
 * @param value - Raw byte read from a file.
 * @returns A validated picture type.
 */
export function pictureTypeFromByte<T extends number>(value: number): T {
  return boundedByteEnum(value, MAX_PICTURE_TYPE as T, 0 as T);
}

/**
 * Decode a shared picture-type integer into a known picture enum value.
 *
 * Unknown values fall back to `Other` (`0`).
 *
 * @template T - Numeric picture enum type.
 * @param value - Raw integer read from a file.
 * @returns A validated picture type.
 */
export function pictureTypeFromUInt<T extends number>(value: number): T {
  return boundedUIntEnum(value, MAX_PICTURE_TYPE as T, 0 as T);
}

/**
 * Render a 16-byte GUID as an uppercase dashed string.
 *
 * @param value - Raw GUID bytes.
 * @returns Canonical uppercase GUID text, or `""` when `value` is not 16 bytes.
 */
export function guidToString(value: ByteVector): string {
  if (value.length !== 16) {
    return "";
  }

  const hex = Array.from(value.data, byte => byte.toString(16).padStart(2, "0").toUpperCase());
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * Parse a GUID string into its raw 16-byte representation.
 *
 * Non-hex separators are ignored. Invalid strings produce an empty buffer.
 *
 * @param value - Input GUID text.
 * @returns Parsed 16-byte GUID data, or an empty {@link ByteVector} when invalid.
 */
export function guidFromString(value: string): ByteVector {
  const hex = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (hex.length !== 32) {
    return new ByteVector();
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return ByteVector.fromByteArray(bytes);
}
