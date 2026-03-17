import { ByteVector, StringType } from "../byteVector.js";
import type { File } from "../file.js";
import { AsfPicture } from "./asfPicture.js";
import { readWORD, readDWORD, readQWORD, readString, renderString } from "./asfUtils.js";

// ---------------------------------------------------------------------------
// AsfAttributeType
// ---------------------------------------------------------------------------

export enum AsfAttributeType {
  UnicodeType = 0,
  BytesType = 1,
  BoolType = 2,
  DWordType = 3,
  QWordType = 4,
  WordType = 5,
  GuidType = 6,
}

// ---------------------------------------------------------------------------
// AsfAttribute
// ---------------------------------------------------------------------------

export class AsfAttribute {
  private _type: AsfAttributeType = AsfAttributeType.UnicodeType;
  private _stringValue = "";
  private _byteVectorValue = new ByteVector();
  private _pictureValue: AsfPicture = AsfPicture.fromInvalid();
  private _numericValue = 0n;
  private _stream = 0;
  private _language = 0;

  // -- Constructors (static factories) --

  /** Empty Unicode attribute. */
  constructor() {}

  static fromString(value: string): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.UnicodeType;
    a._stringValue = value;
    return a;
  }

  static fromByteVector(value: ByteVector): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.BytesType;
    a._byteVectorValue = value;
    return a;
  }

  static fromPicture(value: AsfPicture): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.BytesType;
    a._pictureValue = value;
    return a;
  }

  static fromUInt(value: number): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.DWordType;
    a._numericValue = BigInt(value >>> 0);
    return a;
  }

  static fromULongLong(value: bigint): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.QWordType;
    a._numericValue = value;
    return a;
  }

  static fromUShort(value: number): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.WordType;
    a._numericValue = BigInt(value & 0xFFFF);
    return a;
  }

  static fromBool(value: boolean): AsfAttribute {
    const a = new AsfAttribute();
    a._type = AsfAttributeType.BoolType;
    a._numericValue = value ? 1n : 0n;
    return a;
  }

  // -- Accessors --

  get type(): AsfAttributeType { return this._type; }

  toString(): string { return this._stringValue; }

  toByteVector(): ByteVector {
    if (this._pictureValue.isValid) return this._pictureValue.render();
    return this._byteVectorValue;
  }

  toBool(): number { return this._numericValue !== 0n ? 1 : 0; }
  toUShort(): number { return Number(this._numericValue & 0xFFFFn); }
  toUInt(): number { return Number(this._numericValue & 0xFFFFFFFFn); }
  toULongLong(): bigint { return this._numericValue; }

  toPicture(): AsfPicture { return this._pictureValue; }

  get language(): number { return this._language; }
  set language(value: number) { this._language = value; }

  get stream(): number { return this._stream; }
  set stream(value: number) { this._stream = value; }

  // -- Parsing --

  /**
   * Parse an attribute from an ASF file.
   * @param kind 0 = extended content descriptor, 1 = metadata, 2 = metadata library
   * @returns the attribute name
   */
  async parse(file: File, kind = 0): Promise<string> {
    let size: number;
    let nameLength: number;
    let name: string;

    this._pictureValue = AsfPicture.fromInvalid();

    if (kind === 0) {
      // Extended content descriptor
      nameLength = (await readWORD(file)).value;
      name = await readString(file, nameLength);
      this._type = (await readWORD(file)).value as AsfAttributeType;
      size = (await readWORD(file)).value;
    } else {
      // Metadata or metadata library
      const temp = (await readWORD(file)).value;
      if (kind === 2) {
        this._language = temp;
      }
      this._stream = (await readWORD(file)).value;
      nameLength = (await readWORD(file)).value;
      this._type = (await readWORD(file)).value as AsfAttributeType;
      size = (await readDWORD(file)).value;
      name = await readString(file, nameLength);
    }

    switch (this._type) {
      case AsfAttributeType.WordType:
        this._numericValue = BigInt((await readWORD(file)).value);
        break;

      case AsfAttributeType.BoolType:
        if (kind === 0) {
          this._numericValue = (await readDWORD(file)).value !== 0 ? 1n : 0n;
        } else {
          this._numericValue = (await readWORD(file)).value !== 0 ? 1n : 0n;
        }
        break;

      case AsfAttributeType.DWordType:
        this._numericValue = BigInt((await readDWORD(file)).value);
        break;

      case AsfAttributeType.QWordType:
        this._numericValue = (await readQWORD(file)).value;
        break;

      case AsfAttributeType.UnicodeType:
        this._stringValue = await readString(file, size);
        break;

      case AsfAttributeType.BytesType:
      case AsfAttributeType.GuidType:
        this._byteVectorValue = await file.readBlock(size);
        break;
    }

    if (this._type === AsfAttributeType.BytesType && name === "WM/Picture") {
      this._pictureValue = AsfPicture.create();
      this._pictureValue.parse(this._byteVectorValue);
      if (this._pictureValue.isValid) {
        this._byteVectorValue = new ByteVector();
      }
    }

    return name;
  }

  // -- Data size --

  get dataSize(): number {
    switch (this._type) {
      case AsfAttributeType.WordType: return 2;
      case AsfAttributeType.BoolType:
      case AsfAttributeType.DWordType: return 4;
      case AsfAttributeType.QWordType: return 8;
      case AsfAttributeType.UnicodeType:
        return ByteVector.fromString(this._stringValue, StringType.UTF16LE).length + 2;
      case AsfAttributeType.BytesType:
        if (this._pictureValue.isValid) return this._pictureValue.dataSize;
        return this._byteVectorValue.length;
      case AsfAttributeType.GuidType:
        return this._byteVectorValue.length;
    }
    return 0;
  }

  // -- Rendering --

  render(name: string, kind = 0): ByteVector {
    let data = new ByteVector();

    switch (this._type) {
      case AsfAttributeType.WordType:
        data = ByteVector.fromUShort(this.toUShort(), false);
        break;
      case AsfAttributeType.BoolType:
        if (kind === 0) {
          data = ByteVector.fromUInt(this.toBool(), false);
        } else {
          data = ByteVector.fromUShort(this.toBool(), false);
        }
        break;
      case AsfAttributeType.DWordType:
        data = ByteVector.fromUInt(this.toUInt(), false);
        break;
      case AsfAttributeType.QWordType:
        data = ByteVector.fromLongLong(this.toULongLong(), false);
        break;
      case AsfAttributeType.UnicodeType:
        data = renderString(this._stringValue);
        break;
      case AsfAttributeType.BytesType:
        if (this._pictureValue.isValid) {
          data = this._pictureValue.render();
        } else {
          data = ByteVector.fromByteVector(this._byteVectorValue);
        }
        break;
      case AsfAttributeType.GuidType:
        data = ByteVector.fromByteVector(this._byteVectorValue);
        break;
    }

    if (kind === 0) {
      const nameRendered = renderString(name, true);
      const typeBytes = ByteVector.fromUShort(this._type, false);
      const sizeBytes = ByteVector.fromUShort(data.length, false);
      const result = ByteVector.fromByteVector(nameRendered);
      result.append(typeBytes);
      result.append(sizeBytes);
      result.append(data);
      return result;
    } else {
      const nameData = renderString(name);
      const langBytes = ByteVector.fromUShort(kind === 2 ? this._language : 0, false);
      const streamBytes = ByteVector.fromUShort(this._stream, false);
      const nameLenBytes = ByteVector.fromUShort(nameData.length, false);
      const typeBytes = ByteVector.fromUShort(this._type, false);
      const dataSizeBytes = ByteVector.fromUInt(data.length, false);
      const result = ByteVector.fromByteVector(langBytes);
      result.append(streamBytes);
      result.append(nameLenBytes);
      result.append(typeBytes);
      result.append(dataSizeBytes);
      result.append(nameData);
      result.append(data);
      return result;
    }
  }
}
