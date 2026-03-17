import type { ByteVector } from "../byteVector.js";
import type { IOStream } from "../toolkit/ioStream.js";
import type { offset_t } from "../toolkit/types.js";

// =============================================================================
// Enums
// =============================================================================

export enum MpegVersion {
  Version1 = 0,
  Version2 = 1,
  Version2_5 = 2,
  Version4 = 3,
}

export enum ChannelMode {
  Stereo = 0,
  JointStereo = 1,
  DualChannel = 2,
  SingleChannel = 3,
}

// =============================================================================
// Constants
// =============================================================================

// Bitrate tables indexed by [bitrateIndex].
// Index 0 and 15 are invalid (0).
const bitratesV1L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0];
const bitratesV1L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0];
const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const bitratesV2L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0];
const bitratesV2L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

const sampleRatesV1 = [44100, 48000, 32000, 0];
const sampleRatesV2 = [22050, 24000, 16000, 0];
const sampleRatesV25 = [11025, 12000, 8000, 0];

const adtsSampleRates = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
  16000, 12000, 11025, 8000, 7350, 0, 0, 0,
];

/**
 * Mask for comparing consecutive frame headers.
 * Checks sync, version, layer, and sample-rate fields.
 */
const HEADER_MASK = 0xfffe0c00;

// =============================================================================
// Helpers
// =============================================================================

function isFrameSync(byte1: number, byte2: number): boolean {
  return byte1 === 0xff && byte2 !== 0xff && (byte2 & 0xe0) === 0xe0;
}

// =============================================================================
// MpegHeader
// =============================================================================

/**
 * Parser for a single MPEG audio frame header (4 bytes).
 *
 * When `checkLength` is true the parser also verifies that a second valid
 * frame header with matching version / layer / sample-rate exists at the
 * expected position (`offset + frameLength`).
 */
export class MpegHeader {
  private _isValid: boolean = false;
  private _version: MpegVersion = MpegVersion.Version1;
  private _layer: number = 0;
  private _protectionEnabled: boolean = false;
  private _bitrate: number = 0;
  private _sampleRate: number = 0;
  private _isPadded: boolean = false;
  private _channelMode: ChannelMode = ChannelMode.Stereo;
  private _isCopyrighted: boolean = false;
  private _isOriginal: boolean = false;
  private _frameLength: number = 0;
  private _samplesPerFrame: number = 0;
  private _isADTS: boolean = false;
  private _channels: number = 0;

  private constructor() {}

