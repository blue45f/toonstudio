// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FreeAiZeroBillAssistResponse } from "@/shared/ai/free-ai-zero-bill-cascade";

import { StudioCreateQuickPresetStrip } from "../../studio-shell/StudioCreateQuickPresetStrip";
import {
  MAX_REQUIRED_FIELDS,
  MIN_OPTIONAL_FIELDS,
  SMART_FORM_WORKFLOW_IDS,
  SMART_FORM_WORKFLOW_SCHEMAS,
  applySmartFormRecommendations,
  assertAllBuiltInWorkflowContracts,
  assertMinimalRequiredContract,
  countAiFilledOptionalFields,
  createInitialSmartFormState,
  enhanceRecommendationsWithZeroBillAi,
  generateSmartFormRecommendations,
  restoreSingleFieldAiSuggestion,
  undoSmartFormAutofill,
  updateOptionalFieldValue,
  updateRequiredFieldValue,
  validateMinimalFormSubmission,
  type SmartFormWorkflowSchema,
} from "../minimal-required-form-engine";
import StudioSmartAutofillAssistantCard from "../StudioSmartAutofillAssistantCard";

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD_SOURCE = readFileSync(resolve(HERE, "../StudioSmartAutofillAssistantCard.tsx"), "utf8");
const ENGINE_SOURCE = readFileSync(resolve(HERE, "../minimal-required-form-engine.ts"), "utf8");
const SCHEMAS_SOURCE = readFileSync(resolve(HERE, "../smart-form-workflow-schemas.ts"), "utf8");
const STRIP_SOURCE = readFileSync(
  resolve(HERE, "../../studio-shell/StudioCreateQuickPresetStrip.tsx"),
  "utf8",
);

afterEach(() => {
  cleanup();
});

describe("필수항목 최소화(<= 2개) 스키마 불변식 계약", () => {
  it("5대 핵심 워크플로 전원의 필수 항목은 1~2개 이하 불변식을 만족한다", () => {
    expect(SMART_FORM_WORKFLOW_IDS).toHaveLength(5);
    expect(() => assertAllBuiltInWorkflowContracts()).not.toThrow();

    for (const id of SMART_FORM_WORKFLOW_IDS) {
      const schema = SMART_FORM_WORKFLOW_SCHEMAS[id];
      expect(schema.requiredFields.length).toBeGreaterThanOrEqual(1);
      expect(schema.requiredFields.length).toBeLessThanOrEqual(MAX_REQUIRED_FIELDS);
    }
  });

  it("5대 워크플로 전원은 6~10개의 풍부한 선택 항목을 제공한다", () => {
    for (const id of SMART_FORM_WORKFLOW_IDS) {
      const schema = SMART_FORM_WORKFLOW_SCHEMAS[id];
      expect(schema.optionalFields.length).toBeGreaterThanOrEqual(MIN_OPTIONAL_FIELDS);
      expect(schema.optionalFields.length).toBeLessThanOrEqual(10);
    }
  });

  it("assertMinimalRequiredContract는 필수 항목이 3개 이상이면 예외를 던진다", () => {
    const invalidSchema: SmartFormWorkflowSchema = {
      ...SMART_FORM_WORKFLOW_SCHEMAS["project-create"],
      requiredFields: [
        {
          id: "a",
          labelKo: "항목 A",
          labelEn: "A",
          kind: "text",
          placeholderKo: "",
          helperKo: "",
        },
        {
          id: "b",
          labelKo: "항목 B",
          labelEn: "B",
          kind: "text",
          placeholderKo: "",
          helperKo: "",
        },
        {
          id: "c",
          labelKo: "항목 C",
          labelEn: "C",
          kind: "text",
          placeholderKo: "",
          helperKo: "",
        },
      ],
    };
    expect(() => assertMinimalRequiredContract(invalidSchema)).toThrow(/1~2개/u);
  });

  it("assertMinimalRequiredContract는 필수 항목 0개 또는 필드 ID 중복을 거부한다", () => {
    const emptyRequired: SmartFormWorkflowSchema = {
      ...SMART_FORM_WORKFLOW_SCHEMAS["project-create"],
      requiredFields: [],
    };
    expect(() => assertMinimalRequiredContract(emptyRequired)).toThrow(/1~2개/u);

    const duplicateIds: SmartFormWorkflowSchema = {
      ...SMART_FORM_WORKFLOW_SCHEMAS["project-create"],
      requiredFields: [SMART_FORM_WORKFLOW_SCHEMAS["project-create"].optionalFields[0]],
    };
    expect(() => assertMinimalRequiredContract(duplicateIds)).toThrow(/충돌/u);
  });

  it("선택 항목을 하나도 채우지 않아도 필수 항목만 채우면 제출 검증을 통과한다", () => {
    const state = updateRequiredFieldValue(
      createInitialSmartFormState("project-create"),
      "workPrompt",
      "서울 야경 로판 학원물 1화",
    );
    const validation = validateMinimalFormSubmission(state);
    expect(validation.valid).toBe(true);
    expect(validation.missingFieldIds).toEqual([]);
  });
});

