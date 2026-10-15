import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { StudioPackageArchiveError, type StudioPackageArchiveErrorCode } from "../studio-package-archive";

import {
  buildSubmissionPackage,
  SUBMISSION_PACKAGE_MANIFEST_SCHEMA,
  SubmissionPackageBuildError,
  toSubmissionBuildError,
  type SubmissionPackageBuildOptions,
  type SubmissionPackageManifest,
  type SubmissionPackageProgress,
} from "./submission-package-build";
import {
  completeDraft,
  episodeOf,
  jpegBytes,
  pngBytes,
  probedPage,
  readyPage,
  sheetOf,
  webpLossyBytes,
} from "./submission-package.test-fixture";
import { SUBMISSION_PACKAGE_LIMITS } from "./submission-package-types";
import type { SubmissionPackageDraft } from "./submission-package-types";

const GENERATED_AT = new Date("2026-10-15T09:30:00.000Z");
const decoder = new TextDecoder();

function options(overrides: Partial<SubmissionPackageBuildOptions> = {}): SubmissionPackageBuildOptions {
  return { locale: "ko", generatedAt: GENERATED_AT, includeCoverPdf: false, crc32ExecutionMode: "direct-headless", ...overrides };
}

async function unzip(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

/** 실제 판독 경로를 거친 3화 초안: 회차마다 PNG·JPEG·WebP 중 섞어 쓴다. */
async function realDraft(overrides: Partial<SubmissionPackageDraft> = {}): Promise<SubmissionPackageDraft> {
  const episodes = [
    episodeOf(1, [await probedPage(pngBytes(690, 4000, 3_000), "첫 페이지.png", "a1"), await probedPage(jpegBytes(690, 3000, { totalBytes: 2_000 }), "02.jpg", "a2")]),
    episodeOf(2, [await probedPage(webpLossyBytes(690, 5000, 1_500), "p-1.webp", "b1")]),
    episodeOf(3, [await probedPage(pngBytes(690, 4500, 2_500), "c.png", "c1")]),
  ];
  return completeDraft({ episodes, characters: [sheetOf("c1", { name: "한도깨" })], ...overrides });
}

describe("투고 패키지 ZIP 조립", () => {
  it("표지·시놉시스·캐릭터·매니페스트와 회차별 이미지를 한 ZIP 에 담는다", async () => {
    const result = await buildSubmissionPackage(await realDraft(), options());
    const files = await unzip(result.blob);
    expect(Object.keys(files)).toEqual([
      "cover.md",
      "synopsis.md",
      "characters.md",
      "manifest.json",
      "episodes/ep-001/p-001.png",
      "episodes/ep-001/p-002.jpg",
      "episodes/ep-002/p-001.webp",
      "episodes/ep-003/p-001.png",
    ]);
    expect(result.fileCount).toBe(8);
    expect(result.bytes).toBe(result.blob.size);
    expect(result.blob.type).toBe("application/zip");
    expect(result.warnings).toEqual([]);
  });

  it("이미지 바이트는 한 비트도 바뀌지 않고 확장자는 판독한 형식을 따른다", async () => {
    const png = pngBytes(690, 4000, 3_000);
    const draft = await realDraft({
      episodes: [
        episodeOf(1, [await probedPage(png, "이름이.jpg", "x1")]),
        episodeOf(2, [await probedPage(jpegBytes(690, 100, { totalBytes: 800 }), "b.png", "x2")]),
        episodeOf(3, [await probedPage(pngBytes(690, 100, 500), "c.png", "x3")]),
      ],
    });
    const files = await unzip((await buildSubmissionPackage(draft, options())).blob);
    expect(files["episodes/ep-001/p-001.png"]).toEqual(png);
    expect(Object.keys(files)).toContain("episodes/ep-002/p-001.jpg");
  });

  it("표지에는 제목과 회차 표와 묶음 구성이, 매니페스트에는 파일 목록과 점검 결과가 들어간다", async () => {
    const result = await buildSubmissionPackage(await realDraft(), options());
    const files = await unzip(result.blob);
    const cover = decoder.decode(files["cover.md"]);
    expect(cover).toContain("# 달빛 아래 편의점");
    expect(cover).toContain("- 구성: 회차 3화 · 이미지 4장");
    expect(cover).toContain("`episodes/ep-002/` — 2화 원고 이미지 1장");

    const manifest = JSON.parse(decoder.decode(files["manifest.json"])) as SubmissionPackageManifest;
    expect(manifest.schema).toBe(SUBMISSION_PACKAGE_MANIFEST_SCHEMA);
    expect(manifest.createdAt).toBe("2026-10-15T09:30:00.000Z");
    expect(manifest.widthCheck).toEqual({ id: "naver", width: 690 });
    expect(manifest.totals).toMatchObject({ episodes: 3, pages: 4, characterSheets: 1 });
    expect(manifest.episodes[0]?.pages[0]).toMatchObject({ path: "episodes/ep-001/p-001.png", originalName: "첫 페이지.png", mime: "image/png", width: 690, height: 4000, bytes: 3_000 });
    expect(manifest.characters).toEqual([{ name: "한도깨", aliases: [] }]);
    expect(manifest.checks).toMatchObject({ errors: 0 });
    expect(manifest.textFiles.map((file) => file.path)).toEqual(["cover.md", "synopsis.md", "characters.md"]);
    expect(manifest.textFiles.every((file) => file.bytes > 0)).toBe(true);
  });

  it("같은 입력과 같은 시각이면 바이트까지 같은 ZIP 이 나온다", async () => {
    const draft = await realDraft();
    const first = await buildSubmissionPackage(draft, options());
    const second = await buildSubmissionPackage(draft, options());
    expect(new Uint8Array(await first.blob.arrayBuffer())).toEqual(new Uint8Array(await second.blob.arrayBuffer()));
  });

  it("파일 이름에 작품 제목과 만든 시각이 들어간다", async () => {
    const result = await buildSubmissionPackage(await realDraft(), options());
    expect(result.fileName).toBe("달빛 아래 편의점-submission-20261015-093000Z.zip");
    // 파일 이름으로 쓸 수 없는 제목(경로 구분자뿐)이면 기본 이름으로 대신한다.
    const unsafe = await buildSubmissionPackage(await realDraft({ title: "  ///  " }), options());
    expect(unsafe.fileName).toBe("toonstudio-submission-20261015-093000Z.zip");
  });

  it("영어로 만들면 표지가 영어다", async () => {
    const files = await unzip((await buildSubmissionPackage(await realDraft(), options({ locale: "en" }))).blob);
    expect(decoder.decode(files["cover.md"])).toContain("- Created on: 2026-10-15");
    expect(decoder.decode(files["cover.md"])).toContain("## Package contents");
  });

  it("회차 번호 순으로 담고 입력 순서와 무관하다", async () => {
    const base = await realDraft();
    const shuffled = completeDraft({ ...base, episodes: [...base.episodes].reverse() });
    const files = await unzip((await buildSubmissionPackage(shuffled, options())).blob);
    const images = Object.keys(files).filter((path) => path.startsWith("episodes/"));
    expect(images[0]).toBe("episodes/ep-001/p-001.png");
    expect(images.at(-1)).toBe("episodes/ep-003/p-001.png");
  });
});

describe("진행 상황", () => {
  it("준비 → 묶는 중(파일마다) → 마무리 순으로 알리고 완료 수·바이트가 늘기만 한다", async () => {
    const events: SubmissionPackageProgress[] = [];
    await buildSubmissionPackage(await realDraft(), options({ onProgress: (event) => events.push(event) }));
    expect(events[0]).toMatchObject({ phase: "preparing", completedFiles: 0 });
    expect(events.at(-1)).toMatchObject({ phase: "finishing", completedFiles: 8, totalFiles: 8 });
    const packing = events.filter((event) => event.phase === "packing");
    expect(packing).toHaveLength(8);
    expect(packing.map((event) => event.completedFiles)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(packing.every((event, index) => index === 0 || event.processedBytes >= (packing[index - 1]?.processedBytes ?? 0))).toBe(true);
    expect(packing.at(-1)?.processedBytes).toBe(packing.at(-1)?.totalBytes);
    expect(packing.at(-1)?.path).toBe("episodes/ep-003/p-001.png");
  });
});

describe("점검 실패와 취소", () => {
  it("막는 문제가 남아 있으면 ZIP 을 만들지 않고 invalid-draft 로 문제 목록을 돌려준다", async () => {
    const base = await realDraft();
    const failure = await buildSubmissionPackage(completeDraft({ ...base, episodes: base.episodes.slice(0, 2) }), options()).catch((error: unknown) => error);
    if (!(failure instanceof SubmissionPackageBuildError)) throw new Error("SubmissionPackageBuildError 가 나와야 해요.");
    const error = failure;
    expect(error.code).toBe("invalid-draft");
    expect(error.retryable).toBe(false);
    expect(error.issues.map((issue) => issue.code)).toEqual(["episodes-too-few"]);
  });

  it("시작 전에 이미 취소됐으면 aborted 다", async () => {
    const controller = new AbortController();
    controller.abort();
    const failure = await buildSubmissionPackage(await realDraft(), options({ signal: controller.signal })).catch((error: unknown) => error);
    expect(failure).toMatchObject({ name: "SubmissionPackageBuildError", code: "aborted", retryable: true });
  });

  it("만드는 도중 취소하면 aborted 로 멈추고 남은 파일을 더 읽지 않는다", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    const failure = await buildSubmissionPackage(
      await realDraft(),
      options({
        signal: controller.signal,
        onProgress: (event) => {
          if (event.phase !== "packing") return;
          seen.push(event.path ?? "");
          if (event.completedFiles === 2) controller.abort();
        },
      }),
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "aborted" });
    expect(seen).toHaveLength(2);
  });
});