  static async fromStream(
    stream: IOStream,
    offset: offset_t,
    checkLength: boolean = false,
  ): Promise<MpegHeader> {
    const h = new MpegHeader();
    await h.parse(stream, offset, checkLength);
    return h;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get isValid(): boolean { return this._isValid; }
  get version(): MpegVersion { return this._version; }
  get layer(): number { return this._layer; }
  get protectionEnabled(): boolean { return this._protectionEnabled; }
  get bitrate(): number { return this._bitrate; }
  get sampleRate(): number { return this._sampleRate; }
  get isPadded(): boolean { return this._isPadded; }
  get channelMode(): ChannelMode { return this._channelMode; }
  get isCopyrighted(): boolean { return this._isCopyrighted; }
  get isOriginal(): boolean { return this._isOriginal; }
  get frameLength(): number { return this._frameLength; }
  get samplesPerFrame(): number { return this._samplesPerFrame; }
  get isADTS(): boolean { return this._isADTS; }
  get channels(): number { return this._channels; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async parse(stream: IOStream, offset: offset_t, checkLength: boolean): Promise<void> {
    await stream.seek(offset);
    const data = await stream.readBlock(4);
    if (data.length < 4) return;

    if (!isFrameSync(data.get(0), data.get(1))) return;

    // -- Version --
    const versionBits = (data.get(1) >> 3) & 0x03;
    // -- Layer --
    const layerBits = (data.get(1) >> 1) & 0x03;

    // Detect ADTS (AAC) when layer bits are 0
    if (layerBits === 0) {
      if (versionBits === 2) {
        // MPEG-4 ADTS
        this._version = MpegVersion.Version4;
      } else if (versionBits === 3) {
        // MPEG-2 ADTS
        this._version = MpegVersion.Version2;
      } else {
        return; // invalid
      }
      this._isADTS = true;
      await this.parseADTS(data, stream, offset, checkLength);
      return;
    }

    // Standard MPEG audio
    switch (versionBits) {
      case 3: this._version = MpegVersion.Version1; break;
      case 2: this._version = MpegVersion.Version2; break;
      case 0: this._version = MpegVersion.Version2_5; break;
      default: return; // invalid (01)
    }

    switch (layerBits) {
      case 3: this._layer = 1; break;
      case 2: this._layer = 2; break;
      case 1: this._layer = 3; break;
      default: return; // unreachable (0 handled above)
    }

    // Protection bit (inverted: 0 = protected)
    this._protectionEnabled = (data.get(1) & 0x01) === 0;

    // -- Bitrate --
    const bitrateIndex = (data.get(2) >> 4) & 0x0f;
    this._bitrate = this.lookupBitrate(bitrateIndex);
    if (this._bitrate === 0) return;

    // -- Sample rate --
    const sampleRateIndex = (data.get(2) >> 2) & 0x03;
    this._sampleRate = this.lookupSampleRate(sampleRateIndex);
    if (this._sampleRate === 0) return;

    // -- Padding --
    this._isPadded = (data.get(2) & 0x02) !== 0;

    // -- Channel mode --
    this._channelMode = ((data.get(3) >> 6) & 0x03) as ChannelMode;
    this._channels = this._channelMode === ChannelMode.SingleChannel ? 1 : 2;

    // -- Copyright / Original --
    this._isCopyrighted = (data.get(3) & 0x08) !== 0;
    this._isOriginal = (data.get(3) & 0x04) !== 0;

    // -- Samples per frame --
    this._samplesPerFrame = this.computeSamplesPerFrame();

    // -- Frame length --
    // frameLength = samplesPerFrame / 8 * 1000 * bitrate / sampleRate + padding
    // Simplified: samplesPerFrame * bitrate * 125 / sampleRate + padding
    const paddingSize = this._layer === 1 ? 4 : 1;
    this._frameLength = Math.floor(
      (this._samplesPerFrame * this._bitrate * 125) / this._sampleRate,
    ) + (this._isPadded ? paddingSize : 0);

    if (this._frameLength === 0) return;

    // -- Validate next frame if requested --
    if (checkLength) {
      if (!await this.validateNextFrame(stream, offset, data)) return;
    }

    this._isValid = true;
  }

  private async parseADTS(
    data: ByteVector,
    stream: IOStream,
    offset: offset_t,
    checkLength: boolean,
  ): Promise<void> {
    // Protection bit (inverted)
    this._protectionEnabled = (data.get(1) & 0x01) === 0;

    // Sample rate
    const sampleRateIndex = (data.get(2) >> 2) & 0x0f;
    this._sampleRate = adtsSampleRates[sampleRateIndex];
    if (this._sampleRate === 0) return;

    // Channel configuration is a 3-bit field split across byte boundaries:
    // - MSB (bit 2) is at byte 2, bit 0 → shifted left by 2
    // - LSBs (bits 1-0) are at byte 3, bits 7-6 → shifted right by 6
    const channelConfig = ((data.get(3) >> 6) & 0x03) | ((data.get(2) << 2) & 0x04);
    switch (channelConfig) {
      case 1: this._channels = 1; break;
      case 2: this._channels = 2; break;
      case 3: this._channels = 3; break;
      case 4: this._channels = 4; break;
      case 5: this._channels = 5; break;
      case 6: this._channels = 6; break;
      case 7: this._channels = 8; break;
      default:
        this._channels = this._channelMode === ChannelMode.SingleChannel ? 1 : 2;
        break;
    }

    // Copyright / Original (ADTS-specific bit positions)
    this._isCopyrighted = (data.get(3) & 0x04) !== 0;
    this._isOriginal = (data.get(3) & 0x20) !== 0;

    // Frame length (13-bit field spread across bytes 3-5)
    // Need to read 2 more bytes (bytes 4 and 5)
    await stream.seek(offset);
    const fullData = await stream.readBlock(6);
    if (fullData.length < 6) return;

    this._frameLength =
      ((fullData.get(3) & 0x03) << 11) |
      (fullData.get(4) << 3) |
      (fullData.get(5) >> 5);
    if (this._frameLength === 0) return;

    // ADTS always uses 1024 samples per frame
    this._samplesPerFrame = 1024;

    // Bitrate derived from frame length
    this._bitrate = Math.round(
      (this._frameLength * this._sampleRate * 8) / (this._samplesPerFrame * 1000),
    );

    this._layer = 0;

    if (checkLength) {
      if (!await this.validateNextFrame(stream, offset, data)) return;
    }

    this._isValid = true;
  }

  private async validateNextFrame(
    stream: IOStream,
    offset: offset_t,
    data: ByteVector,
  ): Promise<boolean> {
    await stream.seek(offset + this._frameLength);
    const nextData = await stream.readBlock(4);
    if (nextData.length < 4) return false;

    const currentMasked = data.toUInt(0, true) & HEADER_MASK;
    const nextMasked = nextData.toUInt(0, true) & HEADER_MASK;
    return currentMasked === nextMasked;
  }

  private lookupBitrate(index: number): number {
    if (this._version === MpegVersion.Version1) {
      switch (this._layer) {
        case 1: return bitratesV1L1[index];
        case 2: return bitratesV1L2[index];
        case 3: return bitratesV1L3[index];
      }
    } else {
      switch (this._layer) {
        case 1: return bitratesV2L1[index];
        case 2:
        case 3: return bitratesV2L23[index];
      }
    }
    return 0;
  }

  private lookupSampleRate(index: number): number {
    switch (this._version) {
      case MpegVersion.Version1: return sampleRatesV1[index];
      case MpegVersion.Version2: return sampleRatesV2[index];
      case MpegVersion.Version2_5: return sampleRatesV25[index];
      default: return 0;
    }
  }

  private computeSamplesPerFrame(): number {
    if (this._layer === 1) return 384;
    if (this._layer === 2) return 1152;
    // Layer 3
    return this._version === MpegVersion.Version1 ? 1152 : 576;
  }
}
