import { describe, expect, it } from "vitest";
import { WavFile } from "../riff/wav/wavFile.js";
import { ByteVector, StringType } from "../byteVector.js";
import { ByteVectorStream } from "../toolkit/byteVectorStream.js";
import { ReadStyle } from "../toolkit/types.js";
import { openTestStream, readTestDataBV } from "./testHelper.js";

describe("WAV", () => {
  it("should test PCM properties", async () => {
    // TypeScript-only test
    const stream = openTestStream("empty.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    expect(props?.lengthInSeconds).toBe(3);
    expect(props?.lengthInMilliseconds).toBe(3675);
    expect(props?.bitrate).toBe(32);
    expect(props?.channels).toBe(2);
    expect(props?.sampleRate).toBe(1000);
    expect(props?.bitsPerSample).toBe(16);
    expect(props?.sampleFrames).toBe(3675);
    expect(props?.format).toBe(1);
  });

  it("should test ALAW properties", async () => {
    // TypeScript-only test
    const stream = openTestStream("alaw.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    expect(props?.lengthInSeconds).toBe(3);
    expect(props?.lengthInMilliseconds).toBe(3550);
    expect(props?.bitrate).toBe(128);
    expect(props?.channels).toBe(2);
    expect(props?.sampleRate).toBe(8000);
    expect(props?.bitsPerSample).toBe(8);
    expect(props?.sampleFrames).toBe(28400);
    expect(props?.format).toBe(6);
  });

  it("should test float64 properties", async () => {
    // TypeScript-only test
    const stream = openTestStream("float64.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    expect(props?.lengthInSeconds).toBe(0);
    expect(props?.lengthInMilliseconds).toBe(97);
    expect(props?.bitrate).toBe(5645);
    expect(props?.channels).toBe(2);
    expect(props?.sampleRate).toBe(44100);
    expect(props?.bitsPerSample).toBe(64);
    expect(props?.sampleFrames).toBe(4281);
    expect(props?.format).toBe(3);
  });

  it("should test float properties without fact chunk", async () => {
    // TypeScript-only test
    // Remove the fact chunk by renaming it (change 'fact' to 'fakt')
    const wavData = readTestDataBV("float64.wav");
    expect(wavData.mid(36, 4).toString()).toBe("fact");
    wavData.set(38, 0x6b); // 'k'
    const stream = new ByteVectorStream(wavData);
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    expect(props?.lengthInSeconds).toBe(0);
    expect(props?.lengthInMilliseconds).toBe(97);
    expect(props?.bitrate).toBe(5645);
    expect(props?.channels).toBe(2);
    expect(props?.sampleRate).toBe(44100);
    expect(props?.bitsPerSample).toBe(64);
    expect(props?.sampleFrames).toBe(4281);
    expect(props?.format).toBe(3);
  });

  it("should test WAVE_FORMAT_EXTENSIBLE properties", async () => {
    // TypeScript-only test
    const stream = openTestStream("uint8we.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    expect(props?.lengthInSeconds).toBe(2);
    expect(props?.lengthInMilliseconds).toBe(2937);
    expect(props?.bitrate).toBe(128);
    expect(props?.channels).toBe(2);
    expect(props?.sampleRate).toBe(8000);
    expect(props?.bitsPerSample).toBe(8);
    expect(props?.sampleFrames).toBe(23493);
    expect(props?.format).toBe(1);
  });

  it("should test PCM with fact chunk properties", async () => {
    // TypeScript-only test
    const stream = openTestStream("pcm_with_fact_chunk.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    expect(props?.lengthInSeconds).toBe(3);
    expect(props?.lengthInMilliseconds).toBe(3675);
    expect(props?.bitrate).toBe(32);
    expect(props?.channels).toBe(2);
    expect(props?.sampleRate).toBe(1000);
    expect(props?.bitsPerSample).toBe(16);
    expect(props?.sampleFrames).toBe(3675);
    expect(props?.format).toBe(1);
  });

  it("should handle zero-size data chunk", async () => {
    // TypeScript-only test
    const stream = openTestStream("zero-size-chunk.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should save and re-read ID3v2 tag", async () => {
    // TypeScript-only test
    const wavData = readTestDataBV("empty.wav");
    const stream = new ByteVectorStream(wavData);
    let f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasId3v2Tag).toBe(false);

    f.id3v2Tag!.title = "Title";
    f.id3v2Tag!.artist = "Artist";
    await f.save();
    expect(f.hasId3v2Tag).toBe(true);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasId3v2Tag).toBe(true);
    expect(f.id3v2Tag?.title).toBe("Title");
    expect(f.id3v2Tag?.artist).toBe("Artist");

    f.id3v2Tag!.title = "";
    f.id3v2Tag!.artist = "";
    await f.save();
    expect(f.hasId3v2Tag).toBe(false);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasId3v2Tag).toBe(false);
    expect(f.id3v2Tag?.title).toBe("");
    expect(f.id3v2Tag?.artist).toBe("");
  });

  it("should save ID3v2 v3 tag", async () => {
    // TypeScript-only test
    const wavData = readTestDataBV("empty.wav");
    const stream = new ByteVectorStream(wavData);
    const xxx = "X".repeat(254);

    let f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.hasId3v2Tag).toBe(false);
    f.id3v2Tag!.title = xxx;
    f.id3v2Tag!.artist = "Artist A";
    await f.save(3);
    expect(f.hasId3v2Tag).toBe(true);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.id3v2Tag?.header?.majorVersion).toBe(3);
    expect(f.id3v2Tag?.artist).toBe("Artist A");
    expect(f.id3v2Tag?.title).toBe(xxx);
  });

  it("should save and re-read INFO tag", async () => {
    // TypeScript-only test
    const wavData = readTestDataBV("empty.wav");
    const stream = new ByteVectorStream(wavData);
    let f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasInfoTag).toBe(false);

    f.infoTag!.title = "Title";
    f.infoTag!.artist = "Artist";
    await f.save();
    expect(f.hasInfoTag).toBe(true);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasInfoTag).toBe(true);
    expect(f.infoTag?.title).toBe("Title");
    expect(f.infoTag?.artist).toBe("Artist");

    f.infoTag!.title = "";
    f.infoTag!.artist = "";
    await f.save();
    expect(f.hasInfoTag).toBe(false);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasInfoTag).toBe(false);
    expect(f.infoTag?.title).toBe("");
    expect(f.infoTag?.artist).toBe("");
  });

  it("should handle duplicate tags", async () => {
    // TypeScript-only test
    const stream = openTestStream("duplicate_tags.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);

    // duplicate_tags.wav has duplicate ID3v2/INFO tags.
    // title() returns "Title2" if can't skip the second tag.
    expect(f.hasId3v2Tag).toBe(true);
    expect(f.id3v2Tag?.title).toBe("Title1");

    expect(f.hasInfoTag).toBe(true);
    expect(f.infoTag?.title).toBe("Title1");

    await f.save();
    expect(await f.fileLength()).toBe(15898);
    expect(await f.find(ByteVector.fromString("Title2"))).toBe(-1);
  });

  it("should handle infloop (fuzzed) wav file", async () => {
    // TypeScript-only test
    const stream = openTestStream("infloop.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    const props = f.audioProperties();
    expect(props?.channels).toBe(1);
    expect(props?.bitrate).toBe(88);
    expect(props?.bitsPerSample).toBe(8);
    expect(props?.sampleRate).toBe(11025);
    expect(f.hasInfoTag).toBe(false);
    expect(f.hasId3v2Tag).toBe(false);
  });

  it("should handle segfault wav", async () => {
    // TypeScript-only test
    const stream = openTestStream("segfault.wav");
    const f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
  });

  it("should handle invalid chunk wav file", async () => {
    // C++: test_wav.cpp – TestWAV::testInvalidChunk
    const stream = openTestStream("invalid-chunk.wav");
    let f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.audioProperties()?.lengthInSeconds ?? 0).toBe(0);
    expect(f.hasId3v2Tag).toBe(true);

    f.id3v2Tag!.title = "Title";
    await f.save();

    // After saving, the ID3 chunk is appended after the invalid chunk.
    // On re-read, parsing stops at the invalid chunk name, so the
    // newly-appended ID3 chunk is unreachable.
    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.hasId3v2Tag).toBe(false);
  });

  it("should read and write BEXT chunk", async () => {
    // C++: test_wav.cpp – TestWAV::testBEXTTag
    const origData = readTestDataBV("empty.wav");
    const stream = new ByteVectorStream(origData);

    let f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasBextData).toBe(false);
    expect(f.bextData.isEmpty).toBe(true);

    f.bextData = ByteVector.fromString("test bext data", StringType.Latin1);
    await f.save();
    expect(f.hasBextData).toBe(true);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasBextData).toBe(true);
    expect(f.bextData.equals(ByteVector.fromString("test bext data", StringType.Latin1))).toBe(true);

    f.bextData = ByteVector.fromSize(0);
    await f.save();
    expect(f.hasBextData).toBe(false);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasBextData).toBe(false);
    expect(f.bextData.isEmpty).toBe(true);

    // File without BEXT should be byte-identical to original
    await stream.seek(0);
    const finalData = await stream.readBlock(await stream.length());
    expect(finalData.equals(origData)).toBe(true);
  });

  it("should preserve other tags when writing BEXT chunk", async () => {
    // C++: test_wav.cpp – TestWAV::testBEXTTagWithOtherTags
    const stream = new ByteVectorStream(readTestDataBV("empty.wav"));

    let f = await WavFile.open(stream, true, ReadStyle.Average);
    f.id3v2Tag!.title = "ID3v2 Title";
    f.infoTag.title = "INFO Title";
    f.bextData = ByteVector.fromString("bext payload", StringType.Latin1);
    await f.save();

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.hasId3v2Tag).toBe(true);
    expect(f.hasInfoTag).toBe(true);
    expect(f.hasBextData).toBe(true);
    expect(f.id3v2Tag?.title).toBe("ID3v2 Title");
    expect(f.infoTag.title).toBe("INFO Title");
    expect(f.bextData.equals(ByteVector.fromString("bext payload", StringType.Latin1))).toBe(true);
  });

  it("should read and write iXML chunk", async () => {
    // C++: test_wav.cpp – TestWAV::testiXMLTag
    const origData = readTestDataBV("empty.wav");
    const stream = new ByteVectorStream(origData);

    let f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasiXMLData).toBe(false);
    expect(f.iXMLData).toBe("");

    f.iXMLData = "<BWFXML><IXML_VERSION>1.0</IXML_VERSION></BWFXML>";
    await f.save();
    expect(f.hasiXMLData).toBe(true);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasiXMLData).toBe(true);
    expect(f.iXMLData).toBe("<BWFXML><IXML_VERSION>1.0</IXML_VERSION></BWFXML>");

    f.iXMLData = "";
    await f.save();
    expect(f.hasiXMLData).toBe(false);

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasiXMLData).toBe(false);
    expect(f.iXMLData).toBe("");

    // File without iXML should be byte-identical to original
    await stream.seek(0);
    const finalData = await stream.readBlock(await stream.length());
    expect(finalData.equals(origData)).toBe(true);
  });

  it("should preserve other tags when writing iXML chunk", async () => {
    // C++: test_wav.cpp – TestWAV::testiXMLTagWithOtherTags
    const stream = new ByteVectorStream(readTestDataBV("empty.wav"));

    let f = await WavFile.open(stream, true, ReadStyle.Average);
    f.id3v2Tag!.title = "ID3v2 Title";
    f.iXMLData = "<BWFXML><SCENE>1</SCENE></BWFXML>";
    f.bextData = ByteVector.fromString("bext data", StringType.Latin1);
    await f.save();

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.hasId3v2Tag).toBe(true);
    expect(f.hasiXMLData).toBe(true);
    expect(f.hasBextData).toBe(true);
    expect(f.id3v2Tag?.title).toBe("ID3v2 Title");
    expect(f.iXMLData).toBe("<BWFXML><SCENE>1</SCENE></BWFXML>");
    expect(f.bextData.equals(ByteVector.fromString("bext data", StringType.Latin1))).toBe(true);

    f.iXMLData = "";
    f.bextData = ByteVector.fromSize(0);
    f.strip();
    await f.save();

    await stream.seek(0);
    f = await WavFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(true);
    expect(f.hasId3v2Tag).toBe(false);
    expect(f.hasiXMLData).toBe(false);
    expect(f.iXMLData).toBe("");
    expect(f.hasBextData).toBe(false);
    expect(f.bextData.isEmpty).toBe(true);

    // File with all data removed should be byte-identical to original
    await stream.seek(0);
    const origData = readTestDataBV("empty.wav");
    const finalData = await stream.readBlock(await stream.length());
    expect(finalData.equals(origData)).toBe(true);
  });
});

