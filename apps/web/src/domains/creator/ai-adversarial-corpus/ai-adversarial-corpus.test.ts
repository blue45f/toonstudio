import { redactCreatorSensitiveText } from "@toonstudio/contracts/studio-pii-redactor";
import { describe, expect, it } from "vitest";

import { MALFORMED_AI_JSON_CASES } from "./corpus-malformed-json";
import {
  KOREAN_PII_POSITIVE_CASES,
  SAFE_WEBTOON_PROSE_CASES,
} from "./corpus-pii-korean";
import {
  BENIGN_VILLAIN_DIALOGUE_CASES,
  INPUT_SIGNAL_CASES,
  MANUSCRIPT_LENGTH_CASES,
} from "./corpus-input-boundaries";
import {
  guardCreatorPromptInput,
  normalizeCreatorObfuscatedInput,
  recoverMalformedAiJson,
} from "./resilient-ai-output-guard";

describe("ai-adversarial-corpus (340+ 한국형 PII · 장문 원고 · 입력 경계 · 손상 JSON 회귀 스위트)", () => {
  it("전체 적대적 회귀 코퍼스 규모가 300건 이상이며 중복 ID가 없다", () => {
    const totalCases =
      KOREAN_PII_POSITIVE_CASES.length +
      SAFE_WEBTOON_PROSE_CASES.length +
      MANUSCRIPT_LENGTH_CASES.length +
      INPUT_SIGNAL_CASES.length +
      BENIGN_VILLAIN_DIALOGUE_CASES.length +
      MALFORMED_AI_JSON_CASES.length;

    expect(totalCases).toBeGreaterThanOrEqual(340);

    const allIds = [
      ...KOREAN_PII_POSITIVE_CASES.map((c) => c.id),
      ...SAFE_WEBTOON_PROSE_CASES.map((c) => c.id),
      ...MANUSCRIPT_LENGTH_CASES.map((c) => c.id),
      ...INPUT_SIGNAL_CASES.map((c) => c.id),
      ...MALFORMED_AI_JSON_CASES.map((c) => c.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  describe("1. 한국형 개인정보(전화·계좌·주민번호·도로명/지번 주소·시크릿·난독화) 마스킹 검증", () => {
    const directCases = KOREAN_PII_POSITIVE_CASES.filter((c) => c.mode === "direct");
    const obfuscatedCases = KOREAN_PII_POSITIVE_CASES.filter((c) => c.mode === "obfuscated");

    it.each(directCases)(
      "직접 PII 마스킹 [$id / $category] -> $expectedToken",
      (testCase) => {
        const direct = redactCreatorSensitiveText(testCase.rawText);
        expect(direct.redactedCount).toBeGreaterThanOrEqual(1);
        expect(direct.sanitizedText).toContain(testCase.expectedToken);
        expect(direct.sanitizedText).not.toContain(testCase.leakedSubstring);

        const guarded = guardCreatorPromptInput(testCase.rawText);
        expect(guarded.redactedCount).toBeGreaterThanOrEqual(1);
        expect(guarded.sanitizedText).not.toContain(testCase.leakedSubstring);
        expect(guarded.wrappedPrompt).toContain('<creator_manuscript data-trusted="false">');
      },
    );

    it.each(obfuscatedCases)(
      "전각·제로폭 우회 PII 정규화 후 마스킹 [$id] -> $expectedToken",
      (testCase) => {
        const normalized = normalizeCreatorObfuscatedInput(testCase.rawText);
        expect(normalized).toContain(testCase.leakedSubstring);

        const directAfterNorm = redactCreatorSensitiveText(normalized);
        expect(directAfterNorm.redactedCount).toBeGreaterThanOrEqual(1);
        expect(directAfterNorm.sanitizedText).not.toContain(testCase.leakedSubstring);

        const guarded = guardCreatorPromptInput(testCase.rawText);
        expect(guarded.redactedCount).toBeGreaterThanOrEqual(1);
        expect(guarded.sanitizedText).toContain(testCase.expectedToken);
        expect(guarded.sanitizedText).not.toContain(testCase.leakedSubstring);
      },
    );

    it.each(SAFE_WEBTOON_PROSE_CASES)(
      "정상 웹툰 대사·작업 규격 무오탐 보존 [$id: $noteKo]",
      (safeCase) => {
        const direct = redactCreatorSensitiveText(safeCase.safeText);
        expect(direct.redactedCount).toBe(0);
        expect(direct.sanitizedText).toBe(safeCase.safeText);

        const guarded = guardCreatorPromptInput(safeCase.safeText);
        expect(guarded.redactedCount).toBe(0);
        expect(guarded.sanitizedText).toBe(safeCase.safeText);
      },
    );
  });

  describe("2. 장문 원고와 JSON의 로컬 처리 시간 검증", () => {
    // V8 정규식 초기 JIT 워밍업
    redactCreatorSensitiveText("워밍업 010-1234-5678 서울 강남구 테헤란로 152");
    guardCreatorPromptInput("워밍업 프롬프트");
    recoverMalformedAiJson('{"episode": 0, "titleKo": "워밍업"}');

    it.each(MANUSCRIPT_LENGTH_CASES)(
      "원고 처리 시간 예산 [$id: $descriptionKo]",
      ({ payload }) => {
        const t0 = performance.now();
        if (payload.trimStart().startsWith("{") || payload.trimStart().startsWith("/") || payload.trimStart().startsWith("/*")) {
          const recovered = recoverMalformedAiJson(payload);
          const elapsed = performance.now() - t0;
          expect(recovered.ok).toBe(true);
          expect(elapsed).toBeLessThan(50);
          return;
        }

        const direct = redactCreatorSensitiveText(payload);
        const guarded = guardCreatorPromptInput(payload);
        const elapsed = performance.now() - t0;

        expect(direct.redactedCount).toBeGreaterThanOrEqual(0);
        expect(guarded.redactedCount).toBe(direct.redactedCount);
        expect(typeof guarded.sanitizedText).toBe("string");
        expect(elapsed).toBeLessThan(50);
      },
    );
  });

  describe("3. 프롬프트 인젝션 및 마크다운 비콘 유출 방어 검증", () => {
    it.each(INPUT_SIGNAL_CASES)(
      "프롬프트 인젝션 신호 검출 및 격리 [$id / $expectedSignal]",
      (injCase) => {
        const guarded = guardCreatorPromptInput(injCase.payload);
        expect(guarded.injectionSignals).toContain(injCase.expectedSignal);

        if (injCase.expectedSignal === "markdown-exfil-url") {
          expect(guarded.blockedExfiltrationUrls).toBeGreaterThanOrEqual(1);
          expect(guarded.sanitizedText).toContain("[외부 이미지 비콘 차단됨]");
          expect(guarded.sanitizedText.toLowerCase()).not.toContain("https://");
          expect(guarded.sanitizedText.toLowerCase()).not.toContain("http://");
        }

        // 래핑된 원고 경계 태그 탈출 원천 차단 확인
        const innerSlice = guarded.wrappedPrompt
          .replace(/^<creator_manuscript data-trusted="false">\n/u, "")
          .replace(/\n<\/creator_manuscript>$/u, "");
        expect(innerSlice).not.toContain("</creator_manuscript>");
      },
    );

    it.each(BENIGN_VILLAIN_DIALOGUE_CASES)(
      "정상 웹툰 악역·시스템창 대사는 인젝션 오탐 없이 보존한다 (%#)",
      (dialogue) => {
        const guarded = guardCreatorPromptInput(dialogue);
        expect(guarded.injectionSignals).toHaveLength(0);
        expect(guarded.blockedExfiltrationUrls).toBe(0);
        expect(guarded.sanitizedText).toBe(dialogue);
      },
    );
  });

  describe("4. 마크다운 코드 펜스·후행 쉼표·주석·절단(Truncated) JSON 복원 및 출력 PII 재마스킹", () => {
    it.each(MALFORMED_AI_JSON_CASES)(
      "손상된 LLM JSON 복원 [$id / $defectKind]",
      (jsonCase) => {
        const res = recoverMalformedAiJson(jsonCase.malformedRaw);
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        expect(res.repaired).toBe(true);
        expect(res.repairNotes.length).toBeGreaterThanOrEqual(1);

        const record = res.value as Record<string, unknown>;
        expect(record.episode).toBe(jsonCase.expectedEpisode);
        expect(record.titleKo).toBe(jsonCase.expectedTitleKo);

        if (jsonCase.expectPiiRedacted) {
          expect(res.redactedCount).toBeGreaterThanOrEqual(1);
          expect(JSON.parse(res.repairedJson)).toEqual(res.value);
          expect(JSON.stringify(res.value)).not.toContain("8291-4402");
          expect(JSON.stringify(res.value)).not.toContain("482901-04-192837");
        }
      },
    );

    it("빈 입력이나 JSON 루트 괄호가 전혀 없는 평문은 안전하게 실패 결과를 반환한다", () => {
      expect(recoverMalformedAiJson("   ")).toEqual({
        ok: false,
        error: "empty_json_input",
      });
      expect(recoverMalformedAiJson("죄송합니다. 현재 요청을 처리할 수 없습니다.")).toEqual({
        ok: false,
        error: "missing_json_root_container",
      });
    });
  });
});
