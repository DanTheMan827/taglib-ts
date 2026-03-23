/** @file Audio properties implementation for MPEG (MP3) and ADTS (AAC) files, including VBR (Xing/VBRI) support. */
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
  /** Duration of the audio stream in milliseconds. */
  private _lengthInMs: number = 0;
  /** Average bitrate in kbps. */
  private _bitrate: number = 0;
  /** Sample rate in Hz. */
  private _sampleRate: number = 0;
  /** Number of audio channels. */
  private _channels: number = 0;
  /** MPEG version of the first audio frame. */
  private _version: MpegVersion = MpegVersion.Version1;
  /** MPEG layer number (1, 2, or 3); 0 for ADTS. */
  private _layer: number = 0;
  /** Whether CRC protection is enabled. */
  private _protectionEnabled: boolean = false;
  /** Whether the audio is flagged as copyrighted. */
  private _isCopyrighted: boolean = false;
  /** Whether the audio is flagged as an original recording. */
  private _isOriginal: boolean = false;
  /** Whether the stream is an ADTS (AAC) stream. */
  private _isADTS: boolean = false;
  /** Channel mode of the first audio frame. */
  private _channelMode: ChannelMode = ChannelMode.Stereo;

  /**
   * Private constructor — use the static {@link MpegProperties.create} factory method.
   * @param readStyle - The read-style detail level passed to the base class.
   */
  private constructor(readStyle: ReadStyle) {
    super(readStyle);
  }

  /**
   * Creates an `MpegProperties` instance by reading the audio stream from `file`.
   *
   * @param file - The MPEG file whose audio properties should be determined.
   * @param readStyle - The level of detail to use when scanning the stream (default: `ReadStyle.Average`).
   * @returns A fully populated `MpegProperties` instance.
   */
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

  /** Gets the duration of the audio stream in milliseconds. */
  get lengthInMilliseconds(): number { return this._lengthInMs; }
  /** Gets the average audio bitrate in kbps. */
  override get bitrate(): number { return this._bitrate; }
  /** Gets the audio sample rate in Hz. */
  override get sampleRate(): number { return this._sampleRate; }
  /** Gets the number of audio channels. */
  get channels(): number { return this._channels; }

  // ---------------------------------------------------------------------------
  // MPEG-specific
  // ---------------------------------------------------------------------------

  /** Gets the MPEG version of the first audio frame. */
  get version(): MpegVersion { return this._version; }
  /** Gets the MPEG layer number (1, 2, or 3); 0 for ADTS streams. */
  get layer(): number { return this._layer; }
  /** Gets whether CRC protection is enabled. */
  get protectionEnabled(): boolean { return this._protectionEnabled; }
  /** Gets whether the audio is flagged as copyrighted. */
  get isCopyrighted(): boolean { return this._isCopyrighted; }
  /** Gets whether the audio is flagged as an original recording. */
  get isOriginal(): boolean { return this._isOriginal; }
  /** Gets whether the stream is an ADTS (AAC) stream. */
  get isADTS(): boolean { return this._isADTS; }
  /** Gets the channel mode of the first audio frame. */
  get channelMode(): ChannelMode { return this._channelMode; }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Populates all property fields by scanning the audio frames in `file`.
   * Handles VBR (Xing/VBRI), ADTS, and CBR streams.
   *
   * @param file - The MPEG file to read audio data from.
   */
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

  /**
   * Scans ADTS frames to compute an average bitrate, then derives the stream duration.
   *
   * @param file - The MPEG file being analysed.
   * @param firstOffset - Byte offset of the first ADTS frame.
   * @param firstHeader - The parsed header of the first ADTS frame.
   */
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

  /**
   * Calculates the stream duration from the byte extents between the first and
   * last valid frames using the already-computed bitrate.
   *
   * @param file - The MPEG file being analysed.
   * @param firstOffset - Byte offset of the first valid frame.
   * @param _firstHeader - The first frame header (reserved for future use).
   */
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
