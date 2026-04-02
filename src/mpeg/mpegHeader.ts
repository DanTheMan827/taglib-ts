/** @packageDocumentation MPEG audio frame header parser including ADTS (AAC) support and bitrate/sample-rate lookup tables. */
import type { ByteVector } from "../byteVector.js";
import type { IOStream } from "../toolkit/ioStream.js";
import type { offset_t } from "../toolkit/types.js";

// =============================================================================
// Enums
// =============================================================================

/**
 * MPEG audio version as indicated by bits 19-20 of the frame header.
 */
export enum MpegVersion {
  /** MPEG Version 1 (ISO/IEC 11172-3). */
  Version1 = 0,
  /** MPEG Version 2 (ISO/IEC 13818-3). */
  Version2 = 1,
  /** MPEG Version 2.5 (unofficial extension for very low bitrates). */
  Version2_5 = 2,
  /** MPEG Version 4 / ADTS (AAC). */
  Version4 = 3,
}

/**
 * MPEG channel mode as indicated by bits 6-7 of the third header byte.
 */
export enum ChannelMode {
  /** Stereo (two independent audio channels). */
  Stereo = 0,
  /** Joint Stereo (stereo with side-information coding). */
  JointStereo = 1,
  /** Dual Channel (two independent mono channels). */
  DualChannel = 2,
  /** Single Channel (mono). */
  SingleChannel = 3,
}

// =============================================================================
// Constants
// =============================================================================

// Bitrate tables indexed by [bitrateIndex].
// Index 0 and 15 are invalid (0).
/** Bitrate table for MPEG Version 1, Layer 1 (kbps). Index 0 and 15 are invalid. */
const bitratesV1L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0];
/** Bitrate table for MPEG Version 1, Layer 2 (kbps). Index 0 and 15 are invalid. */
const bitratesV1L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0];
/** Bitrate table for MPEG Version 1, Layer 3 / MP3 (kbps). Index 0 and 15 are invalid. */
const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
/** Bitrate table for MPEG Version 2/2.5, Layer 1 (kbps). Index 0 and 15 are invalid. */
const bitratesV2L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0];
/** Bitrate table for MPEG Version 2/2.5, Layers 2 and 3 (kbps). Index 0 and 15 are invalid. */
const bitratesV2L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

/** Sample rate table for MPEG Version 1 (Hz). Index 3 is invalid. */
const sampleRatesV1 = [44100, 48000, 32000, 0];
/** Sample rate table for MPEG Version 2 (Hz). Index 3 is invalid. */
const sampleRatesV2 = [22050, 24000, 16000, 0];
/** Sample rate table for MPEG Version 2.5 (Hz). Index 3 is invalid. */
const sampleRatesV25 = [11025, 12000, 8000, 0];

/** Sample rate table for ADTS (AAC) streams (Hz). Indices 13-15 are reserved/invalid. */
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

