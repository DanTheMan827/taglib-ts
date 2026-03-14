import { ByteVector, StringType } from '../../../byteVector.js';
import {
  Id3v2Frame,
  Id3v2FrameHeader,
  findNullTerminator,
} from '../id3v2Frame.js';

/**
 * Ownership frame (OWNE).
 *
 * Structure: encoding(1) + pricePaid(null-terminated Latin1)
 *            + datePurchased(8 bytes YYYYMMDD) + seller(in encoding).
 */
export class OwnershipFrame extends Id3v2Frame {
  private _encoding: StringType = StringType.UTF8;
  private _pricePaid: string = '';
  private _datePurchased: string = '';
  private _seller: string = '';

  constructor(encoding: StringType = StringType.UTF8) {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString('OWNE', StringType.Latin1),
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

  get pricePaid(): string {
    return this._pricePaid;
  }

  set pricePaid(value: string) {
    this._pricePaid = value;
  }

  /** Date purchased as YYYYMMDD string. */
  get datePurchased(): string {
    return this._datePurchased;
  }

  set datePurchased(value: string) {
    this._datePurchased = value;
  }

  get seller(): string {
    return this._seller;
  }

  set seller(value: string) {
    this._seller = value;
  }

  toString(): string {
    return `${this._seller} ${this._datePurchased} ${this._pricePaid}`;
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): OwnershipFrame {
    const frame = new OwnershipFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    if (data.length < 1) return;

    this._encoding = data.get(0) as StringType;
    let offset = 1;

    // Price paid: null-terminated Latin1
    const priceEnd = findNullTerminator(data, StringType.Latin1, offset);
    if (priceEnd < 0) return;
    this._pricePaid = data.mid(offset, priceEnd - offset).toString(StringType.Latin1);
    offset = priceEnd + 1;

    // Date purchased: 8 bytes (YYYYMMDD)
    if (offset + 8 > data.length) return;
    this._datePurchased = data.mid(offset, 8).toString(StringType.Latin1);
    offset += 8;

    // Seller: remaining in encoding
    if (offset < data.length) {
      this._seller = data.mid(offset).toString(this._encoding);
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(this._encoding);
    v.append(ByteVector.fromString(this._pricePaid, StringType.Latin1));
    v.append(0); // null terminator
    // Ensure date is exactly 8 bytes
    const dateStr = this._datePurchased.padEnd(8, ' ').slice(0, 8);
    v.append(ByteVector.fromString(dateStr, StringType.Latin1));
    v.append(ByteVector.fromString(this._seller, this._encoding));
    return v;
  }
}
