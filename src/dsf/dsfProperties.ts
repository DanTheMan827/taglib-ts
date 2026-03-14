import { AudioProperties } from "../audioProperties.js";
import { ByteVector } from "../byteVector.js";
import type { ReadStyle } from "../toolkit/types.js";

// =============================================================================
// DsfProperties
// =============================================================================

/**
 * Audio properties for DSD Stream File (DSF) format.
 *
 * Constructed from the 36-byte payload of the "fmt " chunk (after chunk
 * header). The data layout is all little-endian:
 *   formatVersion (4) + formatID (4) + channelType (4) + channels (4) +
 *   sampleRate (4) + bitsPerSample (4) + sampleCount (8) +
 *   blockSizePerChannel (4)
 */
export class DsfProperties extends AudioProperties {
  private _formatVersion: number = 0;
  private _formatID: number = 0;
  private _channelType: number = 0;
  private _channels: number = 0;
  private _sampleRate: number = 0;
  private _bitsPerSample: number = 0;
  private _sampleCount: bigint = 0n;
  private _blockSizePerChannel: number = 0;
  private _bitrate: number = 0;
  private _lengthInMs: number = 0;

  constructor(data: ByteVector, readStyle: ReadStyle) {
    super(readStyle);
    this.read(data);
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
  // DSF-specific
  // ---------------------------------------------------------------------------

  get formatVersion(): number {
    return this._formatVersion;
  }

  get formatID(): number {
    return this._formatID;
  }

  get channelType(): number {
    return this._channelType;
  }

  get bitsPerSample(): number {
    return this._bitsPerSample;
  }

  get sampleCount(): bigint {
    return this._sampleCount;
  }

  get blockSizePerChannel(): number {
    return this._blockSizePerChannel;
  }

  // ---------------------------------------------------------------------------
  // Private – reading
  // ---------------------------------------------------------------------------

  private read(data: ByteVector): void {
    if (data.length < 36) return;

    this._formatVersion = data.toUInt(0, false);
    this._formatID = data.toUInt(4, false);
    this._channelType = data.toUInt(8, false);
    this._channels = data.toUInt(12, false);
    this._sampleRate = data.toUInt(16, false);
    this._bitsPerSample = data.toUInt(20, false);
    this._sampleCount = data.toLongLong(24, false);
    this._blockSizePerChannel = data.toUInt(32, false);

    this._bitrate = Math.round(
      (this._sampleRate * this._bitsPerSample * this._channels) / 1000.0,
    );

    if (this._sampleRate > 0) {
      this._lengthInMs = Math.round(
        (Number(this._sampleCount) * 1000.0) / this._sampleRate,
      );
    }
  }
}
