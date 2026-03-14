import { ByteVector, StringType } from "../byteVector.js";

// ---------------------------------------------------------------------------
// PictureType - same as ID3v2 APIC frame types
// ---------------------------------------------------------------------------

export enum AsfPictureType {
  Other = 0x00,
  FileIcon = 0x01,
  OtherFileIcon = 0x02,
  FrontCover = 0x03,
  BackCover = 0x04,
  LeafletPage = 0x05,
  Media = 0x06,
  LeadArtist = 0x07,
  Artist = 0x08,
  Conductor = 0x09,
  Band = 0x0a,
  Composer = 0x0b,
  Lyricist = 0x0c,
  RecordingLocation = 0x0d,
  DuringRecording = 0x0e,
  DuringPerformance = 0x0f,
  MovieScreenCapture = 0x10,
  ColouredFish = 0x11,
  Illustration = 0x12,
  BandLogo = 0x13,
  PublisherLogo = 0x14,
}

const pictureTypeNames: [AsfPictureType, string][] = [
  [AsfPictureType.Other, "Other"],
  [AsfPictureType.FileIcon, "File Icon"],
  [AsfPictureType.OtherFileIcon, "Other File Icon"],
  [AsfPictureType.FrontCover, "Front Cover"],
  [AsfPictureType.BackCover, "Back Cover"],
  [AsfPictureType.LeafletPage, "Leaflet Page"],
  [AsfPictureType.Media, "Media"],
  [AsfPictureType.LeadArtist, "Lead Artist"],
  [AsfPictureType.Artist, "Artist"],
  [AsfPictureType.Conductor, "Conductor"],
  [AsfPictureType.Band, "Band"],
  [AsfPictureType.Composer, "Composer"],
  [AsfPictureType.Lyricist, "Lyricist"],
  [AsfPictureType.RecordingLocation, "Recording Location"],
  [AsfPictureType.DuringRecording, "During Recording"],
  [AsfPictureType.DuringPerformance, "During Performance"],
  [AsfPictureType.MovieScreenCapture, "Movie Screen Capture"],
  [AsfPictureType.ColouredFish, "Coloured Fish"],
  [AsfPictureType.Illustration, "Illustration"],
  [AsfPictureType.BandLogo, "Band Logo"],
  [AsfPictureType.PublisherLogo, "Publisher Logo"],
];

export function pictureTypeToString(type: AsfPictureType): string {
  for (const [t, name] of pictureTypeNames) {
    if (t === type) return name;
  }
  return "Other";
}

export function pictureTypeFromString(str: string): AsfPictureType {
  const lower = str.toLowerCase();
  for (const [t, name] of pictureTypeNames) {
    if (name.toLowerCase() === lower) return t;
  }
  return AsfPictureType.Other;
}

// ---------------------------------------------------------------------------
// AsfPicture
// ---------------------------------------------------------------------------

export class AsfPicture {
  private _valid: boolean;
  private _type: AsfPictureType = AsfPictureType.Other;
  private _mimeType = "";
  private _description = "";
  private _picture = new ByteVector();

  private constructor(valid: boolean) {
    this._valid = valid;
  }

  /** Create a new valid empty picture. */
  static create(): AsfPicture {
    return new AsfPicture(true);
  }

  /** Create an invalid (sentinel) picture. */
  static fromInvalid(): AsfPicture {
    return new AsfPicture(false);
  }

  get isValid(): boolean { return this._valid; }

  get mimeType(): string { return this._mimeType; }
  set mimeType(value: string) { this._mimeType = value; }

  get type(): AsfPictureType { return this._type; }
  set type(value: AsfPictureType) { this._type = value; }

  get description(): string { return this._description; }
  set description(value: string) { this._description = value; }

  get picture(): ByteVector { return this._picture; }
  set picture(value: ByteVector) { this._picture = value; }

  get dataSize(): number {
    return 9 + (this._mimeType.length + this._description.length) * 2 + this._picture.length;
  }

  render(): ByteVector {
    if (!this._valid) return new ByteVector();

    const typeByte = ByteVector.fromByteArray(new Uint8Array([this._type]));
    const pictureSize = ByteVector.fromUInt(this._picture.length, false);
    const mimeStr = renderUTF16LEString(this._mimeType);
    const descStr = renderUTF16LEString(this._description);

    const result = ByteVector.fromByteVector(typeByte);
    result.append(pictureSize);
    result.append(mimeStr);
    result.append(descStr);
    result.append(this._picture);
    return result;
  }

  parse(bytes: ByteVector): void {
    this._valid = false;
    if (bytes.length < 9) return;

    let pos = 0;
    this._type = bytes.get(0) as AsfPictureType;
    pos++;

    const dataLen = bytes.toUInt(pos, false);
    pos += 4;

    const nullTerminator = ByteVector.fromByteArray(new Uint8Array([0, 0]));

    // Read mime type (null-terminated UTF-16LE)
    const mimeEnd = bytes.find(nullTerminator, pos, 2);
    if (mimeEnd < 0) return;
    this._mimeType = bytes.mid(pos, mimeEnd - pos).toString(StringType.UTF16LE);
    pos = mimeEnd + 2;

    // Read description (null-terminated UTF-16LE)
    const descEnd = bytes.find(nullTerminator, pos, 2);
    if (descEnd < 0) return;
    this._description = bytes.mid(pos, descEnd - pos).toString(StringType.UTF16LE);
    pos = descEnd + 2;

    if (dataLen + pos !== bytes.length) return;

    this._picture = bytes.mid(pos, dataLen);
    this._valid = true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderUTF16LEString(str: string): ByteVector {
  const encoded = ByteVector.fromString(str, StringType.UTF16LE);
  const result = ByteVector.fromByteVector(encoded);
  result.append(ByteVector.fromUShort(0, false));
  return result;
}
