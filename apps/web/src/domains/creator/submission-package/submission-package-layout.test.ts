import { describe, expect, it } from "vitest";

import { listSubmissionPackagePaths, planSubmissionPackageLayout } from "./submission-package-layout";
import { completeDraft, episodeOf, failedPage, readyPage } from "./submission-package.test-fixture";

describe("투고 패키지 파일 배치", () => {
  it("회차를 번호 순으로, 쪽은 놓인 순서로 ASCII 경로에 배치한다", () => {
    const draft = completeDraft({
      title: "한글 제목은 경로에 쓰지 않는다",
      episodes: [
        episodeOf(12, [readyPage({ id: "c1", name: "한글 이름.png" })]),
        episodeOf(2, [readyPage({ id: "b1", mime: "image/jpeg" }), readyPage({ id: "b2", mime: "image/webp" })]),
        episodeOf(1, [readyPage({ id: "a1" })]),
      ],
    });
    const layout = planSubmissionPackageLayout(draft, { includeCoverPdf: false });
    expect(layout.episodes.map((episode) => episode.directory)).toEqual(["episodes/ep-001", "episodes/ep-002", "episodes/ep-012"]);
    expect(layout.episodes[1]?.pages.map((page) => page.path)).toEqual(["episodes/ep-002/p-001.jpg", "episodes/ep-002/p-002.webp"]);
    expect(layout.episodes[2]?.pages[0]).toMatchObject({ path: "episodes/ep-012/p-001.png", originalName: "한글 이름.png" });
    expect(layout.pageCount).toBe(4);
    const paths = listSubmissionPackagePaths(layout);
    expect(paths.every((path) => /^[\x21-\x7e]+$/u.test(path))).toBe(true);
  });

  it("읽을 수 없는 쪽과 이미지가 없는 회차는 배치에서 뺀다", () => {
    const draft = completeDraft({
      episodes: [
        episodeOf(1, [readyPage({ id: "a" }), failedPage({ id: "bad", failure: "unsupported" })]),
        episodeOf(2, []),
        episodeOf(3, [failedPage({ id: "bad2", failure: "empty" })]),
      ],
    });
    const layout = planSubmissionPackageLayout(draft, { includeCoverPdf: false });
    expect(layout.episodes).toHaveLength(1);
    expect(layout.episodes[0]?.pages.map((page) => page.pageId)).toEqual(["a"]);
  });

  it("쪽 번호는 100쪽 이상이어도 자릿수가 맞는다", () => {
    const pages = Array.from({ length: 1_000 }, (_, index) => readyPage({ id: `p${index}` }));
    const layout = planSubmissionPackageLayout(completeDraft({ episodes: [episodeOf(1, pages)] }), { includeCoverPdf: false });
    expect(layout.episodes[0]?.pages[0]?.path).toBe("episodes/ep-001/p-0001.png");
    expect(layout.episodes[0]?.pages.at(-1)?.path).toBe("episodes/ep-001/p-1000.png");
  });

  it("고정 파일 경로 목록은 표지 PDF 여부에 따라 달라진다", () => {
    const draft = completeDraft();
    const without = listSubmissionPackagePaths(planSubmissionPackageLayout(draft, { includeCoverPdf: false }));
    const withPdf = listSubmissionPackagePaths(planSubmissionPackageLayout(draft, { includeCoverPdf: true }));
    expect(without.slice(0, 4)).toEqual(["cover.md", "synopsis.md", "characters.md", "manifest.json"]);
    expect(withPdf.slice(0, 5)).toEqual(["cover.md", "cover.pdf", "synopsis.md", "characters.md", "manifest.json"]);
    expect(new Set(withPdf).size).toBe(withPdf.length);
    expect(withPdf).toHaveLength(without.length + 1);
  });

  it("같은 입력은 같은 배치를 낸다", () => {
    const draft = completeDraft();
    expect(planSubmissionPackageLayout(draft, { includeCoverPdf: true })).toEqual(planSubmissionPackageLayout(draft, { includeCoverPdf: true }));
  });
});
