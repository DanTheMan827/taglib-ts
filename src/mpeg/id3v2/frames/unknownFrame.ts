import { ByteVector, StringType } from '../../../byteVector.js';
import { Id3v2Frame, Id3v2FrameHeader } from '../id3v2Frame.js';

/**
 * Unknown frame – used for any frame type that we don't have a specific parser for.
 */
export class UnknownFrame extends Id3v2Frame {
  private _data: ByteVector;

  constructor(frameId: ByteVector, data?: ByteVector) {
    const header = new Id3v2FrameHeader(frameId);
    super(header);
    this._data = data ?? new ByteVector();
  }

  get data(): ByteVector {
    return this._data;
  }

  toString(): string {
    return this._header.frameId.toString(StringType.Latin1);
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): UnknownFrame {
    const fieldData = Id3v2Frame.fieldData(data, header, version);
    const frame = new UnknownFrame(header.frameId, fieldData);
    frame._header = header;
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    this._data = data;
  }

  protected renderFields(_version: number): ByteVector {
    return this._data;
  }
}
