import { describe, it, expect } from "vitest";
import { DsdiffFile } from "../src/dsdiff/dsdiffFile.js";
import { ByteVectorStream } from "../src/toolkit/byteVectorStream.js";
import { ReadStyle } from "../src/toolkit/types.js";
import { openTestStream, readTestData } from "./testHelper.js";

async function openDsdiffFile(filename: string, readProperties = true, readStyle = ReadStyle.Average): Promise<DsdiffFile> {
  const stream = openTestStream(filename);
  return await DsdiffFile.open(stream, readProperties, readStyle);
}

describe("DSDIFF", () => {
  it("testProperties", async () => {
    const f = await openDsdiffFile("empty10ms.dff");
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      expect(props.lengthInMilliseconds).toBe(10);
      expect(props.bitrate).toBe(5644);
      expect(props.channels).toBe(2);
      expect(props.sampleRate).toBe(2822400);
      expect(props.bitsPerSample).toBe(1);
      expect(props.sampleCount).toBe(28224n);
    }
  });

  it("testTags", async () => {
    const data = readTestData("empty10ms.dff");
    const stream = new ByteVectorStream(data);
    const f = await DsdiffFile.open(stream, true, ReadStyle.Average);

    expect(f.tag().artist).toBe("");
    f.tag().artist = "The Artist";
    await f.save();

    await stream.seek(0);
    const f2 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f2.tag().artist).toBe("The Artist");
  });

  it("testSaveID3v2", async () => {
    const data = readTestData("empty10ms.dff");
    const stream = new ByteVectorStream(data);
    const f = await DsdiffFile.open(stream, true, ReadStyle.Average);

    expect(f.hasID3v2Tag).toBe(false);
    f.tag().title = "TitleXXX";
    await f.save();
    expect(f.hasID3v2Tag).toBe(true);

    await stream.seek(0);
    const f2 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f2.hasID3v2Tag).toBe(true);
    expect(f2.tag().title).toBe("TitleXXX");

    f2.tag().title = "";
    await f2.save();

    await stream.seek(0);
    const f3 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f3.hasID3v2Tag).toBe(false);
  });

  it("testStrip", async () => {
    const data = readTestData("empty10ms.dff");
    const stream = new ByteVectorStream(data);
    const f = await DsdiffFile.open(stream, true, ReadStyle.Average);

    f.tag().artist = "X";
    await f.save();

    await stream.seek(0);
    const f2 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f2.hasID3v2Tag).toBe(true);
    expect(f2.tag().artist).toBe("X");

    // Clear tags by setting empty values
    f2.tag().artist = "";
    f2.tag().title = "";
    await f2.save();

    await stream.seek(0);
    const f3 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f3.hasID3v2Tag).toBe(false);
  });
});
