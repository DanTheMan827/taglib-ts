import { ByteVector } from "../byteVector.js";

export enum VariantType {
  Void,
  Bool,
  Int,
  UInt,
  LongLong,
  ULongLong,
  Double,
  String,
  StringList,
  ByteVector,
  ByteVectorList,
  VariantList,
  VariantMap,
}

export type VariantMap = Map<string, Variant>;
export type VariantList = Variant[];

/**
 * A discriminated-union value that can hold any of the types enumerated
 * by VariantType. Used for complex metadata properties.
 */
export class Variant {
  private _type: VariantType;
  private _value: unknown;

  private constructor(type: VariantType, value: unknown) {
    this._type = type;
    this._value = value;
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  static fromVoid(): Variant {
    return new Variant(VariantType.Void, undefined);
  }

  static fromBool(v: boolean): Variant {
    return new Variant(VariantType.Bool, v);
  }

  static fromInt(v: number): Variant {
    // Truncate to 32-bit signed integer via bitwise OR
    return new Variant(VariantType.Int, v | 0);
  }

  static fromUInt(v: number): Variant {
    return new Variant(VariantType.UInt, v >>> 0);
  }

  static fromLongLong(v: bigint): Variant {
    return new Variant(VariantType.LongLong, v);
  }

  static fromULongLong(v: bigint): Variant {
    return new Variant(VariantType.ULongLong, v);
  }

  static fromDouble(v: number): Variant {
    return new Variant(VariantType.Double, v);
  }

  static fromString(v: string): Variant {
    return new Variant(VariantType.String, v);
  }

  static fromStringList(v: string[]): Variant {
    return new Variant(VariantType.StringList, [...v]);
  }

  static fromByteVector(v: ByteVector): Variant {
    return new Variant(VariantType.ByteVector, ByteVector.fromByteVector(v));
  }

  static fromByteVectorList(v: ByteVector[]): Variant {
    return new Variant(
      VariantType.ByteVectorList,
      v.map((bv) => ByteVector.fromByteVector(bv)),
    );
  }

  static fromList(v: VariantList): Variant {
    return new Variant(VariantType.VariantList, [...v]);
  }

  static fromMap(v: VariantMap): Variant {
    return new Variant(VariantType.VariantMap, new Map(v));
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  type(): VariantType {
    return this._type;
  }

  isEmpty(): boolean {
    return this._type === VariantType.Void;
  }

  // ---------------------------------------------------------------------------
  // Conversion methods
  // ---------------------------------------------------------------------------

  toBool(): boolean {
    if (this._type === VariantType.Bool) {
      return this._value as boolean;
    }
    return false;
  }

  toInt(): number {
    switch (this._type) {
      case VariantType.Int:
      case VariantType.UInt:
      case VariantType.Double:
        return this._value as number;
      case VariantType.LongLong:
      case VariantType.ULongLong:
        return Number(this._value as bigint);
      case VariantType.Bool:
        return (this._value as boolean) ? 1 : 0;
      default:
        return 0;
    }
  }

  toDouble(): number {
    switch (this._type) {
      case VariantType.Double:
      case VariantType.Int:
      case VariantType.UInt:
        return this._value as number;
      case VariantType.LongLong:
      case VariantType.ULongLong:
        return Number(this._value as bigint);
      default:
        return 0;
    }
  }

  toLongLong(): bigint {
    switch (this._type) {
      case VariantType.LongLong:
      case VariantType.ULongLong:
        return this._value as bigint;
      case VariantType.Int:
      case VariantType.UInt:
        return BigInt(this._value as number);
      default:
        return 0n;
    }
  }

  toString(): string {
    switch (this._type) {
      case VariantType.String:
        return this._value as string;
      case VariantType.Bool:
        return (this._value as boolean) ? "true" : "false";
      case VariantType.Int:
      case VariantType.UInt:
      case VariantType.Double:
        return String(this._value);
      case VariantType.LongLong:
      case VariantType.ULongLong:
        return (this._value as bigint).toString();
      default:
        return "";
    }
  }

  toStringList(): string[] {
    if (this._type === VariantType.StringList) {
      return [...(this._value as string[])];
    }
    if (this._type === VariantType.String) {
      return [this._value as string];
    }
    return [];
  }

  toByteVector(): ByteVector {
    if (this._type === VariantType.ByteVector) {
      return ByteVector.fromByteVector(this._value as ByteVector);
    }
    return new ByteVector();
  }

  toByteVectorList(): ByteVector[] {
    if (this._type === VariantType.ByteVectorList) {
      return (this._value as ByteVector[]).map((bv) =>
        ByteVector.fromByteVector(bv),
      );
    }
    if (this._type === VariantType.ByteVector) {
      return [ByteVector.fromByteVector(this._value as ByteVector)];
    }
    return [];
  }

  toList(): VariantList {
    if (this._type === VariantType.VariantList) {
      return [...(this._value as VariantList)];
    }
    return [];
  }

  toMap(): VariantMap {
    if (this._type === VariantType.VariantMap) {
      return new Map(this._value as VariantMap);
    }
    return new Map();
  }
}
