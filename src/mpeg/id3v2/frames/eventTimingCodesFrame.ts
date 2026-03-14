import { ByteVector, StringType } from '../../../byteVector.js';
import { Id3v2Frame, Id3v2FrameHeader } from '../id3v2Frame.js';

/** Synched event types for the ETCO frame. */
export enum EventType {
  Padding = 0x00,
  EndOfInitialSilence = 0x01,
  IntroStart = 0x02,
  MainPartStart = 0x03,
  OutroStart = 0x04,
  OutroEnd = 0x05,
  VerseStart = 0x06,
  RefrainStart = 0x07,
  InterludeStart = 0x08,
  ThemeStart = 0x09,
  VariationStart = 0x0a,
  KeyChange = 0x0b,
  TimeChange = 0x0c,
  MomentaryUnwantedNoise = 0x0d,
  SustainedNoise = 0x0e,
  SustainedNoiseEnd = 0x0f,
  IntroEnd = 0x10,
  MainPartEnd = 0x11,
  VerseEnd = 0x12,
  RefrainEnd = 0x13,
  ThemeEnd = 0x14,
  Profanity = 0x15,
  ProfanityEnd = 0x16,
  NotPredefinedSynch0 = 0xe0,
  NotPredefinedSynch1 = 0xe1,
  NotPredefinedSynch2 = 0xe2,
  NotPredefinedSynch3 = 0xe3,
  NotPredefinedSynch4 = 0xe4,
  NotPredefinedSynch5 = 0xe5,
  NotPredefinedSynch6 = 0xe6,
  NotPredefinedSynch7 = 0xe7,
  NotPredefinedSynch8 = 0xe8,
  NotPredefinedSynch9 = 0xe9,
  NotPredefinedSynchA = 0xea,
  NotPredefinedSynchB = 0xeb,
  NotPredefinedSynchC = 0xec,
  NotPredefinedSynchD = 0xed,
  NotPredefinedSynchE = 0xee,
  NotPredefinedSynchF = 0xef,
  AudioEnd = 0xfd,
  AudioFileEnds = 0xfe,
}

export interface SynchedEvent {
  time: number;
  type: EventType;
}

/**
 * Event timing codes frame (ETCO).
 *
 * Structure: timestampFormat(1) + repeated (eventType(1) + timestamp(4 big-endian)).
 */
export class EventTimingCodesFrame extends Id3v2Frame {
  private _timestampFormat: number = 2; // default: milliseconds
  private _synchedEvents: SynchedEvent[] = [];

  constructor() {
    const header = new Id3v2FrameHeader(
      ByteVector.fromString('ETCO', StringType.Latin1),
    );
    super(header);
  }

  // -- Accessors --------------------------------------------------------------

  /** 1 = MPEG frames, 2 = milliseconds. */
  get timestampFormat(): number {
    return this._timestampFormat;
  }

  set timestampFormat(v: number) {
    this._timestampFormat = v;
  }

  get synchedEvents(): SynchedEvent[] {
    return this._synchedEvents;
  }

  set synchedEvents(events: SynchedEvent[]) {
    this._synchedEvents = events;
  }

  toString(): string {
    return `ETCO: ${this._synchedEvents.length} events`;
  }

  // -- Static -----------------------------------------------------------------

  /** @internal Create from raw frame data. */
  static fromData(
    data: ByteVector,
    header: Id3v2FrameHeader,
    version: number,
  ): EventTimingCodesFrame {
    const frame = new EventTimingCodesFrame();
    frame._header = header;
    frame.parseFields(Id3v2Frame.fieldData(data, header, version), version);
    return frame;
  }

  // -- Protected --------------------------------------------------------------

  protected parseFields(data: ByteVector, _version: number): void {
    if (data.length < 1) return;

    this._timestampFormat = data.get(0);
    this._synchedEvents = [];

    let offset = 1;
    while (offset + 5 <= data.length) {
      const type = data.get(offset) as EventType;
      const time = data.mid(offset + 1, 4).toUInt();
      this._synchedEvents.push({ type, time });
      offset += 5;
    }
  }

  protected renderFields(_version: number): ByteVector {
    const v = new ByteVector();
    v.append(this._timestampFormat);

    for (const event of this._synchedEvents) {
      v.append(event.type & 0xff);
      v.append(ByteVector.fromUInt(event.time));
    }

    return v;
  }
}
