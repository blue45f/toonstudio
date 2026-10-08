import { ENGINEERING_ATLAS_LOCAL_FIRST_DB } from "./engineering-atlas-local-first-db";
import { ENGINEERING_ATLAS_LOCAL_FIRST_FILES } from "./engineering-atlas-local-first-files";
import { ENGINEERING_ATLAS_LOCAL_FIRST_PWA } from "./engineering-atlas-local-first-pwa";
import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · local-first 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 서버가 없어도 작업이 남는 구조를 다룬다(단, 브라우저 저장소는 영구 백업이 아니다 — 내보내기·개인 클라우드 백업을 함께).
 * 카드는 주제별 보조 파일에 두고 여기서 한 배열로 모은다.
 */
export const ENGINEERING_ATLAS_LOCAL_FIRST: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_LOCAL_FIRST_DB,
  ...ENGINEERING_ATLAS_LOCAL_FIRST_PWA,
  ...ENGINEERING_ATLAS_LOCAL_FIRST_FILES,
];
