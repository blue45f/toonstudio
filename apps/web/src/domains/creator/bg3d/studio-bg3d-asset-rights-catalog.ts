/**
 * 번들 환경 카탈로그의 출처 기록을 권리 보기 모델이 읽는 형태로 건네는 얇은 어댑터.
 * 권리 보기 모델(순수)이 정적 자산 매니페스트에 의존하지 않게 하고, 카탈로그를 이미 불러오는 패널 쪽에서만 쓴다.
 */

import { getStudioBg3dEnvironmentAsset } from "./studio-bg3d-environment-catalog";

import type { StudioBg3dBundledProvenanceLike } from "./studio-bg3d-asset-rights-view";

export function getStudioBg3dBundledProvenance(entryId: string): StudioBg3dBundledProvenanceLike | undefined {
  return getStudioBg3dEnvironmentAsset(entryId)?.provenance;
}
