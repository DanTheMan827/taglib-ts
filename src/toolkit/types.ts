export type offset_t = number;

export enum Position {
  Beginning = 0,
  Current = 1,
  End = 2,
}

export enum ReadStyle {
  Fast = 0,
  Average = 1,
  Accurate = 2,
}

export enum StripTags {
  StripNone = 0x0000,
  StripOthers = 0xffff,
}

export enum DuplicateTags {
  Duplicate = 0x0001,
  DoNotDuplicate = 0x0000,
}