/**
 * Returns `true` when the two bytes form a valid MPEG frame sync pattern
 * (0xFF followed by a byte whose top 3 bits are all set, but not 0xFF itself).
 *
 * @param byte1 - First byte (must be 0xFF for a sync).
 * @param byte2 - Second byte (must have bits 7-5 all set, but not equal 0xFF).
 * @returns `true` if the bytes form a valid frame sync sequence.
 */
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
  /** Whether the parsed header represents a valid MPEG frame. */
  private _isValid: boolean = false;
  /** MPEG version extracted from the frame header. */
  private _version: MpegVersion = MpegVersion.Version1;
  /** MPEG layer number (1, 2, or 3); 0 for ADTS streams. */
  private _layer: number = 0;
  /** Whether CRC protection is enabled (bit 0 of second header byte, inverted). */
  private _protectionEnabled: boolean = false;
  /** Audio bitrate in kbps as looked up from the bitrate table. */
  private _bitrate: number = 0;
  /** Sample rate in Hz as looked up from the sample-rate table. */
  private _sampleRate: number = 0;
  /** Whether the frame includes a padding slot to align to byte boundaries. */
  private _isPadded: boolean = false;
  /** Channel mode as encoded in bits 7-6 of the fourth header byte. */
  private _channelMode: ChannelMode = ChannelMode.Stereo;
  /** Whether the audio is copyrighted. */
  private _isCopyrighted: boolean = false;
  /** Whether the audio is an original recording (not a copy). */
  private _isOriginal: boolean = false;
  /** Total byte length of this frame including the header. */
  private _frameLength: number = 0;
  /** Number of PCM samples encoded in this frame. */
  private _samplesPerFrame: number = 0;
  /** Whether the frame is an ADTS (AAC) frame rather than a standard MPEG frame. */
  private _isADTS: boolean = false;
  /** Number of audio channels (1 for mono, 2 for all stereo modes). */
  private _channels: number = 0;

  /**
   * Private constructor — use the static {@link MpegHeader.fromStream} factory method.
   */
  private constructor() {}

  /**
   * Reads and parses an MPEG frame header from the stream at the given offset.
   *
   * @param stream - The I/O stream to read from.
   * @param offset - Byte offset within the stream at which the frame header starts.
   * @param checkLength - When `true`, the next frame is also validated to confirm this is real audio.
   * @returns A fully parsed `MpegHeader`; check {@link isValid} before using the result.
   */
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

  /** Gets whether the header represents a valid MPEG audio frame. */
  get isValid(): boolean { return this._isValid; }
  /** Gets the MPEG version of this frame. */
  get version(): MpegVersion { return this._version; }
  /** Gets the MPEG layer (1, 2, or 3); 0 for ADTS. */
  get layer(): number { return this._layer; }
  /** Gets whether CRC protection is enabled for this frame. */
  get protectionEnabled(): boolean { return this._protectionEnabled; }
  /** Gets the audio bitrate in kbps. */
  get bitrate(): number { return this._bitrate; }
  /** Gets the sample rate in Hz. */
  get sampleRate(): number { return this._sampleRate; }
  /** Gets whether this frame includes a padding slot. */
  get isPadded(): boolean { return this._isPadded; }
  /** Gets the channel mode of this frame. */
  get channelMode(): ChannelMode { return this._channelMode; }
  /** Gets whether the audio is flagged as copyrighted. */
  get isCopyrighted(): boolean { return this._isCopyrighted; }
  /** Gets whether the audio is flagged as an original recording. */
  get isOriginal(): boolean { return this._isOriginal; }
  /** Gets the total byte length of this frame (header + payload). */
  get frameLength(): number { return this._frameLength; }
  /** Gets the number of PCM samples encoded in this frame. */
  get samplesPerFrame(): number { return this._samplesPerFrame; }
  /** Gets whether this is an ADTS (AAC) frame rather than a standard MPEG frame. */
  get isADTS(): boolean { return this._isADTS; }
  /** Gets the number of audio channels (1 for mono, 2 for all stereo modes). */
  get channels(): number { return this._channels; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Reads 4 bytes from the stream at `offset` and populates all header fields.
   * Sets `_isValid` to `true` only if a complete, coherent header is found.
   *
   * @param stream - The I/O stream to read from.
   * @param offset - Byte offset within the stream.
   * @param checkLength - When `true`, also validates the next frame header.
   */
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

  /**
   * Parses an ADTS (AAC) frame header from the given data, reading additional
   * bytes from the stream when needed.
   *
   * @param data - The first 4 bytes already read from the stream.
   * @param stream - The I/O stream (for reading bytes 4-5 of the ADTS header).
   * @param offset - Byte offset in the stream where the frame starts.
   * @param checkLength - When `true`, also validates the next frame header.
   */
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

  /**
   * Verifies that a valid matching frame header exists at `offset + frameLength`.
   * The version, layer, and sample-rate fields must match those of the current header.
   *
   * @param stream - The I/O stream used to read the next frame header.
   * @param offset - Byte offset of the current frame.
   * @param data - The current frame's 4-byte header data (used for masking comparison).
   * @returns `true` if the next frame header is valid and consistent.
   */
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

  /**
   * Looks up the bitrate (kbps) for the given bitrate index using the current
   * version and layer.
   *
   * @param index - The 4-bit bitrate index from the frame header.
   * @returns The bitrate in kbps, or `0` for invalid/free-format indices.
   */
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

  /**
   * Looks up the sample rate (Hz) for the given index using the current version.
   *
   * @param index - The 2-bit sample-rate index from the frame header.
   * @returns The sample rate in Hz, or `0` for invalid indices.
   */
  private lookupSampleRate(index: number): number {
    switch (this._version) {
      case MpegVersion.Version1: return sampleRatesV1[index];
      case MpegVersion.Version2: return sampleRatesV2[index];
      case MpegVersion.Version2_5: return sampleRatesV25[index];
      default: return 0;
    }
  }

  /**
   * Returns the number of PCM samples per frame for the current version and layer.
   * @returns Sample count per frame (384 for Layer 1, 576 or 1152 for Layer 3, 1152 for Layer 2).
   */
  private computeSamplesPerFrame(): number {
    if (this._layer === 1) return 384;
    if (this._layer === 2) return 1152;
    // Layer 3
    return this._version === MpegVersion.Version1 ? 1152 : 576;
  }
}
