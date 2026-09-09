/** @packageDocumentation Audio properties for MP4/M4A/AAC/ALAC files. */
import { AudioProperties } from "../audioProperties.js";
import { ByteVector, StringType } from "../byteVector.js";
import type { IOStream } from "../toolkit/ioStream.js";
import { ReadStyle } from "../toolkit/types.js";
import type { Mp4Atom, Mp4Atoms } from "./mp4Atoms.js";

// ---------------------------------------------------------------------------
// Codec enum
// ---------------------------------------------------------------------------

export enum Mp4Codec {
  Unknown = 0,
  AAC = 1,
  ALAC = 2,
  AC3 = 3,
  EAC3 = 4,
  FLAC = 5,
  DTS = 6,
  Opus = 7,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum total payload length (excluding atom headers) of all "mdat" atoms in the tree. */
function calculateMdatLength(atoms: Mp4Atom[]): number {
  let total = 0;
  for (const atom of atoms) {
    if (atom.length === 0) return 0;
    if (atom.name === "mdat") {
      const payload = atom.length - atom.headerSize;
      if (payload > 0) total += payload;
    }
    total += calculateMdatLength(atom.children);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Mp4Properties
// ---------------------------------------------------------------------------

export class Mp4Properties extends AudioProperties {
  private _lengthMs = 0;
  private _bitrate = 0;
  private _sampleRate = 0;
  private _channels = 0;
  private _bitsPerSample = 0;
  private _encrypted = false;
  private _codec: Mp4Codec = Mp4Codec.Unknown;
  private _codecId = "";

  private constructor(readStyle: ReadStyle = ReadStyle.Average) {
    super(readStyle);
  }

  static async create(
    stream: IOStream,
    atoms: Mp4Atoms,
    readStyle: ReadStyle = ReadStyle.Average,
  ): Promise<Mp4Properties> {
    const props = new Mp4Properties(readStyle);
    await props.read(stream, atoms);
    return props;
  }

  // -- Public getters --

  get lengthInMilliseconds(): number {
    return this._lengthMs;
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
  get bitsPerSample(): number {
    return this._bitsPerSample;
  }
  get isEncrypted(): boolean {
    return this._encrypted;
  }
  get codec(): Mp4Codec {
    return this._codec;
  }
  get codecId(): string {
    return this._codecId;
  }

  // -- Private parsing --

  private async read(stream: IOStream, atoms: Mp4Atoms): Promise<void> {
    const moov = atoms.find("moov");
    if (!moov) return;

    // Find the first audio track (handler type "soun")
    let trak: Mp4Atom | null = null;
    let data: ByteVector;

    const trakList = moov.findAll("trak");
    for (const track of trakList) {
      const hdlr = track.find("mdia", "hdlr");
      if (!hdlr) continue;
      trak = track;
      await stream.seek(hdlr.offset);
      data = await stream.readBlock(hdlr.length);
      if (data.containsAt(ByteVector.fromString("soun", StringType.Latin1), 16)) {
        break;
      }
      trak = null;
    }
    if (!trak) return;

    // Read duration from mdhd
    const mdhd = trak.find("mdia", "mdhd");
    if (!mdhd) return;

    await stream.seek(mdhd.offset);
    data = await stream.readBlock(mdhd.length);

    const version = data.get(8);
    let unit: number;
    let length: number;
    if (version === 1) {
      if (data.length < 36 + 8) return;
      unit = data.toUInt(28);
      length = Number(data.toLongLong(32));
    } else {
      if (data.length < 24 + 8) return;
      unit = data.toUInt(20);
      length = data.toUInt(24);
    }

    if (length === 0) {
      // Fallback: try movie header (mvhd)
      const mvhd = moov.find("mvhd");
      if (mvhd) {
        await stream.seek(mvhd.offset);
        data = await stream.readBlock(mvhd.length);
        if (data.length >= 24 + 4) {
          unit = data.toUInt(20);
          length = data.toUInt(24);
        }
      }
    }

    if (unit > 0 && length > 0) {
      const lengthMs = (length * 1000) / unit;
      if (lengthMs > 0 && lengthMs < 0x7fffffff) {
        this._lengthMs = Math.round(lengthMs);
      }
    }

    // Read codec from stsd
    const stsd = trak.find("mdia", "minf", "stbl", "stsd");
    if (!stsd) return;

    await stream.seek(stsd.offset);
    data = await stream.readBlock(stsd.length);
    if (data.length >= 24) {
      this._codecId = data.mid(20, 4).toString(StringType.Latin1);
    }

    if (data.containsAt(ByteVector.fromString("mp4a", StringType.Latin1), 20)) {
      this._codec = Mp4Codec.AAC;
      this._channels = data.toShort(40);
      this._bitsPerSample = data.toShort(42);
      this._sampleRate = data.toUInt(46);

      // Parse esds for bitrate
      if (
        data.containsAt(ByteVector.fromString("esds", StringType.Latin1), 56) &&
        data.get(64) === 0x03
      ) {
        let pos = 65;
        if (
          data.length > pos + 3 &&
          data.get(pos) === 0x80 &&
          data.get(pos + 1) === 0x80 &&
          data.get(pos + 2) === 0x80
        ) {
          pos += 3;
        }
        pos += 4;
        if (data.length > pos && data.get(pos) === 0x04) {
          pos += 1;
          if (
            data.length > pos + 3 &&
            data.get(pos) === 0x80 &&
            data.get(pos + 1) === 0x80 &&
            data.get(pos + 2) === 0x80
          ) {
            pos += 3;
          }
          pos += 10;
          if (data.length >= pos + 4) {
            const bitrateValue = data.toUInt(pos);
            if (bitrateValue !== 0 || this._lengthMs <= 0) {
              this._bitrate = Math.round(bitrateValue / 1000);
            } else {
              this._bitrate = Math.round(
                (calculateMdatLength(atoms.atoms) * 8) / this._lengthMs,
              );
            }
          }
        }
      }
    } else if (data.containsAt(ByteVector.fromString("alac", StringType.Latin1), 20)) {
      if (
        stsd.length === 88 &&
        data.containsAt(ByteVector.fromString("alac", StringType.Latin1), 56)
      ) {
        this._codec = Mp4Codec.ALAC;
        this._bitsPerSample = data.get(69);
        this._channels = data.get(73);
        this._bitrate = Math.round(data.toUInt(80) / 1000);
        this._sampleRate = data.toUInt(84);

        if (this._bitrate === 0 && this._lengthMs > 0) {
          this._bitrate = Math.round(
            (calculateMdatLength(atoms.atoms) * 8) / this._lengthMs,
          );
        }
      }
    } else if (data.length >= 50) {
      const codecMap = new Map<string, Mp4Codec>([
        ["ac-3", Mp4Codec.AC3],
        ["ec-3", Mp4Codec.EAC3],
        ["fLaC", Mp4Codec.FLAC],
        ["Opus", Mp4Codec.Opus],
        ["dtsc", Mp4Codec.DTS],
        ["dtse", Mp4Codec.DTS],
        ["dtsh", Mp4Codec.DTS],
        ["dtsl", Mp4Codec.DTS],
      ]);
      this._codec = codecMap.get(this._codecId) ?? Mp4Codec.Unknown;
      this._channels = data.toShort(40);
      this._bitsPerSample = data.toShort(42);
      this._sampleRate = data.toUInt(46);

      if (this._codec === Mp4Codec.FLAC) {
        const dfLaPos = data.find(ByteVector.fromString("dfLa", StringType.Latin1));
        if (dfLaPos >= 0 && data.length >= dfLaPos + 26 && (data.get(dfLaPos + 8) & 0x7f) === 0) {
          const streamInfo = data.toUInt(dfLaPos + 22);
          const sampleRate = streamInfo >>> 12;
          if (sampleRate !== 0) {
            this._sampleRate = sampleRate;
          }
          this._channels = ((streamInfo >>> 9) & 0x7) + 1;
          this._bitsPerSample = ((streamInfo >>> 4) & 0x1f) + 1;
        }
      } else if (this._codec === Mp4Codec.EAC3) {
        const dec3Pos = data.find(ByteVector.fromString("dec3", StringType.Latin1));
        if (dec3Pos >= 0 && data.length >= dec3Pos + 6) {
          this._bitrate = data.toUShort(dec3Pos + 4) >> 3;
        }
      }

      if (this._bitrate === 0 && this._lengthMs > 0) {
        this._bitrate = Math.round((calculateMdatLength(atoms.atoms) * 8) / this._lengthMs);
      }
    }

    // Check encryption
    if (stsd.find("drms")) {
      this._encrypted = true;
    }
  }
}