describe("고른 파일이 바뀐 경우", () => {
  class ShrinkingBlob extends Blob {
    override arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(1));
    }
  }

  it("읽는 동안 크기가 달라졌으면 source-changed 로 알리고 다시 고르면 되는 오류로 본다", async () => {
    const base = completeDraft();
    const [first, ...rest] = base.episodes;
    if (!first) throw new Error("시험 초안에 회차가 없어요.");
    const changing = { ...readyPage({ id: "chg", size: 100 }), blob: new ShrinkingBlob([new Uint8Array(100)]) };
    const draft = completeDraft({ episodes: [{ ...first, pages: [changing, ...first.pages] }, ...rest] });
    const failure = await buildSubmissionPackage(draft, options()).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "source-changed", retryable: true });
  });

  it("읽기 자체가 실패해도 source-changed 다", async () => {
    const base = completeDraft();
    const [first, ...rest] = base.episodes;
    if (!first) throw new Error("시험 초안에 회차가 없어요.");
    class BrokenBlob extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.reject(new DOMException("파일이 사라졌어요", "NotFoundError"));
      }
    }
    const gone = { ...readyPage({ id: "gone", size: 100 }), blob: new BrokenBlob([new Uint8Array(100)]) };
    const draft = completeDraft({ episodes: [{ ...first, pages: [gone] }, ...rest] });
    expect(await buildSubmissionPackage(draft, options()).catch((error: unknown) => error)).toMatchObject({ code: "source-changed" });
  });
});

