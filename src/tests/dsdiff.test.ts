import { describe, expect, it } from "vitest";
import { DsdiffFile, DsdiffTagType } from "../dsdiff/dsdiffFile.js";
import { ByteVectorStream } from "../toolkit/byteVectorStream.js";
import { ReadStyle } from "../toolkit/types.js";
import { openTestStream, readTestData } from "./testHelper.js";

async function openDsdiffFile(filename: string, readProperties = true, readStyle = ReadStyle.Average): Promise<DsdiffFile> {
  const stream = openTestStream(filename);
  return await DsdiffFile.open(stream, readProperties, readStyle);
}

describe("DSDIFF", () => {
  it("testProperties", async () => {
    // C++: test_dsdiff.cpp – TestDSDIFF::testProperties
    const f = await openDsdiffFile("empty10ms.dff");
    const props = f.audioProperties();
    expect(props).not.toBeNull();
    if (props) {
      expect(props.lengthInSeconds).toBe(0);
      expect(props.lengthInMilliseconds).toBe(10);
      expect(props.bitrate).toBe(5644);
      expect(props.channels).toBe(2);
      expect(props.sampleRate).toBe(2822400);
      expect(props.bitsPerSample).toBe(1);
      expect(props.sampleCount).toBe(28224n);
    }
  });

  it("testTags", async () => {
    // C++: test_dsdiff.cpp – TestDSDIFF::testTags
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
    // C++: test_dsdiff.cpp – TestDSDIFF::testSaveID3v2
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

    // Also test creating ID3v2 tag directly
    f3.id3v2Tag(true)!.title = "TitleXXX";
    await f3.save();
    expect(f3.hasID3v2Tag).toBe(true);

    await stream.seek(0);
    const f4 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f4.hasID3v2Tag).toBe(true);
    expect(f4.tag().title).toBe("TitleXXX");
  });

  it("testSaveID3v23", async () => {
    // C++: test_dsdiff.cpp – TestDSDIFF::testSaveID3v23
    const data = readTestData("empty10ms.dff");
    const stream = new ByteVectorStream(data);
    const f = await DsdiffFile.open(stream, true, ReadStyle.Average);

    expect(f.hasID3v2Tag).toBe(false);

    const xxx = "X".repeat(254);
    f.tag().title = xxx;
    f.tag().artist = "Artist A";
    await f.save(/* version= */ 3);
    expect(f.hasID3v2Tag).toBe(true);

    await stream.seek(0);
    const f2 = await DsdiffFile.open(stream, true, ReadStyle.Average);
    expect(f2.id3v2Tag()!.header.majorVersion).toBe(3);
    expect(f2.tag().artist).toBe("Artist A");
    expect(f2.tag().title).toBe(xxx);
  });

  it("testStrip", async () => {
    // C++: test_dsdiff.cpp – TestDSDIFF::testStrip (all three sub-cases)
    // Sub-case 1: strip all tags
    {
      const data = readTestData("empty10ms.dff");
      const stream = new ByteVectorStream(data);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        f.id3v2Tag(true)!.artist = "X";
        f.diinTag(true)!.artist = "Y";
        await f.save();
      }
      await stream.seek(0);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        expect(f.hasID3v2Tag).toBe(true);
        expect(f.hasDIINTag).toBe(true);
        await f.strip();
      }
      await stream.seek(0);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        expect(f.hasID3v2Tag).toBe(false);
        expect(f.hasDIINTag).toBe(false);
      }
    }

    // Sub-case 2: strip only ID3v2
    {
      const data = readTestData("empty10ms.dff");
      const stream = new ByteVectorStream(data);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        f.id3v2Tag(true);
        f.diinTag(true);
        f.tag().artist = "X";
        await f.save();
      }
      await stream.seek(0);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        expect(f.hasID3v2Tag).toBe(true);
        expect(f.hasDIINTag).toBe(true);
        await f.strip(DsdiffTagType.ID3v2);
      }
      await stream.seek(0);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        expect(f.hasID3v2Tag).toBe(false);
        expect(f.hasDIINTag).toBe(true);
      }
    }

    // Sub-case 3: strip only DIIN
    {
      const data = readTestData("empty10ms.dff");
      const stream = new ByteVectorStream(data);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        f.tag().artist = "X";
        await f.save();
      }
      await stream.seek(0);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        expect(f.hasID3v2Tag).toBe(true);
        expect(f.hasDIINTag).toBe(true);
        await f.strip(DsdiffTagType.DIIN);
      }
      await stream.seek(0);
      {
        const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
        expect(f.hasID3v2Tag).toBe(true);
        expect(f.hasDIINTag).toBe(false);
      }
    }
  });

  it("testRepeatedSave", async () => {
    // C++: test_dsdiff.cpp – TestDSDIFF::testRepeatedSave
    const orig = readTestData("empty10ms.dff");
    const stream = new ByteVectorStream(new Uint8Array(orig));

    {
      const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
      expect(await f.fileLength()).toBe(7186);
      expect(f.tag().title).toBe("");
      f.tag().title = "NEW TITLE";
      await f.save();
      expect(f.tag().title).toBe("NEW TITLE");
      f.tag().title = "NEW TITLE 2";
      await f.save();
      expect(f.tag().title).toBe("NEW TITLE 2");
      expect(await f.fileLength()).toBe(8292);
      await f.save();
      expect(await f.fileLength()).toBe(8292);
    }

    await stream.seek(0);
    {
      const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
      expect(f.tag().title).toBe("NEW TITLE 2");
      await f.strip();
      expect(await f.fileLength()).toBe(7186);
    }

    // Verify stripped file is byte-identical to the original
    const stripped = new Uint8Array((stream as ByteVectorStream).data().data);
    expect(stripped).toEqual(new Uint8Array(orig));
  });

  it("testSaveDiin", async () => {
    // C++: test_dsdiff.cpp – TestDSDIFF::testSaveDiin
    const data = readTestData("empty10ms.dff");
    const stream = new ByteVectorStream(data);

    {
      const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
      expect(f.hasID3v2Tag).toBe(false);
      expect(f.hasDIINTag).toBe(false);

      const tag = f.diinTag(true)!;
      tag.artist = "DIIN Artist";
      tag.title = "DIIN Title";
      // album not supported by DIIN tag (silently ignored)
      await f.save();
    }

    await stream.seek(0);
    {
      const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
      expect(f.hasID3v2Tag).toBe(false);
      expect(f.hasDIINTag).toBe(true);

      const tag = f.diinTag(false)!;
      expect(tag.artist).toBe("DIIN Artist");
      expect(tag.title).toBe("DIIN Title");
      expect(tag.album).toBe("");
      expect(tag.comment).toBe("");
      expect(tag.genre).toBe("");
      expect(tag.year).toBe(0);
      expect(tag.track).toBe(0);

      const props = f.properties();
      expect(props.size).toBe(2);
      expect(props.get("ARTIST")?.toString()).toBe("DIIN Artist");
      expect(props.get("TITLE")?.toString()).toBe("DIIN Title");

      tag.artist = "";
      tag.title = "";
      await f.save();
    }

    await stream.seek(0);
    {
      const f = await DsdiffFile.open(stream, true, ReadStyle.Average);
      expect(f.hasID3v2Tag).toBe(false);
      expect(f.hasDIINTag).toBe(false);
    }
  });
});