describe("한국어 한 줄 입력 기반 AI 권장 자동 채우기 엔진 정확도", () => {
  it("작품 생성: '서울 야경 로판 학원물 1화' 한 줄로 장르·규격·태그 5개·시놉시스·분업·Rights BOM·OKLCH 배색을 모두 채운다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: { workPrompt: "서울 야경 로판 학원물 1화" },
    });

    expect(result.hasEnoughContext).toBe(true);
    expect(result.costKrw).toBe(0);
    expect(result.paidBillingBlocked).toBe(true);
    expect(result.filledCount).toBe(SMART_FORM_WORKFLOW_SCHEMAS["project-create"].optionalFields.length);

    expect(result.recommendations.genre?.value).toBe("로맨스 판타지");
    expect(result.recommendations.targetPlatformSpec?.value).toContain("네이버 웹툰");
    expect(result.recommendations.tags?.tagsPreview).toHaveLength(5);
    expect(result.recommendations.tags?.value).toContain("#로판");
    expect(result.recommendations.tags?.value).toContain("#학원물");
    expect(result.recommendations.synopsis?.value).toContain("서울 야경 로판 학원물 1화");
    expect(result.recommendations.rightsBomDefault?.value).toContain("Rights BOM".replace("Rights BOM", "OFL"));
    expect(result.recommendations.divisionPreset?.value).toContain("3인 분업");
    expect(result.recommendations.colorPalette?.value).toContain("oklch(");
    expect(result.recommendations.colorPalette?.value).not.toMatch(/#[0-9a-fA-F]{3,8}/u);

    for (const rec of Object.values(result.recommendations)) {
      expect(rec.confidence).toBeGreaterThanOrEqual(0.65);
      expect(rec.confidence).toBeLessThanOrEqual(0.98);
      expect(rec.reasonKo.length).toBeGreaterThan(8);
    }
  });

  it("작품 생성: '사이버펑크 액션 보스전 12화 카카오페이지'는 SF·카카오 규격·6인 풀 스튜디오를 추천한다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: { workPrompt: "사이버펑크 액션 보스전 12화 카카오페이지" },
    });

    expect(result.recommendations.genre?.value).toBe("SF·사이버펑크");
    expect(result.recommendations.targetPlatformSpec?.value).toContain("카카오페이지");
    expect(result.recommendations.ageRating?.value).toBe("15세 이용가");
    expect(result.recommendations.divisionPreset?.value).toContain("6인 풀 스튜디오");
    expect(result.recommendations.scrollMarginPx?.value).toContain("180px");
    expect(result.recommendations.tags?.tagsPreview).toHaveLength(5);
  });

  it("작품 생성: '일상 고양이 4컷툰 인스타그램'은 정사각 컷툰·1인 독립 연재·전체 이용가를 추천한다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: { workPrompt: "일상 고양이 4컷툰 인스타그램" },
    });

    expect(result.recommendations.genre?.value).toBe("일상·코미디");
    expect(result.recommendations.targetPlatformSpec?.value).toContain("1080×1080px");
    expect(result.recommendations.divisionPreset?.value).toContain("1인 독립 연재");
    expect(result.recommendations.ageRating?.value).toBe("전체 이용가");
  });

  it("회차 발행: 핵심 장면 한 줄로 소개글·작가의 말·공개 시간·썸네일·해시태그·Rights BOM을 채운다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "episode-publish",
      requiredValues: { episodeSeed: "비 오는 옥상에서 첫 고백 7화" },
    });

    expect(result.filledCount).toBe(SMART_FORM_WORKFLOW_SCHEMAS["episode-publish"].optionalFields.length);
    expect(result.recommendations.episodeSummary?.value).toContain("7화");
    expect(result.recommendations.authorNote?.value).toContain("7화");
    expect(result.recommendations.thumbnailHook?.value).toContain("70%");
    expect(result.recommendations.hashtags?.tagsPreview).toHaveLength(5);
    expect(result.recommendations.rightsBomDefault?.value).toContain("BOM");
  });

  it("원고 내보내기: 단행본 인쇄 요청이면 CMYK 300DPI PDF/X-1a와 3mm 도련을 자동 설정한다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "export-release",
      requiredValues: { exportGoal: "미스터리 추리 단행본 3화 인쇄 PDF 출고" },
    });

    expect(result.recommendations.targetPlatformSpec?.value).toContain("단행본 인쇄 B5");
    expect(result.recommendations.fileFormat?.value).toContain("PDF/X-1a");
    expect(result.recommendations.colorProfile?.value).toContain("CMYK");
    expect(result.recommendations.filenameTemplate?.value).toContain("ep03_print_cmyk");
    expect(result.recommendations.preflightChecklist?.value).toContain("3mm 도련");
  });

  it("분업 팀 초대: 필수 2칸 입력 시 채색 역할·권한 범위·인수인계·초대 인사말을 자동 완성한다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "team-division-invite",
      requiredValues: {
        inviteTarget: "김채색",
        teamNeed: "3화 배경 채색과 야간 조명 보정",
      },
    });

    expect(result.filledCount).toBe(
      SMART_FORM_WORKFLOW_SCHEMAS["team-division-invite"].optionalFields.length,
    );
    expect(result.recommendations.divisionRole?.value).toBe("채색·명암·보정 담당");
    expect(result.recommendations.permissionScope?.value).toContain("보호 잠금");
    expect(result.recommendations.welcomeMessage?.value).toContain("김채색");
    expect(result.recommendations.welcomeMessage?.value).toContain("3화 배경 채색과 야간 조명 보정");
  });

  it("문의 접수: 브러시 필압 지연 한 줄로 드로잉 분류·높음 우선순위·1분 자가 점검 팁을 자동 생성한다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "support-inquiry",
      requiredValues: {
        inquirySummary: "태블릿 브러시 필압이 갑자기 지연되고 저장이 느려요",
      },
    });

    expect(result.recommendations.inquiryCategory?.value).toBe("드로잉·브러시 성능");
    expect(result.recommendations.urgencyLevel?.value).toContain("높음");
    expect(result.recommendations.affectedSurface?.value).toContain("캔버스 편집기");
    expect(result.recommendations.selfCheckTip?.value).toContain("하드웨어 가속");
  });
});

