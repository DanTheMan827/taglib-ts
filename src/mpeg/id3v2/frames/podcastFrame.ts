import { ByteVector, StringType } from '../../../byteVector.js';
import { Id3v2Frame, Id3v2FrameHeader } from '../id3v2Frame.js';

/**
 * Podcast frame (PCST) – an iTunes-specific marker frame.
 *
 * This is a simple frame with a fixed 4-byte payload of 0x00000000.
 */
export class PodcastFrame extends Id3v2Frame {
  constructor() {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString('PCST', StringType.Latin1),
    );
    super(header);
  }

  toString(): string {
    return 'PCST';
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): PodcastFrame {
    // We ignore the payload – it's always 0x00000000
    Id3v2Frame.fieldData(data, header, version);
    const frame = new PodcastFrame();
    frame._header = header;
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(_data: ByteVector, _version: number): void {
    // Nothing to parse
  }

  protected renderFields(_version: number): ByteVector {
    return ByteVector.fromSize(4, 0);
  }
}
