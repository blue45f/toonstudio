import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings, statusStringKind } from "./status-i18n";

describe("statusStringKind", () => {
  it("로딩·실패 문구를 분류하고 일반 문구는 통과시킨다", () => {
    expect(statusStringKind("패널을 여는 중...")).toBe("loading");
    expect(statusStringKind("리뷰 데이터를 불러오지 못했습니다.")).toBe("failure");
    expect(statusStringKind("Loading editor...")).toBe("loading");
    expect(statusStringKind("Failed to load reviews")).toBe("failure");
    expect(statusStringKind("최신 revision 불러오기")).toBeNull();
    expect(statusStringKind("에셋 진입 안내")).toBeNull();
  });
});

describe("scanHardcodedStatusStrings — 하드코딩 검출", () => {
  it("label 속성의 한국어 로딩 리터럴을 잡는다", () => {
    const source = `<StudioRouteLoading label="Studio 편집기를 여는 중..." />`;
    const violations = scanHardcodedStatusStrings(source);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe("loading");
    expect(violations[0]?.rule).toBe("display-prop-literal");
  });

  it("기본값 파라미터의 로딩 리터럴을 잡는다", () => {
    const source = `export function StudioPanelLoading({ label = "패널을 여는 중..." }: Props) {}`;
    expect(scanHardcodedStatusStrings(source)).toHaveLength(1);
  });

  it("loadingLabel 속성의 한국어 로딩 리터럴을 잡는다 (인스펙터 섹션 가족)", () => {
    const source = `<StudioInspectorSection sectionId="tool.x" loadingLabel="선 보정을 여는 중...">`;
    const violations = scanHardcodedStatusStrings(source);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe("loading");
    expect(violations[0]?.rule).toBe("display-prop-literal");
  });

  it("에러 상수(REVIEWS_FETCH_ERROR 패턴)를 잡는다", () => {
    const source = `const REVIEWS_FETCH_ERROR = "리뷰 데이터를 불러오지 못했습니다.";`;
    const violations = scanHardcodedStatusStrings(source);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe("failure");
    expect(violations[0]?.rule).toBe("named-status-const");
  });

  it("키 맵이 없는 상태 맵의 항목 값을 잡는다", () => {
    const source = [
      `const ROUTE_ERROR_DETAILS = {`,
      `  "invalid-work-id": "작품 ID를 안전하게 읽을 수 없습니다.",`,
      `};`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(source);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("named-status-map-entry");
  });

  it("JSX 텍스트와 setError 호출의 에러 문구를 잡는다", () => {
    const source = [
      `<p>불러오지 못했습니다. 다시 시도해 주세요.</p>`,
      `setError("저장에 실패했습니다.");`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(source);
    expect(violations.map((v) => v.rule)).toEqual(["jsx-text", "error-channel-call"]);
    expect(violations.every((v) => v.kind === "failure")).toBe(true);
  });

  it("useApiResource의 한국어 에러 인자를 잡는다", () => {
    const source = `useApiResource<Response>(url, "리뷰 데이터를 불러오지 못했습니다.");`;
    const violations = scanHardcodedStatusStrings(source);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("api-error-literal");
  });

  it("영문 하드코딩 로딩·에러도 잡는다", () => {
    const source = `<Spinner label="Loading editor..." />\n<ErrorState message="Failed to load" />`;
    expect(scanHardcodedStatusStrings(source)).toHaveLength(2);
  });
});

describe("scanHardcodedStatusStrings — 허용 패턴", () => {
  it("useT 키 + 한국어 폴백은 허용한다", () => {
    const source = `<StudioRouteLoading label={t("studio.canvas.shell.loadingEditor", "Studio 편집기를 여는 중...")} />`;
    expect(scanHardcodedStatusStrings(source)).toEqual([]);
  });

  it("useBilingual 쌍과 정적 등록 호출은 허용한다", () => {
    const source = [
      `const label = t("패널을 여는 중...", "Opening panel...");`,
      `const key = defineBilingualText("scope", "id", "불러오지 못했습니다.", "Failed to load.");`,
      `const text = translateCurrentStaticSourceText("scope", "ko", "저장에 실패했습니다.");`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(source)).toEqual([]);
  });

  it("*_KEYS 맵과 짝을 이룬 폴백 데이터 맵은 허용한다", () => {
    const source = [
      `const ROUTE_ERROR_DETAILS = {`,
      `  "invalid-work-id": "작품 ID를 안전하게 읽을 수 없습니다.",`,
      `};`,
      `const ROUTE_ERROR_DETAIL_KEYS = {`,
      `  "invalid-work-id": "studio.canvas.shell.routeErrorDetail.invalidWorkId",`,
      `};`,
      `const text = t(ROUTE_ERROR_DETAIL_KEYS[code], ROUTE_ERROR_DETAILS[code]);`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(source)).toEqual([]);
  });

  it("주석·콘솔 로그·i18n-exempt 줄은 건드리지 않는다", () => {
    const source = [
      `// 로딩 실패 시 기본값은 "여는 중..." 이다`,
      `console.error("데이터를 불러오지 못했습니다", error);`,
      `const FALLBACK = "여는 중..."; // i18n-exempt: 테스트 픽스처 전용`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(source)).toEqual([]);
  });
});
