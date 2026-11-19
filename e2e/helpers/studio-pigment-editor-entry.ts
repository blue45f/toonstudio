import { waitForEditorSettled } from "./studio-editor-a11y";

import type { Page } from "@playwright/test";

/** 원고의 실제 셸·명령·로딩·오프라인 준비 조건을 확인하고 원고 연결 문맥을 유지한다. */
export async function waitForPigmentEditorSettled(page: Page): Promise<void> {
  const before = new URL(page.url());
  // Clarity는 현재 원고의 상시 셸이다. 공통 준비가 그 버튼을 지원하므로 배치 전환이나
  // locator handler로 셸을 제거하지 않는다. 출력·프로젝트 명령은 각 작업에서 UI로 연다.
  await waitForEditorSettled(page);
  const after = new URL(page.url());
  if (after.origin !== before.origin || after.pathname !== before.pathname || after.hash !== before.hash) {
    throw new Error("안료 준비가 원고의 주소를 변경했습니다.");
  }
  for (const key of new Set(before.searchParams.keys())) {
    if (JSON.stringify(after.searchParams.getAll(key)) !== JSON.stringify(before.searchParams.getAll(key))) {
      throw new Error(`안료 준비가 원고의 기존 연결 문맥을 변경했습니다: ${key}`);
    }
  }
}