describe("빈 입력 방어 및 ₩0 무료 AI 캐스케이드 브리지", () => {
  it("빈 입력이나 공백만 넣으면 안전하게 방어하고 과금 ₩0 안내를 돌려준다", () => {
    const result = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: { workPrompt: "   " },
    });

    expect(result.hasEnoughContext).toBe(false);
    expect(result.filledCount).toBe(0);
    expect(result.recommendations).toEqual({});
    expect(result.costKrw).toBe(0);
    expect(result.noticeKo).toContain("비어");
  });

  it("₩0 무료 AI 캐스케이드 어댑터는 개인정보를 마스킹하고 보강 제안을 병합하며 과금 0원을 유지한다", async () => {
    let capturedPrompt = "";
    const mockRunner = vi.fn(
      async (input: { readonly inputText: string }): Promise<FreeAiZeroBillAssistResponse> => {
        capturedPrompt = input.inputText;
        return {
          ok: true,
          providerId: "groq-free-tier",
          providerTier: "cloud-free",
          model: "llama-free",
          mode: "idea-remix",
          costGuaranteedZeroUsd: 0,
          paidBillingBlocked: true,
          piiRedactedCount: 0,
          headlineKo: "₩0 무료 AI 강화 요약",
          bulletsKo: ["첫 컷에서 서울 야경 속 깨진 회중시계로 복선을 던지세요."],
          rawData: {},
          fallbackNoticeKo: null,
        };
      },
    );

    const enhanced = await enhanceRecommendationsWithZeroBillAi({
      workflowId: "project-create",
      requiredValues: {
        workPrompt: "서울 야경 로판 학원물 1화 문의 author@example.com 010-1234-5678",
      },
      assistRunner: mockRunner,
    });

    expect(mockRunner).toHaveBeenCalledTimes(1);
    expect(capturedPrompt).not.toContain("author@example.com");
    expect(capturedPrompt).not.toContain("010-1234-5678");
    expect(enhanced.piiRedactedCount).toBeGreaterThanOrEqual(2);
    expect(enhanced.costKrw).toBe(0);
    expect(enhanced.paidBillingBlocked).toBe(true);
    expect(enhanced.engineMode).toBe("zero-bill-cascade");
    expect(enhanced.recommendations.synopsis?.source).toBe("ai-zero-bill-cascade");
    expect(enhanced.recommendations.synopsis?.value).toContain("회중시계");
  });

  it("무료 AI 브리지가 오류를 던져도 유료 전환 없이 로컬 추론(₩0) 결과로 안전 폴백한다", async () => {
    const failingRunner = vi.fn(async () => {
      throw new Error("network down");
    });

    const fallback = await enhanceRecommendationsWithZeroBillAi({
      workflowId: "export-release",
      requiredValues: { exportGoal: "네이버 웹툰 2화 마감 출고" },
      assistRunner: failingRunner,
    });

    expect(fallback.hasEnoughContext).toBe(true);
    expect(fallback.costKrw).toBe(0);
    expect(fallback.paidBillingBlocked).toBe(true);
    expect(fallback.recommendations.targetPlatformSpec?.value).toContain("네이버 웹툰");
    expect(fallback.noticeKo).toContain("로컬 추론(₩0)");
  });
});

