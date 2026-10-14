import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 태블릿 터치 컷 편집 동선 계약 (G3).
 *
 * 전수 점검에서 확정한 단절 3건을 소스 수준으로 고정한다:
 * 1. 캔버스 컨텍스트 메뉴(요소 편집의 주 경로) 항목 높이가 44px 터치 표준에 닿는다.
 * 2. 컷(페이지) 다중 선택에 수정 키가 필요 없는 터치 모드가 있고, 포인터 선택에 실제로 배선돼 있다.
 * 3. 컷 순서 변경은 HTML5 드래그(터치 불가)뿐 아니라 카드 버튼 경로가 존재하고, 카드 안내가 그 경로를 알린다.
 */
function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("캔버스 컨텍스트 메뉴 터치 타겟", () => {
  const menu = source("./canvas/StudioCanvasContextMenu.tsx");

  it("모든 메뉴 항목 버튼이 min-h-11(44px)을 가진다", () => {
    // 항목 버튼은 전부 "w-full items-center gap-2" 행 레이아웃을 공유한다(구분선·컨테이너는 제외).
    const itemClasses = [...menu.matchAll(/className="([^"]*w-full items-center gap-2[^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(itemClasses.length).toBeGreaterThanOrEqual(16);
    for (const className of itemClasses) {
      expect(className).toContain("min-h-11");
    }
  });

  it("py-1.5만으로 높이를 만들던 구 항목 패턴이 남아 있지 않다", () => {
    expect(menu).not.toMatch(/className="flex w-full items-center gap-2 rounded px-2\.5 py-1\.5/);
  });
});

describe("컷 목록 터치 동선", () => {
  const pane = source("./StudioPageListPaneBase.tsx");
  const dnd = source("./studio-page-dnd.ts");

  it("터치 다중 선택 토글이 존재하고 aria-pressed로 상태가 노출된다", () => {
    expect(pane).toContain('data-testid="studio-page-touch-multi-select"');
    expect(pane).toContain("aria-pressed={touchMultiSelect}");
    expect(pane).toContain("여러 개 선택");
  });

  it("터치 모드가 포인터 선택의 additive 입력에 실제로 배선돼 있다", () => {
    expect(pane).toContain(
      "additive: event.metaKey || event.ctrlKey || touchMultiSelect,",
    );
  });

  it("순서 변경 드래그는 HTML5 전용임을 전제로, 카드 버튼 대체 경로가 있다", () => {
    // HTML5 DragEvent 기반 재배열은 터치 브라우저에서 동작하지 않으므로 버튼 경로가 필수다.
    expect(dnd).toContain("DragEvent");
    expect(pane).toContain('aria-label="위로 이동"');
    expect(pane).toContain('aria-label="아래로 이동"');
    expect(pane).toContain('aria-label="맨 위로 이동"');
    expect(pane).toContain('aria-label="맨 아래로 이동"');
  });

  it("카드 안내가 드래그·수정 키 외에 터치 경로(버튼·여러 개 선택)를 함께 알린다", () => {
    expect(pane).toContain("카드 버튼으로 순서 변경·이름 편집");
    expect(pane).toContain("'여러 개 선택'을 켜면 탭으로 다중 선택");
  });
});
