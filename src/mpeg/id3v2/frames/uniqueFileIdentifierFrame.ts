import { ByteVector, StringType } from "../../../byteVector.js";
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
} from "../id3v2Frame.js";

/**
 * Unique file identifier frame (UFID).
 *
 * Structure: owner(null-terminated Latin1) + identifier(bytes).
 */
export class UniqueFileIdentifierFrame extends Id3v2Frame {
  private _owner: string = "";
  private _identifier: ByteVector = new ByteVector();

  constructor(owner?: string, identifier?: ByteVector) {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString("UFID", StringType.Latin1),
    );
    super(header);
    if (owner !== undefined) this._owner = owner;
    if (identifier !== undefined) this._identifier = identifier;
  }

  // -- Accessors --------------------------------------------------------------

  get owner(): string {
    return this._owner;
  }

  set owner(value: string) {
    this._owner = value;
  }

  get identifier(): ByteVector {
    return this._identifier;
  }

  set identifier(data: ByteVector) {
    this._identifier = data;
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
  ): UniqueFileIdentifierFrame {
    const frame = new UniqueFileIdentifierFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    const nullIdx = findNullTerminator(data, StringType.Latin1, 0);
    if (nullIdx < 0) {
      this._owner = data.toString(StringType.Latin1);
      this._identifier = new ByteVector();
    } else {
      this._owner = data.mid(0, nullIdx).toString(StringType.Latin1);
      this._identifier = data.mid(nullIdx + 1);
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(ByteVector.fromString(this._owner, StringType.Latin1));
    v.append(0); // null terminator
    v.append(this._identifier);
    return v;
  }
}
