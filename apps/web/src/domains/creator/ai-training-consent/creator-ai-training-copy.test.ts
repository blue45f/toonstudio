// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CREATOR_AI_TRAINING_OPTION_ORDER,
  getCreatorAiTrainingChangeNotice,
  getCreatorAiTrainingCopy,
  getCreatorAiTrainingFieldCopy,
  getCreatorAiTrainingLimitNotice,
  getCreatorAiTrainingOptionDescription,
  type CreatorAiTrainingContext,
} from "./creator-ai-training-copy";

import { CREATOR_COMMUNITY_AI_TRAINING_CONSENTS } from "@/shared/lib/creator-community-publication-contract";
import { useI18n } from "@/shared/lib/i18n";

const CONSENTS = CREATOR_COMMUNITY_AI_TRAINING_CONSENTS;
const CONTEXTS: readonly CreatorAiTrainingContext[] = ["publication", "package"];

function allCopy(): string[] {
  const strings = [getCreatorAiTrainingLimitNotice()];
  for (const context of CONTEXTS) {
    const field = getCreatorAiTrainingFieldCopy(context);
    strings.push(field.legend, field.hint, field.defaultSuffix);
  }
  for (const consent of CONSENTS) {
    const copy = getCreatorAiTrainingCopy(consent);
    strings.push(copy.valueLabel, copy.badgeLabel, copy.readerNote);
    for (const context of CONTEXTS) {
      strings.push(getCreatorAiTrainingOptionDescription(consent, context));
      strings.push(getCreatorAiTrainingChangeNotice(consent, { context }));
      strings.push(getCreatorAiTrainingChangeNotice(consent, { context, published: true }));
    }
  }
  return strings;
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  useI18n.getState().setLang("ko");
});

