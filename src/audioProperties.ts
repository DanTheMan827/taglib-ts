/** @file Abstract AudioProperties base class shared by all format-specific audio-properties implementations. */

import { ReadStyle } from "./toolkit/types.js";

/**
 * Abstract base class providing common audio properties such as length,
 * bitrate, sample rate, and channel count.
 */
export abstract class AudioProperties {
  /** The read style used when parsing the audio stream. */
  protected _readStyle: ReadStyle;

  /**
   * @param readStyle Controls the trade-off between parsing accuracy and
   *                  performance. Defaults to {@link ReadStyle.Average}.
   */
  constructor(readStyle: ReadStyle = ReadStyle.Average) {
    this._readStyle = readStyle;
  }

  /** Duration rounded to the nearest second. */
  get lengthInSeconds(): number {
    return Math.trunc(this.lengthInMilliseconds / 1000);
  }

  /** Exact duration in milliseconds. */
  abstract get lengthInMilliseconds(): number;

  /**
   * Average bitrate of the audio stream in kb/s.
   * Returns `0` if the value is not available.
   */
  get bitrate(): number {
    return 0;
  }

  /**
   * Sample rate of the audio stream in Hz.
   * Returns `0` if the value is not available.
   */
  get sampleRate(): number {
    return 0;
  }

  /** Number of audio channels (e.g. `1` for mono, `2` for stereo). */
  abstract get channels(): number;
}
