import { AudioProperties } from "../audioProperties.js";
import { ByteVector, StringType } from "../byteVector.js";
import type { offset_t, ReadStyle } from "../toolkit/types.js";
import type { MpcFile } from "./mpcFile.js";

// Sample rate lookup table (same as original MusePack source).
const sftable = [44100, 48000, 37800, 32000, 0, 0, 0, 0];

/** MPC header size for SV7 and earlier: 8 × 7 = 56 bytes. */
export const MPC_HEADER_SIZE = 8 * 7;

// ---------------------------------------------------------------------------
// Helpers – variable-length integer reading (SV8)
// ---------------------------------------------------------------------------

interface ReadSizeFromFileResult {
  size: number;
  sizeLength: number;
  eof: boolean;
}

async function readSizeFromFile(file: MpcFile): Promise<ReadSizeFromFileResult> {
  let sizeLength = 0;
  let size = 0;
  let eof = false;
  let tmp: number;

  do {
    const b = await file.readBlock(1);
    if (b.isEmpty) {
      eof = true;
      break;
    }
    tmp = b.get(0);
    size = (size * 128) + (tmp & 0x7f);
    sizeLength++;
  } while (tmp & 0x80);

  return { size, sizeLength, eof };
}

interface ReadSizeFromDataResult {
  size: number;
  pos: number;
}

function readSizeFromData(data: ByteVector, startPos: number): ReadSizeFromDataResult {
  let pos = startPos;
  let size = 0;
  let tmp: number;

  do {
    tmp = data.get(pos++);
    size = (size * 128) + (tmp & 0x7f);
  } while ((tmp & 0x80) && pos < data.length);

  return { size, pos };
}

// =============================================================================
// MpcProperties
// =============================================================================

/**
 * Audio properties for Musepack (MPC) streams.
 *
 * Supports SV4 through SV8 stream versions.  SV8 uses a containerized
 * packet format ("MPCK" magic); SV7 uses a fixed header ("MP+" magic);
 * SV4/SV5 use an older legacy header.
 */
export class MpcProperties extends AudioProperties {
  private _version: number = 0;
  private _lengthInMs: number = 0;
  private _bitrate: number = 0;
  private _sampleRate: number = 0;
  private _channels: number = 0;
  private _totalFrames: number = 0;
  private _sampleFrames: number = 0;
  private _trackGain: number = 0;
  private _trackPeak: number = 0;
  private _albumGain: number = 0;
  private _albumPeak: number = 0;

  private constructor(readStyle: ReadStyle) {
    super(readStyle);
  }

