// 소스 전용 회귀 검사: 실제 PNG codec·브라우저 CSP 통과 여부는 별도 Chrome 실행에서 확인한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import vm from "node:vm";

const harnessSource = await readFile(new URL("./browser.mjs", import.meta.url), "utf8");
const startMarker = "async function compareFrames(page, left, right) {\n";
const endMarker = "\nfunction requirePaint(delta) {";
assert.equal(harnessSource.split(startMarker).length, 2, "compareFrames 함수 시작 경계는 정확히 한 개여야 합니다.");
assert.equal(harnessSource.split(endMarker).length, 2, "compareFrames 함수 끝 경계는 정확히 한 개여야 합니다.");
const functionStart = harnessSource.indexOf(startMarker);
const functionEnd = harnessSource.indexOf(endMarker, functionStart);
assert(functionEnd > functionStart, "compareFrames 함수 경계를 찾지 못했습니다.");
const compareFramesSource = harnessSource.slice(functionStart, functionEnd);
const PNG_A = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV9kAAAAASUVORK5CYII=", "base64");
const PNG_B = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const dataUrl = (bytes) => "data:image/png;base64," + bytes.toString("base64");

function fixture({ overrideUrls, sizeMismatch = false } = {}) {
  const observed = { networkCalls: 0, bitmaps: [], closed: 0 };
  const compareFrames = vm.runInNewContext("(" + compareFramesSource + ")", {
    atob, Blob, Uint8Array,
    fetch() {
      observed.networkCalls += 1;
      throw new TypeError("connect-src CSP가 data: fetch를 차단했습니다.");
    },
    async createImageBitmap(blob) {
      assert.equal(blob.type, "image/png");
      const bytes = Buffer.from(await blob.arrayBuffer());
      const index = observed.bitmaps.length;
      assert.deepEqual(bytes, index === 0 ? PNG_A : PNG_B);
      observed.bitmaps.push(bytes);
      return {
        width: sizeMismatch && index === 1 ? 2 : 1,
        height: 1,
        pixels: new Uint8ClampedArray(index === 0 ? [0, 0, 0, 255] : [4, 0, 0, 255]),
        close() { observed.closed += 1; },
      };
    },
    document: {
      createElement(kind) {
        assert.equal(kind, "canvas");
        let image;
        return {
          width: 0, height: 0,
          getContext(kind, options) {
            assert.equal(kind, "2d");
            assert.equal(options.willReadFrequently, true);
            return {
              drawImage(bitmap, x, y) { assert.equal(x, 0); assert.equal(y, 0); image = bitmap; },
              getImageData() { return { data: image.pixels }; },
            };
          },
        };
      },
    },
  });
  const page = { evaluate: (callback, urls) => callback(overrideUrls ?? urls) };
  return { observed, run: () => compareFrames(page, { bytes: PNG_A }, { bytes: PNG_B }) };
}

test("data: fetch가 거절되는 환경에서도 원 바이트를 Blob으로 전달하고 같은 픽셀 통계를 계산한다", async () => {
  const { run, observed } = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(await run())), {
    width: 1, height: 1, changedPixels: 1, peakChannelDelta: 4, meanDelta: 4 / 3, distinctColors: 1,
  });
  assert.equal(observed.networkCalls, 0);
  assert.equal(observed.bitmaps.length, 2);
  assert.equal(observed.closed, 2);
});

test("PNG base64 이외 URI와 비정규 padding·서명을 네트워크 요청 없이 거절한다", async () => {
  for (const invalid of [
    "https://example.invalid/image.png",
    "data:image/jpeg;base64," + PNG_A.toString("base64"),
    "data:image/png;charset=utf-8;base64," + PNG_A.toString("base64"),
    "data:image/png;base64,",
    "data:image/png;base64,AA=A",
    "data:image/png;base64,AB==",
    "data:image/png;base64,AAB=",
    dataUrl(PNG_A) + "\n",
    "data:image/png;base64," + Buffer.from([255, 216, 255, 224]).toString("base64"),
  ]) {
    const { run, observed } = fixture({ overrideUrls: [invalid, dataUrl(PNG_B)] });
    await assert.rejects(run(), /증거 PNG/u);
    assert.equal(observed.networkCalls, 0);
    assert.equal(observed.bitmaps.length, 0);
  }
});

test("원 Canvas 크기 불일치 거절과 ImageBitmap 반환을 유지한다", async () => {
  const { run, observed } = fixture({ sizeMismatch: true });
  await assert.rejects(run(), /Canvas 크기가 바뀌었습니다/u);
  assert.equal(observed.networkCalls, 0);
  assert.equal(observed.closed, 2);
});
