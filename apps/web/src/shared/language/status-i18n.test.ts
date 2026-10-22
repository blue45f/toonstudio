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

describe("scanHardcodedStatusStrings — 생산자 채널 (T0 확장, includeProducerChannels)", () => {
  const producer = { includeProducerChannels: true } as const;

  it("throw 리터럴을 잡는다 — 실패 키워드가 없는 한글 검증 문구도 포함", () => {
    const source = [
      `throw new Error("통합 AI 설정에서 외부 Creator Runtime 주소와 토큰을 등록하세요.");`,
      "throw new Studio3dGenerationRequestError(`파일이 너무 큽니다 (HTTP ${status})`);",
    ].join("\n");
    const violations = scanHardcodedStatusStrings(source, producer);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.rule === "throw-literal")).toBe(true);
    expect(violations.every((v) => v.kind === "failure")).toBe(true);
  });

  it("Result error 필드 리터럴을 잡고, 타입 표기와 동적 패스스루는 잡지 않는다", () => {
    const source = [
      `return { ok: false, code: "invalid_input", error: "배경 프롬프트를 입력하세요." };`,
      `return { ok: false, code: "parse_error", error: \`요청이 실패했습니다 (HTTP \${status}): \${message}\` };`,
      `export type R<T> = { ok: false; error: string };`,
      `return { ok: false, code: "parse_error", error: parsed.error };`,
      `return { ok: false, code: "http_error", error: error.message };`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(source, producer);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.rule === "result-error-literal")).toBe(true);
  });

  it("failure() 헬퍼의 메시지 인자(1번째·2번째)를 잡는다", () => {
    const source = [
      `return failure("network_error", "fal 서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.");`,
      `return failure("fal 업로드에 실패했습니다.");`,
      `return failure("provider_error", describeFalError(status, payload));`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(source, producer);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.rule === "failure-call-literal")).toBe(true);
  });

  it("throw 없는 Error 생성자 리터럴(TimeoutError 패턴)도 잡고 throw와 중복으로 세지 않는다", () => {
    const source = [
      `const error = new Error("스토리 편집 도구를 불러오는 시간이 초과됐어요. 다시 시도해 주세요.");`,
      `throw new Error("저장에 실패했습니다.");`,
    ].join("\n");
    const violations = scanHardcodedStatusStrings(source, producer);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.rule)).toEqual(["error-constructor-literal", "throw-literal"]);
  });

  it("영문 내부 불변식 throw는 잡지 않는다 (이름 판정용 메시지)", () => {
    const source = `const error = new Error("The Studio AI operation was aborted.");`;
    expect(scanHardcodedStatusStrings(source, producer)).toEqual([]);
  });

  it("영문 실패 throw는 잡는다", () => {
    const source = `throw new Error("Failed to load the reference image.");`;
    const violations = scanHardcodedStatusStrings(source, producer);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("throw-literal");
  });

  it("aiErrorText 키 경유(폴백 포함)는 위반이 아니다", () => {
    const source = [
      `return { ok: false, code: "network_error", error: aiErrorText("studio.aiError.client.requestCancelled", "요청이 취소되었습니다.") };`,
      `throw new Error(aiErrorText("studio.aiError.reference.dataUrlNotSupported", "data URL 형식이 아닙니다."));`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(source, producer)).toEqual([]);
  });

  it("옵션을 끄면 생산자 채널은 기존 동작대로 잡지 않는다 (기존 가드 계약 보호)", () => {
    const source = [
      `throw new Error("통합 AI 설정에서 외부 Creator Runtime 주소와 토큰을 등록하세요.");`,
      `return { ok: false, code: "invalid_input", error: "배경 프롬프트를 입력하세요." };`,
    ].join("\n");
    expect(scanHardcodedStatusStrings(source)).toEqual([]);
    expect(scanHardcodedStatusStrings(source, {})).toEqual([]);
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
