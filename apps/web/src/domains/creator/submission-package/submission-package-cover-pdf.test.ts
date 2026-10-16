import { describe, expect, it } from "vitest";

import type { SubmissionCoverInput } from "./submission-package-cover";
import {
  buildCoverPdfBlocks,
  COVER_PDF_MAX_PAGES,
  COVER_PDF_PAGE,
  paginateCoverPdf,
  renderSubmissionCoverPdf,
  wrapCoverPdfText,
  type CoverPdfBlock,
  type MeasureText,
} from "./submission-package-cover-pdf";
import { planSubmissionPackageLayout } from "./submission-package-layout";
import { evaluateSubmissionPackage } from "./submission-package-preflight";
import { completeDraft, sheetOf } from "./submission-package.test-fixture";
import type { SubmissionPackageDraft } from "./submission-package-types";

/** 글자 하나가 글꼴 크기의 절반 폭(영문·공백)이거나 한 배(한글·기타)라고 치는 단순한 측정기. */
const measure: MeasureText = (text, fontPx) =>
  Array.from(text).reduce((sum, character) => sum + (/[\x20-\x7e]/u.test(character) ? fontPx * 0.5 : fontPx), 0);

const fixed10: MeasureText = (text) => Array.from(text).length * 10;

function inputOf(draft: SubmissionPackageDraft = completeDraft()): SubmissionCoverInput {
  const report = evaluateSubmissionPackage({ draft });
  return { draft, report, layout: planSubmissionPackageLayout(draft, { includeCoverPdf: true }), locale: "ko", generatedAt: new Date("2026-10-15T09:30:00.000Z") };
}

describe("표지 PDF 줄바꿈", () => {
  it("폭을 넘으면 글자 단위로 줄을 바꾼다(한글)", () => {
    expect(wrapCoverPdfText(fixed10, "가나다라마바사", 15, 400, 30)).toEqual(["가나다", "라마바", "사"]);
  });

  it("공백이 있으면 단어 사이에서 줄을 바꾼다", () => {
    expect(wrapCoverPdfText(fixed10, "aaa bbb ccc", 15, 400, 70)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapCoverPdfText(fixed10, "aaaa bbbb", 15, 400, 50)).toEqual(["aaaa", "bbbb"]);
  });

  it("줄바꿈과 빈 줄을 지킨다", () => {
    expect(wrapCoverPdfText(fixed10, "첫째\n\n둘째", 15, 400, 100)).toEqual(["첫째", "", "둘째"]);
  });

  it("한 줄이 폭보다 길어도 무한 루프 없이 끝난다", () => {
    const lines = wrapCoverPdfText(fixed10, "가".repeat(200), 15, 400, 25);
    expect(lines.join("")).toBe("가".repeat(200));
    expect(lines.every((line) => Array.from(line).length <= 2)).toBe(true);
  });
});

describe("표지 PDF 쪽 나누기", () => {
  const { margin, height, width } = COVER_PDF_PAGE;

  function longBlocks(count: number): CoverPdfBlock[] {
    return Array.from({ length: count }, (_, index): CoverPdfBlock => ({ kind: "bullet", text: `항목 ${index + 1} ${"설명 ".repeat(8)}` }));
  }

  it("한 쪽에 들어가는 내용은 한 쪽이고 모든 줄이 여백 안에 있다", () => {
    const pages = paginateCoverPdf([{ kind: "title", text: "제목" }, { kind: "body", text: "본문" }], measure);
    expect(pages).toHaveLength(1);
    for (const line of pages[0]?.lines ?? []) {
      expect(line.x).toBeGreaterThanOrEqual(margin);
      expect(line.y).toBeLessThanOrEqual(height - margin);
    }
  });

  it("내용이 길면 쪽을 넘기고 어느 줄도 아래 여백을 침범하지 않는다", () => {
    const pages = paginateCoverPdf(longBlocks(80), measure);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.lines.length).toBeGreaterThan(0);
      for (const line of page.lines) {
        expect(line.y).toBeLessThanOrEqual(height - margin - 24);
        expect(line.x).toBeLessThan(width - margin);
      }
    }
  });

  it("목록 첫 줄에는 글머리 표시가 붙고 이어지는 줄은 들여쓴다", () => {
    const pages = paginateCoverPdf([{ kind: "bullet", text: "가".repeat(120) }], measure);
    const lines = pages[0]?.lines ?? [];
    expect(lines[0]?.text.startsWith("• ")).toBe(true);
    expect(lines[0]?.x).toBe(margin);
    expect(lines[1]?.x).toBeGreaterThan(margin);
  });

  it("쪽 맨 위의 제목은 위 간격을 두지 않는다", () => {
    const first = paginateCoverPdf([{ kind: "heading", text: "제목" }], measure)[0]?.lines[0];
    expect(first?.y).toBeCloseTo(margin + 20, 5);
  });

  it("쪽 수 상한을 넘으면 남은 내용을 버리고 cover.md 를 보라고 적는다", () => {
    const pages = paginateCoverPdf(longBlocks(2_000), measure, 3);
    expect(pages).toHaveLength(3);
    expect(pages[2]?.lines.at(-1)?.text).toContain("cover.md");
    expect(COVER_PDF_MAX_PAGES).toBeGreaterThanOrEqual(3);
  });

  it("같은 입력은 같은 쪽 나누기를 낸다", () => {
    expect(paginateCoverPdf(longBlocks(40), measure)).toEqual(paginateCoverPdf(longBlocks(40), measure));
  });
});

