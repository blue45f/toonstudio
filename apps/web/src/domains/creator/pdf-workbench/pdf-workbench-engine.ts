/**
 * PDF 워크벤치 엔진 — pdf-lib 어댑터. 모델(pdf-workbench-model)의 순수 계획을 실제
 * PDF 바이트 연산으로 바꾼다. 전부 클라이언트에서 돌고 서버로 보내지 않는다.
 *
 * 담당: 원본 검사(페이지 수·제목), 내용 지문(SHA-256 — 앵커의 documentId 재료),
 * 출력 계획 실행(병합·재배열·회전), 범위 분할 파일 생성.
 *
 * 성능: 출력 계획은 같은 소스의 연속 구간을 한 번의 copyPages로 배치 복사한다
 * (페이지마다 호출하면 수백 페이지 병합에서 호출·순회 비용이 페이지 수만큼 쌓인다).
 * 파싱한 소스 문서는 다운로드 세션 범위에서 재사용한다 — 병합을 다시 받거나
 * 분할로 이어 받아도 같은 원본을 빌드마다 다시 파싱하지 않는다.
 *
 * 암호화 PDF: pdf-lib는 암호가 걸린 문서를 열지 못한다(EncryptedPDFError). 조용히
 * 실패로 뭉개지 않고 종류를 구분해 돌려줘서, 화면이 "암호가 걸려 있어요"와 "파일이
 * 깨졌어요"를 다른 문구로 안내하게 한다. 권한 해제·복호화는 이 트랙의 범위가 아니다
 * (cat7 §5에서 암호화 열기는 동선 효용이 낮아 제외 판정).
 */

import { EncryptedPDFError, PDFDocument, degrees } from "pdf-lib";

import {
  buildPdfOutputPlan,
  buildPdfSplitPlans,
  normalizeRotationDelta,
  suggestPdfOutputName,
  type PdfPageRange,
  type PdfOutputStep,
  type PdfWorkbenchSource,
  type PdfWorkbenchState,
} from "./pdf-workbench-model";

export type PdfWorkbenchLoadErrorKind = "encrypted" | "invalid";

/** PDF를 열지 못했을 때 — kind로 화면 문구를 가른다. */
export class PdfWorkbenchLoadError extends Error {
  readonly kind: PdfWorkbenchLoadErrorKind;

  constructor(kind: PdfWorkbenchLoadErrorKind, message: string) {
    super(message);
    this.name = "PdfWorkbenchLoadError";
    this.kind = kind;
  }
}

export interface PdfWorkbenchInspectedSource {
  readonly source: PdfWorkbenchSource;
  /** 원본 내용 지문 (SHA-256 hex) — 댓글 앵커의 documentId로 쓴다. */
  readonly fingerprint: string;
}

/** 바이트 내용 지문. 이름이 바뀌어도 내용이 같으면 같은 문서로 식별된다. */
export async function fingerprintPdfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadDocument(bytes: Uint8Array, name: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new PdfWorkbenchLoadError(
        "encrypted",
        `"${name}"은(는) 암호가 걸려 있어 열 수 없어요. 암호를 해제한 PDF로 다시 시도해 주세요.`,
      );
    }
    throw new PdfWorkbenchLoadError(
      "invalid",
      `"${name}"을(를) PDF로 읽지 못했어요. 파일이 손상됐거나 PDF가 아닐 수 있어요.`,
    );
  }
}

/** 파일을 열어 소스 정보(페이지 수·제목 반영 이름)와 지문을 확정한다. */
export async function inspectPdfSource(input: {
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}): Promise<PdfWorkbenchInspectedSource> {
  const doc = await loadDocument(input.bytes, input.name);
  const fingerprint = await fingerprintPdfBytes(input.bytes);
  return {
    fingerprint,
    source: {
      id: input.id,
      name: input.name,
      sizeBytes: input.bytes.byteLength,
      pageCount: doc.getPageCount(),
    },
  };
}

interface CachedSourceDocument {
  /** 파싱에 쓴 원본 바이트. 참조가 다르면(같은 id로 파일 교체) 낡은 문서로 보지 않고 다시 파싱한다. */
  readonly bytes: Uint8Array;
  readonly document: Promise<PDFDocument>;
}

interface DocumentCache {
  readonly bytesBySourceId: ReadonlyMap<string, Uint8Array>;
  readonly cache: Map<string, CachedSourceDocument>;
}

/**
 * 다운로드 세션 범위 소스 문서 캐시. 워크벤치 화면이 살아 있는 동안 유지되고,
 * 빌드(병합·분할)끼리 파싱 결과를 나눠 쓴다. 캐시 항목은 "지금 워크벤치에 있는
 * 소스"로만 남긴다 — 소스를 지우면 다음 빌드에서 그 문서도 함께 정리돼 메모리가
 * 세션 내내 쌓이지 않는다.
 */
