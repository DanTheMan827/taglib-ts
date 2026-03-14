import { ByteVector, StringType } from "../../byteVector.js";
import { IOStream } from "../../toolkit/ioStream.js";
import { Position } from "../../toolkit/types.js";

/**
 * EBML Element IDs used in Matroska files.
 */
export const EbmlId = {
  EBMLHeader:                0x1A45DFA3,
  DocType:                   0x4282,
  DocTypeVersion:            0x4287,
  VoidElement:               0xEC,
  Segment:                   0x18538067,
  SeekHead:                  0x114D9B74,
  Seek:                      0x4DBB,
  SeekID:                    0x53AB,
  SeekPosition:              0x53AC,
  Info:                      0x1549A966,
  TimestampScale:            0x2AD7B1,
  Duration:                  0x4489,
  Title:                     0x7BA9,
  Tracks:                    0x1654AE6B,
  TrackEntry:                0xAE,
  TrackType:                 0x83,
  CodecID:                   0x86,
  Audio:                     0xE1,
  SamplingFrequency:         0xB5,
  Channels:                  0x9F,
  BitDepth:                  0x6264,
  Tags:                      0x1254C367,
  Tag:                       0x7373,
  Targets:                   0x63C0,
  TargetTypeValue:           0x68CA,
  TagTrackUID:               0x63C5,
  TagEditionUID:             0x63C9,
  TagChapterUID:             0x63C4,
  TagAttachmentUID:          0x63C6,
  SimpleTag:                 0x67C8,
  TagName:                   0x45A3,
  TagString:                 0x4487,
  TagLanguage:               0x447A,
  TagBinary:                 0x4485,
  TagLanguageDefault:        0x4484,
  Attachments:               0x1941A469,
  AttachedFile:              0x61A7,
  AttachedFileDescription:   0x467E,
  AttachedFileName:          0x466E,
  AttachedFileMediaType:     0x4660,
  AttachedFileData:          0x465C,
  AttachedFileUID:           0x46AE,
  Cluster:                   0x1F43B675,
  Cues:                      0x1C53BB6B,
} as const;

/**
 * Returns the byte length of an EBML element ID.
 */
export function idSize(id: number): number {
  if (id <= 0xFF) return 1;
  if (id <= 0xFFFF) return 2;
  if (id <= 0xFFFFFF) return 3;
  return 4;
}

/**
 * Determine the VINT size length from the first byte.
 * The number of leading zeros in the first byte indicates extra bytes.
 * maxSizeLength limits how many bytes are allowed (4 for IDs, 8 for sizes).
 */
export function vintSizeLength(firstByte: number, maxSizeLength: number): number {
  if (!firstByte) return 0;
  let mask = 0x80;
  let numBytes = 1;
  while (!(mask & firstByte)) {
    numBytes++;
    mask >>= 1;
  }
  if (numBytes > maxSizeLength) return 0;
  return numBytes;
}

/**
 * Read an element ID from a stream. Returns [id, bytesRead] or [0, 0] on failure.
 */
export function readElementId(stream: IOStream): [number, number] {
  const firstByteVec = stream.readBlock(1);
  if (firstByteVec.length !== 1) return [0, 0];

  const firstByte = firstByteVec.get(0);
  const numBytes = vintSizeLength(firstByte, 4);
  if (!numBytes) return [0, 0];

  if (numBytes === 1) {
    return [firstByte, 1];
  }

  const rest = stream.readBlock(numBytes - 1);
  if (rest.length !== numBytes - 1) return [0, 0];

  // Build the ID as a big-endian unsigned integer
  let id = firstByte;
  for (let i = 0; i < rest.length; i++) {
    id = (id * 256) + rest.get(i);
  }
  return [id, numBytes];
}

/**
 * Read a VINT (variable-length integer) from a stream.
 * Returns [sizeLength, value] or [0, 0] on failure.
 * The VINT marker bit is masked off to get the actual data value.
 */
