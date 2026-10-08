import { describe, expect, it } from "vitest";

import { proxiedCoverSrc, proxiedCoverSrcSet } from "./cover-proxy";

describe("proxiedCoverSrc", () => {
  it("허용 호스트(pstatic) 표지를 프록시 URL로 바꾼다", () => {
    expect(
      proxiedCoverSrc("https://image-comic.pstatic.net/webtoon/25455/thumbnail/thumbnail_IMAG21_1.jpg")
    ).toBe(
      "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F25455%2Fthumbnail%2Fthumbnail_IMAG21_1.jpg"
    );
  });

  // KMAS는 통합 규약(docs/kmas-integration.md §3·§6)상 서버 프록시 중계 대상이 아니고,
  // 서버 경유 fetch가 KMAS 포털에 닿지 않아 스포트라이트 표지가 전멸한 회귀(2026-10-08)가
  // 있어 원본 URL을 그대로 둔다. 명시 포트(:443) 형태도 같은 취급이다.
  it.each([
    "https://www.kmas.or.kr:443/common/file/atchmnflDownload.ajax?fileImageId=58ff2761-4d22-40d6-9995-50fb9b437412",
    "https://www.kmas.or.kr/common/file/atchmnflDownload.ajax?fileImageId=3000123139",
  ])("KMAS 첨부 다운로드 URL은 프록시로 바꾸지 않는다: %s", (src) => {
    expect(proxiedCoverSrc(src)).toBe(src);
  });

  it("쿼리가 있는 레진 표지도 통째로 인코딩한다", () => {
    expect(
      proxiedCoverSrc("https://ccdn.lezhin.com/v2/comics/7011737621132804/images/thumbnail.jpg?updated=1776994518580")
    ).toBe(
      "/api/cover?u=https%3A%2F%2Fccdn.lezhin.com%2Fv2%2Fcomics%2F7011737621132804%2Fimages%2Fthumbnail.jpg%3Fupdated%3D1776994518580"
    );
  });

  it("이미 프록시 경유인 URL은 그대로 둔다(이중 인코딩 방지)", () => {
    const already = "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fa.jpg";
    expect(proxiedCoverSrc(already)).toBe(already);
  });

  it.each([
    "/assets/local-cover.png",
    "/api/generated/cover.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://toonstudio.example/9c2f1d",
  ])("로컬·인라인 자산은 그대로 둔다: %s", (src) => {
    expect(proxiedCoverSrc(src)).toBe(src);
  });

  it.each([
    "https://lh3.googleusercontent.com/a/avatar.png",
    "https://images.unsplash.com/photo-1",
    "https://evil-image-comic.pstatic.net/a.png",
    "https://image-comic.pstatic.net.evil.test/a.png",
  ])("허용 목록에 없는 외부 호스트는 바꾸지 않는다: %s", (src) => {
    expect(proxiedCoverSrc(src)).toBe(src);
  });

  it("허용 호스트의 http 표지는 https로 올려 프록시한다", () => {
    expect(proxiedCoverSrc("http://image-comic.pstatic.net/a.jpg")).toBe(
      "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fa.jpg"
    );
  });

  it("프로토콜 상대 URL(//호스트)도 허용 호스트면 프록시한다", () => {
    expect(proxiedCoverSrc("//ssl.pstatic.net/a.jpg")).toBe(
      "/api/cover?u=https%3A%2F%2Fssl.pstatic.net%2Fa.jpg"
    );
  });

  it.each(["", "not a url", "cover.png"])("URL로 해석할 수 없는 값은 그대로 둔다: %j", (src) => {
    expect(proxiedCoverSrc(src)).toBe(src);
  });
});

describe("proxiedCoverSrcSet", () => {
  it("각 후보 URL에 같은 변환을 적용하고 디스크립터는 유지한다", () => {
    expect(
      proxiedCoverSrcSet(
        "https://image-comic.pstatic.net/a.jpg 480w, https://image-comic.pstatic.net/b.jpg 960w"
      )
    ).toBe(
      "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fa.jpg 480w, /api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fb.jpg 960w"
    );
  });

  it("로컬 후보는 그대로 둔다", () => {
    expect(proxiedCoverSrcSet("/assets/a.png 1x, /assets/b.png 2x")).toBe(
      "/assets/a.png 1x, /assets/b.png 2x"
    );
  });

  it("KMAS 후보는 프록시로 바꾸지 않는다", () => {
    const srcSet =
      "https://www.kmas.or.kr/common/file/atchmnflDownload.ajax?fileImageId=1 480w, https://www.kmas.or.kr/common/file/atchmnflDownload.ajax?fileImageId=2 960w";
    expect(proxiedCoverSrcSet(srcSet)).toBe(srcSet);
  });
});
