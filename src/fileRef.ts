/** @file FileRef — format-agnostic entry point for opening audio files and accessing their tags and properties. */

import { File } from "./file.js";
import { Tag } from "./tag.js";
import { AudioProperties } from "./audioProperties.js";
import { IOStream } from "./toolkit/ioStream.js";
import { ByteVectorStream } from "./toolkit/byteVectorStream.js";
import { ByteVector } from "./byteVector.js";
import { PropertyMap } from "./toolkit/propertyMap.js";
import { ReadStyle } from "./toolkit/types.js";
import type { VariantMap } from "./toolkit/variant.js";
import { detectByExtension, detectByContent, detectOggSubFormat, defaultFileExtensions } from "./formatDetection.js";

/**
 * Format-agnostic handle for an audio file.
 *
 * `FileRef` detects the audio format automatically (by file-name extension
 * first, then by magic-byte content inspection) and instantiates the correct
 * format-specific {@link File} subclass. All common tag and audio-property
 * operations are exposed as convenience methods so that callers rarely need to
 * interact with the underlying {@link File} directly.
 *
 * @example Open an audio file from a browser `File` object
 * ```ts
 * const ref = await FileRef.fromBlob(file, file.name);
 * if (ref.isValid) {
 *   console.log(ref.tag()?.title);
 * }
 * ```
 */
export class FileRef {
  /** The underlying format-specific file instance, or `null` if detection failed. */
  private _file: File | null = null;

  /** @param file The resolved format-specific file, or `null`. */
  private constructor(file: File | null) {
    this._file = file;
  }

  /**
   * Open an audio stream and return a `FileRef`.
   *
   * @param stream           The audio data stream.
   * @param readProperties   When `true` (default), audio properties are parsed.
   * @param readStyle        Controls parsing accuracy vs. performance.
   * @returns A `FileRef` whose {@link isValid} reflects whether the format was
   *          recognised and parsed successfully.
   */
  static async open(stream: IOStream, readProperties: boolean = true, readStyle: ReadStyle = ReadStyle.Average): Promise<FileRef> {
    const file = await FileRef.createFile(stream, readProperties, readStyle);
    return new FileRef(file);
  }

  /**
   * Create a `FileRef` from a raw byte array.
   *
   * @param data             The audio data.
   * @param filename         Optional filename used for extension-based format
   *                         detection (e.g. `"track.mp3"`). Falls back to
   *                         content-based detection when empty.
   * @param readProperties   When `true` (default), audio properties are parsed.
   * @param readStyle        Controls parsing accuracy vs. performance.
   * @returns A resolved `FileRef`.
   */
  static async fromByteArray(data: Uint8Array, filename: string = "", readProperties: boolean = true, readStyle: ReadStyle = ReadStyle.Average): Promise<FileRef> {
    const bv = ByteVector.fromByteArray(data);
    const stream = filename ? new NamedByteVectorStream(bv, filename) : new ByteVectorStream(bv);
    const file = await FileRef.createFile(stream, readProperties, readStyle);
    return new FileRef(file);
  }

  /**
   * Create a `FileRef` from a browser `Blob` or `File`.
   *
   * @param blob             The blob containing audio data.
   * @param filename         Optional filename override for extension-based
   *                         detection. When omitted and `blob` is a `File`,
   *                         `blob.name` is used automatically.
   * @param readProperties   When `true` (default), audio properties are parsed.
   * @param readStyle        Controls parsing accuracy vs. performance.
   * @returns A resolved `FileRef`.
   */
  static async fromBlob(blob: Blob, filename?: string, readProperties?: boolean, readStyle?: ReadStyle): Promise<FileRef> {
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    const name = filename ?? (blob instanceof File ? blob.name : "");
    return await FileRef.fromByteArray(data, name, readProperties, readStyle);
  }