describe("이전 값 스냅샷 Undo 스택 및 항목별 제어", () => {
  it("자동 채우기 적용 후 undoSmartFormAutofill을 호출하면 직전 선택 항목 상태가 완벽히 복원된다", () => {
    let state = updateRequiredFieldValue(
      createInitialSmartFormState("project-create"),
      "workPrompt",
      "서울 야경 로판 학원물 1화",
    );
    state = updateOptionalFieldValue(state, "synopsis", "내가 먼저 써 둔 줄거리");

    const rec = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: state.requiredValues,
    });
    const applied = applySmartFormRecommendations(state, rec, { respectUserEdits: false });

    expect(applied.undoStack).toHaveLength(1);
    expect(applied.optionalValues.genre).toBe("로맨스 판타지");
    expect(applied.optionalValues.synopsis).not.toBe("내가 먼저 써 둔 줄거리");

    const restored = undoSmartFormAutofill(applied);
    expect(restored.undoStack).toHaveLength(0);
    expect(restored.optionalValues.genre).toBe("");
    expect(restored.optionalValues.synopsis).toBe("내가 먼저 써 둔 줄거리");
    expect(restored.fieldOrigins.synopsis).toBe("user-edited");
    expect(restored.fieldOrigins.genre).toBe("empty");
  });

  it("다단계 Undo 스택은 LIFO 순서로 복원하고 빈 스택에서는 안전하게 상태를 유지한다", () => {
    let state = updateRequiredFieldValue(
      createInitialSmartFormState("project-create"),
      "workPrompt",
      "서울 야경 로판 학원물 1화",
    );
    const firstRec = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: state.requiredValues,
    });
    state = applySmartFormRecommendations(state, firstRec);

    state = updateRequiredFieldValue(state, "workPrompt", "일상 고양이 4컷툰 인스타그램");
    const secondRec = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: state.requiredValues,
    });
    state = applySmartFormRecommendations(state, secondRec);

    expect(state.undoStack).toHaveLength(2);
    expect(state.optionalValues.genre).toBe("일상·코미디");

    const backOnce = undoSmartFormAutofill(state);
    expect(backOnce.optionalValues.genre).toBe("로맨스 판타지");
    expect(backOnce.undoStack).toHaveLength(1);

    const backTwice = undoSmartFormAutofill(backOnce);
    expect(backTwice.optionalValues.genre).toBe("");
    expect(backTwice.undoStack).toHaveLength(0);

    const noopUndo = undoSmartFormAutofill(backTwice);
    expect(noopUndo.lastNoticeKo).toContain("기록이 없어요");
  });

  it("사용자가 직접 수정한 항목은 다음 자동 채우기에서 보호되고 개별 복원으로 AI 제안을 다시 켤 수 있다", () => {
    let state = updateRequiredFieldValue(
      createInitialSmartFormState("project-create"),
      "workPrompt",
      "서울 야경 로판 학원물 1화",
    );
    const rec = generateSmartFormRecommendations({
      workflowId: "project-create",
      requiredValues: state.requiredValues,
    });
    state = applySmartFormRecommendations(state, rec);
    state = updateOptionalFieldValue(state, "tags", "#나만의커스텀태그");

    expect(state.fieldOrigins.tags).toBe("user-edited");

    const reapplied = applySmartFormRecommendations(state, rec);
    expect(reapplied.optionalValues.tags).toBe("#나만의커스텀태그");
    expect(reapplied.lastNoticeKo).toContain("직접 수정한 1개 항목은 그대로 유지");

    const restoredSingle = restoreSingleFieldAiSuggestion(reapplied, "tags");
    expect(restoredSingle.fieldOrigins.tags).toBe("ai-suggested");
    expect(restoredSingle.optionalValues.tags).toContain("#로판");
    expect(countAiFilledOptionalFields(restoredSingle)).toBe(9);
  });
});

