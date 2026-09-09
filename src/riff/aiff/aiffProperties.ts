/** @packageDocumentation Audio properties for AIFF/AIFC files. Parses the COMM chunk including optional AIFC compression info. */

import { ByteVector, StringType } from "../../byteVector.js";
import { AudioProperties } from "../../audioProperties.js";
import { ReadStyle } from "../../toolkit/types.js";

/** Maximum signed 32-bit integer used for C++-compatible property clamping. */
const INT32_MAX = 0x7fffffff;

/**
 * Audio properties parsed from an AIFF/AIFC `COMM` chunk.
 *
 * `COMM` chunk layout (big-endian):
 * `channels(2)` + `sampleFrames(4)` + `bitsPerSample(2)`
 * + `sampleRate(10 bytes, IEEE 754 80-bit extended float)`
 *
 * For AIFC, additionally:
 * + `compressionType(4)` + `compressionName(Pascal string)`
 */
export class AiffProperties extends AudioProperties {
  /** Number of audio channels. */
  private _channels: number = 0;
  /** Total number of PCM sample frames in the stream. */
  private _sampleFrames: number = 0;
  /** Bits per sample (bit depth). */
  private _bitsPerSample: number = 0;
  /** Sample rate in Hz (decoded from the 80-bit IEEE 754 extended float). */
  private _sampleRate: number = 0;
  /** Byte length of the `"SSND"` sound-data chunk. */
  private _streamLength: number = 0;
  /** Whether this is an AIFC file (contains a compression type field). */
  private _isAifc: boolean = false;
  /** Four-character compression type identifier (AIFC only, e.g. `"NONE"`, `"sowt"`). */
  private _compressionType: string = "";
  /** Human-readable compression name Pascal string (AIFC only). */
  private _compressionName: string = "";

  /**
   * Constructs an {@link AiffProperties} instance by parsing a `COMM` chunk.
   * @param commData - Raw bytes of the `COMM` chunk (must be at least 18 bytes).
   * @param streamLength - Byte length of the `"SSND"` chunk.
   * @param readStyle - Level of detail for property parsing. Defaults to `ReadStyle.Average`.
   */
  constructor(
    commData: ByteVector,
    streamLength: number,
    readStyle: ReadStyle = ReadStyle.Average,
  ) {
    super(readStyle);
    this._streamLength = streamLength;

    if (commData.length < 18) return;

    this._channels = commData.toUShort(0, true);
    this._sampleFrames = commData.toUInt(2, true);
    this._bitsPerSample = commData.toUShort(6, true);
    const sampleRate = commData.toFloat80BE(8);
    if (sampleRate >= 1.0 && sampleRate < INT32_MAX) {
      this._sampleRate = sampleRate;
    }

    // AIFC extension: compressionType + compressionName after byte 18
    if (commData.length >= 22) {
      this._isAifc = true;
      this._compressionType = commData.mid(18, 4).toString(StringType.Latin1);

      // Pascal string: first byte is length, followed by that many chars
      if (commData.length >= 23) {
        const nameLen = commData.get(22);
        if (commData.length >= 23 + nameLen) {
          this._compressionName = commData
            .mid(23, nameLen)
            .toString(StringType.Latin1);
        }
      }
    }
  }

  /**
   * Playback duration in milliseconds, derived from `sampleFrames` and `sampleRate`.
   * @returns Duration in milliseconds, or `0` if `sampleRate` is zero.
   */
  get lengthInMilliseconds(): number {
    if (this._sampleRate > 0) {
      const length = (this._sampleFrames * 1000.0) / this._sampleRate;
      if (length > 0 && length < INT32_MAX) {
        return Math.round(length);
      }
    }
    return 0;
  }

  /**
   * Average bitrate of the stream in kilobits per second.
   * Matches the C++ calculation: `trunc(streamLength * 8 / preciseLength + 0.5)`.
   * @returns Bitrate in kbps, or `0` if duration is zero.
   */
  override get bitrate(): number {
    if (this._sampleRate > 0 && this._sampleFrames > 0) {
      const preciseLength = (this._sampleFrames * 1000.0) / this._sampleRate;
      if (preciseLength > 0 && preciseLength < INT32_MAX) {
        const bitrate = (this._streamLength * 8.0) / preciseLength;
        if (bitrate >= 0 && bitrate < INT32_MAX) {
          return Math.trunc(bitrate + 0.5);
        }
      }
    }
    return 0;
  }

  /**
   * Sample rate of the audio stream in Hz (rounded to the nearest integer).
   * @returns Sample rate in Hz, or `0` if unknown.
   */
  override get sampleRate(): number {
    return this._sampleRate > 0 ? Math.round(this._sampleRate) : 0;
  }

  /**
   * Number of audio channels.
   * @returns Channel count (e.g. `2` for stereo).
   */
  get channels(): number {
    return this._channels;
  }

  /**
   * Bits per sample (bit depth) of the audio stream.
   * @returns Bit depth (e.g. `16`, `24`).
   */
  get bitsPerSample(): number {
    return this._bitsPerSample;
  }

  /**
   * Total number of PCM sample frames in the `"SSND"` chunk.
   * @returns Sample frame count.
   */
  get sampleFrames(): number {
    return this._sampleFrames;
  }

  /**
   * Whether this is an AIFC file (the `COMM` chunk contains a compression type field).
   * @returns `true` for AIFC, `false` for plain AIFF.
   */
  get isAifc(): boolean {
    return this._isAifc;
  }

  /**
   * Four-character compression type identifier (AIFC only).
   * Common values: `"NONE"` (uncompressed), `"sowt"` (little-endian PCM), `"fl32"`.
   * @returns The compression type string, or `""` for plain AIFF.
   */
  get compressionType(): string {
    return this._compressionType;
  }

  /**
   * Human-readable compression name from the Pascal string in the `COMM` chunk (AIFC only).
   * @returns The compression name string, or `""` for plain AIFF.
   */
  get compressionName(): string {
    return this._compressionName;
  }
}
