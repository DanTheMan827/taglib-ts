/**
 * @file Variant discriminated-union type for complex metadata properties.
 */

import { ByteVector } from "../byteVector.js";

/** Discriminant tag for the {@link Variant} union. */
export enum VariantType {
  /** No value (null/undefined equivalent). */
  Void,
  /** Boolean value. */
  Bool,
  /** 32-bit signed integer. */
  Int,
  /** 32-bit unsigned integer. */
  UInt,
  /** 64-bit signed integer (`bigint`). */
  LongLong,
  /** 64-bit unsigned integer (`bigint`). */
  ULongLong,
  /** IEEE-754 double-precision float. */
  Double,
  /** UTF-16 string. */
  String,
  /** Ordered list of strings. */
  StringList,
  /** Raw binary data. */
  ByteVector,
  /** Ordered list of raw binary buffers. */
  ByteVectorList,
  /** Ordered list of {@link Variant} values. */
  VariantList,
  /** String-keyed map of {@link Variant} values. */
  VariantMap,
}

/** A string-keyed map whose values are {@link Variant} instances. */
export type VariantMap = Map<string, Variant>;

/** An ordered list of {@link Variant} instances. */
export type VariantList = Variant[];

/**
 * A discriminated-union value that can hold any of the types enumerated
 * by VariantType. Used for complex metadata properties.
 */
export class Variant {
  /** Active type discriminant. */
  private _type: VariantType;

  /** The stored value; its runtime type matches `_type`. */
  private _value: unknown;

  /**
   * @param type  - Discriminant identifying the stored type.
   * @param value - The actual value to store.
   */
  private constructor(type: VariantType, value: unknown) {
    this._type = type;
    this._value = value;
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  /** Creates a void (empty) Variant. */
  static fromVoid(): Variant {
    return new Variant(VariantType.Void, undefined);
  }

  /**
   * @param v - Boolean value to store.
   */
  static fromBool(v: boolean): Variant {
    return new Variant(VariantType.Bool, v);
  }

  /**
   * Stores `v` truncated to a 32-bit signed integer.
   *
   * @param v - Number to store as a signed 32-bit integer.
   */
  static fromInt(v: number): Variant {
    // Truncate to 32-bit signed integer via bitwise OR
    return new Variant(VariantType.Int, v | 0);
  }

  /**
   * @param v - Number to store as an unsigned 32-bit integer.
   */
  static fromUInt(v: number): Variant {
    return new Variant(VariantType.UInt, v >>> 0);
  }

  /**
   * @param v - `bigint` to store as a signed 64-bit integer.
   */
  static fromLongLong(v: bigint): Variant {
    return new Variant(VariantType.LongLong, v);
  }

  /**
   * @param v - `bigint` to store as an unsigned 64-bit integer.
   */
  static fromULongLong(v: bigint): Variant {
    return new Variant(VariantType.ULongLong, v);
  }

  /**
   * @param v - Number to store as a double-precision float.
   */
  static fromDouble(v: number): Variant {
    return new Variant(VariantType.Double, v);
  }

  /**
   * @param v - String to store.
   */
  static fromString(v: string): Variant {
    return new Variant(VariantType.String, v);
  }

  /**
   * Stores a copy of the provided string array.
   *
   * @param v - String list to store.
   */
  static fromStringList(v: string[]): Variant {
    return new Variant(VariantType.StringList, [...v]);
  }

  /**
   * Stores a copy of the provided {@link ByteVector}.
   *
   * @param v - Binary data to store.
   */
  static fromByteVector(v: ByteVector): Variant {
    return new Variant(VariantType.ByteVector, ByteVector.fromByteVector(v));
  }

  /**
   * Stores copies of each {@link ByteVector} in the list.
   *
   * @param v - List of binary buffers to store.
   */
  static fromByteVectorList(v: ByteVector[]): Variant {
    return new Variant(
      VariantType.ByteVectorList,
      v.map(bv => ByteVector.fromByteVector(bv)),
    );
  }

  /**
   * Stores a shallow copy of the provided {@link VariantList}.
   *
   * @param v - List of Variant values to store.
   */
  static fromList(v: VariantList): Variant {
    return new Variant(VariantType.VariantList, [...v]);
  }

  /**
   * Stores a shallow copy of the provided {@link VariantMap}.
   *
   * @param v - Map of Variant values to store.
   */
  static fromMap(v: VariantMap): Variant {
    return new Variant(VariantType.VariantMap, new Map(v));
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Returns the active {@link VariantType} discriminant. */
  type(): VariantType {
    return this._type;
  }

  /** Returns `true` when the variant holds no value (`Void`). */
  isEmpty(): boolean {
    return this._type === VariantType.Void;
  }

  // ---------------------------------------------------------------------------
  // Conversion methods
  // ---------------------------------------------------------------------------

  /**
   * Returns the stored value as a boolean.
   * Returns `false` if the type is not {@link VariantType.Bool}.
   */
  toBool(): boolean {
    if (this._type === VariantType.Bool) {
      return this._value as boolean;
    }
    return false;
  }

  /**
   * Returns the stored value as a JavaScript number.
   * Numeric types are coerced; all other types return `0`.
   */
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

  /**
   * Returns the stored value as a double-precision float.
   * Numeric types are coerced; all other types return `0`.
   */
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

  /**
   * Returns the stored value as a `bigint`.
   * Integer `bigint` types are returned directly; JS number types are
   * promoted via `BigInt()`; all other types return `0n`.
   */
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

  /**
   * Returns the stored value as a string.
   * Scalar types are stringified; non-scalar types return `""`.
   */
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

  /**
   * Returns the stored value as a string array.
   * A single `String` value is wrapped in a one-element array.
   * All other types return `[]`.
   */
  toStringList(): string[] {
    if (this._type === VariantType.StringList) {
      return [...(this._value as string[])];
    }
    if (this._type === VariantType.String) {
      return [this._value as string];
    }
    return [];
  }

  /**
   * Returns a copy of the stored {@link ByteVector}.
   * Returns an empty `ByteVector` for all other types.
   */
  toByteVector(): ByteVector {
    if (this._type === VariantType.ByteVector) {
      return ByteVector.fromByteVector(this._value as ByteVector);
    }
    return new ByteVector();
  }

  /**
   * Returns copies of the stored {@link ByteVector} list.
   * A single `ByteVector` value is wrapped in a one-element array.
   * All other types return `[]`.
   */
  toByteVectorList(): ByteVector[] {
    if (this._type === VariantType.ByteVectorList) {
      return (this._value as ByteVector[]).map(bv =>
        ByteVector.fromByteVector(bv),
      );
    }
    if (this._type === VariantType.ByteVector) {
      return [ByteVector.fromByteVector(this._value as ByteVector)];
    }
    return [];
  }

  /**
   * Returns a shallow copy of the stored {@link VariantList}.
   * Returns `[]` for all other types.
   */
  toList(): VariantList {
    if (this._type === VariantType.VariantList) {
      return [...(this._value as VariantList)];
    }
    return [];
  }

  /**
   * Returns a shallow copy of the stored {@link VariantMap}.
   * Returns an empty `Map` for all other types.
   */
  toMap(): VariantMap {
    if (this._type === VariantType.VariantMap) {
      return new Map(this._value as VariantMap);
    }
    return new Map();
  }
}
