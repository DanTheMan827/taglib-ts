/**
 * @packageDocumentation Format detection utilities for mapping file extensions and magic bytes
 * to taglib-ts format keys. This module has no imports of format-specific
 * classes to enable tree-shaking and code splitting.
 */

import { ByteVector, StringType } from "./byteVector.js";
import { IOStream } from "./toolkit/ioStream.js";
import { Position } from "./toolkit/types.js";

/**
 * Determine the audio format from a filename extension.
 *
 * @param name A filename or path whose extension is used for detection
 *             (e.g. `"track.mp3"` or `"/music/song.flac"`).
 * @returns A format key string (e.g. `"mpeg"`, `"flac"`), or `null` when the
 *          extension is not recognised.
 */
export function detectByExtension(name: string): string | null {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  switch (ext) {
    case "MP3": case "MP2": case "AAC": return "mpeg";
    case "OGG": case "OGA": return "ogg";
    case "OPUS": return "ogg-opus";
    case "SPX": return "ogg-speex";
    case "FLAC": return "flac";
    case "M4A": case "M4B": case "M4P": case "M4R": case "M4V": case "MP4": case "3G2": case "AAX": return "mp4";
    case "WMA": case "WMV": case "ASF": return "asf";
    case "AIF": case "AIFF": case "AFC": case "AIFC": return "aiff";
    case "WAV": return "wav";
    case "MPC": return "mpc";
    case "WV": return "wavpack";
    case "APE": return "ape-file";
    case "TTA": return "trueaudio";
    case "DSF": return "dsf";
    case "DFF": case "DSDIFF": return "dsdiff";
    case "MOD": return "mod";
    case "S3M": return "s3m";
    case "IT": return "it";
    case "XM": return "xm";
    case "SHN": return "shorten";
    case "MKA": case "MKV": case "WEBM": return "matroska";
    default: return null;
  }
}

/**
 * Determine the audio format by inspecting magic bytes in the stream.
 *
 * Reads up to the first 36 bytes (and occasionally seeks further for formats
 * such as S3M and MOD). MPEG is matched last because its frame-sync bytes
 * (`0xff 0xe*`) are prone to false positives.
 *
 * @param stream The audio data stream, seeked to any position on entry.
 * @returns A format key string, or `null` when the format cannot be identified.
 */
export async function detectByContent(stream: IOStream): Promise<string | null> {
  await stream.seek(0, Position.Beginning);
  const header = await stream.readBlock(36);

  if (header.length < 4) return null;

  if (header.length >= 16) {
    const asfGuid = ByteVector.fromByteArray(new Uint8Array([
      0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11,
      0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
    ]));
    if (header.containsAt(asfGuid, 0)) return "asf";
  }

  if (header.containsAt(ByteVector.fromString("fLaC", StringType.Latin1), 0)) return "flac";

  if (header.containsAt(ByteVector.fromString("OggS", StringType.Latin1), 0)) {
    await stream.seek(0, Position.Beginning);
    const buf = await stream.readBlock(128);
    const opusId = ByteVector.fromString("OpusHead", StringType.Latin1);
    const speexId = ByteVector.fromString("Speex   ", StringType.Latin1);
    const flacId = ByteVector.fromByteArray(new Uint8Array([0x7f, 0x46, 0x4c, 0x41, 0x43]));
    const vorbisId = ByteVector.fromByteArray(new Uint8Array([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]));

    if (buf.find(opusId) >= 0) return "ogg-opus";
    if (buf.find(speexId) >= 0) return "ogg-speex";
    if (buf.find(flacId) >= 0) return "ogg-flac";
    if (buf.find(vorbisId) >= 0) return "ogg-vorbis";
    return "ogg-vorbis";
  }

  if (header.length >= 8 && header.mid(4, 4).toString(StringType.Latin1) === "ftyp") return "mp4";

  if (
    header.length >= 12 &&
    header.mid(0, 4).toString(StringType.Latin1) === "RIFF" &&
    header.mid(8, 4).toString(StringType.Latin1) === "WAVE"
  )
    return "wav";

  if (header.length >= 12 && header.mid(0, 4).toString(StringType.Latin1) === "FORM") {
    const fmt = header.mid(8, 4).toString(StringType.Latin1);
    if (fmt === "AIFF" || fmt === "AIFC") return "aiff";
  }

  if (
    header.length >= 4 &&
    header.get(0) === 0x1a &&
    header.get(1) === 0x45 &&
    header.get(2) === 0xdf &&
    header.get(3) === 0xa3
  )
    return "matroska";

  if (
    header.containsAt(ByteVector.fromString("MPCK", StringType.Latin1), 0) ||
    header.containsAt(ByteVector.fromString("MP+", StringType.Latin1), 0)
  )
    return "mpc";

  if (header.containsAt(ByteVector.fromString("wvpk", StringType.Latin1), 0)) return "wavpack";

  if (header.containsAt(ByteVector.fromString("MAC ", StringType.Latin1), 0)) return "ape-file";

  if (header.length >= 4 && header.mid(0, 3).toString(StringType.Latin1) === "TTA") return "trueaudio";

  if (header.containsAt(ByteVector.fromString("DSD ", StringType.Latin1), 0)) return "dsf";

  if (
    header.length >= 16 &&
    header.containsAt(ByteVector.fromString("FRM8", StringType.Latin1), 0) &&
    header.containsAt(ByteVector.fromString("DSD ", StringType.Latin1), 12)
  )
    return "dsdiff";

  if (header.length >= 3 && header.mid(0, 3).toString(StringType.Latin1) === "ID3") {
    if (header.length >= 10) {
      const id3Size =
        ((header.get(6) & 0x7f) << 21) |
        ((header.get(7) & 0x7f) << 14) |
        ((header.get(8) & 0x7f) << 7) |
        (header.get(9) & 0x7f);
      const id3TotalSize = 10 + id3Size;
      await stream.seek(id3TotalSize, Position.Beginning);
      const afterId3 = await stream.readBlock(4);
      if (afterId3.length >= 3 && afterId3.mid(0, 3).toString(StringType.Latin1) === "TTA") return "trueaudio";
      if (afterId3.length >= 4 && afterId3.mid(0, 4).toString(StringType.Latin1) === "MAC ") return "ape-file";
    }
    return "mpeg";
  }

  if (header.length >= 17 && header.mid(0, 17).toString(StringType.Latin1) === "Extended Module: ") return "xm";

  if (header.containsAt(ByteVector.fromString("IMPM", StringType.Latin1), 0)) return "it";

  if (header.containsAt(ByteVector.fromString("ajkg", StringType.Latin1), 0)) return "shorten";

  if ((await stream.length()) >= 48) {
    await stream.seek(44, Position.Beginning);
    const s3mMagic = await stream.readBlock(4);
    if (s3mMagic.length >= 4 && s3mMagic.toString(StringType.Latin1) === "SCRM") return "s3m";
  }

  if ((await stream.length()) >= 1084) {
    await stream.seek(1080, Position.Beginning);
    const modTag = await stream.readBlock(4);
    if (modTag.length >= 4) {
      const id = modTag.toString(StringType.Latin1);
      if (isKnownModTag(id)) return "mod";
    }
  }

  if (header.length >= 2 && header.get(0) === 0xff && (header.get(1) & 0xe0) === 0xe0) return "mpeg";

  return null;
}

