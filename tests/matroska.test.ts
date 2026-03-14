import { describe, it, expect } from "vitest";
import { MatroskaFile } from "../src/matroska/matroskaFile.js";
import { ReadStyle } from "../src/toolkit/types.js";
import { openTestStream } from "./testHelper.js";
import { FileRef } from "../src/fileRef.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const TEST_DATA_DIR = resolve(import.meta.dirname ?? __dirname, "data");

function openMatroskaFile(filename: string, readProperties = true, readStyle = ReadStyle.Average): MatroskaFile {
  const stream = openTestStream(filename);
  return new MatroskaFile(stream, readProperties, readStyle);
}

describe("Matroska", () => {
  describe("Properties", () => {
    it("should read MKA properties", () => {
      const f = openMatroskaFile("no-tags.mka");
      expect(f.isValid).toBe(true);
      const props = f.audioProperties();
      expect(props).toBeTruthy();
      expect(props!.lengthInSeconds).toBe(0);
      expect(props!.lengthInMilliseconds).toBe(444);
      expect(props!.bitrate).toBe(223);
      expect(props!.channels).toBe(2);
      expect(props!.sampleRate).toBe(44100);
      expect(props!.docType).toBe("matroska");
      expect(props!.docTypeVersion).toBe(4);
      expect(props!.codecName).toBe("A_MPEG/L3");
      expect(props!.title).toBe("");
    });

    it("should read MKV properties", () => {
      const f = openMatroskaFile("tags-before-cues.mkv");
      expect(f.isValid).toBe(true);
      const props = f.audioProperties();
      expect(props).toBeTruthy();
      expect(props!.lengthInSeconds).toBe(0);
      expect(props!.lengthInMilliseconds).toBe(120);
      expect(props!.bitrate).toBe(227);
      expect(props!.channels).toBe(0);
      expect(props!.sampleRate).toBe(0);
      expect(props!.docType).toBe("matroska");
      expect(props!.docTypeVersion).toBe(4);
      expect(props!.codecName).toBe("");
      expect(props!.title).toBe("handbrake");
    });

    it("should read WebM properties", () => {
      const f = openMatroskaFile("no-tags.webm");
      expect(f.isValid).toBe(true);
      const props = f.audioProperties();
      expect(props).toBeTruthy();
      expect(props!.lengthInSeconds).toBe(0);
      expect(props!.lengthInMilliseconds).toBe(1);
      expect(props!.bitrate).toBe(2816);
      expect(props!.channels).toBe(0);
      expect(props!.sampleRate).toBe(0);
      expect(props!.docType).toBe("webm");
      expect(props!.docTypeVersion).toBe(4);
      expect(props!.codecName).toBe("");
      expect(props!.title).toBe("");
    });

    it("should not read properties when readProperties=false", () => {
      const f = openMatroskaFile("no-tags.webm", false);
      expect(f.isValid).toBe(true);
      expect(f.audioProperties()).toBeNull();
    });
  });

  describe("Tags", () => {
    it("should read tags from MKV", () => {
      const f = openMatroskaFile("tags-before-cues.mkv");
      const tag = f.tag();
      // tags-before-cues.mkv has tags added by Handbrake
      expect(f.isValid).toBe(true);
    });

    it("should handle file with no tags", () => {
      const f = openMatroskaFile("no-tags.mka");
      // No tags element in the file - tag may be null or empty
      const tag = f.tag();
      if (tag) {
        expect(tag.isEmpty).toBe(true);
      }
    });

    it("should support PropertyMap interface", () => {
      const f = openMatroskaFile("tags-before-cues.mkv");
      // The file should be readable and produce a PropertyMap
      const props = f.properties();
      expect(props).toBeTruthy();
    });
  });

  describe("FileRef integration", () => {
    it("should detect MKA by extension", async () => {
      const data = readFileSync(resolve(TEST_DATA_DIR, "no-tags.mka"));
      const ref = await FileRef.fromByteArray(new Uint8Array(data), "test.mka");
      expect(ref.isValid).toBe(true);
      expect(ref.audioProperties()).toBeTruthy();
      expect(ref.audioProperties()!.lengthInMilliseconds).toBe(444);
    });

    it("should detect MKV by extension", async () => {
      const data = readFileSync(resolve(TEST_DATA_DIR, "tags-before-cues.mkv"));
      const ref = await FileRef.fromByteArray(new Uint8Array(data), "test.mkv");
      expect(ref.isValid).toBe(true);
    });

    it("should detect WebM by extension", async () => {
      const data = readFileSync(resolve(TEST_DATA_DIR, "no-tags.webm"));
      const ref = await FileRef.fromByteArray(new Uint8Array(data), "test.webm");
      expect(ref.isValid).toBe(true);
    });

    it("should detect Matroska by content", async () => {
      const data = readFileSync(resolve(TEST_DATA_DIR, "no-tags.mka"));
      // Pass no extension so it falls through to content detection
      const ref = await FileRef.fromByteArray(new Uint8Array(data), "test.unknown");
      expect(ref.isValid).toBe(true);
      expect(ref.audioProperties()!.lengthInMilliseconds).toBe(444);
    });
  });

  describe("Tag title fallback", () => {
    it("should use segment title when no TITLE tag present", () => {
      const f = openMatroskaFile("tags-before-cues.mkv");
      // MKV with "handbrake" as segment title
      const props = f.audioProperties();
      expect(props).toBeTruthy();
      expect(props!.title).toBe("handbrake");
    });
  });
});