const sessionDocumentCache = new Map<string, CachedSourceDocument>();

function createDocumentCache(bytesBySourceId: ReadonlyMap<string, Uint8Array>): DocumentCache {
  for (const sourceId of sessionDocumentCache.keys()) {
    if (!bytesBySourceId.has(sourceId)) sessionDocumentCache.delete(sourceId);
  }
  return { bytesBySourceId, cache: sessionDocumentCache };
}

function documentFor(cacheSet: DocumentCache, sourceId: string): Promise<PDFDocument> {
  const bytes = cacheSet.bytesBySourceId.get(sourceId);
  if (!bytes) {
    return Promise.reject(new Error(`워크벤치 소스를 찾지 못했어요: ${sourceId}`));
  }
  const cached = cacheSet.cache.get(sourceId);
  if (cached && cached.bytes === bytes) return cached.document;
  const pending = loadDocument(bytes, sourceId);
  cacheSet.cache.set(sourceId, { bytes, document: pending });
  return pending;
}

/**
 * 한 번의 copyPages로 복사할 구간 — 같은 소스에서 원본 페이지 번호가 이어지는
 * 걸음들. 병합의 기본형(소스 전체를 순서대로 붙이기)은 구간 하나로 접혀 호출이
 * 1회가 되고, 재배열로 순서가 끊긴 지점에서만 구간이 나뉜다. 회전은 구간을
 * 가르지 않는다 — 복사한 페이지마다 따로 적용하므로 결과는 페이지 단위 복사와
 * 같다.
 */
interface PdfCopyRun {
  readonly sourceId: string;
  readonly steps: readonly PdfOutputStep[];
}

function groupCopyRuns(steps: readonly PdfOutputStep[]): PdfCopyRun[] {
  const runs: { sourceId: string; steps: PdfOutputStep[] }[] = [];
  for (const step of steps) {
    const lastRun = runs[runs.length - 1];
    const lastStep = lastRun?.steps[lastRun.steps.length - 1];
    if (
      lastRun &&
      lastStep &&
      lastRun.sourceId === step.sourceId &&
      step.sourcePageIndex === lastStep.sourcePageIndex + 1
    ) {
      lastRun.steps.push(step);
    } else {
      runs.push({ sourceId: step.sourceId, steps: [step] });
    }
  }
  return runs;
}

/** 계획의 걸음들을 순서대로 복사해 새 문서를 만든다. 소스가 달라도 순서는 계획이다. */
async function buildDocumentFromSteps(
  cacheSet: DocumentCache,
  steps: readonly PdfOutputStep[],
  title: string | undefined,
): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  for (const run of groupCopyRuns(steps)) {
    const sourceDoc = await documentFor(cacheSet, run.sourceId);
    const copiedPages = await output.copyPages(
      sourceDoc,
      run.steps.map((step) => step.sourcePageIndex),
    );
    for (const [index, step] of run.steps.entries()) {
      const copied = copiedPages[index];
      if (!copied) throw new Error(`페이지를 복사하지 못했어요: ${step.sourceId}#${step.sourcePageIndex}`);
      if (step.rotationDelta !== 0) {
        const next = normalizeRotationDelta(copied.getRotation().angle + step.rotationDelta);
        copied.setRotation(degrees(next));
      }
      output.addPage(copied);
    }
  }
  if (title) output.setTitle(title);
  return output.save();
}

/** 현재 워크벤치 목록 전체를 한 PDF 바이트로 만든다 (병합·재배열·회전의 실행 지점). */
export async function buildMergedPdfBytes(input: {
  readonly state: PdfWorkbenchState;
  readonly bytesBySourceId: ReadonlyMap<string, Uint8Array>;
  readonly title?: string;
}): Promise<Uint8Array> {
  const steps = buildPdfOutputPlan(input.state);
  if (steps.length === 0) throw new Error("내려받을 페이지가 없어요. 먼저 PDF를 추가해 주세요.");
  return buildDocumentFromSteps(createDocumentCache(input.bytesBySourceId), steps, input.title);
}

/** 범위마다 파일 하나씩 — [{ name, bytes }]를 돌려준다. */
export async function buildSplitPdfFiles(input: {
  readonly state: PdfWorkbenchState;
  readonly bytesBySourceId: ReadonlyMap<string, Uint8Array>;
  readonly ranges: readonly PdfPageRange[];
  readonly baseName: string;
  readonly title?: string;
}): Promise<readonly { readonly name: string; readonly bytes: Uint8Array }[]> {
  const plans = buildPdfSplitPlans(input.state, input.ranges);
  const cacheSet = createDocumentCache(input.bytesBySourceId);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const plan of plans) {
    if (plan.steps.length === 0) continue;
    files.push({
      name: suggestPdfOutputName(input.baseName, plan.label),
      bytes: await buildDocumentFromSteps(cacheSet, plan.steps, input.title),
    });
  }
  return files;
}
