import { ByteVector, StringType } from '../../../byteVector.js';
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
} from '../id3v2Frame.js';

/**
 * Private frame (PRIV).
 *
 * Structure: owner(null-terminated Latin1) + data.
 */
export class PrivateFrame extends Id3v2Frame {
  private _owner: string = '';
  private _data: ByteVector = new ByteVector();

  constructor() {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString('PRIV', StringType.Latin1),
    );
    super(header);
  }

  // -- Accessors --------------------------------------------------------------

  get owner(): string {
    return this._owner;
  }

  set owner(value: string) {
    this._owner = value;
  }

  get data(): ByteVector {
    return this._data;
  }

  set data(value: ByteVector) {
    this._data = value;
  }

  get renderData(): ByteVector {
    return this._data;
  }

  toString(): string {
    return this._owner;
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): PrivateFrame {
    const frame = new PrivateFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    const nullIdx = findNullTerminator(data, StringType.Latin1, 0);
    if (nullIdx < 0) {
      this._owner = data.toString(StringType.Latin1);
      this._data = new ByteVector();
    } else {
      this._owner = data.mid(0, nullIdx).toString(StringType.Latin1);
      this._data = data.mid(nullIdx + 1);
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(ByteVector.fromString(this._owner, StringType.Latin1));
    v.append(0); // null terminator
    v.append(this._data);
    return v;
  }
}