describe("표지 PDF", () => {
  const fakePdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

  it("PDF 그리기를 주입하면 cover.pdf 로 담고 표지의 묶음 구성에도 적는다", async () => {
    const result = await buildSubmissionPackage(
      await realDraft(),
      options({ includeCoverPdf: true, renderCoverPdf: () => Promise.resolve(fakePdf) }),
    );
    const files = await unzip(result.blob);
    expect(Object.keys(files).slice(0, 5)).toEqual(["cover.md", "cover.pdf", "synopsis.md", "characters.md", "manifest.json"]);
    expect(files["cover.pdf"]).toEqual(fakePdf);
    expect(decoder.decode(files["cover.md"])).toContain("`cover.pdf`");
    const manifest = JSON.parse(decoder.decode(files["manifest.json"])) as SubmissionPackageManifest;
    expect(manifest.textFiles.find((file) => file.path === "cover.pdf")?.bytes).toBe(fakePdf.byteLength);
    expect(result.warnings).toEqual([]);
  });

  it("PDF 를 그리지 못해도 ZIP 은 만들고 경고만 남기며, 표지에는 PDF 를 적지 않는다", async () => {
    const result = await buildSubmissionPackage(
      await realDraft(),
      options({ includeCoverPdf: true, renderCoverPdf: () => Promise.reject(new Error("canvas unavailable")) }),
    );
    const files = await unzip(result.blob);
    expect(Object.keys(files)).not.toContain("cover.pdf");
    expect(decoder.decode(files["cover.md"])).not.toContain("cover.pdf");
    expect(result.warnings).toEqual([{ code: "cover-pdf-failed" }]);
  });

  it("PDF 그리기 함수가 없으면 같은 경고를 남긴다", async () => {
    const result = await buildSubmissionPackage(await realDraft(), options({ includeCoverPdf: true }));
    expect(result.warnings).toEqual([{ code: "cover-pdf-failed" }]);
  });

  it("PDF 를 그리는 도중 취소하면 전체가 aborted 다", async () => {
    const failure = await buildSubmissionPackage(
      await realDraft(),
      options({ includeCoverPdf: true, renderCoverPdf: () => Promise.reject(new DOMException("취소", "AbortError")) }),
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "aborted" });
  });

  it("PDF 를 원하지 않으면 그리기 함수를 부르지 않는다", async () => {
    let called = 0;
    await buildSubmissionPackage(await realDraft(), options({ includeCoverPdf: false, renderCoverPdf: () => { called += 1; return Promise.resolve(fakePdf); } }));
    expect(called).toBe(0);
  });
});

