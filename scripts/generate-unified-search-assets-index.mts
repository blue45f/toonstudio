/**
 * 통합 검색 소재 경량 색인 생성기 (A6, 2026-10-22).
 *
 * 소재 전용 표면(/market/browse)의 로컬 정본인 스타터 레코드
 * (packages/contracts CREATOR_MARKETPLACE_STARTER_RECORDS — 서버 카탈로그와
 * 병합되는 바로 그 목록)에서 통합 검색이 필요한 최소 필드(제목·태그·종류)만
 * 뽑아 `apps/web/src/shared/components/unified-search-assets-index.ts`로 적재한다.
 *
 * 왜 전체 레코드를 import하지 않는가: 스타터 카탈로그 전체는 340KB가 넘는
 * 계약 모듈(zod 스키마 포함)이라 검색 청크에 넣을 수 없다. 이 색인은
 * 레코드당 한 줄(튜플)만 남겨 약 21KB로 줄인 사본이며, 원본이 바뀌면
 * 이 스크립트로 재생성한다(수기 편집 금지).
 *
 * 실행: node --experimental-strip-types scripts/generate-unified-search-assets-index.mts
 * (레포의 다른 generate-*.mts 스크립트와 같은 방식)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "../packages/contracts/src/creator-marketplace-starter-catalog";

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/src/shared/components/unified-search-assets-index.ts",
);

/** 태그 구분자 — 태그 문자열에 등장하지 않는 문자만 쓴다. */
const TAG_SEPARATOR = "|";

const rows = CREATOR_MARKETPLACE_STARTER_RECORDS.map((record) => {
  const tags = record.tags.map((tag) => tag.trim()).filter(Boolean);
  for (const tag of tags) {
    if (tag.includes(TAG_SEPARATOR)) {
      throw new Error(`태그에 구분자(${TAG_SEPARATOR})가 들어 있어 색인할 수 없습니다: ${record.id} / ${tag}`);
    }
  }
  return [record.id, record.name, record.kind, tags.join(TAG_SEPARATOR)] as const;
});

const body = `/**
 * 통합 검색 소재 경량 색인 — 생성 파일, 수기 편집 금지 (A6, 2026-10-22).
 *
 * 생성: scripts/generate-unified-search-assets-index.mts
 * 원본: packages/contracts CREATOR_MARKETPLACE_STARTER_RECORDS
 *       (소재 전용 표면 /market/browse가 서버 결과와 병합하는 로컬 정본 목록)
 *
 * 레코드당 [id, 제목, 종류, 태그(| 구분)] 튜플만 남긴 경량 사본이다.
 * 소재 원본 레코드(설명·라이선스·미리보기 등)는 싣지 않는다 — 통합 검색은
 * 제목·태그·종류로 찾고, 상세는 도착지(/market/resource/<id>)가 맡는다.
 * 총 ${rows.length}건.
 */

export type UnifiedAssetIndexRow = readonly [
  id: string,
  title: string,
  kind: string,
  tagsJoined: string,
];

export const UNIFIED_ASSETS_INDEX: readonly UnifiedAssetIndexRow[] = [
${rows.map((row) => `  ${JSON.stringify(row)},`).join("\n")}
];
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(OUTPUT, "utf8");
  if (current !== body) {
    console.error(
      "통합 검색 소재 색인이 원본 스타터 카탈로그와 어긋납니다. 복구: node --experimental-strip-types scripts/generate-unified-search-assets-index.mts",
    );
    process.exit(1);
  }
  console.log(`unified-search-assets-index: 최신 상태입니다 (${rows.length}건)`);
} else {
  writeFileSync(OUTPUT, body, "utf8");
  console.log(`unified-search-assets-index: ${rows.length} rows -> ${OUTPUT}`);
}
