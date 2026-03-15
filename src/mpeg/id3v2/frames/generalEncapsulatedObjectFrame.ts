import { ByteVector, StringType } from "../../../byteVector.js";
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
  nullTerminatorSize,
} from "../id3v2Frame.js";

/**
 * General encapsulated object frame (GEOB).
 *
 * Structure: encoding(1) + mimeType(null-terminated Latin1)
 *            + fileName(null-terminated in encoding)
 *            + description(null-terminated in encoding) + objectData.
 */
export class GeneralEncapsulatedObjectFrame extends Id3v2Frame {
  private _encoding: StringType = StringType.UTF8;
  private _mimeType: string = "";
  private _fileName: string = "";
  private _description: string = "";
  private _object: ByteVector = new ByteVector();

  constructor(encoding: StringType = StringType.UTF8) {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString("GEOB", StringType.Latin1),
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

  get mimeType(): string {
    return this._mimeType;
  }

  set mimeType(value: string) {
    this._mimeType = value;
  }

  get fileName(): string {
    return this._fileName;
  }

  set fileName(value: string) {
    this._fileName = value;
  }

  get description(): string {
    return this._description;
  }

  set description(value: string) {
    this._description = value;
  }

  get object(): ByteVector {
    return this._object;
  }

  set object(data: ByteVector) {
    this._object = data;
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
  ): GeneralEncapsulatedObjectFrame {
    const frame = new GeneralEncapsulatedObjectFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    if (data.length < 1) return;

    this._encoding = data.get(0) as StringType;
    let offset = 1;

    // MIME type: null-terminated Latin1
    const mimeEnd = findNullTerminator(data, StringType.Latin1, offset);
    if (mimeEnd < 0) return;
    this._mimeType = data.mid(offset, mimeEnd - offset).toString(StringType.Latin1);
    offset = mimeEnd + 1;

    const ntSize = nullTerminatorSize(this._encoding);

    // File name: null-terminated in encoding
    const fnEnd = findNullTerminator(data, this._encoding, offset);
    if (fnEnd < 0) return;
    this._fileName = data
      .mid(offset, fnEnd - offset)
      .toString(this._encoding);
    offset = fnEnd + ntSize;

    // Description: null-terminated in encoding
    const descEnd = findNullTerminator(data, this._encoding, offset);
    if (descEnd < 0) {
      this._description = data.mid(offset).toString(this._encoding);
      this._object = new ByteVector();
    } else {
      this._description = data
        .mid(offset, descEnd - offset)
        .toString(this._encoding);
      this._object = data.mid(descEnd + ntSize);
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(this._encoding);

    // MIME type (Latin1, null-terminated)
    v.append(ByteVector.fromString(this._mimeType, StringType.Latin1));
    v.append(0);

    const ntBytes =
      this._encoding === StringType.UTF16 ||
      this._encoding === StringType.UTF16BE ||
      this._encoding === StringType.UTF16LE
        ? ByteVector.fromSize(2, 0)
        : ByteVector.fromSize(1, 0);

    // File name
    v.append(ByteVector.fromString(this._fileName, this._encoding));
    v.append(ntBytes);

    // Description
    v.append(ByteVector.fromString(this._description, this._encoding));
    v.append(ntBytes);

    // Object data
    v.append(this._object);

    return v;
  }
}
