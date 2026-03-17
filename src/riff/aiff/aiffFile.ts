import { ByteVector } from "../../byteVector.js";
import { RiffFile } from "../riffFile.js";
import { AiffProperties } from "./aiffProperties.js";
import { Id3v2Tag } from "../../mpeg/id3v2/id3v2Tag.js";
import type { Tag } from "../../tag.js";
import type { ReadStyle } from "../../toolkit/types.js";
import type { IOStream } from "../../toolkit/ioStream.js";

/**
 * AIFF / AIFC file handler.
 *
 * AIFF is a big-endian RIFF-like container ("FORM" / "AIFF" or "AIFC"):
 *   "COMM" – common audio properties
 *   "SSND" – sound data
 *   "ID3 " / "id3 " – ID3v2 tag
 */
export class AiffFile extends RiffFile {
  private _properties: AiffProperties | null = null;
  private _id3v2Tag: Id3v2Tag | null = null;

  private constructor(stream: IOStream) {
    super(stream, /* bigEndian */ true);
  }

  static async open(
    stream: IOStream,
    readProperties: boolean = true,
    readStyle?: ReadStyle,
  ): Promise<AiffFile> {
    const file = new AiffFile(stream);
    await file.parseHeader();
    await file.read(readProperties, readStyle);
    return file;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  tag(): Tag | null {
    return this._id3v2Tag;
  }

  audioProperties(): AiffProperties | null {
    return this._properties;
  }

  get id3v2Tag(): Id3v2Tag | null {
    return this._id3v2Tag;
  }

  async save(): Promise<boolean> {
    if (this.readOnly) return false;

    if (this._id3v2Tag && !this._id3v2Tag.isEmpty) {
      const rendered = this._id3v2Tag.render();
      await this.setChunkData("ID3 ", rendered);
    } else {
      await this.removeChunk("ID3 ");
      await this.removeChunk("id3 ");
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------

  private async read(readProperties: boolean, readStyle?: ReadStyle): Promise<void> {
    let commData: ByteVector | null = null;
    let streamLength = 0;

    for (let i = 0; i < this.chunkCount; i++) {
      const name = this.chunkName(i);

      if (name === "COMM" && readProperties) {
        commData = await this.chunkData(i);
      } else if (name === "SSND" && readProperties) {
        streamLength = this.chunkDataSize(i);
      } else if (name === "ID3 " || name === "id3 ") {
        this._id3v2Tag = Id3v2Tag.readFrom(
          this._stream,
          this.chunkOffset(i),
        );
      }
    }

    // Ensure default tag exists
    if (!this._id3v2Tag) {
      this._id3v2Tag = new Id3v2Tag();
    }

    if (readProperties && commData) {
      this._properties = new AiffProperties(commData, streamLength, readStyle);
    }
  }
}