  static async create(
    file: MpcFile,
    streamLength: offset_t,
    readStyle: ReadStyle,
  ): Promise<MpcProperties> {
    const p = new MpcProperties(readStyle);

    const magic = await file.readBlock(4);
    if (magic.length >= 4 &&
        magic.get(0) === 0x4d && magic.get(1) === 0x50 &&
        magic.get(2) === 0x43 && magic.get(3) === 0x4b) {
      // "MPCK" – Musepack SV8
      await p.readSV8(file, streamLength);
    } else {
      // SV7 or older – fixed-size header
      const rest = await file.readBlock(MPC_HEADER_SIZE - 4);
      const header = ByteVector.fromByteVector(magic);
      header.append(rest);
      p.readSV7(header, streamLength);
    }
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
  // MPC-specific
  // ---------------------------------------------------------------------------

  get mpcVersion(): number {
    return this._version;
  }

  get totalFrames(): number {
    return this._totalFrames;
  }

  get sampleFrames(): number {
    return this._sampleFrames;
  }

  /** Track gain (to dB: `64.82 - trackGain / 256`). */
  get trackGain(): number {
    return this._trackGain;
  }

  /** Track peak (to dB: `trackPeak / 256`). */
  get trackPeak(): number {
    return this._trackPeak;
  }

  /** Album gain (to dB: `64.82 - albumGain / 256`). */
  get albumGain(): number {
    return this._albumGain;
  }

  /** Album peak (to dB: `albumPeak / 256`). */
  get albumPeak(): number {
    return this._albumPeak;
  }

  // ---------------------------------------------------------------------------
  // Private – SV8
  // ---------------------------------------------------------------------------

  private async readSV8(file: MpcFile, streamLength: offset_t): Promise<void> {
    let readSH = false;
    let readRG = false;

    while (!readSH || !readRG) {
      const packetType = await file.readBlock(2);
      if (packetType.length < 2) break;

      const { size: packetSize, sizeLength, eof } = await readSizeFromFile(file);
      if (eof) break;

      const dataSize = packetSize - 2 - sizeLength;
      const data = await file.readBlock(dataSize);
      if (data.length !== dataSize) break;

      const pt0 = packetType.get(0);
      const pt1 = packetType.get(1);

      // "SH" – Stream Header
      if (pt0 === 0x53 && pt1 === 0x48) {
        if (dataSize <= 5) break;

        readSH = true;

        let pos = 4;
        this._version = data.get(pos);
        pos += 1;

        const sfResult = readSizeFromData(data, pos);
        this._sampleFrames = sfResult.size;
        pos = sfResult.pos;

        if (pos > dataSize - 3) break;

        const bsResult = readSizeFromData(data, pos);
        const begSilence = bsResult.size;
        pos = bsResult.pos;

        if (pos > dataSize - 2) break;

        const flags = data.toUShort(pos, true);

        this._sampleRate = sftable[(flags >>> 13) & 0x07];
        this._channels = ((flags >>> 4) & 0x0f) + 1;

        const frameCount = this._sampleFrames - begSilence;
        if (frameCount > 0 && this._sampleRate > 0) {
          const length = (frameCount * 1000.0) / this._sampleRate;
          this._lengthInMs = Math.round(length);
          this._bitrate = Math.round((streamLength * 8.0) / length);
        }
      } else if (pt0 === 0x52 && pt1 === 0x47) {
        // "RG" – Replay Gain
        if (dataSize <= 9) break;

        readRG = true;

        const replayGainVersion = data.get(0);
        if (replayGainVersion === 1) {
          this._trackGain = data.toShort(1, true);
          this._trackPeak = data.toShort(3, true);
          this._albumGain = data.toShort(5, true);
          this._albumPeak = data.toShort(7, true);
        }
      } else if (pt0 === 0x53 && pt1 === 0x45) {
        // "SE" – Stream End
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private – SV7 and older
  // ---------------------------------------------------------------------------

  private readSV7(data: ByteVector, streamLength: offset_t): void {
    const mpPlus = ByteVector.fromString("MP+", StringType.Latin1);

    if (data.startsWith(mpPlus)) {
      if (data.length < 4) return;

      this._version = data.get(3) & 15;
      if (this._version < 7) return;

      this._totalFrames = data.toUInt(4, false);

      const flags = data.toUInt(8, false);
      this._sampleRate = sftable[(flags >>> 16) & 0x03];
      this._channels = 2;

      const gapless = data.toUInt(5, false);

      this._trackGain = data.toShort(14, false);
      this._trackPeak = data.toUShort(12, false);
      this._albumGain = data.toShort(18, false);
      this._albumPeak = data.toUShort(16, false);

      // Convert gain info
      if (this._trackGain !== 0) {
        let tmp = Math.round(
          (64.82 - toSigned16(this._trackGain) / 100.0) * 256.0,
        );
        if (tmp >= (1 << 16) || tmp < 0) tmp = 0;
        this._trackGain = tmp;
      }

      if (this._albumGain !== 0) {
        let tmp = Math.round(
          (64.82 - toSigned16(this._albumGain) / 100.0) * 256.0,
        );
        if (tmp >= (1 << 16) || tmp < 0) tmp = 0;
        this._albumGain = tmp;
      }

      if (this._trackPeak !== 0) {
        this._trackPeak = Math.round(
          Math.log10(this._trackPeak) * 20 * 256,
        );
      }

      if (this._albumPeak !== 0) {
        this._albumPeak = Math.round(
          Math.log10(this._albumPeak) * 20 * 256,
        );
      }

      if ((gapless >>> 31) & 0x0001) {
        const lastFrameSamples = (gapless >>> 20) & 0x07ff;
        this._sampleFrames = this._totalFrames * 1152 - lastFrameSamples;
      } else {
        this._sampleFrames = this._totalFrames * 1152 - 576;
      }
    } else {
      // SV4 / SV5 legacy header
      const headerData = data.toUInt(0, false);

      this._bitrate = (headerData >>> 23) & 0x01ff;
      this._version = (headerData >>> 11) & 0x03ff;
      this._sampleRate = 44100;
      this._channels = 2;

      if (this._version >= 5) {
        this._totalFrames = data.toUInt(4, false);
      } else {
        this._totalFrames = data.toUShort(6, false);
      }

      this._sampleFrames = this._totalFrames * 1152 - 576;
    }

    if (this._sampleFrames > 0 && this._sampleRate > 0) {
      const length = (this._sampleFrames * 1000.0) / this._sampleRate;
      this._lengthInMs = Math.round(length);

      if (this._bitrate === 0) {
        this._bitrate = Math.round((streamLength * 8.0) / length);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utility – reinterpret unsigned 16-bit as signed
// ---------------------------------------------------------------------------

function toSigned16(value: number): number {
  return value >= 0x8000 ? value - 0x10000 : value;
}