  /** The tag exposed by the underlying file, or `null` if unavailable. */
  tag(): Tag | null { return this._file?.tag() ?? null; }
  /** The audio properties exposed by the underlying file, or `null` if unavailable. */
  audioProperties(): AudioProperties | null { return this._file?.audioProperties() ?? null; }
  /** The underlying format-specific file instance, or `null`. */
  file(): File | null { return this._file; }
  /** `true` when no format was detected or the file could not be parsed. */
  get isNull(): boolean { return !this._file; }
  /** `true` when the file was detected and parsed without errors. */
  get isValid(): boolean { return this._file?.isValid ?? false; }

  /**
   * Write any pending tag changes back to the in-memory stream.
   *
   * @returns `true` on success, `false` if saving failed or no file is open.
   */
  async save(): Promise<boolean> { return (await this._file?.save()) ?? false; }

  /**
   * Return all tag fields as a unified {@link PropertyMap}.
   * Returns an empty map when no file is open.
   */
  properties(): PropertyMap { return this._file?.properties() ?? new PropertyMap(); }

  /**
   * Apply a {@link PropertyMap} to the underlying tag.
   *
   * @param props The properties to set.
   * @returns Unsupported properties, or `props` unchanged when no file is open.
   */
  setProperties(props: PropertyMap): PropertyMap { return this._file?.setProperties(props) ?? props; }

  /**
   * Remove properties not supported by the underlying tag format.
   *
   * @param props Keys of the properties to remove.
   */
  removeUnsupportedProperties(props: string[]): void { this._file?.removeUnsupportedProperties(props); }

  /**
   * Return the keys of all complex (non-string) properties stored in the file.
   *
   * @returns An array of property key strings, or `[]` when no file is open.
   */
  complexPropertyKeys(): string[] { return this._file?.complexPropertyKeys() ?? []; }

  /**
   * Return all complex property values for the given key.
   *
   * @param key The property key (e.g. `"PICTURE"`).
   * @returns An array of {@link VariantMap} objects, or `[]` when no file is open.
   */
  complexProperties(key: string): VariantMap[] { return this._file?.complexProperties(key) ?? []; }

  /**
   * Set complex property values for the given key.
   *
   * @param key   The property key (e.g. `"PICTURE"`).
   * @param value The new values to store.
   * @returns `true` if stored, `false` if the format does not support this or no file is open.
   */
  setComplexProperties(key: string, value: VariantMap[]): boolean { return this._file?.setComplexProperties(key, value) ?? false; }

  /**
   * Return the list of file extensions recognized by taglib-ts.
   *
   * @returns An array of lowercase extension strings (without the leading dot).
   */
  static defaultFileExtensions(): string[] { return defaultFileExtensions(); }

  /**
   * Detect the format for `stream` and return the resolved format key,
   * or `null` when the format is not recognised.
   *
   * @param stream         The audio data stream.
   * @param readProperties Whether to parse audio properties.
   * @param readStyle      Parsing accuracy vs. performance trade-off.
   * @returns The underlying {@link File} instance, or `null`.
   */
  private static async createFile(stream: IOStream, readProperties: boolean, readStyle: ReadStyle): Promise<File | null> {
    let format = detectByExtension(stream.name());

    // For generic 'ogg' extension, detect sub-format from content
    if (format === "ogg") {
      format = await detectOggSubFormat(stream);
    }

    if (!format) {
      format = await detectByContent(stream);
    }

    if (!format) return null;

    return await FileRef.instantiateFormat(format, stream, readProperties, readStyle);
  }

