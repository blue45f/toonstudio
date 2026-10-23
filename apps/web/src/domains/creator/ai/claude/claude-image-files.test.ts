import { describe, expect, it } from "vitest";

import { firstImageFile, pickDroppedFile } from "./claude-image-files";

function files(...items: Array<[string, string]>): FileList {
  return items.map(([name, type]) => new File(["x"], name, { type })) as unknown as FileList;
}

describe("firstImageFile", () => {
  it("목록이 없거나 이미지가 없으면 null", () => {
    expect(firstImageFile(null)).toBeNull();
    expect(firstImageFile(undefined)).toBeNull();
    expect(firstImageFile(files(["notes.txt", "text/plain"]))).toBeNull();
  });

  it("지원하는 형식(PNG·JPEG·WebP)이면 고른다", () => {
    expect(firstImageFile(files(["a.png", "image/png"]))?.name).toBe("a.png");
    expect(firstImageFile(files(["a.jpg", "image/jpeg"]))?.name).toBe("a.jpg");
    expect(firstImageFile(files(["a.webp", "image/webp"]))?.name).toBe("a.webp");
  });

  it("형식 정보가 비어 있으면 확장자로 판단한다", () => {
    expect(firstImageFile(files(["page.PNG", ""]))?.name).toBe("page.PNG");
    expect(firstImageFile(files(["page.jpeg", ""]))?.name).toBe("page.jpeg");
  });

  it("앞에 지원하지 않는 이미지(GIF·HEIC)가 끼어 있어도 뒤의 쓸 수 있는 파일을 고른다", () => {
    expect(firstImageFile(files(["anim.gif", "image/gif"], ["photo.heic", "image/heic"], ["page.png", "image/png"]))?.name).toBe("page.png");
  });

  it("지원하는 형식이 하나도 없으면 첫 이미지를 돌려줘 호출 쪽이 형식 오류를 알릴 수 있게 한다", () => {
    expect(firstImageFile(files(["notes.txt", "text/plain"], ["anim.gif", "image/gif"]))?.name).toBe("anim.gif");
  });
});

describe("pickDroppedFile", () => {
  it("이미지가 있으면 쓸 수 있는 이미지를 고른다", () => {
    expect(pickDroppedFile(files(["notes.txt", "text/plain"], ["page.png", "image/png"]))?.name).toBe("page.png");
  });

  it("이미지가 하나도 없어도 첫 파일을 돌려줘 형식 오류를 알릴 수 있게 한다", () => {
    expect(pickDroppedFile(files(["notes.txt", "text/plain"]))?.name).toBe("notes.txt");
  });

  it("파일이 없으면 null", () => {
    expect(pickDroppedFile(null)).toBeNull();
    expect(pickDroppedFile(files())).toBeNull();
  });
});
