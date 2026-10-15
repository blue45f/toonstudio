import { describe, expect, it } from "vitest";

import { probeImageBlob, probeImageHeader, toSubmissionPageFile } from "./submission-image-probe";
import {
  gifBytes,
  imageFile,
  jpegBytes,
  pngBytes,
  webpExtendedBytes,
  webpLosslessBytes,
  webpLossyBytes,
} from "./submission-package.test-fixture";

describe("이미지 머리 판독", () => {
  it("PNG 의 형식과 가로·세로를 IHDR 에서 읽는다", () => {
    expect(probeImageHeader(pngBytes(690, 8000))).toEqual({ ok: true, mime: "image/png", width: 690, height: 8000 });
  });

  it("JPEG 의 SOF 표식에서 가로·세로를 읽고, 앞에 다른 구간(APP0)이 있어도 건너뛴다", () => {
    expect(probeImageHeader(jpegBytes(720, 1280))).toEqual({ ok: true, mime: "image/jpeg", width: 720, height: 1280 });
  });

  it("WebP 세 가지 변형(lossy·lossless·extended)의 크기를 읽는다", () => {
    expect(probeImageHeader(webpLossyBytes(800, 3000))).toEqual({ ok: true, mime: "image/webp", width: 800, height: 3000 });
    expect(probeImageHeader(webpLosslessBytes(1080, 12000))).toEqual({ ok: true, mime: "image/webp", width: 1080, height: 12000 });
    expect(probeImageHeader(webpExtendedBytes(690, 20000))).toEqual({ ok: true, mime: "image/webp", width: 690, height: 20000 });
  });

  it("지원하지 않는 형식(GIF 등)은 unsupported 다", () => {
    expect(probeImageHeader(gifBytes())).toEqual({ ok: false, reason: "unsupported" });
    expect(probeImageHeader(new Uint8Array(64).fill(0x41))).toEqual({ ok: false, reason: "unsupported" });
  });

  it("머리가 모자라면 truncated, 서명은 맞는데 구조가 어긋나면 corrupt 다", () => {
    expect(probeImageHeader(pngBytes(10, 10).slice(0, 12))).toEqual({ ok: false, reason: "truncated" });
    expect(probeImageHeader(Uint8Array.from([0xff, 0xd8]))).toEqual({ ok: false, reason: "truncated" });
    expect(probeImageHeader(jpegBytes(10, 10).slice(0, 20))).toEqual({ ok: false, reason: "truncated" });
    const brokenPng = pngBytes(10, 10);
    brokenPng[12] = 0x58; // IHDR → XHDR
    expect(probeImageHeader(brokenPng)).toEqual({ ok: false, reason: "corrupt" });
    // 크기 0 은 이미지가 아니다.
    expect(probeImageHeader(pngBytes(0, 10))).toEqual({ ok: false, reason: "corrupt" });
  });

  it("SOS 표식이 SOF 보다 먼저 나오면 손상으로 본다", () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]);
    expect(probeImageHeader(bytes)).toEqual({ ok: false, reason: "corrupt" });
  });
});

describe("Blob 판독", () => {
  it("큰 EXIF 가 앞에 있는 JPEG 는 더 읽어서 크기를 찾는다", async () => {
    const bytes = jpegBytes(690, 4000, { app1Bytes: 10_000 });
    const file = imageFile(bytes, "exif.jpg");
    expect(await probeImageBlob(file)).toEqual({ ok: true, mime: "image/jpeg", width: 690, height: 4000 });
  });

  it("빈 파일은 empty, 지원하지 않는 형식은 unsupported, 잘린 파일은 unreadable 이다", async () => {
    expect(await probeImageBlob(new Blob([]))).toEqual({ ok: false, failure: "empty" });
    expect(await probeImageBlob(imageFile(gifBytes(), "a.gif"))).toEqual({ ok: false, failure: "unsupported" });
    expect(await probeImageBlob(imageFile(pngBytes(10, 10).slice(0, 16), "cut.png"))).toEqual({ ok: false, failure: "unreadable" });
  });

  it("확장자가 아니라 서명으로 형식을 정한다", async () => {
    const file = imageFile(pngBytes(690, 1000), "looks-like.jpg", "image/jpeg");
    expect(await probeImageBlob(file)).toEqual({ ok: true, mime: "image/png", width: 690, height: 1000 });
  });

  it("읽기가 던지면 unreadable 로 바꾼다", async () => {
    const broken = { size: 100, slice: () => ({ arrayBuffer: () => Promise.reject(new Error("denied")) }) } as unknown as Blob;
    expect(await probeImageBlob(broken)).toEqual({ ok: false, failure: "unreadable" });
  });

  it("취소하면 AbortError 를 던진다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeImageBlob(imageFile(pngBytes(1, 1), "a.png"), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("toSubmissionPageFile 은 성공과 실패를 모두 메타데이터로 담는다", async () => {
    const ok = await toSubmissionPageFile(imageFile(pngBytes(690, 5000, 4096), "p1.png"), { id: "a" });
    expect(ok).toMatchObject({ id: "a", name: "p1.png", size: 4096, mime: "image/png", width: 690, height: 5000, failure: null });
    const bad = await toSubmissionPageFile(imageFile(gifBytes(), "x.gif"), { id: "b" });
    expect(bad).toMatchObject({ id: "b", mime: null, width: null, height: null, failure: "unsupported" });
  });
});
