// 그리기 검증기가 브라우저 빌드의 저장 능력을 있는 그대로 기록하게 하는 도우미.
//
// Linux 용 Playwright WebKit 빌드는 navigator.storage 자체를 노출하지 않아 OPFS 기반 SQLite 를 쓸 수 없다
// (임시·영구 컨텍스트 모두 같다). 그런 빌드에서 "saved" 를 기다리면 제품이 아니라 플랫폼 한계 때문에 검증이 영원히
// 실패하므로, 제품이 문서화한 세션 전용 계약(경고·편집 가능·가짜 저장 표시 없음)을 대신 검증한다.
// 진입점이 있는 엔진은 어떤 경우에도 "saved" 를 요구한다.

/** 페이지가 OPFS 진입점(navigator.storage.getDirectory)을 노출하는지 같은 출처에서 확인한다. */
export function hasOpfsEntryPoint(page) {
  return page.evaluate(() => typeof navigator.storage?.getDirectory === "function");
}

/**
 * 엔진이 기대해야 할 저장 상태.
 * 진입점이 없는 WebKit 만 세션 전용으로 내리고, 나머지(진입점이 있는 WebKit 포함)는 항상 saved 다.
 * 진입점이 있는데 saved 가 아니면 플랫폼 한계가 아니라 결함이므로 호출부의 saved 기대가 그대로 실패시킨다.
 */
export function expectedDrawingPersistence(engine, opfsEntryPoint) {
  return engine === "webkit" && !opfsEntryPoint ? "session-only" : "saved";
}