export function readVint(stream: IOStream): [number, number] {
  const firstByteVec = stream.readBlock(1);
  if (firstByteVec.length !== 1) return [0, 0];

  const firstByte = firstByteVec.get(0);
  const numBytes = vintSizeLength(firstByte, 8);
  if (!numBytes) return [0, 0];

  // Mask off the VINT marker bit
  const mask = (1 << (8 - numBytes)) - 1;
  let value = firstByte & mask;

  if (numBytes > 1) {
    const rest = stream.readBlock(numBytes - 1);
    if (rest.length !== numBytes - 1) return [0, 0];
    for (let i = 0; i < rest.length; i++) {
      value = (value * 256) + rest.get(i);
    }
  }

  return [numBytes, value];
}

/** An EBML element header parsed from a stream. */
export interface EbmlElement {
  id: number;
  dataSize: number;
  /** Total header size (id bytes + size bytes). */
  headSize: number;
  /** Offset where the element header starts in the stream. */
  offset: number;
}

/**
 * Read the next EBML element header from the stream.
 * Returns null on failure.
 */
export function readElement(stream: IOStream): EbmlElement | null {
  const offset = stream.tell();
  const [id, idLen] = readElementId(stream);
  if (!id) return null;

  const [sizeLen, dataSize] = readVint(stream);
  if (!sizeLen) return null;

  return {
    id,
    dataSize,
    headSize: idLen + sizeLen,
    offset,
  };
}

/**
 * Skip an element's data in the stream.
 */
export function skipElement(stream: IOStream, element: EbmlElement): void {
  stream.seek(element.offset + element.headSize + element.dataSize, Position.Beginning);
}

/**
 * Find a specific element by ID within a range. Skips unmatched elements.
 */
export function findElement(stream: IOStream, targetId: number, maxOffset: number): EbmlElement | null {
  while (stream.tell() < maxOffset) {
    const element = readElement(stream);
    if (!element) return null;
    if (element.id === targetId) return element;
    skipElement(stream, element);
  }
  return null;
}

/**
 * Read all child elements within a master element's data range.
 */
export function readChildElements(stream: IOStream, parentDataOffset: number, parentDataSize: number): EbmlElement[] {
  const endOffset = parentDataOffset + parentDataSize;
  const children: EbmlElement[] = [];
  stream.seek(parentDataOffset, Position.Beginning);
  while (stream.tell() < endOffset) {
    const element = readElement(stream);
    if (!element) break;
    children.push(element);
    skipElement(stream, element);
  }
  return children;
}

/**
 * Read the raw data of an element from the stream.
 */
export function readElementData(stream: IOStream, element: EbmlElement): ByteVector {
  stream.seek(element.offset + element.headSize, Position.Beginning);
  return stream.readBlock(element.dataSize);
}

/**
 * Read an unsigned integer element value (1-8 bytes, big-endian).
 */
export function readUintValue(stream: IOStream, element: EbmlElement): number {
  const data = readElementData(stream, element);
  if (data.length === 0) return 0;
  let value = 0;
  for (let i = 0; i < data.length; i++) {
    value = value * 256 + data.get(i);
  }
  return value;
}

/**
 * Read a float element value (4 or 8 bytes, big-endian IEEE 754).
 */
export function readFloatValue(stream: IOStream, element: EbmlElement): number {
  const data = readElementData(stream, element);
  if (data.length === 4) {
    return data.toFloat32BE(0);
  }
  if (data.length === 8) {
    return data.toFloat64BE(0);
  }
  return 0;
}

/**
 * Read a UTF-8 string element value.
 */
export function readStringValue(stream: IOStream, element: EbmlElement): string {
  const data = readElementData(stream, element);
  if (data.length === 0) return "";
  // Trim trailing null bytes
  let len = data.length;
  while (len > 0 && data.get(len - 1) === 0) len--;
  return data.mid(0, len).toString(StringType.UTF8);
}
