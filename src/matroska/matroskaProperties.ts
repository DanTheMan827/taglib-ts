import { AudioProperties } from "../audioProperties.js";
import { ReadStyle } from "../toolkit/types.js";

/**
 * Audio properties for Matroska files (MKV, MKA, WebM).
 */
export class MatroskaProperties extends AudioProperties {
  private _lengthMs: number = 0;
  private _bitrate: number = -1;
  private _sampleRate: number = 0;
  private _channels: number = 0;
  private _bitsPerSample: number = 0;
  private _codecName: string = "";
  private _docType: string = "";
  private _docTypeVersion: number = 0;
  private _title: string = "";
  private _fileLength: number = 0;

  constructor(readStyle: ReadStyle = ReadStyle.Average) {
    super(readStyle);
  }

  get lengthInMilliseconds(): number {
    return this._lengthMs;
  }

  override get bitrate(): number {
    if (this._bitrate === -1) {
      this._bitrate = this._lengthMs !== 0
        ? Math.round(this._fileLength * 8 / this._lengthMs)
        : 0;
    }
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

  get codecName(): string {
    return this._codecName;
  }

  get docType(): string {
    return this._docType;
  }

  get docTypeVersion(): number {
    return this._docTypeVersion;
  }

  get title(): string {
    return this._title;
  }

  // Setters used during parsing
  setLengthInMilliseconds(ms: number): void { this._lengthMs = ms; }
  setSampleRate(rate: number): void { this._sampleRate = rate; }
  setChannels(ch: number): void { this._channels = ch; }
  setBitsPerSample(bits: number): void { this._bitsPerSample = bits; }
  setCodecName(name: string): void { this._codecName = name; }
  setDocType(type: string): void { this._docType = type; }
  setDocTypeVersion(version: number): void { this._docTypeVersion = version; }
  setTitle(title: string): void { this._title = title; }
  setFileLength(length: number): void { this._fileLength = length; }
}
