/** @packageDocumentation ID3v2 unsynchronized lyrics frame (USLT). Stores free-form lyrics or text transcription. */
import { ByteVector, StringType } from "../../../byteVector.js";
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
  nullTerminatorSize,
} from "../id3v2Frame.js";

/**
 * Unsynchronized lyrics/text transcription frame (USLT).
 *
 * Structure: encoding(1) + language(3) + description(null-terminated) + lyrics.
 */
export class UnsynchronizedLyricsFrame extends Id3v2Frame {
  /** Text encoding used for the description and lyrics content. */
  private _encoding: StringType = StringType.UTF8;
  /** Three-byte ISO-639-2 language code identifying the language of the lyrics. */
  private _language: ByteVector = ByteVector.fromString("XXX", StringType.Latin1);
  /** Short content description distinguishing multiple USLT frames with the same language. */
  private _description: string = "";
  /** The full lyrics or text transcription content. */
  private _text: string = "";

  /**
   * Creates a new unsynchronized lyrics frame.
   * @param encoding - The text encoding to use for the description and lyrics. Defaults to UTF-8.
   */
  constructor(encoding: StringType = StringType.UTF8) {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString("USLT", StringType.Latin1),
    );
    super(header);
    this._encoding = encoding;
  }

  // -- Accessors --------------------------------------------------------------

  /** Gets the text encoding used for the description and lyrics content. */
  get encoding(): StringType {
    return this._encoding;
  }

  /** Sets the text encoding used for the description and lyrics content. */
  set encoding(e: StringType) {
    this._encoding = e;
  }

  /** Gets the three-byte ISO-639-2 language code identifying the language of the lyrics. */
  get language(): ByteVector {
    return this._language;
  }

  /**
   * Sets the three-byte ISO-639-2 language code. The value is truncated or padded with spaces
   * to exactly three bytes.
   */
  set language(lang: ByteVector) {
    this._language = lang.mid(0, 3);
    if (this._language.length < 3) {
      this._language.resize(3, 0x20);
    }
  }

  /** Gets the short content description for this frame. */
  get description(): string {
    return this._description;
  }

  /** Sets the short content description for this frame. */
  set description(value: string) {
    this._description = value;
  }

  /** Gets the lyrics or text transcription content. */
  get text(): string {
    return this._text;
  }

  /** Sets the lyrics or text transcription content. */
  set text(value: string) {
    this._text = value;
  }

  /**
   * Returns the lyric text.
   * @returns The lyrics or text transcription stored in this frame.
   */
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

  /**
   * Finds the first USLT frame in a tag whose description matches the given string.
   * @param tag - The ID3v2 tag object containing a `frames` array to search.
   * @param description - The content description to match against.
   * @returns The first matching {@link UnsynchronizedLyricsFrame}, or `null` if none is found.
   */
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

  /**
   * Parses the binary field data for this USLT frame.
   * @param data - Raw field bytes starting with the encoding byte.
   * @param _version - The ID3v2 version (unused).
   */
  protected parseFields(data: ByteVector, _version: number): void {
    if (data.length < 4) return;

    this._encoding = data.get(0) as StringType;
    this._language = data.mid(1, 3);

    const ntSize = nullTerminatorSize(this._encoding);
    const descStart = 4;
    const nullIdx = findNullTerminator(data, this._encoding, descStart);

    if (nullIdx < 0) {
      this._description = data.mid(descStart).toString(this._encoding);
      this._text = "";
    } else {
      this._description = data
        .mid(descStart, nullIdx - descStart)
        .toString(this._encoding);
      this._text = data
        .mid(nullIdx + ntSize)
        .toString(this._encoding);
    }
  }

  /**
   * Serialises this frame's fields to binary.
   * @param _version - The ID3v2 version (unused).
   * @returns A {@link ByteVector} containing the encoded frame fields.
   */
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