describe("StudioSmartAutofillAssistantCard UI · 접근성 · 인터랙션", () => {
  it("초보자 배너·₩0 배지·5대 워크플로 탭과 필수 1칸을 렌더링한다", () => {
    render(<StudioSmartAutofillAssistantCard />);

    expect(
      screen.getByText(/필수 1개만 입력하면 나머지는 AI가 채워드립니다/u),
    ).toBeTruthy();
    expect(screen.getByTestId("smart-form-zero-cost-badge").textContent).toContain("₩0");
    expect(screen.getAllByRole("tab")).toHaveLength(5);

    const requiredInputs = document.querySelectorAll('[aria-required="true"]');
    expect(requiredInputs).toHaveLength(1);
    expect(
      screen.getByTestId<HTMLButtonElement>("smart-form-undo-btn").disabled,
    ).toBe(true);
  });

  it("한 줄 입력 후 'AI 권장값 한 번에 채우기'를 누르면 선택 항목이 채워지고 배지와 사유가 표시된다", () => {
    render(<StudioSmartAutofillAssistantCard />);

    const promptInput = screen.getByTestId<HTMLInputElement>(
      "smart-form-required-input-workPrompt",
    );
    fireEvent.change(promptInput, { target: { value: "서울 야경 로판 학원물 1화" } });
    fireEvent.click(screen.getByTestId("smart-form-autofill-btn"));

    const details = screen.getByTestId<HTMLDetailsElement>("smart-form-optional-details");
    expect(details.open).toBe(true);
    expect(screen.getByTestId("smart-form-optional-summary").textContent).toContain(
      "선택 항목 9개 보기 (AI 권장 채움 9개)",
    );
    expect(screen.getByTestId("smart-form-ai-badge-genre").textContent).toContain("AI 권장 채움");
    expect(screen.getByTestId("smart-form-reason-genre").textContent).toContain("추천 사유:");
    expect(
      screen.getByTestId<HTMLButtonElement>("smart-form-undo-btn").disabled,
    ).toBe(false);
  });

  it("'이전으로 되돌리기'를 클릭하면 AI가 채운 선택 항목이 초기화되고 상태 안내가 갱신된다", () => {
    render(<StudioSmartAutofillAssistantCard initialPrompt="서울 야경 로판 학원물 1화" />);

    fireEvent.click(screen.getByTestId("smart-form-autofill-btn"));
    expect(screen.getByTestId("smart-form-optional-summary").textContent).toContain(
      "AI 권장 채움 9개",
    );

    fireEvent.click(screen.getByTestId("smart-form-undo-btn"));
    expect(screen.getByTestId("smart-form-optional-summary").textContent).toContain(
      "AI 권장 채움 0개",
    );
    expect(screen.getByTestId("smart-form-status-banner").textContent).toContain("되돌렸어요");
    expect(
      screen.getByTestId<HTMLButtonElement>("smart-form-undo-btn").disabled,
    ).toBe(true);
  });

  it("항목별 '직접 수정' 후 편집하면 '직접 수정됨' 배지가 뜨고 'AI 제안 유지'로 즉시 복원된다", () => {
    render(<StudioSmartAutofillAssistantCard initialPrompt="서울 야경 로판 학원물 1화" />);

    fireEvent.click(screen.getByTestId("smart-form-autofill-btn"));
    fireEvent.click(screen.getByTestId("smart-form-edit-manual-tags"));

    const tagsInput = screen.getByLabelText(/추천 태그 5개/u) as HTMLInputElement;
    expect(document.activeElement).toBe(tagsInput);

    fireEvent.change(tagsInput, { target: { value: "#직접입력태그" } });
    expect(screen.getByTestId("smart-form-manual-badge-tags").textContent).toContain("직접 수정됨");

    fireEvent.click(screen.getByTestId("smart-form-keep-ai-tags"));
    expect(tagsInput.value).toContain("#로판");
    expect(screen.getByTestId("smart-form-ai-badge-tags").textContent).toContain("AI 권장 채움");
  });

  it("5대 워크플로 탭을 순회해도 모든 탭의 필수 입력란이 2개 이하를 유지한다", () => {
    render(<StudioSmartAutofillAssistantCard />);

    for (const id of SMART_FORM_WORKFLOW_IDS) {
      fireEvent.click(screen.getByTestId(`smart-form-tab-${id}`));
      const requiredCount = document.querySelectorAll('[aria-required="true"]').length;
      expect(requiredCount).toBeGreaterThanOrEqual(1);
      expect(requiredCount).toBeLessThanOrEqual(2);
    }
  });

  it("필수 항목이 비어 있을 때 자동 채우기를 누르면 aria-invalid와 친절한 경고를 표시한다", () => {
    render(<StudioSmartAutofillAssistantCard />);

    fireEvent.click(screen.getByTestId("smart-form-autofill-btn"));
    const input = screen.getByTestId("smart-form-required-input-workPrompt");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("smart-form-validation-banner").textContent).toContain("필수 항목");
  });

  it("'₩0 무료 AI 심화 보강' 버튼이 비동기 어댑터를 실행해 선택 항목을 보강한다", async () => {
    const assistRunner = vi.fn(
      async (): Promise<FreeAiZeroBillAssistResponse> => ({
        ok: true,
        providerId: "local-zero-cost-fallback",
        providerTier: "local-fallback",
        model: "toonstudio-deterministic-coach-v2",
        mode: "idea-remix",
        costGuaranteedZeroUsd: 0,
        paidBillingBlocked: true,
        piiRedactedCount: 0,
        headlineKo: "무과금 심화 요약",
        bulletsKo: ["첫 장면에서 감성 260px 여백으로 시선을 붙잡으세요."],
        rawData: {},
        fallbackNoticeKo: null,
      }),
    );

    render(
      <StudioSmartAutofillAssistantCard
        initialPrompt="서울 야경 로판 학원물 1화"
        assistRunner={assistRunner}
      />,
    );

    fireEvent.click(screen.getByTestId("smart-form-cascade-btn"));
    await waitFor(() => {
      expect(assistRunner).toHaveBeenCalledTimes(1);
    });
    const synopsisArea = screen.getByLabelText(/시놉시스 초안/u) as HTMLTextAreaElement;
    expect(synopsisArea.value).toContain("260px 여백");
  });
});

