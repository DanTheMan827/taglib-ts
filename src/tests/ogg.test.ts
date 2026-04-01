import { describe, expect, it } from "vitest";
import { OggOpusFile } from "../ogg/opus/opusFile.js";
import { OggSpeexFile } from "../ogg/speex/speexFile.js";
import { OggVorbisFile } from "../ogg/vorbis/vorbisFile.js";
import { ByteVectorStream } from "../toolkit/byteVectorStream.js";
import { ReadStyle } from "../toolkit/types.js";
import { openTestStream, readTestData } from "./testHelper.js";

describe("OGG Vorbis", () => {
  it("should read empty ogg file", async () => {
    const stream = openTestStream("empty.ogg");
    const f = await OggVorbisFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const tag = f.tag();
    expect(tag).not.toBeNull();
  });

  it("should read test ogg file", async () => {
    const stream = openTestStream("test.ogg");
    const f = await OggVorbisFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      expect(props.sampleRate).toBeGreaterThan(0);
      expect(props.channels).toBeGreaterThan(0);
    }
  });

  it("should report correct audio properties for test.ogg", async () => {
    const stream = openTestStream("test.ogg");
    const f = await OggVorbisFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      // Values verified against C++ TagLib and mediainfo:
      // The file has 162496 samples at 44100 Hz ≈ 3685 ms.
      // Bitrate excludes the three Vorbis header packets per the spec.
      expect(props.sampleRate).toBe(44100);
      expect(props.channels).toBe(2);
      expect(props.lengthInMilliseconds).toBe(3685);
      expect(props.bitrate).toBe(1);
    }
  });

  it("should read lowercase fields ogg", async () => {
    const stream = openTestStream("lowercase-fields.ogg");
    const f = await OggVorbisFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should read empty_vorbis.oga", async () => {
    const stream = openTestStream("empty_vorbis.oga");
    const f = await OggVorbisFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should save and re-read", async () => {
    const data = readTestData("empty.ogg");
    const stream = new ByteVectorStream(data);
    const f = await OggVorbisFile.open(stream, true, ReadStyle.Average);

    if (f.isValid) {
      const tag = f.tag();
      if (tag) {
        tag.title = "Ogg Test";
        tag.artist = "Test Artist";
        await f.save();
      }

      await stream.seek(0);
      const f2 = await OggVorbisFile.open(stream, true, ReadStyle.Average);
      const tag2 = f2.tag();
      if (tag2) {
        expect(tag2.title).toBe("Ogg Test");
        expect(tag2.artist).toBe("Test Artist");
      }
    }
  });
});

describe("OGG Opus", () => {
  it("should read opus file", async () => {
    const stream = openTestStream("correctness_gain_silent_output.opus");
    const f = await OggOpusFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      expect(props.sampleRate).toBe(48000); // Opus always 48kHz
      expect(props.channels).toBeGreaterThan(0);
    }
  });

  it("should report correct audio properties for correctness_gain_silent_output.opus", async () => {
    const stream = openTestStream("correctness_gain_silent_output.opus");
    const f = await OggOpusFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      // Values verified against C++ TagLib and mediainfo:
      // 371369 playable samples (371489 granules − 120 preSkip) at 48000 Hz ≈ 7737 ms.
      // Bitrate excludes the two mandatory Opus header packets per RFC 7845.
      expect(props.sampleRate).toBe(48000);
      expect(props.channels).toBe(1);
      expect(props.lengthInMilliseconds).toBe(7737);
      expect(props.bitrate).toBe(36);
    }
  });
});

describe("OGG Speex", () => {
  it("should read speex file", async () => {
    const stream = openTestStream("empty.spx");
    const f = await OggSpeexFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
  });

  it("should report correct audio properties for empty.spx", async () => {
    const stream = openTestStream("empty.spx");
    const f = await OggSpeexFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      // Values verified against C++ TagLib:
      // 162496 samples at 44100 Hz ≈ 3685 ms.
      // Bitrate excludes the two Speex header packets per the Speex spec.
      expect(props.sampleRate).toBe(44100);
      expect(props.channels).toBe(2);
      expect(props.lengthInMilliseconds).toBe(3685);
      expect(props.bitrate).toBe(53);
    }
  });
});
