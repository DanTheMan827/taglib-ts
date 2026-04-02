/** @packageDocumentation Audio properties for WAV files. Parses the RIFF "fmt " chunk. */

import { ByteVector } from "../../byteVector.js";
import { AudioProperties } from "../../audioProperties.js";
import { ReadStyle } from "../../toolkit/types.js";

/** WAVE format tag for PCM audio. */
const FORMAT_PCM = 1;
/** WAVE format tag for IEEE 754 float audio. */
const FORMAT_IEEE_FLOAT = 3;
/** WAVE format tag for WAVE_FORMAT_EXTENSIBLE. */
const FORMAT_EXTENSIBLE = 0xfffe;

/**
 * Audio properties parsed from a WAV `"fmt "` chunk.
 *
 * `fmt ` chunk layout (little-endian):
 * `format(2)` + `channels(2)` + `sampleRate(4)` + `avgBytesPerSec(4)`
 * + `blockAlign(2)` + `bitsPerSample(2)`
 *
 * For WAVE_FORMAT_EXTENSIBLE, the sub-format GUID occupies bytes 24–39, and
 * bytes 24–25 contain the actual codec identifier.
 */
export class WavProperties extends AudioProperties {
  /** Audio format tag (e.g. `1` = PCM, `3` = IEEE float). */
  private _format: number = 0;
  /** Number of audio channels. */
  private _channels: number = 0;
  /** Sample rate in Hz. */
  private _sampleRate: number = 0;
  /** Average bytes per second (from fmt chunk; used as fallback for duration). */
  private _avgBytesPerSec: number = 0;
  /** Bits per sample (bit depth). */
  private _bitsPerSample: number = 0;
  /** Total number of PCM sample frames. */
  private _sampleFrames: number = 0;
  /** Cached duration in milliseconds (computed during construction). */
  private _lengthInMilliseconds: number = 0;
  /** Cached bitrate in kbps (computed during construction). */
  private _bitrate: number = 0;

  /**
   * Constructs a {@link WavProperties} instance by parsing a `"fmt "` chunk.
   * Matches the C++ calculation: uses exact floating-point arithmetic and
   * `Math.trunc(x + 0.5)` rounding (equivalent to C++ `static_cast<int>(x + 0.5)`).
   * @param data - Raw bytes of the `"fmt "` chunk (must be at least 16 bytes).
   * @param streamLength - Byte length of the `"data"` chunk including chunk padding.
   * @param totalSamples - Sample frame count from the `"fact"` chunk (0 if absent).
   * @param readStyle - Level of detail for property parsing. Defaults to `ReadStyle.Average`.
   */
  constructor(
    data: ByteVector,
    streamLength: number,
    totalSamples: number = 0,
    readStyle: ReadStyle = ReadStyle.Average,
  ) {
    super(readStyle);

    if (data.length < 16) return;

    this._format = data.toUShort(0, false);

    // WAVE_FORMAT_EXTENSIBLE: read actual sub-format from offset 24.
    if (this._format === FORMAT_EXTENSIBLE) {
      if (data.length !== 40) return;
      this._format = data.toUShort(24, false);
    }

    // For non-PCM formats a fact chunk is required (unless we fall back to byteRate).
    if (this._format !== FORMAT_PCM && this._format !== FORMAT_IEEE_FLOAT && totalSamples === 0) {
      return;
    }

    this._channels = data.toUShort(2, false);
    this._sampleRate = data.toUInt(4, false);
    this._avgBytesPerSec = data.toUInt(8, false);
    this._bitsPerSample = data.toUShort(14, false);

    // Compute sample frames: use fact chunk for non-PCM; derive from data for PCM.
    if (this._format !== FORMAT_PCM && (this._format !== FORMAT_IEEE_FLOAT || totalSamples !== 0)) {
      this._sampleFrames = totalSamples;
    } else if (this._channels > 0 && this._bitsPerSample > 0) {
      const bytesPerFrame = this._channels * Math.trunc((this._bitsPerSample + 7) / 8);
      this._sampleFrames = bytesPerFrame > 0 ? Math.trunc(streamLength / bytesPerFrame) : 0;
    }

    // Compute duration and bitrate using exact floating-point arithmetic (matches C++).
    if (this._sampleFrames > 0 && this._sampleRate > 0) {
      const preciseLength = (this._sampleFrames * 1000.0) / this._sampleRate;
      this._lengthInMilliseconds = Math.trunc(preciseLength + 0.5);
      this._bitrate = streamLength > 0
        ? Math.trunc((streamLength * 8.0) / preciseLength + 0.5)
        : 0;
    } else if (this._avgBytesPerSec > 0) {
      // Fallback: use declared average byte rate.
      this._lengthInMilliseconds = Math.trunc((streamLength * 1000.0) / this._avgBytesPerSec + 0.5);
      this._bitrate = Math.trunc((this._avgBytesPerSec * 8.0) / 1000.0 + 0.5);
    }
  }

  /**
   * Playback duration in milliseconds.
   * @returns Duration in milliseconds, or `0` if unknown.
   */
  get lengthInMilliseconds(): number {
    return this._lengthInMilliseconds;
  }

  /**
   * Average bitrate of the stream in kilobits per second.
   * @returns Bitrate in kbps, or `0` if unknown.
   */
  override get bitrate(): number {
    return this._bitrate;
  }

  /**
   * Sample rate of the audio stream in Hz.
   * @returns Sample rate in Hz, or `0` if unknown.
   */
  override get sampleRate(): number {
    return this._sampleRate;
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
   * @returns Bit depth (e.g. `16`, `24`, `32`).
   */
  get bitsPerSample(): number {
    return this._bitsPerSample;
  }

  /**
   * Total number of PCM sample frames.
   * @returns Sample frame count, or `0` if unknown.
   */
  get sampleFrames(): number {
    return this._sampleFrames;
  }

  /**
   * Audio format tag from the `"fmt "` chunk.
   * Common values: `1` = PCM, `3` = IEEE float, `6` = A-law, `7` = μ-law.
   * For `WAVE_FORMAT_EXTENSIBLE` files, this is the sub-format tag.
   * @returns The format tag value.
   */
  get format(): number {
    return this._format;
  }
}
