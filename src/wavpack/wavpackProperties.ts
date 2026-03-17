import { AudioProperties } from "../audioProperties.js";
import { ByteVector, StringType } from "../byteVector.js";
import type { offset_t, ReadStyle } from "../toolkit/types.js";
import type { File } from "../file.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size of a WavPack block header in bytes. */
export const HeaderSize = 32;

// Flag bit masks
const BYTES_STORED = 3;
const MONO_FLAG = 4;
const HYBRID_FLAG = 8;
const DSD_FLAG = 0x80000000;

const SHIFT_LSB = 13;
const SHIFT_MASK = 0x1f << SHIFT_LSB;

const SRATE_LSB = 23;
const SRATE_MASK = 0xf << SRATE_LSB;

const INITIAL_BLOCK = 0x800;
const FINAL_BLOCK = 0x1000;

const MIN_STREAM_VERS = 0x402;
const MAX_STREAM_VERS = 0x410;

// Metadata block ID constants
const ID_DSD_BLOCK = 0x0e;
const ID_OPTIONAL_DATA = 0x20;
const ID_UNIQUE = 0x3f;
const ID_ODD_SIZE = 0x40;
const ID_LARGE = 0x80;
const ID_SAMPLE_RATE = ID_OPTIONAL_DATA | 0x7; // 0x27

/** Standard sample rate lookup table. */
const sampleRates = [
  6000, 8000, 9600, 11025, 12000, 16000, 22050, 24000,
  32000, 44100, 48000, 64000, 88200, 96000, 192000, 0,
];

// ---------------------------------------------------------------------------
// Helpers – metadata chunk parsing
// ---------------------------------------------------------------------------

/**
 * Parse metadata blocks within a WavPack block (excluding the 32-byte header)
 * looking for the chunk with the given `id`.
 *
 * For ID_SAMPLE_RATE (0x27): returns the non-standard sample rate.
 * For ID_DSD_BLOCK (0x0e): returns the DSD rate shift value.
 */
function getMetaDataChunk(block: ByteVector, id: number): number {
  if (id !== ID_SAMPLE_RATE && id !== ID_DSD_BLOCK) return 0;

  const blockSize = block.length;
  let index = 0;

  while (index + 1 < blockSize) {
    const metaId = block.get(index);
    let metaBc = block.get(index + 1) << 1;
    index += 2;

    if (metaId & ID_LARGE) {
      if (index + 2 > blockSize) return 0;
      metaBc += (block.get(index) << 9) + (block.get(index + 1) << 17);
      index += 2;
    }

    if (index + metaBc > blockSize) return 0;

    // Non-standard sample rate
    if (
      id === ID_SAMPLE_RATE &&
      (metaId & ID_UNIQUE) === ID_SAMPLE_RATE &&
      metaBc === 4
    ) {
      let sampleRate = block.get(index);
      sampleRate |= block.get(index + 1) << 8;
      sampleRate |= block.get(index + 2) << 16;

      // Only use 4th byte if it's really there (even size)
      if (!(metaId & ID_ODD_SIZE)) {
        sampleRate |= (block.get(index + 3) & 0x7f) << 24;
      }
      return sampleRate;
    }

    // DSD rate shift
    if (
      id === ID_DSD_BLOCK &&
      (metaId & ID_UNIQUE) === ID_DSD_BLOCK &&
      metaBc > 0
    ) {
      const rateShift = block.get(index);
      if (rateShift <= 31) return rateShift;
    }

    index += metaBc;
  }

  return 0;
}

function getNonStandardRate(block: ByteVector): number {
  return getMetaDataChunk(block, ID_SAMPLE_RATE);
}

function getDsdRateShifter(block: ByteVector): number {
  return getMetaDataChunk(block, ID_DSD_BLOCK);
}

// =============================================================================
// WavPackProperties
// =============================================================================

/**
 * Audio properties for WavPack streams.
 *
 * Supports standard and non-standard sample rates, hybrid (lossy) and
 * lossless modes, multi-channel configurations, and DSD audio.
 */
export class WavPackProperties extends AudioProperties {
  private _lengthInMs: number = 0;
  private _bitrate: number = 0;
  private _sampleRate: number = 0;
  private _channels: number = 0;
  private _version: number = 0;
  private _bitsPerSample: number = 0;
  private _lossless: boolean = false;
  private _dsd: boolean = false;
  private _sampleFrames: number = 0;

  private constructor(readStyle: ReadStyle) {
    super(readStyle);
  }

