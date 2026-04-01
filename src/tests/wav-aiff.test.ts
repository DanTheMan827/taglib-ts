import { describe, expect, it } from "vitest";
import { AiffFile } from "../riff/aiff/aiffFile.js";
import { WavFile } from "../riff/wav/wavFile.js";
import { ByteVectorStream } from "../toolkit/byteVectorStream.js";
import { ReadStyle } from "../toolkit/types.js";
import { openTestStream, readTestData } from "./testHelper.js";

describe("WAV", () => {
  it("should read empty wav file", async () => {
    const stream = openTestStream("empty.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      expect(props.sampleRate).toBeGreaterThan(0);
      expect(props.channels).toBeGreaterThan(0);
      expect(props.bitsPerSample).toBeGreaterThan(0);
    }
  });

  it("should read alaw wav file", async () => {
    const stream = openTestStream("alaw.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should read float64 wav file", async () => {
    const stream = openTestStream("float64.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    if (props) {
      expect(props.bitsPerSample).toBe(64);
    }
  });

  it("should read uint8we wav file", async () => {
    const stream = openTestStream("uint8we.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should read pcm_with_fact_chunk wav file", async () => {
    const stream = openTestStream("pcm_with_fact_chunk.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should read duplicate tags wav file", async () => {
    const stream = openTestStream("duplicate_tags.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should handle invalid chunk wav file", async () => {
    const stream = openTestStream("invalid-chunk.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f).toBeDefined();
  });

  it("should handle segfault wav", async () => {
    const stream = openTestStream("segfault.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f).toBeDefined();
  });

  it("should handle zero-size-chunk wav", async () => {
    const stream = openTestStream("zero-size-chunk.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f).toBeDefined();
  });

  it("should handle infloop wav", async () => {
    const stream = openTestStream("infloop.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f).toBeDefined();
  });

  it("should save and re-read", async () => {
    const data = readTestData("empty.wav");
    const stream = new ByteVectorStream(data);
    const f = await WavFile.open(stream, true, ReadStyle.Average);

    if (f.isValid && f.id3v2Tag) {
      f.id3v2Tag.title = "WAV Test";
      await f.save();
    }

    await stream.seek(0);
    const f2 = await WavFile.open(stream, true, ReadStyle.Average);
    if (f2.isValid && f2.id3v2Tag) {
      expect(f2.id3v2Tag.title).toBe("WAV Test");
    }
  });
});

describe("AIFF", () => {
  it("should read empty aiff file", async () => {
    const stream = openTestStream("empty.aiff");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      expect(props.sampleRate).toBeGreaterThan(0);
      expect(props.channels).toBeGreaterThan(0);
    }
  });

  it("should report correct audio properties for empty.aiff", async () => {
    const stream = openTestStream("empty.aiff");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      // Values verified against C++ TagLib:
      // 2941 sample frames at 44100 Hz, SSND data 5882 bytes (with padding).
      // Exact (unrounded) duration used for bitrate to match C++ reference.
      expect(props.sampleRate).toBe(44100);
      expect(props.channels).toBe(1);
      expect(props.bitsPerSample).toBe(16);
      expect(props.lengthInMilliseconds).toBe(67);
      expect(props.bitrate).toBe(706);
    }
  });

  it("should read noise aif file", async () => {
    const stream = openTestStream("noise.aif");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should read noise_odd aif file", async () => {
    const stream = openTestStream("noise_odd.aif");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should read duplicate_id3v2 aiff file", async () => {
    const stream = openTestStream("duplicate_id3v2.aiff");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should handle segfault aif", async () => {
    const stream = openTestStream("segfault.aif");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f).toBeDefined();
  });

  it("should handle excessive alloc aif", async () => {
    const stream = openTestStream("excessive_alloc.aif");
    const f = await AiffFile.open(stream, true, ReadStyle.Average);
    expect(f).toBeDefined();
  });
});
