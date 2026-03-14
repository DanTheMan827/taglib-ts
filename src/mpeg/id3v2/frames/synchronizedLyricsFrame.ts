import { ByteVector, StringType } from '../../../byteVector.js';
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
  nullTerminatorSize,
} from '../id3v2Frame.js';

/** Content types for the SYLT frame. */
export enum SynchedTextType {
  Other = 0x00,
  Lyrics = 0x01,
  TextTranscription = 0x02,
  Movement = 0x03,
  Events = 0x04,
  Chord = 0x05,
  Trivia = 0x06,
  WebpageUrls = 0x07,
  ImageUrls = 0x08,
}

export interface SynchedText {
  time: number;
  text: string;
}

/**
 * Synchronized lyrics/text frame (SYLT).
 *
 * Structure: encoding(1) + language(3) + timestampFormat(1) + contentType(1)
 *            + description(null-terminated in encoding)
 *            + repeated (text(null-terminated in encoding) + timestamp(4 big-endian)).
 */
export class SynchronizedLyricsFrame extends Id3v2Frame {
  private _encoding: StringType = StringType.UTF8;
  private _language: ByteVector = ByteVector.fromString('XXX', StringType.Latin1);
  private _description: string = '';
  private _timestampFormat: number = 2;
  private _textType: SynchedTextType = SynchedTextType.Other;
  private _synchedText: SynchedText[] = [];

  constructor(encoding: StringType = StringType.UTF8) {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString('SYLT', StringType.Latin1),
    );
    super(header);
    this._encoding = encoding;
  }

  // -- Accessors --------------------------------------------------------------

  get encoding(): StringType {
    return this._encoding;
  }

  set encoding(e: StringType) {
    this._encoding = e;
  }

  get language(): ByteVector {
    return this._language;
  }

  set language(lang: ByteVector) {
    this._language = lang.mid(0, 3);
    if (this._language.length < 3) {
      this._language.resize(3, 0x20);
    }
  }

  get description(): string {
    return this._description;
  }

  set description(value: string) {
    this._description = value;
  }

  /** 1 = MPEG frames, 2 = milliseconds. */
  get timestampFormat(): number {
    return this._timestampFormat;
  }

  set timestampFormat(v: number) {
    this._timestampFormat = v;
  }

  get textType(): SynchedTextType {
    return this._textType;
  }

  set textType(v: SynchedTextType) {
    this._textType = v;
  }

  get synchedText(): SynchedText[] {
    return this._synchedText;
  }

  set synchedText(text: SynchedText[]) {
    this._synchedText = text;
  }

  toString(): string {
    return this._description;
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): SynchronizedLyricsFrame {
    const frame = new SynchronizedLyricsFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    if (data.length < 6) return;

    this._encoding = data.get(0) as StringType;
    this._language = data.mid(1, 3);
    this._timestampFormat = data.get(4);
    this._textType = data.get(5) as SynchedTextType;

    const ntSize = nullTerminatorSize(this._encoding);
    let offset = 6;

    // Description (null-terminated in encoding)
    const descEnd = findNullTerminator(data, this._encoding, offset);
    if (descEnd < 0) {
      this._description = data.mid(offset).toString(this._encoding);
      return;
    }
    this._description = data
      .mid(offset, descEnd - offset)
      .toString(this._encoding);
    offset = descEnd + ntSize;

    // Parse synched text entries
    this._synchedText = [];
    while (offset < data.length) {
      const textEnd = findNullTerminator(data, this._encoding, offset);
      if (textEnd < 0) break;

      const text = data
        .mid(offset, textEnd - offset)
        .toString(this._encoding);
      offset = textEnd + ntSize;

      if (offset + 4 > data.length) break;
      const time = data.mid(offset, 4).toUInt();
      offset += 4;

      this._synchedText.push({ text, time });
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(this._encoding);
    v.append(this._language.mid(0, 3));
    v.append(this._timestampFormat);
    v.append(this._textType);

    const ntBytes =
      this._encoding === StringType.UTF16 ||
      this._encoding === StringType.UTF16BE ||
      this._encoding === StringType.UTF16LE
        ? ByteVector.fromSize(2, 0)
        : ByteVector.fromSize(1, 0);

    // Description
    v.append(ByteVector.fromString(this._description, this._encoding));
    v.append(ntBytes);

    // Synched text entries
    for (const entry of this._synchedText) {
      v.append(ByteVector.fromString(entry.text, this._encoding));
      v.append(ntBytes);
      v.append(ByteVector.fromUInt(entry.time));
    }

    return v;
  }
}
