import { ByteVector, StringType } from '../../../byteVector.js';
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
  nullTerminatorSize,
} from '../id3v2Frame.js';

/**
 * Unsynchronized lyrics/text transcription frame (USLT).
 *
 * Structure: encoding(1) + language(3) + description(null-terminated) + lyrics.
 */
export class UnsynchronizedLyricsFrame extends Id3v2Frame {
  private _encoding: StringType = StringType.UTF8;
  private _language: ByteVector = ByteVector.fromString('XXX', StringType.Latin1);
  private _description: string = '';
  private _text: string = '';

  constructor(encoding: StringType = StringType.UTF8) {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString('USLT', StringType.Latin1),
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

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
  }

  toString(): string {
    return this._text;
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): UnsynchronizedLyricsFrame {
    const frame = new UnsynchronizedLyricsFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  static findByDescription(
    tag: { frames?: Id3v2Frame[] },
    description: string,
  ): UnsynchronizedLyricsFrame | null {
    if (!tag.frames) return null;
    for (const frame of tag.frames) {
      if (
        frame instanceof UnsynchronizedLyricsFrame &&
        frame._description === description
      ) {
        return frame;
      }
    }
    return null;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    if (data.length < 4) return;

    this._encoding = data.get(0) as StringType;
    this._language = data.mid(1, 3);

    const ntSize = nullTerminatorSize(this._encoding);
    const descStart = 4;
    const nullIdx = findNullTerminator(data, this._encoding, descStart);

    if (nullIdx < 0) {
      this._description = data.mid(descStart).toString(this._encoding);
      this._text = '';
    } else {
      this._description = data
        .mid(descStart, nullIdx - descStart)
        .toString(this._encoding);
      this._text = data
        .mid(nullIdx + ntSize)
        .toString(this._encoding);
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(this._encoding);
    v.append(this._language.mid(0, 3));
    v.append(ByteVector.fromString(this._description, this._encoding));
    if (
      this._encoding === StringType.UTF16 ||
      this._encoding === StringType.UTF16BE ||
      this._encoding === StringType.UTF16LE
    ) {
      v.append(ByteVector.fromSize(2, 0));
    } else {
      v.append(0);
    }
    v.append(ByteVector.fromString(this._text, this._encoding));
    return v;
  }
}
