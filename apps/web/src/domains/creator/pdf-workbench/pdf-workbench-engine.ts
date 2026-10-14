/**
 * PDF 워크벤치 엔진 — pdf-lib 어댑터. 모델(pdf-workbench-model)의 순수 계획을 실제
 * PDF 바이트 연산으로 바꾼다. 전부 클라이언트에서 돌고 서버로 보내지 않는다.
 *
 * 담당: 원본 검사(페이지 수·문서 속성), 내용 지문(SHA-256 — 앵커의 documentId 재료),
 * 출력 계획 실행(병합·재배열·회전), 범위 분할 파일 생성.
 *
 * 문서 속성: 출력(병합·분할)은 pdf-workbench-metadata의 속성을 받아 저장 직전에
 * 찍는다. `metadata`가 정본이고, 기존 호출자의 `title` 단독 지정은 그대로 동작한다
 * (metadata가 있으면 그쪽이 우선). 소스 검사는 읽은 속성을 함께 돌려줘서
 * 화면이 "소스 PDF에 이미 들어 있는 속성"을 표시할 수 있게 한다.
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
import {
  readPdfMetadataFromDocument,
  stampPdfMetadata,
  type PdfDocumentMetadata,
  type PdfSourceMetadata,
} from "./pdf-workbench-metadata";

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
  /** 원본 PDF에 이미 기록돼 있던 문서 속성 — 화면의 소스 속성 표가 표시한다. */
  readonly metadata: PdfSourceMetadata;
}

/**
 * 이미 열린 문서에서 속성을 읽는다. 정보 사전이 깨져 읽기에 실패해도 파일
 * 추가 자체(페이지 수·지문)는 막지 않는다 — 빈 속성을 돌려주면 화면은
 * "기록된 속성이 없어요"로 표시한다 (썸네일 실패를 자리표시로 대체하는 것과
 * 같은 관례: 부가 정보 실패가 본 작업을 죽이지 않는다).
 */
function readSourceMetadata(doc: PDFDocument): PdfSourceMetadata {
  try {
    return readPdfMetadataFromDocument(doc);
  } catch {
    return {};
  }
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
    metadata: readSourceMetadata(doc),
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

/** 출력 속성 결정: metadata가 정본이고, 없을 때만 기존 title 단독 지정을 제목으로 쓴다. */
function resolveOutputMetadata(input: {
  readonly title?: string;
  readonly metadata?: PdfDocumentMetadata;
}): PdfDocumentMetadata {
  if (input.metadata) return input.metadata;
  return input.title ? { title: input.title } : {};
}

/** 계획의 걸음들을 순서대로 복사해 새 문서를 만든다. 소스가 달라도 순서는 계획이다. */
async function buildDocumentFromSteps(
  cacheSet: DocumentCache,
  steps: readonly PdfOutputStep[],
  metadata: PdfDocumentMetadata,
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
  // 저장 직전 1회 스탬프 — 속성이 비면 stampPdfMetadata가 no-op이라
  // producer·수정일도 건드리지 않아 기존 출력과 바이트 동작이 달라지지 않는다.
  stampPdfMetadata(output, metadata);
  return output.save();
}

/** 현재 워크벤치 목록 전체를 한 PDF 바이트로 만든다 (병합·재배열·회전의 실행 지점). */
export async function buildMergedPdfBytes(input: {
  readonly state: PdfWorkbenchState;
  readonly bytesBySourceId: ReadonlyMap<string, Uint8Array>;
  /** @deprecated metadata.title을 쓸 것. metadata가 없을 때만 제목으로 반영된다. */
  readonly title?: string;
  /** 결과 PDF에 기록할 문서 속성 (제목·저자·주제·키워드). */
  readonly metadata?: PdfDocumentMetadata;
}): Promise<Uint8Array> {
  const steps = buildPdfOutputPlan(input.state);
  if (steps.length === 0) throw new Error("내려받을 페이지가 없어요. 먼저 PDF를 추가해 주세요.");
  return buildDocumentFromSteps(createDocumentCache(input.bytesBySourceId), steps, resolveOutputMetadata(input));
}

/** 범위마다 파일 하나씩 — [{ name, bytes }]를 돌려준다. */
export async function buildSplitPdfFiles(input: {
  readonly state: PdfWorkbenchState;
  readonly bytesBySourceId: ReadonlyMap<string, Uint8Array>;
  readonly ranges: readonly PdfPageRange[];
  readonly baseName: string;
  /** @deprecated metadata.title을 쓸 것. metadata가 없을 때만 제목으로 반영된다. */
  readonly title?: string;
  /** 분할 파일 전부에 기록할 문서 속성 (제목·저자·주제·키워드). */
  readonly metadata?: PdfDocumentMetadata;
}): Promise<readonly { readonly name: string; readonly bytes: Uint8Array }[]> {
  const plans = buildPdfSplitPlans(input.state, input.ranges);
  const cacheSet = createDocumentCache(input.bytesBySourceId);
  const metadata = resolveOutputMetadata(input);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const plan of plans) {
    if (plan.steps.length === 0) continue;
    files.push({
      name: suggestPdfOutputName(input.baseName, plan.label),
      bytes: await buildDocumentFromSteps(cacheSet, plan.steps, metadata),
    });
  }
  return files;
}
