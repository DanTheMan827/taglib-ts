/** @file OGG FLAC file format tests — ported from taglib/tests/test_oggflac.cpp */

import { describe, expect, it } from "vitest";
import { OggFlacFile } from "../ogg/flac/oggFlacFile.js";
import { ByteVectorStream } from "../toolkit/byteVectorStream.js";
import { ReadStyle } from "../toolkit/types.js";
import { openTestStream, readTestData } from "./testHelper.js";

/** Build a reproducible ASCII string of exactly `length` characters (matches C++ `longText`). */
function longText(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_";
  let t = "";
  for (let i = 0; i < length; i++) t += chars[i % chars.length];
  return t;
}

describe("OGG FLAC", () => {
  it("testFramingBit", async () => {
    // C++: test_oggflac.cpp – TestOggFLAC::testFramingBit
    const data = readTestData("empty_flac.oga");
    const stream = new ByteVectorStream(data);

    {
      const f = await OggFlacFile.open(stream, true, ReadStyle.Average);
      f.tag()!.artist = "The Artist";
      await f.save();
    }

    await stream.seek(0);
    {
      const f = await OggFlacFile.open(stream, true, ReadStyle.Average);
      expect(f.tag()!.artist).toBe("The Artist");

      expect(await f.fileLength()).toBe(9134);
    }
  });

  it("testFuzzedFile", async () => {
    // C++: test_oggflac.cpp – TestOggFLAC::testFuzzedFile
    const stream = openTestStream("segfault.oga");
    const f = await OggFlacFile.open(stream, true, ReadStyle.Average);
    expect(f.isValid).toBe(false);
  });

  it("testSplitPackets", async () => {
    // C++: test_oggflac.cpp – TestOggFLAC::testSplitPackets
    const text = longText(128 * 1024);

    // Phase 1: write large title
    const data = readTestData("empty_flac.oga");
    const stream = new ByteVectorStream(data);
    {
      const f = await OggFlacFile.open(stream, true, ReadStyle.Average);
      f.tag()!.title = text;
      await f.save();
    }

    await stream.seek(0);
    {
      const f = await OggFlacFile.open(stream, true, ReadStyle.Average);
      expect(f.isValid).toBe(true);
      expect(await f.fileLength()).toBe(141141);
      expect((await f.lastPageHeader())?.sequenceNumber).toBe(21);
      expect((await f.packet(0)).length).toBe(51);
      expect((await f.packet(1)).length).toBe(131126);
      expect((await f.packet(2)).length).toBe(22);
      expect((await f.packet(3)).length).toBe(8196);
      expect(f.tag()!.title).toBe(text);
      expect(f.audioProperties()?.lengthInMilliseconds).toBe(3705);

      // Phase 2: shrink back to small title
      f.tag()!.title = "ABCDE";
      await f.save();
    }

    await stream.seek(0);
    {
      const f = await OggFlacFile.open(stream, true, ReadStyle.Average);
      expect(f.isValid).toBe(true);
      expect(await f.fileLength()).toBe(9128);
      expect((await f.lastPageHeader())?.sequenceNumber).toBe(5);
      expect((await f.packet(0)).length).toBe(51);
      expect((await f.packet(1)).length).toBe(59);
      expect((await f.packet(2)).length).toBe(22);
      expect((await f.packet(3)).length).toBe(8196);
      expect(f.tag()!.title).toBe("ABCDE");
      expect(f.audioProperties()?.lengthInMilliseconds).toBe(3705);
    }
  });
});
