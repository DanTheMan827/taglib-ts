import { AudioProperties } from "../audioProperties.js";
import { ReadStyle } from "../toolkit/types.js";

// ---------------------------------------------------------------------------
// AsfCodec
// ---------------------------------------------------------------------------

export enum AsfCodec {
  Unknown = 0,
  WMA1,
  WMA2,
  WMA9Pro,
  WMA9Lossless,
}

// ---------------------------------------------------------------------------
// AsfProperties
// ---------------------------------------------------------------------------

export class AsfProperties extends AudioProperties {
  private _length = 0;
  private _bitrate = 0;
  private _sampleRate = 0;
  private _channels = 0;
  private _bitsPerSample = 0;
  private _codec: AsfCodec = AsfCodec.Unknown;
  private _codecName = "";
  private _codecDescription = "";
  private _encrypted = false;

  constructor(readStyle: ReadStyle = ReadStyle.Average) {
    super(readStyle);
  }

  // -- AudioProperties interface --

  get lengthInMilliseconds(): number { return this._length; }
  get bitrate(): number { return this._bitrate; }
  get sampleRate(): number { return this._sampleRate; }
  get channels(): number { return this._channels; }

  // -- ASF-specific --

  get bitsPerSample(): number { return this._bitsPerSample; }
  get codec(): AsfCodec { return this._codec; }
  get codecName(): string { return this._codecName; }
  get codecDescription(): string { return this._codecDescription; }
  get isEncrypted(): boolean { return this._encrypted; }

  // -- Setters (used by AsfFile during parsing) --

  setLengthInMilliseconds(value: number): void { this._length = value; }
  setBitrate(value: number): void { this._bitrate = value; }
  setSampleRate(value: number): void { this._sampleRate = value; }
  setChannels(value: number): void { this._channels = value; }
  setBitsPerSample(value: number): void { this._bitsPerSample = value; }

  setCodec(formatTag: number): void {
    switch (formatTag) {
      case 0x0160: this._codec = AsfCodec.WMA1; break;
      case 0x0161: this._codec = AsfCodec.WMA2; break;
      case 0x0162: this._codec = AsfCodec.WMA9Pro; break;
      case 0x0163: this._codec = AsfCodec.WMA9Lossless; break;
      default: this._codec = AsfCodec.Unknown; break;
    }
  }

  setCodecName(value: string): void { this._codecName = value; }
  setCodecDescription(value: string): void { this._codecDescription = value; }
  setEncrypted(value: boolean): void { this._encrypted = value; }
}
