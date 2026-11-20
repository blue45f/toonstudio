import { createRecord, emptyData } from "@toonstudio/contracts/admin-production-change";
import { describe, expect, it } from "vitest";

import { emptyChangeFilters, filterProductionChanges } from "./production-change-list";
import { changeCsv, writeDataPath } from "./production-change-ui";

const actor = { userId: "synthetic-admin", displayName: "합성 관리자" };
describe("제작 변경 목록과 편집 보존", () => {
  it("상태·영향도·충돌·최신성·검색을 조합하며 높은 영향도를 우선 정렬한다", () => {
    const low = createRecord({ ...emptyData(), title: "장면 A", project: "합성 프로젝트", impact: "low", conflictState: "none" }, actor);
    const high = createRecord({ ...emptyData(), title: "장면 B", project: "합성 프로젝트", impact: "high", conflictState: "open" }, actor);
    const records = [low, high];
    expect(filterProductionChanges(records, "all", { ...emptyChangeFilters(), sort: "impact" }).map(record => record.id)).toEqual([high.id, low.id]);
    expect(filterProductionChanges(records, "all", { ...emptyChangeFilters(), search: "합성", status: "draft", impact: "high", conflict: "open", freshness: "unknown" }).map(record => record.id)).toEqual([high.id]);
    expect(filterProductionChanges(records, "approval", emptyChangeFilters())).toEqual([]);
    expect(filterProductionChanges(records, "all", { ...emptyChangeFilters(), freshness: "fresh" })).toEqual([]);
    expect(records).toEqual([low, high]);
  });
  it("입력 변경은 원본 스냅샷을 보존하고 임의 경로를 추가하지 않는다", () => {
    const original = emptyData(); const changed = writeDataPath(original, "conflict.local.summary", "로컬 변경");
    expect(changed.conflict.local.summary).toBe("로컬 변경"); expect(original.conflict.local.summary).toBe("");
    expect(() => writeDataPath(original, "__proto__.polluted", true)).toThrow();
    expect(() => writeDataPath(original, "extra", true)).toThrow();
  });
  it("CSV 셀의 수식과 인용부호를 이스케이프한다", () => {
    const record = createRecord({ ...emptyData(), title: '=HYPERLINK("https://example.test")' }, actor);
    const csv = changeCsv([record]);
    expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain('""https://example.test""');
  });
});
