import { describe, expect, it } from "vitest";

import {
  classifyReviewConnection,
  externalReviewDraftKey,
  extractReviewTags,
  filterReviewResponses,
  isDraftWorthSaving,
  needsConnectionFallback,
  parseExternalReviewDraft,
  permissionScopeRows,
  serializeExternalReviewDraft,
} from "./external-review-entry";

describe("classifyReviewConnection", () => {
  it("오프라인을 최우선으로 분류하고 폴백 안내 대상으로 본다", () => {
    expect(classifyReviewConnection({ online: false, connection: { effectiveType: "4g" } })).toBe("offline");
    expect(needsConnectionFallback("offline")).toBe(true);
  });

  it("2G 계열과 saveData를 저속으로 분류한다", () => {
    expect(classifyReviewConnection({ online: true, connection: { effectiveType: "2g" } })).toBe("slow");
    expect(classifyReviewConnection({ online: true, connection: { effectiveType: "slow-2g" } })).toBe("slow");
    expect(classifyReviewConnection({ online: true, connection: { saveData: true, effectiveType: "4g" } })).toBe("slow");
  });

  it("정보가 없거나 빠른 연결은 온라인으로 보고 안내를 띄우지 않는다", () => {
    expect(classifyReviewConnection({ online: true })).toBe("online");
    expect(classifyReviewConnection({ online: true, connection: { effectiveType: "4g" } })).toBe("online");
    expect(needsConnectionFallback("online")).toBe(false);
  });
});

describe("외부 검수 초안 임시 저장", () => {
  it("직렬화 왕복이 되고 검수 건별 키가 분리된다", () => {
    const draft = { reviewerName: "김검수", decision: "comment", note: "3컷 대사 확인", savedAt: "2026-10-14T00:00:00.000Z" };
    expect(parseExternalReviewDraft(serializeExternalReviewDraft(draft))).toEqual(draft);
    expect(externalReviewDraftKey("r1")).not.toBe(externalReviewDraftKey("r2"));
  });

  it("깨진 저장값은 null로 폴백한다", () => {
    expect(parseExternalReviewDraft(null)).toBeNull();
    expect(parseExternalReviewDraft("{broken")).toBeNull();
    expect(parseExternalReviewDraft(JSON.stringify({ reviewerName: 1 }))).toBeNull();
  });

  it("빈 초안은 저장 가치가 없다고 본다", () => {
    expect(isDraftWorthSaving({ reviewerName: " ", note: "" })).toBe(false);
    expect(isDraftWorthSaving({ reviewerName: "", note: "의견" })).toBe(true);
  });
});

describe("코멘트·태그 검색 자산화", () => {
  const responses = [
    { reviewerName: "김검수", decision: "comment", note: "말풍선 위치 #레이아웃 확인 부탁", createdAt: "2026-10-14T00:00:00.000Z" },
    { reviewerName: "Lee", decision: "approve", note: "좋습니다 #승인완료", createdAt: "2026-10-14T01:00:00.000Z" },
    { reviewerName: "Park", decision: "request-changes", note: "배경 톤 조정", createdAt: "2026-10-14T02:00:00.000Z" },
  ];
  const label = (decision: string) => ({ comment: "댓글", approve: "승인", "request-changes": "수정 요청" })[decision] ?? decision;

  it("태그를 순서 유지·중복 제거로 추출한다", () => {
    expect(extractReviewTags(responses.map((r) => r.note))).toEqual(["레이아웃", "승인완료"]);
    expect(extractReviewTags(["#태그, 끝", "#태그 반복"])).toEqual(["태그"]);
  });

  it("이름·본문·결정 라벨·태그로 검색된다", () => {
    expect(filterReviewResponses(responses, "lee", label)).toHaveLength(1);
    expect(filterReviewResponses(responses, "#레이아웃", label)).toHaveLength(1);
    expect(filterReviewResponses(responses, "수정 요청", label)).toHaveLength(1);
    expect(filterReviewResponses(responses, "  ", label)).toHaveLength(3);
    expect(filterReviewResponses(responses, "없는검색어", label)).toHaveLength(0);
  });
});

describe("permissionScopeRows", () => {
  it("고정 순서로 허용/차단을 돌려주고 보기는 항상 허용이다", () => {
    expect(permissionScopeRows(["comment"])).toEqual([
      { permission: "view", allowed: true },
      { permission: "comment", allowed: true },
      { permission: "approve", allowed: false },
      { permission: "download", allowed: false },
    ]);
  });
});
