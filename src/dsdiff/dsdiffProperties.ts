import { AudioProperties } from "../audioProperties.js";
import type { ReadStyle } from "../toolkit/types.js";

// =============================================================================
// DsdiffProperties
// =============================================================================

/**
 * Audio properties for DSD Interchange File Format (DSDIFF).
 *
 * Unlike most properties classes, DSDIFF properties are constructed from
 * pre-computed values extracted during the chunk-walking phase of file
 * parsing, rather than from raw byte data.
 */
export class DsdiffProperties extends AudioProperties {
  private _sampleRate: number;
  private _channels: number;
  private _sampleCount: bigint;
  private _bitrate: number;
  private _lengthInMs: number;

  constructor(
    sampleRate: number,
    channels: number,
    sampleCount: bigint,
    bitrate: number,
    readStyle: ReadStyle,
  ) {
    super(readStyle);

    this._sampleRate = sampleRate;
    this._channels = channels;
    this._sampleCount = sampleCount;
    this._bitrate = bitrate;

    this._lengthInMs =
      sampleRate > 0
        ? Math.round((Number(sampleCount) * 1000.0) / sampleRate)
        : 0;
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
  // DSDIFF-specific
  // ---------------------------------------------------------------------------

  /** DSD audio is always 1 bit per sample. */
  get bitsPerSample(): number {
    return 1;
  }

  get sampleCount(): bigint {
    return this._sampleCount;
  }
}
