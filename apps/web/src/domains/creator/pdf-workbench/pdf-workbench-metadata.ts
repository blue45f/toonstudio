/**
 * pdf-workbench-metadata.ts — PDF 문서 속성(메타데이터) 모델·스탬프·읽기.
 *
 * 배경: PdfCraft 대조(artcraft-features REPORT §1.2·§2)에서 확인된 빈틈 —
 * 워크벤치 엔진은 출력 제목만 세울 수 있어, 출판·공유용 PDF에 저자·주제·
 * 키워드를 남길 방법이 없었고, 가져온 소스 PDF에 이미 들어 있는 속성도
 * 화면에서 볼 수 없었다. 이 모듈이 그 빈틈의 정본이다.
 *
 * 경계:
 * - 전부 클라이언트에서 돌고 서버로 보내지 않는다 (엔진과 같은 경계).
 * - 쓰기는 두 지점에서 쓴다: 엔진이 병합·분할 문서를 저장하기 직전
 *   `stampPdfMetadata(doc, …)`로 직접 찍고(재파싱 없음), 이미 만들어진
 *   바이트에는 `applyPdfMetadata(bytes, …)` 후처리로 찍는다.
 * - 읽기는 `readPdfMetadataFromDocument(doc)`(동기, 엔진 inspect 재사용)와
 *   `readPdfMetadata(bytes)`(단독 호출용)를 함께 둔다.
 * - 폼 상태(문자열 4칸)와 문서 속성(키워드 배열) 사이의 변환도 여기 둔다 —
 *   패널(pdf-workbench-metadata-panel)은 표시만 맡고 규칙은 테스트로 고정한다.
 *
 * 사용자 노출 문자열은 한글로 둔다.
 */

import { PDFDocument } from "pdf-lib";

/** PDF 정보 사전에 남기는 문서 속성. 빈 칸은 "기록하지 않음"이다. */
export interface PdfDocumentMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
}

/** 소스 PDF에서 읽은 속성 + 표시용 부가 정보. 패널의 소스 속성 표가 쓴다. */
export interface PdfSourceMetadata extends PdfDocumentMetadata {
  readonly creator?: string;
  readonly producer?: string;
  readonly creationDate?: Date;
  readonly modificationDate?: Date;
}

/** 출력 설정 폼의 값 — 키워드는 쉼표로 구분한 한 줄 문자열로 편집한다. */
export interface PdfMetadataFormValue {
  readonly title: string;
  readonly author: string;
  readonly subject: string;
  readonly keywordsText: string;
}

export const EMPTY_PDF_METADATA_FORM: PdfMetadataFormValue = {
  title: "",
  author: "",
  subject: "",
  keywordsText: "",
};

/** 필드별 권장 최대 길이 — PDF 뷰어·메타데이터 패널에서 잘리지 않는 실용 상한. */
export const PDF_METADATA_FIELD_LIMITS = {
  title: 200,
  author: 120,
  subject: 300,
  keyword: 60,
  keywordsMax: 20,
} as const;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clampLength(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** 키워드 배열 정규화: 공백 정리 → 빈 값 제거 → 중복 제거(첫 등장 순서) → 개수·길이 상한. */
export function normalizePdfKeywords(keywords: readonly string[] | undefined): readonly string[] | undefined {
  if (!keywords) return undefined;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of keywords) {
    const keyword = clampLength(raw.trim().replace(/\s+/gu, " "), PDF_METADATA_FIELD_LIMITS.keyword);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    normalized.push(keyword);
    if (normalized.length >= PDF_METADATA_FIELD_LIMITS.keywordsMax) break;
  }
  return normalized.length > 0 ? normalized : undefined;
}

/** 빈 값·공백을 제거하고 길이를 자른 정규형 메타데이터. 전부 비면 null. */
export function normalizePdfMetadata(input: PdfDocumentMetadata): PdfDocumentMetadata | null {
  const normalized: PdfDocumentMetadata = {
    title: clean(input.title) ? clampLength(clean(input.title) as string, PDF_METADATA_FIELD_LIMITS.title) : undefined,
    author: clean(input.author) ? clampLength(clean(input.author) as string, PDF_METADATA_FIELD_LIMITS.author) : undefined,
    subject: clean(input.subject) ? clampLength(clean(input.subject) as string, PDF_METADATA_FIELD_LIMITS.subject) : undefined,
    keywords: normalizePdfKeywords(input.keywords),
  };
  return normalized.title || normalized.author || normalized.subject || normalized.keywords ? normalized : null;
}

/** "웹툰, 단행본, , 회차 1" 같은 입력 문자열을 키워드 배열로 파싱한다 (쉼표·줄바꿈 구분, 중복 제거). */
export function parsePdfKeywordsInput(text: string): readonly string[] {
  return normalizePdfKeywords(text.split(/[,\n]/u)) ?? [];
}

/** 키워드 배열을 폼 표시용 한 줄 문자열로 되돌린다. */
export function formatPdfKeywordsInput(keywords: readonly string[] | undefined): string {
  return (keywords ?? []).join(", ");
}