describe("표지 PDF 내용 블록", () => {
  it("제목·소개·회차·캐릭터·점검·끝맺음 순으로 만든다", () => {
    const blocks = buildCoverPdfBlocks(inputOf());
    const texts = blocks.map((block) => block.text);
    expect(blocks[0]).toEqual({ kind: "title", text: "달빛 아래 편의점" });
    expect(texts).toContain("로그라인");
    expect(texts).toContain("야간 편의점 알바생이 밤마다 찾아오는 손님들의 사연을 듣는다.");
    expect(texts.some((text) => text.startsWith("1화 · 1화 제목 (2, 690px, 5KB)"))).toBe(true);
    expect(texts.some((text) => text.startsWith("캐릭터 c1 — 겁이 많지만"))).toBe(true);
    expect(texts).toContain("막는 문제도, 알릴 문제도 없었어요.");
    expect(texts.some((text) => text.includes("어떤 서버에도 올리지 않았어요"))).toBe(true);
    expect(texts).not.toContain("---");
  });

  it("비어 있는 구성은 강조 줄로 알리고 로그라인은 작성하지 않음으로 적는다", () => {
    const blocks = buildCoverPdfBlocks(inputOf(completeDraft({ logline: "", characters: [] })));
    expect(blocks.find((block) => block.kind === "accent")?.text).toBe("아직 갖추지 못한 구성: 로그라인, 캐릭터 시트");
    expect(blocks.some((block) => block.kind === "muted" && block.text === "작성하지 않음")).toBe(true);
  });

  it("캐릭터 한 줄 소개는 첫 줄만, 길면 줄여서 쓴다", () => {
    const long = sheetOf("z", { name: "긴이름", personality: `${"가".repeat(120)}\n둘째 줄` });
    const blocks = buildCoverPdfBlocks(inputOf(completeDraft({ characters: [long] })));
    const bullet = blocks.find((block) => block.text.startsWith("긴이름 — "));
    expect(bullet?.text.endsWith("…")).toBe(true);
    expect(bullet?.text).not.toContain("둘째 줄");
  });
});

describe("표지 PDF 그리기", () => {
  interface FakeContext {
    font: string;
    fillStyle: string;
    textBaseline: string;
    textAlign: string;
    fillRect: () => void;
    fillText: (text: string) => void;
    measureText: (text: string) => { width: number };
  }

  function fakeCanvasFactory(drawn: string[]) {
    const created: Array<{ width: number; height: number }> = [];
    const context: FakeContext = {
      font: "",
      fillStyle: "",
      textBaseline: "",
      textAlign: "",
      fillRect: () => undefined,
      fillText: (text) => { drawn.push(text); },
      measureText: (text) => ({ width: Array.from(text).length * 8 }),
    };
    const createCanvas = (width: number, height: number): HTMLCanvasElement => {
      const canvas = { width, height, getContext: () => context };
      created.push(canvas);
      // 시험용 캔버스: 이 모듈이 쓰는 width·height·getContext 만 가진다.
      return canvas as unknown as HTMLCanvasElement;
    };
    return { createCanvas, created };
  }

  const fakeJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

  it("쪽마다 그려 JPEG 로 바꾸고 PDF 한 파일로 조립한다", async () => {
    const drawn: string[] = [];
    const { createCanvas, created } = fakeCanvasFactory(drawn);
    const bytes = await renderSubmissionCoverPdf(inputOf(), { createCanvas, toJpegBytes: () => Promise.resolve(fakeJpeg) });
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF-1.4");
    expect(drawn).toContain("달빛 아래 편의점");
    expect(drawn.some((text) => /^1 \/ \d+$/u.test(text))).toBe(true);
    // 캔버스는 쓰고 나면 0×0 으로 비워 메모리를 돌려준다.
    expect(created.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it("컨텍스트를 얻지 못하면 알 수 있는 오류로 실패한다", async () => {
    const createCanvas = (): HTMLCanvasElement => ({ width: 1, height: 1, getContext: () => null }) as unknown as HTMLCanvasElement;
    await expect(renderSubmissionCoverPdf(inputOf(), { createCanvas, toJpegBytes: () => Promise.resolve(fakeJpeg) })).rejects.toThrow("표지 PDF");
  });

  it("JPEG 인코딩이 PNG 로 폴백하면 조립 단계가 거절한다", async () => {
    const { createCanvas } = fakeCanvasFactory([]);
    await expect(renderSubmissionCoverPdf(inputOf(), { createCanvas, toJpegBytes: () => Promise.resolve(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])) })).rejects.toThrow("JPEG");
  });

  it("취소 신호가 있으면 AbortError 로 멈춘다", async () => {
    const controller = new AbortController();
    controller.abort();
    const { createCanvas } = fakeCanvasFactory([]);
    await expect(renderSubmissionCoverPdf(inputOf(), { createCanvas, toJpegBytes: () => Promise.resolve(fakeJpeg), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
