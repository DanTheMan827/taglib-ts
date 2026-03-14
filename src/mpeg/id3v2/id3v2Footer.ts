import { ByteVector } from "../../byteVector.js";
import { Id3v2Header } from "./id3v2Header.js";

/**
 * ID3v2 footer (v2.4 only).
 *
 * The footer is identical to the header except the file identifier is "3DI"
 * instead of "ID3". It allows a parser to find the tag when scanning from the
 * end of a file.
 */
export class Id3v2Footer {
  /** Footer is always 10 bytes (same as header). */
  static readonly size: number = 10;

  /** The footer file identifier "3DI". */
  static readonly fileIdentifier: ByteVector = ByteVector.fromString("3DI");

  constructor() {}

  /**
   * Render the footer from an existing header.
   * The rendered bytes are identical to the header except bytes 0-2 are "3DI".
   */
  render(header: Id3v2Header): ByteVector {
    const headerData = header.render();
    headerData.set(0, 0x33); // '3'
    headerData.set(1, 0x44); // 'D'
    headerData.set(2, 0x49); // 'I'
    return headerData;
  }
}
