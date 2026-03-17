import { AudioProperties } from "../audioProperties.js";
import { ReadStyle } from "../toolkit/types.js";
import { MpegHeader, MpegVersion, ChannelMode } from "./mpegHeader.js";
import { XingHeader } from "./xingHeader.js";
import type { MpegFile } from "./mpegFile.js";

/**
 * Audio properties for MPEG (MP3) and ADTS (AAC) streams.
 *
 * Reads frame headers to determine duration, bitrate, sample rate and
 * channel layout. Handles both CBR and VBR (Xing / VBRI) streams.
 */
export class MpegProperties extends AudioProperties {
  private _lengthInMs: number = 0;
  private _bitrate: number = 0;
  private _sampleRate: number = 0;
  private _channels: number = 0;
  private _version: MpegVersion = MpegVersion.Version1;
  private _layer: number = 0;
  private _protectionEnabled: boolean = false;
  private _isCopyrighted: boolean = false;
  private _isOriginal: boolean = false;
  private _isADTS: boolean = false;
  private _channelMode: ChannelMode = ChannelMode.Stereo;

  private constructor(readStyle: ReadStyle) {
    super(readStyle);
  }

  static async create(
    file: MpegFile,
    readStyle: ReadStyle = ReadStyle.Average,
  ): Promise<MpegProperties> {
    const props = new MpegProperties(readStyle);
    await props.read(file);
    return props;
  }

  // ---------------------------------------------------------------------------
  // AudioProperties interface
  // ---------------------------------------------------------------------------

  get lengthInMilliseconds(): number { return this._lengthInMs; }
  override get bitrate(): number { return this._bitrate; }
  override get sampleRate(): number { return this._sampleRate; }
  get channels(): number { return this._channels; }

  // ---------------------------------------------------------------------------
  // MPEG-specific
  // ---------------------------------------------------------------------------

  get version(): MpegVersion { return this._version; }
  get layer(): number { return this._layer; }
  get protectionEnabled(): boolean { return this._protectionEnabled; }
  get isCopyrighted(): boolean { return this._isCopyrighted; }
  get isOriginal(): boolean { return this._isOriginal; }
  get isADTS(): boolean { return this._isADTS; }
  get channelMode(): ChannelMode { return this._channelMode; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async read(file: MpegFile): Promise<void> {
    // 1. Find first valid frame
    const firstOffset = await file.firstFrameOffset();
    if (firstOffset < 0) return;

    const firstHeader = await MpegHeader.fromStream(file["_stream"], firstOffset, false);
    if (!firstHeader.isValid) return;

    // Copy header properties
    this._version = firstHeader.version;
    this._layer = firstHeader.layer;
    this._sampleRate = firstHeader.sampleRate;
    this._channels = firstHeader.channels;
    this._channelMode = firstHeader.channelMode;
    this._protectionEnabled = firstHeader.protectionEnabled;
    this._isCopyrighted = firstHeader.isCopyrighted;
    this._isOriginal = firstHeader.isOriginal;
    this._isADTS = firstHeader.isADTS;

    // 2. Try Xing/VBRI VBR header from first frame data
    await file.seek(firstOffset);
    const firstFrameData = await file.readBlock(firstHeader.frameLength);
    const xingHeader = new XingHeader(firstFrameData);

    if (xingHeader.isValid) {
      // VBR stream
      if (firstHeader.samplesPerFrame > 0 && this._sampleRate > 0) {
        const timePerFrame =
          (firstHeader.samplesPerFrame * 1000.0) / this._sampleRate;
        const duration = timePerFrame * xingHeader.totalFrames;
        this._lengthInMs = Math.round(duration);
        this._bitrate = Math.round(
          (xingHeader.totalSize * 8.0) / duration,
        );
      }
      return;
    }

    // 3. ADTS: scan frames for average bitrate
    if (firstHeader.isADTS) {
      if (this._readStyle === ReadStyle.Fast) {
        this._bitrate = 0;
        this._lengthInMs = 0;
        return;
      }
      await this.readADTS(file, firstOffset, firstHeader);
      return;
    }

    // 4. CBR: use first header bitrate
    if (firstHeader.bitrate > 0) {
      this._bitrate = firstHeader.bitrate;
    }

    // 5. Calculate duration from stream extent
    if (this._bitrate > 0) {
      await this.computeLength(file, firstOffset, firstHeader);
    }
  }

  private async readADTS(
    file: MpegFile,
    firstOffset: number,
    firstHeader: MpegHeader,
  ): Promise<void> {
    let offset = firstOffset;
    let frameLen = firstHeader.frameLength;
    let totalFrameSize = 0;
    let numFrames = 0;
    let sameBytesPerFrameCount = 0;
    let lastBytesPerFrame = 0;


    while (true) {
      const nextOffset = await file.nextFrameOffset(offset + frameLen);
      if (nextOffset <= offset) break;

      offset = nextOffset;
      const header = await MpegHeader.fromStream(file["_stream"], offset, false);
      if (!header.isValid) break;
      frameLen = header.frameLength;

      totalFrameSize += header.frameLength;
      numFrames++;

      const bytesPerFrame = Math.floor(totalFrameSize / numFrames);

      // In Average mode, stop early once the average has stabilized
      if (this._readStyle !== ReadStyle.Accurate) {
        if (bytesPerFrame === lastBytesPerFrame) {
          sameBytesPerFrameCount++;
          if (sameBytesPerFrameCount >= 10) break;
        } else {
          sameBytesPerFrameCount = 0;
        }
        lastBytesPerFrame = bytesPerFrame;
      }
    }

    if (numFrames > 0 && firstHeader.samplesPerFrame > 0) {
      const bytesPerFrame = Math.floor(totalFrameSize / numFrames);
      this._bitrate = Math.round(
        (bytesPerFrame * 8 * this._sampleRate) /
          (1000 * firstHeader.samplesPerFrame),
      );
    }

    if (this._bitrate > 0) {
      await this.computeLength(file, firstOffset, firstHeader);
    }
  }

  private async computeLength(
    file: MpegFile,
    firstOffset: number,
    _firstHeader: MpegHeader,
  ): Promise<void> {
    const lastOffset = await file.lastFrameOffset();
    if (lastOffset < 0) return;

    const lastHeader = await MpegHeader.fromStream(file["_stream"], lastOffset, false);
    if (!lastHeader.isValid) return;

    const streamLength = lastOffset - firstOffset + lastHeader.frameLength;
    if (streamLength > 0) {
      this._lengthInMs = Math.round((streamLength * 8.0) / this._bitrate);
    }
  }
}
