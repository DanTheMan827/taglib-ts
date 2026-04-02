/** @packageDocumentation ID3v2 URL link frames (W*** and WXXX). Store hyperlinks related to the audio content. */
import { ByteVector, StringType } from "../../../byteVector.js";
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
  nullTerminatorSize,
} from "../id3v2Frame.js";

/**
 * URL link frame (W*** except WXXX).
 *
 * Structure: url (Latin1 text, no encoding byte, no null terminator).
 */
export class UrlLinkFrame extends Id3v2Frame {
  /** The URL string stored in this frame. Populated lazily from `_rawData`. */
  private _url: string = "";
  /** Deferred raw field bytes from `fromData()`; cleared after first parse. */
  private _rawData: ByteVector | undefined;

  /**
   * Creates a new URL link frame with the given four-byte frame identifier.
   * @param frameId - The four-byte ID3v2 frame identifier (e.g. `WCOM`).
   */
  constructor(frameId: ByteVector) {
    const header = new Id3v2FrameHeader(frameId);
    super(header);
  }

  // -- Accessors --------------------------------------------------------------

  /** Gets the URL stored in this frame. Triggers lazy parsing if needed. */
  get url(): string {
    this._parseRawData();
    return this._url;
  }

  /** Sets the URL stored in this frame. Triggers lazy parsing if needed. */
  set url(value: string) {
    this._parseRawData();
    this._url = value;
  }

  /**
   * Returns the URL string.
   * @returns The URL stored in this frame.
   */
  toString(): string {
    return this.url;
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): UrlLinkFrame {
    const frame = new UrlLinkFrame(header.frameId);
    frame._header = header;
    frame._rawData = Id3v2Frame.fieldData(data, header, version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  /**
   * Stores the raw field bytes for lazy parsing.
   * @param data - Raw field bytes for this frame.
   * @param _version - The ID3v2 version (unused).
   */
  protected parseFields(data: ByteVector, _version: number): void {
    this._rawData = data;
  }

  /**
   * Serialises the URL to binary using Latin1 encoding.
   * @param _version - The ID3v2 version (unused).
   * @returns A {@link ByteVector} containing the Latin1-encoded URL.
   */
  protected renderFields(_version: number): ByteVector {
    this._parseRawData();
    return ByteVector.fromString(this._url, StringType.Latin1);
  }

  // -- Private ----------------------------------------------------------------

  /** Materialises the lazily-deferred raw field data into `_url`. */
  private _parseRawData(): void {
    if (this._rawData === undefined) return;
    const data = this._rawData;
    this._rawData = undefined;
    this._url = data.toString(StringType.Latin1);
  }
}

/**
 * User URL link frame (WXXX).
 *
 * Structure: encoding(1) + description(null-terminated in encoding) + url.
 */
export class UserUrlLinkFrame extends UrlLinkFrame {
  /** Text encoding used for the description field. */
  private _encoding: StringType = StringType.UTF8;
  /** Short content description identifying this WXXX frame among others. */
  private _description: string = "";
  /** Deferred raw WXXX field bytes from `fromRawData()`; cleared after first parse. */
  private _rawWxxxData: ByteVector | undefined;

  /**
   * Creates a new user URL link frame (WXXX).
   * @param encoding - The text encoding to use for the description. Defaults to UTF-8.
   */
  constructor(encoding: StringType = StringType.UTF8) {
    super(ByteVector.fromString("WXXX", StringType.Latin1));
    this._encoding = encoding;
  }

  /** Gets the text encoding used for the description field. Triggers lazy parsing if needed. */
  get encoding(): StringType {
    this._parseWxxxRaw();
    return this._encoding;
  }

  /** Sets the text encoding used for the description field. Triggers lazy parsing if needed. */
  set encoding(e: StringType) {
    this._parseWxxxRaw();
    this._encoding = e;
  }

  /** Gets the content description for this WXXX frame. Triggers lazy parsing if needed. */
  get description(): string {
    this._parseWxxxRaw();
    return this._description;
  }

  /** Sets the content description for this WXXX frame. Triggers lazy parsing if needed. */
  set description(value: string) {
    this._parseWxxxRaw();
    this._description = value;
  }

  // -- Static -----------------------------------------------------------------

  /**
   * Creates a {@link UserUrlLinkFrame} from raw frame data read from a tag.
   * @param data - The full raw frame bytes.
   * @param header - The already-parsed frame header.
   * @param version - The ID3v2 version of the containing tag.
   * @returns A new {@link UserUrlLinkFrame} with deferred field parsing.
   */
  static fromRawData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): UserUrlLinkFrame {
    const frame = new UserUrlLinkFrame();
    frame._header = header;
    frame._rawWxxxData = Id3v2Frame.fieldData(data, header, version);
    return frame;
  }

  static find(
    tag: { frames?: Id3v2Frame[] },
    description: string,
  ): UserUrlLinkFrame | null {
    if (!tag.frames) return null;
    for (const frame of tag.frames) {
      if (
        frame instanceof UserUrlLinkFrame &&
        frame.description === description
      ) {
        return frame;
      }
    }
    return null;
  }

  // -- Protected --------------------------------------------------------------

  protected override renderFields(_version: number): ByteVector {
    this._parseWxxxRaw();
    const v = new ByteVector();
    v.append(this._encoding);
    v.append(ByteVector.fromString(this._description, this._encoding));
    // Null terminator
    if (
      this._encoding === StringType.UTF16 ||
      this._encoding === StringType.UTF16BE ||
      this._encoding === StringType.UTF16LE
    ) {
      v.append(ByteVector.fromSize(2, 0));
    } else {
      v.append(0);
    }
    v.append(ByteVector.fromString(this.url, StringType.Latin1));
    return v;
  }

  // -- Private ----------------------------------------------------------------

  private _parseWxxxRaw(): void {
    if (this._rawWxxxData === undefined) return;
    const data = this._rawWxxxData;
    this._rawWxxxData = undefined;

    if (data.length < 1) return;

    this._encoding = data.get(0) as StringType;
    const ntSize = nullTerminatorSize(this._encoding);
    const descEnd = findNullTerminator(data, this._encoding, 1);

    if (descEnd < 0) {
      this._description = data.mid(1).toString(this._encoding);
    } else {
      this._description = data
        .mid(1, descEnd - 1)
        .toString(this._encoding);
      // URL is always Latin1
      this.url = data.mid(descEnd + ntSize).toString(StringType.Latin1);
    }
  }
}