describe("AI 학습 허용 표기 문구", () => {
  it("선택지는 보수적인 값을 먼저, 허용을 마지막에 두고 계약 어휘를 빠짐없이 덮는다", () => {
    expect([...CREATOR_AI_TRAINING_OPTION_ORDER]).toEqual(["unspecified", "prohibited", "allowed"]);
    expect([...CREATOR_AI_TRAINING_OPTION_ORDER].sort()).toEqual([...CONSENTS].sort());
  });

  it("세 값 모두 서로 다른 값 이름·배지·설명을 가진다", () => {
    const copies = CONSENTS.map((consent) => getCreatorAiTrainingCopy(consent));
    for (const key of ["valueLabel", "badgeLabel", "readerNote"] as const) {
      const values = copies.map((copy) => copy[key]);
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
      expect(new Set(values).size).toBe(CONSENTS.length);
    }
    for (const context of CONTEXTS) {
      const descriptions = CONSENTS.map((consent) => getCreatorAiTrainingOptionDescription(consent, context));
      expect(descriptions.every((value) => value.trim().length > 0)).toBe(true);
      expect(new Set(descriptions).size).toBe(CONSENTS.length);
    }
  });

  it("미지정 문구는 어디에도 허용으로 읽힐 표현을 쓰지 않고 오히려 허용으로 해석하지 말라고 안내한다", () => {
    const copy = getCreatorAiTrainingCopy("unspecified");
    expect(copy.valueLabel).toBe("미지정");
    expect(copy.badgeLabel).not.toContain("허용");
    expect(copy.readerNote).toContain("허용으로 해석하지 마세요");
    for (const context of CONTEXTS) {
      expect(getCreatorAiTrainingOptionDescription("unspecified", context)).toContain(
        "허용으로 해석되지 않습니다",
      );
      expect(getCreatorAiTrainingFieldCopy(context).hint).toContain("허용으로 해석되지 않습니다");
    }
  });

  it("패키지 문맥의 안내는 독자 화면이 아니라 manifest 기록을 가리키고 게시 표기와 별도임을 밝힌다", () => {
    expect(getCreatorAiTrainingOptionDescription("unspecified", "publication")).toContain("독자 화면");
    const packageDescription = getCreatorAiTrainingOptionDescription("unspecified", "package");
    expect(packageDescription).toContain("manifest");
    expect(packageDescription).not.toContain("독자 화면");
    const hint = getCreatorAiTrainingFieldCopy("package").hint;
    expect(hint).toContain("manifest");
    expect(hint).toContain("게시 설정에서 따로 정합니다");
    expect(getCreatorAiTrainingFieldCopy("publication").hint).not.toContain("manifest");
  });

  it("허용·불허 배지는 작가의 표기임을 문구에 드러낸다", () => {
    expect(getCreatorAiTrainingCopy("allowed").badgeLabel).toBe("AI 학습 허용 표기");
    expect(getCreatorAiTrainingCopy("prohibited").badgeLabel).toBe("AI 학습 불허 표기");
  });

  it("한계 고지는 별도 계약을 대체하지 않고 강제할 수 없다는 사실만 말한다", () => {
    const notice = getCreatorAiTrainingLimitNotice();
    expect(notice).toContain("작가의 의사 표시");
    expect(notice).toContain("별도 계약을 대체하지 않습니다");
    expect(notice).toContain("강제할 수 없습니다");
  });

  it("어떤 문구도 법적 효력의 유무를 단정하지 않는다", () => {
    for (const text of allCopy()) {
      expect(text, `법적 효력을 단정하는 표현 금지: ${text}`).not.toMatch(
        /법적|법률|효력이 (있|없)|보장|합법|위법|라이선스(를|가)? (부여|제공)/u,
      );
    }
  });

  it("변경 확인 문구는 새 값과 표기가 해 줄 수 없는 일을 함께 말한다", () => {
    const allowed = getCreatorAiTrainingChangeNotice("allowed");
    expect(allowed).toContain("'허용'으로 표기를 바꿨습니다");
    expect(allowed).toContain("되돌릴 수 없습니다");
    const prohibited = getCreatorAiTrainingChangeNotice("prohibited");
    expect(prohibited).toContain("'불허'로 표기를 바꿨습니다");
    expect(prohibited).toContain("기술적으로 막을 수는 없습니다");
    const unspecified = getCreatorAiTrainingChangeNotice("unspecified");
    expect(unspecified).toContain("'미지정'으로 표기를 바꿨습니다");
    expect(unspecified).toContain("허용으로 해석되지 않습니다");
  });

  it("패키지 문맥의 확인 문구는 manifest 기록 위치를, 게시 문맥은 독자 화면을 가리킨다", () => {
    for (const consent of CONSENTS) {
      expect(getCreatorAiTrainingChangeNotice(consent, { context: "package" })).toContain(
        "manifest.json(rights.aiTraining)",
      );
    }
    expect(getCreatorAiTrainingChangeNotice("allowed", { context: "publication" })).toContain(
      "독자 화면",
    );
    expect(getCreatorAiTrainingChangeNotice("prohibited", { context: "publication" })).toContain(
      "독자 화면",
    );
  });

  it("이미 게시한 작품이라는 단서는 게시 문맥에서만 덧붙는다", () => {
    for (const consent of CONSENTS) {
      const base = getCreatorAiTrainingChangeNotice(consent);
      const published = getCreatorAiTrainingChangeNotice(consent, { published: true });
      expect(published.startsWith(base)).toBe(true);
      expect(published).toContain("다음 게시(릴리스)부터");
      expect(base).not.toContain("다음 게시(릴리스)부터");
      expect(
        getCreatorAiTrainingChangeNotice(consent, { context: "package", published: true }),
      ).not.toContain("다음 게시(릴리스)부터");
    }
  });

  it("영어 로캘에서는 같은 구조의 영어 문구가 나오고 한국어가 섞이지 않는다", () => {
    useI18n.getState().setLang("en");
    const notice = getCreatorAiTrainingLimitNotice();
    expect(notice).toContain("does not replace a separate agreement");
    expect(notice).toContain("cannot make outside AI companies follow it");
    expect(getCreatorAiTrainingCopy("unspecified").badgeLabel).toBe("AI training not specified");
    expect(getCreatorAiTrainingCopy("allowed").valueLabel).toBe("Allowed");
    expect(getCreatorAiTrainingChangeNotice("prohibited")).toContain("Label changed to 'Not allowed'");
    for (const text of allCopy()) {
      expect(text, `영어 로캘에 한글이 섞임: ${text}`).not.toMatch(/[ㄱ-ㅎㅏ-ㅣ가-힣]/u);
    }
  });
});
