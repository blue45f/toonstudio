/**
 * 사업계획서 내려받기 파일 생성 스크립트 (개발·검증용).
 *
 * 같은 business-plan-download.ts에서 DOCX·PDF를 만들어 지정한 폴더에 쓴다.
 * HWP는 제공하지 않는다. 2026-11-06 확인: LibreOffice 24.2.7.2는
 * `--convert-to hwp`에 "no export filter"로 실패하고, "Hangul WP 97"
 * 필터를 직접 지정해도 한 줄짜리 문서조차 저장 단계(0x81a)에서
 * 실패한다. 브라우저에서 HWP를 만들 방법도 없다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument } from "pdf-lib";

import {
  BUSINESS_PLAN_DOCX_FILENAME,
  BUSINESS_PLAN_PDF_FILENAME,
  buildBusinessPlanDocx,
  buildBusinessPlanPdf,
} from "../src/domains/marketing/business-plan-download";

function outDir(): string {
  const flag = process.argv.indexOf("--out");
  if (flag === -1 || process.argv[flag + 1] === undefined) {
    throw new Error("사용법: tsx generate-business-plan-downloads.ts --out <폴더>");
  }
  return process.argv[flag + 1] as string;
}

async function main(): Promise<void> {
  const dir = outDir();
  mkdirSync(dir, { recursive: true });

  const docxBlob = await buildBusinessPlanDocx();
  const docxPath = join(dir, BUSINESS_PLAN_DOCX_FILENAME);
  writeFileSync(docxPath, new Uint8Array(await docxBlob.arrayBuffer()));
  console.log(`${docxPath}: ${docxBlob.size.toLocaleString()} bytes`);

  const root = process.cwd();
  const pdfBytes = await buildBusinessPlanPdf({
    regular: new Uint8Array(
      readFileSync(join(root, "apps/web/public/fonts/business-plan-noto-sans-kr-regular-subset.ttf")),
    ),
    bold: new Uint8Array(
      readFileSync(join(root, "apps/web/public/fonts/business-plan-noto-sans-kr-bold-subset.ttf")),
    ),
  });
  const pdfPath = join(dir, BUSINESS_PLAN_PDF_FILENAME);
  writeFileSync(pdfPath, pdfBytes);
  const loaded = await PDFDocument.load(pdfBytes);
  console.log(`${pdfPath}: ${pdfBytes.byteLength.toLocaleString()} bytes, ${loaded.getPageCount()}쪽`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
