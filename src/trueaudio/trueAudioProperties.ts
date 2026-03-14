import { AudioProperties } from "../audioProperties.js";
import { ByteVector, StringType } from "../byteVector.js";
import type { offset_t, ReadStyle } from "../toolkit/types.js";

/** TTA1 header size: "TTA" (3) + version (1) + format (2) + channels (2) +
 *  bitsPerSample (2) + sampleRate (4) + sampleFrames (4) = 18 bytes. */
export const TTA_HEADER_SIZE = 18;

// =============================================================================
// TrueAudioProperties
// =============================================================================

/**
 * Audio properties for TrueAudio (TTA) streams.
 *
 * Parses the 18-byte TTA1 header: "TTA" + version byte + audio format (2) +
 * channels (2) + bitsPerSample (2) + sampleRate (4) + sampleFrames (4).
 */
export class TrueAudioProperties extends AudioProperties {
  private _version: number = 0;
  private _lengthInMs: number = 0;
  private _bitrate: number = 0;
  private _sampleRate: number = 0;
  private _channels: number = 0;
  private _bitsPerSample: number = 0;
  private _sampleFrames: number = 0;

  constructor(data: ByteVector, streamLength: offset_t, readStyle: ReadStyle) {
    super(readStyle);
    this.read(data, streamLength);
  }

  // ---------------------------------------------------------------------------
  // AudioProperties interface
  // ---------------------------------------------------------------------------

  get lengthInMilliseconds(): number {
    return this._lengthInMs;
  }

  override get bitrate(): number {
    return this._bitrate;
  }

  override get sampleRate(): number {
    return this._sampleRate;
  }

  get channels(): number {
    return this._channels;
  }

  // ---------------------------------------------------------------------------
  // TTA-specific
  // ---------------------------------------------------------------------------

  get ttaVersion(): number {
    return this._version;
  }

  get bitsPerSample(): number {
    return this._bitsPerSample;
  }

  get sampleFrames(): number {
    return this._sampleFrames;
  }

  // ---------------------------------------------------------------------------
  // Private – reading
  // ---------------------------------------------------------------------------

  private read(data: ByteVector, streamLength: offset_t): void {
    if (data.length < 4) return;

    const tta = ByteVector.fromString("TTA", StringType.Latin1);
    if (!data.startsWith(tta)) return;

    let pos = 3;

    // Version byte is ASCII digit: '1' → 1
    this._version = data.get(pos) - 0x30; // '0' = 0x30
    pos += 1;

    // Only TTA1 is fully specified
    if (this._version === 1) {
      if (data.length < TTA_HEADER_SIZE) return;

      // Skip 2-byte audio format field
      pos += 2;

      this._channels = data.toShort(pos, false);
      pos += 2;

      this._bitsPerSample = data.toShort(pos, false);
      pos += 2;

      this._sampleRate = data.toUInt(pos, false);
      pos += 4;

      this._sampleFrames = data.toUInt(pos, false);

      if (this._sampleFrames > 0 && this._sampleRate > 0) {
        const length = (this._sampleFrames * 1000.0) / this._sampleRate;
        this._lengthInMs = Math.round(length);
        this._bitrate = Math.round((streamLength * 8.0) / length);
      }
    }
  }
}
