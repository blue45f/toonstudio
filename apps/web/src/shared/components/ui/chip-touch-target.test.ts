// 터치 타겟 44px 표준화 계약 테스트.
// 상호작용 칩은 기본 44px(min-h-11)이어야 하고, 예외는 compact 같은 명시 prop 으로만 허용한다.
// CalendarPage 의 주요 칩·버튼도 같은 하한을 지켜 pointer-coarse 우회(36px)로 회귀하지 않는다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const chipSource = readFileSync(join(HERE, "chip.tsx"), "utf-8");
const calendarSource = readFileSync(
  join(HERE, "../../../domains/catalog/CalendarPage.tsx"),
  "utf-8",
);
const panelSource = readFileSync(join(HERE, "../title-filter-panel.tsx"), "utf-8");
const exploreSource = readFileSync(
  join(HERE, "../../../domains/catalog/ExplorePage.tsx"),
  "utf-8",
);

describe("칩 터치 타겟 44px 계약", () => {
  it("TagChip 기본값은 min-h-11 이고 예외는 명시 prop(compact)뿐이다", () => {
    // 기본 분기(compact=false)에 44px 하한이 있어야 한다.
    expect(chipSource).toContain('"min-h-11 px-3 py-1 text-[0.7rem]"');
    expect(chipSource).toContain('"min-h-11 px-3.5 py-1 text-xs"');
    // compact 는 구조분해로 소비되어 DOM 속성으로 새지 않아야 한다.
    expect(chipSource).toContain("compact = false,");
    expect(chipSource).toContain("compact?: boolean;");
    // 기본 분기가 compact 분기보다 뒤(삼항의 else)에만 등장 — 즉 기본값이 44px 이다.
    const compactIdx = chipSource.indexOf('? "px-2 py-0.5 text-[0.7rem]"');
    const defaultIdx = chipSource.indexOf('"min-h-11 px-3 py-1 text-[0.7rem]"');
    expect(compactIdx).toBeGreaterThan(-1);
    expect(defaultIdx).toBeGreaterThan(compactIdx);
  });

  it("CalendarPage 플랫폼 칩은 44px 이고 coarse 우회(36px)로 되돌아가지 않는다", () => {
    expect(calendarSource).toContain(
      '"inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors"',
    );
    expect(calendarSource).not.toContain("pointer-coarse:h-9");
    expect(calendarSource).not.toContain("inline-flex h-7 items-center");
  });

  it("TitleFilterPanel 공용 칩 헬퍼와 ExplorePage 태그 칩도 44px 이다", () => {
    expect(panelSource).toContain(
      '"inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[0.72rem] transition-colors"',
    );
    expect(panelSource).not.toContain('"inline-flex h-7 items-center');
    expect(exploreSource).toContain('"group inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5');
  });

  it("CalendarPage 주요 버튼은 44px 미만 하한을 쓰지 않는다", () => {
    expect(calendarSource).not.toContain("min-h-9");
    // "오늘 보기" 버튼과 "전체 보기" 버튼이 44px 하한을 가진다.
    expect(calendarSource).toContain(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border border-accent/40",
    );
    expect(calendarSource).toContain(
      'className="inline-flex min-h-11 items-center px-1 text-xs text-accent hover:underline"',
    );
  });
});
