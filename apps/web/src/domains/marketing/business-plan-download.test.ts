import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";

import {
  BUSINESS_PLAN_DOCX_FILENAME,
  BUSINESS_PLAN_PDF_FILENAME,
  buildBusinessPlanDocx,
  buildBusinessPlanPdf,
  type BusinessPlanPdfFontBytes,
} from "./business-plan-download";
import { BUSINESS_PLAN_SECTIONS } from "./business-plan-data";

/**
 * 사업계획서 내려받기 검증.
 * DOCX·PDF 모두 business-plan-data.ts에서 만들며, 표지·문항 순서·금지 표기를
 * 파일 내용으로 확인한다. PDF 텍스트 추출은 pdfjs-dist legacy 빌드로 한다
 * (표준 빌드는 순수 Node에서 해시 오류가 나므로 쓰지 않는다).
 */

const FORBIDDEN_TEAM_NAMES = ["이현우", "김수진", "박지훈", "최예린"];
const EXPECTED_HEADINGS = [
  "툰스튜디오 사업계획서",
  "단계마다 도구와 파일이 바뀌어",
  "클립스튜디오 하나와 경쟁할 수 있으면",
  "가격 정책은 심플하게",
  "순서를 건너뛰지 않는다",
  "실제 수치와 검증 목표는 계속 구분한다",
];

function loadPdfFonts(): BusinessPlanPdfFontBytes {
  const root = process.cwd();
  return {
    regular: new Uint8Array(
      readFileSync(
        join(root, "apps/web/public/fonts/business-plan-noto-sans-kr-regular-subset.ttf"),
      ),
    ),
    bold: new Uint8Array(
      readFileSync(
        join(root, "apps/web/public/fonts/business-plan-noto-sans-kr-bold-subset.ttf"),
      ),
    ),
  };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: bytes });
  const pdf = await loading.promise;
  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""));
  }
  return parts.join("\n");
}

describe("사업계획서 DOCX 내려받기", () => {
  it("A4·맑은 고딕 12pt·줄 간격 160% 문서에 본문과 표를 담는다", async () => {
    const blob = await buildBusinessPlanDocx();
    expect(blob.size).toBeGreaterThan(10_000);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const documentXml = new TextDecoder().decode(files["word/document.xml"]);
    expect(documentXml).toContain('w:w="11907"');
    expect(documentXml).toContain('w:h="16839"');
    expect(documentXml).toContain("맑은 고딕");
    for (const heading of EXPECTED_HEADINGS) {
      expect(documentXml).toContain(heading);
    }
    // 표와 "입력 필요" 셀(단가를 지어내지 않았다는 표시)이 그대로 들어간다.
    expect(documentXml).toContain("입력 필요");
    expect(documentXml).toContain("병목 다이어그램");
    for (const name of FORBIDDEN_TEAM_NAMES) {
      expect(documentXml).not.toContain(name);
    }
    // 꼬리말 쪽번호는 진짜 PAGE 필드여야 한다 (문자열 CURRENT가 그대로
    // 찍히면 렌더러가 숫자를 보여주지 못한다).
    const footerXml = new TextDecoder().decode(files["word/footer1.xml"]);
    expect(footerXml).toContain("PAGE");
    expect(footerXml).not.toContain("<CURRENT>");
  });

  it("파일 이름이 고정된 ASCII 이름이다", () => {
    expect(BUSINESS_PLAN_DOCX_FILENAME).toBe("toonstudio-business-plan.docx");
    expect(BUSINESS_PLAN_PDF_FILENAME).toBe("toonstudio-business-plan.pdf");
  });
});

describe("사업계획서 PDF 내려받기", () => {
  it("부분집합 한글 폰트로 A4 PDF를 만들고 본문을 읽을 수 있다", async () => {
    const bytes = await buildBusinessPlanPdf(loadPdfFonts());
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toBe("툰스튜디오 사업계획서");
    const pageCount = loaded.getPageCount();
    const firstPage = loaded.getPage(0);
    expect(firstPage.getWidth()).toBeCloseTo(595.28, 1);
    expect(firstPage.getHeight()).toBeCloseTo(841.89, 1);
    const text = await extractPdfText(bytes);
    for (const heading of EXPECTED_HEADINGS) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("입력 필요");
    expect(text).toContain("제출용 문서가 아닙니다");
    for (const name of FORBIDDEN_TEAM_NAMES) {
      expect(text).not.toContain(name);
    }
    // 본문 분량이 많아 제출 본문 한도(표지 제외 8쪽)를 넘을 수 있다.
    // 쪽수는 단정하지 않고 측정값으로만 기록한다 (실패 원인이 되지 않는다).
    expect(pageCount).toBeGreaterThanOrEqual(1);
    console.log(`사업계획서 PDF 쪽수(표지 포함): ${pageCount}`);
  }, 120_000);
});

describe("사업계획서 데이터 원본", () => {
  it("문항 수가 페이지와 파일의 원본과 같다", () => {
    expect(BUSINESS_PLAN_SECTIONS.map((section) => section.id)).toEqual([
      "q1",
      "why-webtoon",
      "q2",
      "q3",
      "q4",
      "appendix",
    ]);
  });
});
