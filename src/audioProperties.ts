import { ReadStyle } from "./toolkit/types.js";

/**
 * Abstract base class providing common audio properties such as length,
 * bitrate, sample rate, and channel count.
 */
export abstract class AudioProperties {
  protected _readStyle: ReadStyle;

  constructor(readStyle: ReadStyle = ReadStyle.Average) {
    this._readStyle = readStyle;
  }

  /** Duration rounded to the nearest second. */
  get lengthInSeconds(): number {
    return Math.round(this.lengthInMilliseconds / 1000);
  }

  abstract get lengthInMilliseconds(): number;

  get bitrate(): number {
    return 0;
  }

  get sampleRate(): number {
    return 0;
  }

  abstract get channels(): number;
}