  static async create(file: File, streamLength: offset_t, readStyle: ReadStyle): Promise<WavPackProperties> {
    const p = new WavPackProperties(readStyle);
    await p.read(file, streamLength);
    return p;
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
  // WavPack-specific
  // ---------------------------------------------------------------------------

  get version(): number {
    return this._version;
  }

  get bitsPerSample(): number {
    return this._bitsPerSample;
  }

  get isLossless(): boolean {
    return this._lossless;
  }

  get isDsd(): boolean {
    return this._dsd;
  }

  get sampleFrames(): number {
    return this._sampleFrames;
  }

  // ---------------------------------------------------------------------------
  // Private – reading
  // ---------------------------------------------------------------------------

  private async read(file: File, streamLength: offset_t): Promise<void> {
    const wvpk = ByteVector.fromString("wvpk", StringType.Latin1);
    let offset: offset_t = 0;

    while (true) {
      await file.seek(offset);
      const data = await file.readBlock(HeaderSize);

      if (data.length < HeaderSize) break;
      if (!data.startsWith(wvpk)) break;

      const blockSize = data.toUInt(4, false);
      const smplFrames = data.toUInt(12, false);
      const blockSamples = data.toUInt(20, false);
      const flags = data.toUInt(24, false);
      let smplRate = sampleRates[(flags & SRATE_MASK) >>> SRATE_LSB];

      if (blockSize < 24 || blockSize > 1048576) break;

      if (!blockSamples) {
        // Ignore blocks with no samples
        offset += blockSize + 8;
        continue;
      }

      // For non-standard sample rates or DSD audio, parse the block body
      if (!smplRate || (flags & DSD_FLAG)) {
        const adjustedBlockSize = blockSize - 24;
        const block = await file.readBlock(adjustedBlockSize);

        if (block.length < adjustedBlockSize) break;

        if (!smplRate) {
          smplRate = getNonStandardRate(block);
        }

        if (smplRate && (flags & DSD_FLAG)) {
          smplRate <<= getDsdRateShifter(block);
        }
      }

      if (flags & INITIAL_BLOCK) {
        this._version = data.toShort(8, false);
        if (this._version < MIN_STREAM_VERS || this._version > MAX_STREAM_VERS)
          break;

        this._bitsPerSample =
          ((flags & BYTES_STORED) + 1) * 8 -
          ((flags & SHIFT_MASK) >>> SHIFT_LSB);
        this._sampleRate = smplRate;
        this._lossless = !(flags & HYBRID_FLAG);
        this._dsd = (flags & DSD_FLAG) !== 0;
        this._sampleFrames = smplFrames;
      }

      this._channels += flags & MONO_FLAG ? 1 : 2;

      if (flags & FINAL_BLOCK) break;

      offset += blockSize + 8;
    }

    // 0xFFFFFFFF means the frame count is unknown — seek backward for it
    if (this._sampleFrames === 0xffffffff) {
      this._sampleFrames = await this.seekFinalIndex(file, streamLength);
    }

    if (this._sampleFrames > 0 && this._sampleRate > 0) {
      const length = (this._sampleFrames * 1000.0) / this._sampleRate;
      this._lengthInMs = Math.round(length);
      this._bitrate = Math.round((streamLength * 8.0) / length);
    }
  }

  private async seekFinalIndex(file: File, streamLength: offset_t): Promise<number> {
    const wvpk = ByteVector.fromString("wvpk", StringType.Latin1);
    let offset = streamLength;

    while (offset >= HeaderSize) {
      offset = await file.rfind(wvpk, offset - 4);
      if (offset === -1) return 0;

      await file.seek(offset);
      const data = await file.readBlock(HeaderSize);
      if (data.length < HeaderSize) return 0;

      const blockSize = data.toUInt(4, false);
      const blockIndex = data.toUInt(16, false);
      const blockSamples = data.toUInt(20, false);
      const flags = data.toUInt(24, false);
      const vers = data.toShort(8, false);

      // Validate to avoid spurious "wvpk" matches in binary data
      if (
        vers < MIN_STREAM_VERS ||
        vers > MAX_STREAM_VERS ||
        blockSize & 1 ||
        blockSize < 24 ||
        blockSize >= 1048576 ||
        blockSamples > 131072
      ) {
        continue;
      }

      if (blockSamples && flags & FINAL_BLOCK) {
        return blockIndex + blockSamples;
      }
    }

    return 0;
  }
}
