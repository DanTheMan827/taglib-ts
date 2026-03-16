import { describe, it, expect, beforeEach } from "vitest";
import { ChunkedByteVectorStream } from "../src/toolkit/chunkedByteVectorStream.js";
import { ByteVector } from "../src/byteVector.js";
import { afterEach } from "node:test";

function bv(data: number[] | Uint8Array) {
  return new ByteVector(new Uint8Array(data));
}

describe("ChunkedByteVectorStream", () => {
  let stream: ChunkedByteVectorStream;

  beforeEach(() => {
    stream = new ChunkedByteVectorStream(...[1,2,3,4,5,6,7,8,9,10].map(n => new Uint8Array([n])));
  });

  afterEach(() => {
    expect(stream.chunkParts().filter(chunk => chunk.length === 0).length).toBe(0); // No empty chunks should remain after tests
  });

  it("initialize with single array and read it back", () => {
    const singleChunkStream = new ChunkedByteVectorStream(new Uint8Array([1,2,3,4,5]));
    expect(singleChunkStream.data().data).toEqual(new Uint8Array([1,2,3,4,5]));
    expect(singleChunkStream.length()).toBe(5);
    expect(singleChunkStream.chunkParts().length).toEqual(1);
  });

  it("reads blocks across chunk boundaries", () => {
    expect(stream.readBlock(4).data).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(stream.readBlock(3).data).toEqual(new Uint8Array([5, 6, 7]));
    expect(stream.readBlock(10).data).toEqual(new Uint8Array([8, 9, 10]));
    expect(stream.readBlock(1).data).toEqual(new Uint8Array([])); // EOF
    stream.seek(5);
    expect(stream.readBlock(4).data).toEqual(new Uint8Array([6, 7, 8, 9]));
  });

  it("writes blocks and overwrites existing data", () => {
    stream.seek(2);
    stream.writeBlock(bv([99, 100]));
    expect(stream.data().data).toEqual(new Uint8Array([1, 2, 99, 100, 5, 6, 7, 8, 9, 10]));
  });

  it("appends new data when writing past end", () => {
    stream.seek(10);
    stream.writeBlock(bv([11, 12]));
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12]));
  });

  it("inserts data at start, replacing bytes", () => {
    stream.insert(bv([50, 51]), 0, 2);
    expect(stream.data().data).toEqual(new Uint8Array([50, 51, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it("inserts data in middle, partial overwrite without enough new bytes", () => {
    stream.insert(bv([60, 61, 62]), 4, 2);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,60,61,62,7,8,9,10]));
  });

  it("inserts data in middle, partial overwrite", () => {
    stream.insert(bv([60, 61, 62, 63, 64, 65]), 4, 2);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,60,61,62,63,64,65,7,8,9,10]));
  });

  it("inserts data at end, no overwrite", () => {
    stream.insert(bv([99]), 10);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,5,6,7,8,9,10,99]));
  });

  it("removes a block from the middle", () => {
    stream.removeBlock(3, 4);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,8,9,10]));
  });

  it("removes a block at the start", () => {
    stream.removeBlock(0, 3);
    expect(stream.data().data).toEqual(new Uint8Array([4,5,6,7,8,9,10]));
  });

  it("removes a block at the end", () => {
    stream.removeBlock(7, 3);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,5,6,7]));
  });

  it("truncates to a shorter length", () => {
    stream.truncate(5);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,5]));
    expect(stream.length()).toBe(5);
  });

  it("truncates and pads to a longer length", () => {
    stream.truncate(12);
    expect(stream.data().data).toEqual(new Uint8Array([1,2,3,4,5,6,7,8,9,10,0,0]));
    expect(stream.length()).toBe(12);
  });

  it("seek and tell work as expected", () => {
    stream.seek(5);
    expect(stream.tell()).toBe(5);
    stream.seek(-2, 1);
    expect(stream.tell()).toBe(3);
    stream.seek(-1, 2);
    expect(stream.tell()).toBe(9);
  });

  it("clear resets position", () => {
    stream.seek(7);
    stream.clear();
    expect(stream.tell()).toBe(0);
  });

  it("chunkParts returns correct chunks", () => {
    expect(stream.chunkParts().map(a => Array.from(a))).toEqual([[1],[2],[3],[4],[5],[6],[7],[8],[9],[10]]);
    stream.insert(bv([20,21]), 5);
    expect(stream.chunkParts().map(a => Array.from(a))).toEqual([[1],[2],[3],[4],[5],[20,21],[6],[7],[8],[9],[10]]);
  });

  it("blob returns a Blob with correct data", () => {
    const blob = stream.blob("application/octet-stream");
    expect(blob.size).toBe(10);
  });

  it("readOnly and isOpen always return correct values", () => {
    expect(stream.readOnly()).toBe(false);
    expect(stream.isOpen()).toBe(true);
  });
});
