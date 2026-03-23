/**
 * @file TagLib version number representation and runtime version accessor.
 */

/**
 * Encodes a TagLib version as major.minor.patch and provides a combined
 * integer representation for easy comparison.
 */
export class VersionNumber {
  /** Major version component. */
  private _major: number;

  /** Minor version component. */
  private _minor: number;

  /** Patch version component. */
  private _patch: number;

  /**
   * @param major - Major version number.
   * @param minor - Minor version number.
   * @param patch - Patch version number. Defaults to `0`.
   */
  constructor(major: number, minor: number, patch: number = 0) {
    this._major = major;
    this._minor = minor;
    this._patch = patch;
  }

  /** Combined version: (major << 16) | (minor << 8) | patch */
  combinedVersion(): number {
    return ((this._major & 0xff) << 16) | ((this._minor & 0xff) << 8) | (this._patch & 0xff);
  }

  /** Returns the major version component. */
  majorVersion(): number {
    return this._major;
  }

  /** Returns the minor version component. */
  minorVersion(): number {
    return this._minor;
  }

  /** Returns the patch version component. */
  patchVersion(): number {
    return this._patch;
  }

  /** Returns the version as a `"major.minor.patch"` string. */
  toString(): string {
    return `${this._major}.${this._minor}.${this._patch}`;
  }
}

/** Returns the current TagLib runtime version (2.0.0). */
export function runtimeVersion(): VersionNumber {
  return new VersionNumber(2, 0, 0);
}