describe("CRC 계산 Worker 를 쓸 수 없는 환경", () => {
  it("worker 모드가 실패하면 메인 스레드 계산으로 한 번 다시 시도하고 경고를 남긴다", async () => {
    const result = await buildSubmissionPackage(await realDraft(), options({ crc32ExecutionMode: "worker" }));
    expect(result.warnings).toEqual([{ code: "crc32-worker-unavailable" }]);
    expect(Object.keys(await unzip(result.blob))).toContain("cover.md");
  });
});

describe("메모리 상한", () => {
  it("앱 상한은 작성기의 고정 상한보다 낮다", () => {
    expect(SUBMISSION_PACKAGE_LIMITS.maxTotalBytes).toBeLessThan(512_000_000);
    expect(SUBMISSION_PACKAGE_LIMITS.maxFileBytes).toBeLessThan(256_000_000);
    expect(SUBMISSION_PACKAGE_LIMITS.maxFiles).toBeLessThan(1_100);
  });

  it("점검의 용량 상한을 낮추면 같은 규칙으로 만들기도 거절한다", async () => {
    const failure = await buildSubmissionPackage(await realDraft(), options({ limits: { ...SUBMISSION_PACKAGE_LIMITS, maxFileBytes: 1_000 } })).catch((error: unknown) => error);
    if (!(failure instanceof SubmissionPackageBuildError)) throw new Error("SubmissionPackageBuildError 가 나와야 해요.");
    expect(failure.code).toBe("invalid-draft");
    expect(failure.issues.some((issue) => issue.code === "page-too-large")).toBe(true);
  });
});

describe("오류 분류", () => {
  it.each<[StudioPackageArchiveErrorCode, string, boolean]>([
    ["TOTAL_SIZE_LIMIT", "limit", false],
    ["ENTRY_SIZE_LIMIT", "limit", false],
    ["ENTRY_COUNT_LIMIT", "limit", false],
    ["ARCHIVE_SIZE_LIMIT", "limit", false],
    ["ZIP32_OVERFLOW", "limit", false],
    ["SOURCE_INVALID", "source-changed", true],
    ["SOURCE_SIZE_MISMATCH", "source-changed", true],
    ["PATH_INVALID", "unexpected", true],
    ["PATH_DUPLICATE", "unexpected", true],
  ])("작성기 오류 %s 는 %s 로 정리한다", (archiveCode, expected, retryable) => {
    const error = toSubmissionBuildError(new StudioPackageArchiveError(archiveCode, "메시지"));
    expect(error).toMatchObject({ code: expected, retryable, message: "메시지" });
  });

  it("취소·일반 오류·문자열 던지기도 정리한다", () => {
    expect(toSubmissionBuildError(new DOMException("x", "AbortError"))).toMatchObject({ code: "aborted" });
    expect(toSubmissionBuildError(new Error("boom"))).toMatchObject({ code: "unexpected", message: "boom" });
    expect(toSubmissionBuildError("문자열")).toMatchObject({ code: "unexpected" });
    const already = new SubmissionPackageBuildError("limit", "x");
    expect(toSubmissionBuildError(already)).toBe(already);
  });
});