/** 폼 값 → 문서 속성. 전부 비면 null (스탬프를 건너뛰는 신호). */
export function metadataFromFormValue(form: PdfMetadataFormValue): PdfDocumentMetadata | null {
  return normalizePdfMetadata({
    title: form.title,
    author: form.author,
    subject: form.subject,
    keywords: parsePdfKeywordsInput(form.keywordsText),
  });
}

/** 문서 속성 → 폼 값 (소스 속성을 출력 설정 초깃값으로 가져올 때 쓴다). */
export function formValueFromMetadata(metadata: PdfDocumentMetadata | undefined): PdfMetadataFormValue {
  if (!metadata) return EMPTY_PDF_METADATA_FORM;
  return {
    title: metadata.title ?? "",
    author: metadata.author ?? "",
    subject: metadata.subject ?? "",
    keywordsText: formatPdfKeywordsInput(metadata.keywords),
  };
}

/**
 * 이미 열린 문서에 속성을 직접 찍는다. 엔진의 저장 직전 지점이 쓰는 경로.
 * 정규형이 비면 아무것도 바꾸지 않고 false를 돌려준다 (기존 제목 단독 호출과
 * 동작이 달라지지 않게, producer도 이때는 건드리지 않는다).
 */
export function stampPdfMetadata(doc: PDFDocument, metadata: PdfDocumentMetadata): boolean {
  const normalized = normalizePdfMetadata(metadata);
  if (!normalized) return false;
  if (normalized.title) doc.setTitle(normalized.title);
  if (normalized.author) doc.setAuthor(normalized.author);
  if (normalized.subject) doc.setSubject(normalized.subject);
  if (normalized.keywords) doc.setKeywords([...normalized.keywords]);
  doc.setProducer("ToonStudio");
  doc.setModificationDate(new Date());
  return true;
}

/** PDF 바이트에 메타데이터를 적용해 새 바이트를 돌려준다. 전부 비면 원본을 그대로 돌려준다. */
export async function applyPdfMetadata(bytes: Uint8Array, metadata: PdfDocumentMetadata): Promise<Uint8Array> {
  if (!normalizePdfMetadata(metadata)) return bytes;
  const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  stampPdfMetadata(doc, metadata);
  return doc.save();
}

/** pdf-lib가 돌려주는 키워드 문자열을 배열로 푼다. 쉼표·공백 혼합 표기를 모두 허용한다. */
export function splitPdfKeywordsRaw(raw: string | undefined): readonly string[] | undefined {
  if (!raw) return undefined;
  return normalizePdfKeywords(raw.split(/[,\s]+/u));
}

/** 이미 열린 문서에서 속성을 읽는다 (동기). 엔진 inspectPdfSource가 재사용한다. */
export function readPdfMetadataFromDocument(doc: PDFDocument): PdfSourceMetadata {
  return {
    title: clean(doc.getTitle()),
    author: clean(doc.getAuthor()),
    subject: clean(doc.getSubject()),
    keywords: splitPdfKeywordsRaw(doc.getKeywords()),
    creator: clean(doc.getCreator()),
    producer: clean(doc.getProducer()),
    creationDate: doc.getCreationDate(),
    modificationDate: doc.getModificationDate(),
  };
}

/** 기존 PDF 바이트에서 문서 속성을 읽는다 (워크벤치 소스 정보 표시용). */
export async function readPdfMetadata(bytes: Uint8Array): Promise<PdfSourceMetadata> {
  const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false, ignoreEncryption: true });
  return readPdfMetadataFromDocument(doc);
}

/** 속성이 하나라도 있는지 — 패널이 "속성 없음" 안내를 보일지 가르는 판정. */
export function hasPdfMetadata(metadata: PdfDocumentMetadata | undefined): boolean {
  if (!metadata) return false;
  return Boolean(metadata.title || metadata.author || metadata.subject || (metadata.keywords && metadata.keywords.length > 0));
}

/** 표시 순서가 고정된 속성 행 라벨. 패널·테스트가 같은 순서를 공유한다. */
export const PDF_METADATA_FIELD_LABELS = {
  title: "제목",
  author: "저자",
  subject: "주제",
  keywords: "키워드",
} as const;

export interface PdfMetadataDisplayRow {
  readonly key: "title" | "author" | "subject" | "keywords";
  readonly label: string;
  /** 표시할 값. 속성이 없으면 undefined — 패널이 행 자체를 숨긴다. */
  readonly value?: string;
}

/** 소스 속성을 표시 행으로 변환한다. 빈 속성은 행을 만들지 않는다. */
export function describePdfMetadataRows(metadata: PdfDocumentMetadata | undefined): readonly PdfMetadataDisplayRow[] {
  if (!metadata) return [];
  const rows: PdfMetadataDisplayRow[] = [
    { key: "title", label: PDF_METADATA_FIELD_LABELS.title, value: clean(metadata.title) },
    { key: "author", label: PDF_METADATA_FIELD_LABELS.author, value: clean(metadata.author) },
    { key: "subject", label: PDF_METADATA_FIELD_LABELS.subject, value: clean(metadata.subject) },
    {
      key: "keywords",
      label: PDF_METADATA_FIELD_LABELS.keywords,
      value: metadata.keywords && metadata.keywords.length > 0 ? formatPdfKeywordsInput(metadata.keywords) : undefined,
    },
  ];
  return rows.filter((row) => row.value !== undefined);
}
