import { ByteVector, StringType } from "../byteVector.js";
import type { File } from "../file.js";

// ---------------------------------------------------------------------------
// ASF GUIDs (16-byte constants)
// ---------------------------------------------------------------------------

export const headerGuid = ByteVector.fromByteArray(new Uint8Array([
  0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11,
  0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C,
]));

export const filePropertiesGuid = ByteVector.fromByteArray(new Uint8Array([
  0xA1, 0xDC, 0xAB, 0x8C, 0x47, 0xA9, 0xCF, 0x11,
  0x8E, 0xE4, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65,
]));

export const streamPropertiesGuid = ByteVector.fromByteArray(new Uint8Array([
  0x91, 0x07, 0xDC, 0xB7, 0xB7, 0xA9, 0xCF, 0x11,
  0x8E, 0xE6, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65,
]));

export const contentDescriptionGuid = ByteVector.fromByteArray(new Uint8Array([
  0x33, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11,
  0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C,
]));

export const extendedContentDescriptionGuid = ByteVector.fromByteArray(new Uint8Array([
  0x40, 0xA4, 0xD0, 0xD2, 0x07, 0xE3, 0xD2, 0x11,
  0x97, 0xF0, 0x00, 0xA0, 0xC9, 0x5E, 0xA8, 0x50,
]));

export const headerExtensionGuid = ByteVector.fromByteArray(new Uint8Array([
  0xB5, 0x03, 0xBF, 0x5F, 0x2E, 0xA9, 0xCF, 0x11,
  0x8E, 0xE3, 0x00, 0xC0, 0x0C, 0x20, 0x53, 0x65,
]));

export const metadataGuid = ByteVector.fromByteArray(new Uint8Array([
  0xEA, 0xCB, 0xF8, 0xC5, 0xAF, 0x5B, 0x77, 0x48,
  0x84, 0x67, 0xAA, 0x8C, 0x44, 0xFA, 0x4C, 0xCA,
]));

export const metadataLibraryGuid = ByteVector.fromByteArray(new Uint8Array([
  0x94, 0x1C, 0x23, 0x44, 0x98, 0x94, 0xD1, 0x49,
  0xA1, 0x41, 0x1D, 0x13, 0x4E, 0x45, 0x70, 0x54,
]));

export const codecListGuid = ByteVector.fromByteArray(new Uint8Array([
  0x40, 0x52, 0xD1, 0x86, 0x1D, 0x31, 0xD0, 0x11,
  0xA3, 0xA4, 0x00, 0xA0, 0xC9, 0x03, 0x48, 0xF6,
]));

export const contentEncryptionGuid = ByteVector.fromByteArray(new Uint8Array([
  0xFB, 0xB3, 0x11, 0x22, 0x23, 0xBD, 0xD2, 0x11,
  0xB4, 0xB7, 0x00, 0xA0, 0xC9, 0x55, 0xFC, 0x6E,
]));

export const extendedContentEncryptionGuid = ByteVector.fromByteArray(new Uint8Array([
  0x14, 0xE6, 0x8A, 0x29, 0x22, 0x26, 0x20, 0x17,
  0x4C, 0xB9, 0x35, 0xDA, 0xE0, 0x7E, 0xE9, 0x28,
]));

export const advancedContentEncryptionGuid = ByteVector.fromByteArray(new Uint8Array([
  0xB6, 0x9B, 0x07, 0x7A, 0xA4, 0xDA, 0x12, 0x4E,
  0xA5, 0xCA, 0x91, 0xD3, 0x8D, 0xC1, 0x1A, 0x8D,
]));

// ---------------------------------------------------------------------------
// ASF reading helpers
// ---------------------------------------------------------------------------

export interface ReadResult<T> {
  value: T;
  ok: boolean;
}

export async function readWORD(file: File): Promise<ReadResult<number>> {
  const v = await file.readBlock(2);
  if (v.length !== 2) return { value: 0, ok: false };
  return { value: v.toUShort(0, false), ok: true };
}

export async function readDWORD(file: File): Promise<ReadResult<number>> {
  const v = await file.readBlock(4);
  if (v.length !== 4) return { value: 0, ok: false };
  return { value: v.toUInt(0, false), ok: true };
}

export async function readQWORD(file: File): Promise<ReadResult<bigint>> {
  const v = await file.readBlock(8);
  if (v.length !== 8) return { value: 0n, ok: false };
  return { value: v.toULongLong(0, false), ok: true };
}

export async function readString(file: File, length: number): Promise<string> {
  const data = await file.readBlock(length);
  let size = data.length;
  // Strip trailing UTF-16 null terminators
  while (size >= 2) {
    if (data.get(size - 1) !== 0 || data.get(size - 2) !== 0) break;
    size -= 2;
  }
  const trimmed = size !== data.length ? data.mid(0, size) : data;
  return trimmed.toString(StringType.UTF16LE);
}

export function renderString(str: string, includeLength = false): ByteVector {
  const encoded = ByteVector.fromString(str, StringType.UTF16LE);
  const nullTerminator = ByteVector.fromUShort(0, false);
  const data = ByteVector.fromByteVector(encoded);
  data.append(nullTerminator);
  if (includeLength) {
    const lenPrefix = ByteVector.fromUShort(data.length, false);
    const result = ByteVector.fromByteVector(lenPrefix);
    result.append(data);
    return result;
  }
  return data;
}