  /**
   * Dynamically import and instantiate the correct format-specific file class.
   *
   * @param format         The format key returned by the detection functions.
   * @param stream         The audio data stream.
   * @param readProperties Whether to parse audio properties.
   * @param readStyle      Parsing accuracy vs. performance trade-off.
   * @returns The instantiated {@link File}, or `null` if the format is unknown
   *          or if the dynamic import fails.
   */
  private static async instantiateFormat(format: string, stream: IOStream, readProperties: boolean, readStyle: ReadStyle): Promise<File | null> {
    try {
      switch (format) {
        case "mpeg": {
          const { MpegFile } = await import("./mpeg/mpegFile.js");
          return await MpegFile.open(stream, readProperties, readStyle);
        }
        case "flac": {
          const { FlacFile } = await import("./flac/flacFile.js");
          return await FlacFile.open(stream, readProperties, readStyle);
        }
        case "mp4": {
          const { Mp4File } = await import("./mp4/mp4File.js");
          return await Mp4File.open(stream, readProperties, readStyle);
        }
        case "ogg-vorbis": {
          const { OggVorbisFile } = await import("./ogg/vorbis/vorbisFile.js");
          return await OggVorbisFile.open(stream, readProperties, readStyle);
        }
        case "ogg-opus": {
          const { OggOpusFile } = await import("./ogg/opus/opusFile.js");
          return await OggOpusFile.open(stream, readProperties, readStyle);
        }
        case "ogg-speex": {
          const { OggSpeexFile } = await import("./ogg/speex/speexFile.js");
          return await OggSpeexFile.open(stream, readProperties, readStyle);
        }
        case "ogg-flac": {
          const { OggFlacFile } = await import("./ogg/flac/oggFlacFile.js");
          return await OggFlacFile.open(stream, readProperties, readStyle);
        }
        case "wav": {
          const { WavFile } = await import("./riff/wav/wavFile.js");
          return await WavFile.open(stream, readProperties, readStyle);
        }
        case "aiff": {
          const { AiffFile } = await import("./riff/aiff/aiffFile.js");
          return await AiffFile.open(stream, readProperties, readStyle);
        }
        case "mpc": {
          const { MpcFile } = await import("./mpc/mpcFile.js");
          return await MpcFile.open(stream, readProperties, readStyle);
        }
        case "wavpack": {
          const { WavPackFile } = await import("./wavpack/wavpackFile.js");
          return await WavPackFile.open(stream, readProperties, readStyle);
        }
        case "ape-file": {
          const { ApeFile } = await import("./ape/apeFile.js");
          return await ApeFile.open(stream, readProperties, readStyle);
        }
        case "trueaudio": {
          const { TrueAudioFile } = await import("./trueaudio/trueAudioFile.js");
          return await TrueAudioFile.open(stream, readProperties, readStyle);
        }
        case "dsf": {
          const { DsfFile } = await import("./dsf/dsfFile.js");
          return await DsfFile.open(stream, readProperties, readStyle);
        }
        case "dsdiff": {
          const { DsdiffFile } = await import("./dsdiff/dsdiffFile.js");
          return await DsdiffFile.open(stream, readProperties, readStyle);
        }
        case "mod": {
          const { ModFile } = await import("./mod/modFile.js");
          return await ModFile.open(stream, readProperties, readStyle);
        }
        case "s3m": {
          const { S3mFile } = await import("./s3m/s3mFile.js");
          return await S3mFile.open(stream, readProperties, readStyle);
        }
        case "xm": {
          const { XmFile } = await import("./xm/xmFile.js");
          return await XmFile.open(stream, readProperties, readStyle);
        }
        case "it": {
          const { ItFile } = await import("./it/itFile.js");
          return await ItFile.open(stream, readProperties, readStyle);
        }
        case "shorten": {
          const { ShortenFile } = await import("./shorten/shortenFile.js");
          return await ShortenFile.open(stream, readProperties, readStyle);
        }
        case "asf": {
          const { AsfFile } = await import("./asf/asfFile.js");
          return await AsfFile.open(stream, readProperties, readStyle);
        }
        case "matroska": {
          const { MatroskaFile } = await import("./matroska/matroskaFile.js");
          return await MatroskaFile.open(stream, readProperties, readStyle);
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}

/** Helper: ByteVectorStream with a custom name for extension-based detection. */
class NamedByteVectorStream extends ByteVectorStream {
  private _name: string;
  /**
   * @param data The audio data buffer.
   * @param name The filename (including extension) used for format detection.
   */
  constructor(data: ByteVector, name: string) {
    super(data);
    this._name = name;
  }
  override name(): string {
    return this._name;
  }
}
