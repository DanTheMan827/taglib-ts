/**
 * Encodes a TagLib version as major.minor.patch and provides a combined
 * integer representation for easy comparison.
 */
export class VersionNumber {
  private _major: number;
  private _minor: number;
  private _patch: number;

  constructor(major: number, minor: number, patch: number = 0) {
    this._major = major;
    this._minor = minor;
    this._patch = patch;
  }

  /** Combined version: (major << 16) | (minor << 8) | patch */
  combinedVersion(): number {
    return ((this._major & 0xff) << 16) | ((this._minor & 0xff) << 8) | (this._patch & 0xff);
  }

  majorVersion(): number {
    return this._major;
  }

  minorVersion(): number {
    return this._minor;
  }

  patchVersion(): number {
    return this._patch;
  }

  toString(): string {
    return `${this._major}.${this._minor}.${this._patch}`;
  }
}

/** Returns the current TagLib runtime version (2.0.0). */
export function runtimeVersion(): VersionNumber {
  return new VersionNumber(2, 0, 0);
}