/**
 * Detect the Ogg sub-format (Vorbis, Opus, Speex, or FLAC) by scanning the
 * first 128 bytes of a stream already identified as Ogg.
 *
 * @param stream The Ogg audio data stream.
 * @returns One of `"ogg-opus"`, `"ogg-speex"`, `"ogg-flac"`, or `"ogg-vorbis"`
 *          (the last is used as a fallback when none of the others match).
 */
export async function detectOggSubFormat(stream: IOStream): Promise<string> {
  await stream.seek(0, Position.Beginning);
  const buf = await stream.readBlock(128);
  const opusId = ByteVector.fromString("OpusHead", StringType.Latin1);
  const speexId = ByteVector.fromString("Speex   ", StringType.Latin1);
  const flacId = ByteVector.fromByteArray(new Uint8Array([0x7f, 0x46, 0x4c, 0x41, 0x43]));

  if (buf.find(opusId) >= 0) return "ogg-opus";
  if (buf.find(speexId) >= 0) return "ogg-speex";
  if (buf.find(flacId) >= 0) return "ogg-flac";
  return "ogg-vorbis";
}

/**
 * Check whether a 4-character MOD tag is one of the recognised MOD format
 * identifiers.
 *
 * @param id The 4-byte string read from offset 1080 of the file.
 * @returns `true` if the tag is a known MOD identifier.
 */
function isKnownModTag(id: string): boolean {
  if (id === "M.K." || id === "M!K!" || id === "M&K!" || id === "N.T.") return true;
  if (id === "CD81" || id === "OKTA") return true;
  if (id.startsWith("FLT") || id.startsWith("TDZ")) {
    const d = id.charCodeAt(3);
    return d >= 0x30 && d <= 0x39;
  }
  if (id.endsWith("CHN")) {
    const d = id.charCodeAt(0);
    return d >= 0x30 && d <= 0x39;
  }
  if (id.endsWith("CH") || id.endsWith("CN")) {
    const d0 = id.charCodeAt(0);
    const d1 = id.charCodeAt(1);
    return d0 >= 0x30 && d0 <= 0x39 && d1 >= 0x30 && d1 <= 0x39;
  }
  return false;
}

/**
 * Return the full list of file extensions supported by taglib-ts.
 *
 * @returns An array of lowercase extension strings without a leading dot.
 */
export function defaultFileExtensions(): string[] {
  return [
    "mp3", "mp2", "aac", "ogg", "oga", "opus", "spx", "flac",
    "m4a", "m4b", "m4p", "m4r", "m4v", "mp4", "3g2", "aax",
    "wma", "wmv", "asf", "aif", "aiff", "afc", "aifc", "wav",
    "mpc", "wv", "ape", "tta", "dsf", "dff", "dsdiff",
    "mod", "s3m", "it", "xm", "shn", "mka", "mkv", "webm",
  ];
}
