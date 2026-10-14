import { describe, expect, it } from "vitest";

import {
  classifySentenceTone,
  classifyTextTone,
  findToneViolations,
  hasMixedTone,
  registersInFlow,
  resolveToneRegister,
  toneForSurface,
  TONE_POLICY,
} from "./tone-policy";

describe("말투 정책 선언 (BLUEPRINT §3.4)", () => {
  it("기본은 해요체이고 법적·결제 표면만 합니다체를 허용한다", () => {
    expect(TONE_POLICY).toEqual({ general: "polite", legal: "formal", payment: "formal" });
    expect(toneForSurface("general")).toBe("polite");
    expect(toneForSurface("legal")).toBe("formal");
    expect(toneForSurface("payment")).toBe("formal");
  });

  it("표면 종류 선언이 템플릿 변형 기본 말투보다 우선한다", () => {
    // 선언이 없으면 템플릿 변형 기본값(전 변형 해요체)을 따른다.
    expect(resolveToneRegister({})).toBe("polite");
    expect(resolveToneRegister({ templateTone: "polite" })).toBe("polite");
    // 법적 문서를 일반 템플릿으로 렌더해도 표면 선언이 이긴다.
    expect(resolveToneRegister({ surfaceKind: "legal", templateTone: "polite" })).toBe("formal");
    expect(resolveToneRegister({ surfaceKind: "payment", templateTone: "polite" })).toBe("formal");
    expect(resolveToneRegister({ surfaceKind: "general", templateTone: "polite" })).toBe("polite");
  });
});

describe("문장 말투 분류", () => {
  it("해요체·합니다체 종결을 가른다", () => {
    expect(classifySentenceTone("저장하지 못했어요.")).toBe("polite");
    expect(classifySentenceTone("머리카락이 머리에 붙었어요")).toBe("polite");
    expect(classifySentenceTone("다시 시도해 주세요.")).toBe("polite");
    expect(classifySentenceTone("프로필과 로그인 정보가 삭제됩니다.")).toBe("formal");
    expect(classifySentenceTone("계정을 탈퇴 처리할까요?")).toBe("polite");
    expect(classifySentenceTone("본인 인증을 마치면 볼 수 있어요.")).toBe("polite");
    expect(classifySentenceTone("동의하시겠습니까?")).toBe("formal");
  });

  it("문어체 단정과 라벨 조각은 혼재 판정 대상이 아니다", () => {
    expect(classifySentenceTone("원본은 보존된다.")).toBe("plain");
    expect(classifySentenceTone("계정 탈퇴")).toBe("none");
    expect(classifySentenceTone("초기화")).toBe("none");
    expect(classifySentenceTone("")).toBe("none");
  });

  it("문장 단위로 나눠 각각 분류한다", () => {
    const classified = classifyTextTone("파일을 읽지 못했어요. 포즈 파일이 맞는지 확인해 주세요.");
    expect(classified.map((c) => c.tone)).toEqual(["polite", "polite"]);
  });
});

describe("흐름 혼재 판정 — 같은 흐름 안에서 말투 혼재 0", () => {
  it("감사 실측 사례: 탈퇴 흐름은 현재 혼재 상태로 판정된다", () => {
    // plain-language 감사 요약 5 + 현재 main app 사전 실측:
    // account.profile.confirmDelete(합니다체)와 errorDelete(해요체)가 같은 흐름에 있다.
    const withdrawalFlow = [
      "계정을 탈퇴 처리할까요? 프로필과 로그인 정보가 삭제되고 현재 세션이 만료됩니다.",
      "계정을 탈퇴 처리하지 못했어요.",
    ];
    expect(hasMixedTone(withdrawalFlow)).toBe(true);
    expect([...registersInFlow(withdrawalFlow)].sort()).toEqual(["formal", "polite"]);
  });

  it("한 말투로 통일된 흐름은 혼재가 아니다", () => {
    expect(hasMixedTone(["저장했어요.", "아래 버튼으로 다시 시도해 주세요."])).toBe(false);
    expect(hasMixedTone(["본 약관은 서비스를 이용하는 조건을 정합니다.", "회원은 약관에 동의합니다."])).toBe(false);
    expect(hasMixedTone(["계정 탈퇴", "초기화"])).toBe(false);
  });

  it("선언 말투와 반대인 문장만 위반으로 보고한다", () => {
    const text = "프로필과 로그인 정보가 삭제됩니다. 작성한 글은 탈퇴한 사용자로 남습니다.";
    expect(findToneViolations(text, "polite").map((v) => v.tone)).toEqual(["formal", "formal"]);
    expect(findToneViolations(text, "formal")).toEqual([]);
    expect(findToneViolations("저장하지 못했어요. 다시 저장해 주세요.", "polite")).toEqual([]);
  });
});
