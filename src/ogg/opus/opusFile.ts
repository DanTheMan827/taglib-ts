import { ByteVector, StringType } from "../../byteVector.js";
import { IOStream } from "../../toolkit/ioStream.js";
import { ReadStyle } from "../../toolkit/types.js";
import { XiphComment } from "../xiphComment.js";
import { OggFile } from "../oggFile.js";
import { OpusProperties } from "./opusProperties.js";

const OPUS_TAGS_HEADER = ByteVector.fromString(
  "OpusTags",
  StringType.Latin1,
);

/**
 * Implementation of an Ogg Opus file.
 *
 * Packet 0 — OpusHead identification header (for audio properties).
 * Packet 1 — OpusTags: "OpusTags" (8 bytes) + XiphComment data (no framing bit).
 */
export class OggOpusFile extends OggFile {
  private _tag: XiphComment;
  private _properties: OpusProperties | null = null;

  protected override get numHeaderPackets(): number { return 2; }

  private constructor(stream: IOStream) {
    super(stream);
    this._tag = new XiphComment();
  }

  static async open(
    stream: IOStream,
    readProperties: boolean = true,
    readStyle: ReadStyle = ReadStyle.Average,
  ): Promise<OggOpusFile> {
    const file = new OggOpusFile(stream);
    await file.read(readProperties, readStyle);
    return file;
  }

  tag(): XiphComment {
    return this._tag;
  }

  audioProperties(): OpusProperties | null {
    return this._properties;
  }

  override async save(): Promise<boolean> {
    if (this.readOnly) {
      return false;
    }

    // Re-render: "OpusTags" + rendered comment (no framing bit)
    const commentData = this._tag.render(false);
    const packet = new ByteVector();
    packet.append(ByteVector.fromString("OpusTags", StringType.Latin1));
    packet.append(commentData);
    this.setPacket(1, packet);

    return super.save();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async read(readProperties: boolean, readStyle: ReadStyle): Promise<void> {
    // Parse comment header (packet 1)
    const commentPacket = await this.packet(1);
    if (
      commentPacket.length > 8 &&
      commentPacket.startsWith(OPUS_TAGS_HEADER)
    ) {
      // XiphComment data starts after the 8-byte "OpusTags" prefix
      this._tag = XiphComment.readFrom(commentPacket, 8);
    }

    if (readProperties) {
      this._properties = await OpusProperties.create(this, readStyle);
    }
  }
}