describe("OKLCH 시맨틱 토큰 · 정적 계약 · StudioCreateQuickPresetStrip 지연 마운트", () => {
  it("신규 UI/엔진 소스에는 원시 HEX·any·transition-all이 0건이고 min-h-11·tabular-nums·keep-all·motion-reduce를 준수한다", () => {
    expect(CARD_SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(CARD_SOURCE).not.toMatch(/\bany\b/u);
    expect(CARD_SOURCE).not.toContain("transition-all");
    expect(ENGINE_SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(ENGINE_SOURCE).not.toMatch(/:\s*any\b/u);
    expect(SCHEMAS_SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(SCHEMAS_SOURCE).not.toMatch(/:\s*any\b/u);

    expect(CARD_SOURCE).toContain("min-h-11");
    expect(CARD_SOURCE).toContain("tabular-nums");
    expect(CARD_SOURCE).toContain("[word-break:keep-all]");
    expect(CARD_SOURCE).toContain("motion-reduce:");
  });

  it("StudioCreateQuickPresetStrip은 static import 없이 React.lazy로 지연 연결하고 펼치면 도우미를 마운트한다", async () => {
    expect(STRIP_SOURCE).toContain(
      'React.lazy(\n  () => import("../smart-form-autofill/StudioSmartAutofillAssistantCard")',
    );
    expect(STRIP_SOURCE).not.toMatch(
      /import\s+[\s\S]*from\s+["']\.\.\/smart-form-autofill/u,
    );

    const onSelectPreset = vi.fn();
    render(
      <StudioCreateQuickPresetStrip activePresetId={null} onSelectPreset={onSelectPreset} />,
    );

    const disclosure = screen.getByTestId<HTMLDetailsElement>("studio-smart-autofill-disclosure");
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("smart-form-autofill-card")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    const card = await screen.findByTestId("smart-form-autofill-card");
    expect(card).toBeTruthy();

    fireEvent.change(screen.getByTestId("smart-form-required-input-workPrompt"), {
      target: { value: "일상 고양이 4컷툰 인스타그램" },
    });
    fireEvent.click(screen.getByTestId("smart-form-autofill-btn"));
    fireEvent.click(screen.getByTestId("smart-form-apply-host-btn"));

    expect(onSelectPreset).toHaveBeenCalledTimes(1);
    expect(onSelectPreset.mock.calls[0]?.[0]?.quickPresetId).toBe("daily-cuttoon");
  });
});
