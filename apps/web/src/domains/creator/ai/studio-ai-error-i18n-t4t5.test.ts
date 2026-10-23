import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { scanHardcodedStatusStrings } from "../../../shared/language/status-i18n";

import { planStudioAiEpisodeProduction } from "./studio-ai-episode-production-director";
import { planStudioAiExecutionPreflight } from "./studio-ai-execution-preflight";
import { reconcileStudioAiComicDirectorJobs } from "./studio-ai-comic-director-session";
import {
  STUDIO_AI_ERROR_T4T5_EN,
  STUDIO_AI_ERROR_T4T5_KO,
  encodeAiErrorCode,
  resolvePersistedAiErrorText,
  resolveStudioAiComicFindingMessage,
  resolveStudioAiEpisodeIssue,
  studioAiEpisodeIssueCode,
} from "./studio-ai-error-i18n-t4t5";

/**
 * AI 진단·구조 채널 에러 문구 i18n 이관 계약 (A4 후속 AI 이관 T4+T5, 2026-10-22).
 *
 * T1 사전(studio-ai-error-i18n.ts)은 병행 트랜치 소유라 건드리지 않고,
 * T4+T5 구간(issue·media·preflight·scenarioImage·comicApi·canon·session·
 * bridge·onnx)은 전용 모듈 studio-ai-error-i18n-t4t5.ts에 분리 등록했다.
 * 구조 채널(episode 이슈·media findings)은 생산자가 id+파라미터를 싣고
 * 표시 시점에 해석하고, 영속 job.error는 코드 문자열을 저장한다.
 * 구 레코드의 한국어 문자열은 코드 표식이 없어 그대로 표시된다(하위호환).
 */

const HANGUL = /[가-힣]/;
const KO_KEYS = Object.keys(STUDIO_AI_ERROR_T4T5_KO).sort();

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

function setLang(lang: string): void {
  useI18n.setState({ lang });
}

afterEach(() => {
  setLang("ko");
});

const PRODUCER_FILES = [
  "./studio-ai-comic-director-media.ts",
  "./studio-ai-execution-preflight.ts",
  "./studio-scenario-image-generation.ts",
  "./studio-ai-comic-director-api.ts",
  "./canon/studio-character-canon.ts",
  "./studio-ai-comic-director-session.ts",
  "./studio-stroke-proposal-bridge.ts",
  "./studio-onnx-colorize-layers.ts",
] as const;

const CALL_PATTERN =
  /aiErrorText\("([^"]+)",\s*(?:\{[^}]*\},\s*)?"((?:[^"\\]|\\.)*)"\)/g;

function collectCalls(file: string): Array<{ key: string; fallback: string }> {
  return [...readSource(file).matchAll(CALL_PATTERN)].map((match) => ({
    key: match[1] ?? "",
    fallback: match[2] ?? "",
  }));
}

describe("studio.aiError T4+T5 사전", () => {
  it("ko/en 키 집합이 일치하고 91키다", () => {
    expect(Object.keys(STUDIO_AI_ERROR_T4T5_EN).sort()).toEqual(KO_KEYS);
    expect(KO_KEYS).toHaveLength(91);
    expect(KO_KEYS.every((key) => key.startsWith("studio.aiError."))).toBe(true);
  });

  it("en 값에 한글이 없고 ko/en 값이 비어 있지 않다", () => {
    for (const key of KO_KEYS) {
      expect(STUDIO_AI_ERROR_T4T5_EN[key as keyof typeof STUDIO_AI_ERROR_T4T5_EN], key).not.toMatch(HANGUL);
      expect((STUDIO_AI_ERROR_T4T5_KO[key as keyof typeof STUDIO_AI_ERROR_T4T5_KO] ?? "").length, key).toBeGreaterThan(0);
    }
  });

  it("네임스페이스 구간 수가 트랜치 범위와 대응한다 (issue 43·media 22·onnx 9·scenarioImage 4·comicApi 4·preflight 3·bridge 3·canon 2·session 1)", () => {
    const count = (prefix: string) => KO_KEYS.filter((key) => key.startsWith(prefix)).length;
    expect(count("studio.aiError.issue.")).toBe(43);
    expect(count("studio.aiError.media.")).toBe(22);
    expect(count("studio.aiError.onnx.")).toBe(9);
    expect(count("studio.aiError.scenarioImage.")).toBe(4);
    expect(count("studio.aiError.comicApi.")).toBe(4);
    expect(count("studio.aiError.preflight.")).toBe(3);
    expect(count("studio.aiError.bridge.")).toBe(3);
    expect(count("studio.aiError.canon.")).toBe(2);
    expect(count("studio.aiError.session.")).toBe(1);
  });
});

describe("studio.aiError T4+T5 소비 계약", () => {
  it("생산자 직접 호출의 폴백이 ko 사전값과 글자 단위로 일치하고 미등록 참조가 없다", () => {
    for (const file of PRODUCER_FILES) {
      for (const call of collectCalls(file)) {
        expect(STUDIO_AI_ERROR_T4T5_KO[call.key as keyof typeof STUDIO_AI_ERROR_T4T5_KO], `${file} :: ${call.key}`).toBe(call.fallback);
      }
    }
  });

  it("직접 호출 키 + session 코드 + issue 해석 키를 합치면 전 키가 소비된다", () => {
    const used = new Set<string>();
    for (const file of PRODUCER_FILES) {
      for (const call of collectCalls(file)) used.add(call.key);
    }
    for (const match of readSource("./studio-ai-comic-director-session.ts").matchAll(/encodeAiErrorCode\("([^"]+)"\)/g)) {
      used.add(match[1] ?? "");
    }
    // issue 키는 해석 계층이 코드×필드로 조합하므로 전 조합을 열거해 확인한다.
    const codes = [
      "inputEmpty", "inputTooFewCuts", "sceneLargeBatch", "sceneLocationAmbiguous",
      "sceneLightingConflict", "costumeChangeWithoutTransition", "cutLongDialogue",
      "cutRepeatedShot", "cameraVarietyLow", "episodeCutCountHigh",
      "missingCharacter", "missingCostume", "missingLocation", "missingLighting",
      "missingStyle", "missingProps",
    ];
    for (const code of codes) {
      for (const field of ["title", "description", "resolution"]) {
        if (code.startsWith("missing") && field === "description") continue;
        used.add(`studio.aiError.issue.${code}.${field}`);
      }
    }
    used.add("studio.aiError.issue.missingAnchor.description");
    expect([...used].sort()).toEqual(KO_KEYS);
  });

  it("생산자 파일에 생산자 채널 하드코딩이 남아 있지 않다 (탐지기 producer 모드 0건)", () => {
    for (const file of PRODUCER_FILES) {
      const violations = scanHardcodedStatusStrings(readSource(file), {
        includeProducerChannels: true,
      });
      expect(violations, file).toEqual([]);
    }
  });
});

describe("episode 이슈 표시 시점 해석 (T4)", () => {
  it("이관 전후로 이슈 id 집합이 동일하다 (스냅샷 대조)", () => {
    const inputs = [
      { script: "   " },
      {
        script: "빈 교실 창문으로 오후 햇빛이 들어온다.\n칠판 위 분필가루가 천천히 떨어진다.",
        styleAnchor: "clean webtoon cel style",
      },
      {
        script: [
          "민서: 지금까지 네가 숨겨 온 모든 비밀을 오늘 여기서 반드시 밝혀내고 말겠어 그러니 더는 도망치지 마",
          "민서가 조용히 창밖을 바라본다.",
          "민서가 책상 위 편지를 집어 든다.",
          "민서가 문 쪽으로 천천히 걸어간다.",
        ].join("\n"),
      },
      {
        script: "주인공이 교복 차림으로 학교를 나선다.\n주인공이 정장을 입고 사무실에 도착한다.",
        characterAnchor: "주인공",
        styleAnchor: "webtoon cel",
        lightingAnchor: "낮",
        propAnchor: "가방",
      },
    ] as const;
    const expectedIds = [
      "costume-change-without-transition",
      "cut-1-long-dialogue",
      "cut-3-repeated-shot",
      "input-empty",
      "input-too-few-cuts",
      "missing-character-anchor",
      "missing-costume-anchor",
      "missing-lighting-anchor",
      "missing-location-anchor",
      "missing-props-anchor",
      "missing-style-anchor",
    ];
    const seen = new Set<string>();
    for (const input of inputs) {
      const plan = planStudioAiEpisodeProduction(input);
      for (const issue of plan.issues) {
        seen.add(issue.id);
        expect(studioAiEpisodeIssueCode(issue.id), issue.id).not.toBeNull();
        const resolved = resolveStudioAiEpisodeIssue(issue);
        expect(resolved.id).toBe(issue.id);
      }
    }
    expect([...seen].sort()).toEqual(expectedIds);
  });

  it("ko에서는 원문 그대로, en에서는 영어로 해석된다 (동적 파라미터 포함)", () => {
    const plan = planStudioAiEpisodeProduction({ script: "   " });
    const issue = plan.issues[0];
    expect(issue).toBeDefined();
    setLang("ko");
    expect(resolveStudioAiEpisodeIssue(issue!).title).toBe("대본이 비어 있어요");
    setLang("en");
    const resolved = resolveStudioAiEpisodeIssue(issue!);
    expect(resolved.title).toBe("The script is empty");
    expect(resolved.description).not.toMatch(HANGUL);
    expect(resolved.resolution).not.toMatch(HANGUL);
  });

  it("파라미터가 없는 구 이슈와 모르는 id는 원문을 그대로 유지한다", () => {
    const legacy = {
      id: "input-too-few-cuts",
      severity: "notice",
      category: "pacing",
      title: "회차가 매우 짧아요",
      description: "2개 컷만 감지되어 도입·전개·후킹 리듬을 평가하기 어렵습니다.",
      resolution: "의도한 티저가 아니라면 반응 컷이나 공간 전환 컷을 보강하세요.",
    } as const;
    setLang("en");
    expect(resolveStudioAiEpisodeIssue(legacy).title).toBe("회차가 매우 짧아요");
    const unknown = { ...legacy, id: "future-issue", params: { count: 2 } } as const;
    expect(resolveStudioAiEpisodeIssue(unknown).title).toBe("회차가 매우 짧아요");
  });
});

describe("media findings·preflight·영속 해석 (T4)", () => {
  it("findings는 id로 해석되고 해상도는 리포트 크기가 채워진다", () => {
    const finding = {
      id: "resolution",
      message: "원본이 640×480px입니다. 최종 원고 확대 전에 확인하세요.",
    };
    setLang("ko");
    expect(resolveStudioAiComicFindingMessage(finding, { width: 640, height: 480 })).toBe(finding.message);
    setLang("en");
    expect(resolveStudioAiComicFindingMessage(finding, { width: 640, height: 480 })).toBe(
      "The original is 640×480px. Check it before enlarging for the final manuscript.",
    );
    expect(resolveStudioAiComicFindingMessage({ id: "unknown", message: "원문" })).toBe("원문");
  });

  it("preflight unavailableReason이 현재 로케일로 만들어진다", () => {
    const input = {
      activeTool: "background",
      imageConfigured: false,
      textConfigured: false,
      connectionLabel: "연결 없음",
      connectionOk: false,
    } as const;
    setLang("ko");
    expect(planStudioAiExecutionPreflight(input).unavailableReason).toContain("이미지 API가 연결되지 않아");
    setLang("en");
    expect(planStudioAiExecutionPreflight(input).unavailableReason).toBe(
      "The image API is not connected, so this cannot run. Add a key in the AI assist settings.",
    );
  });

  it("영속 job.error는 코드로 저장되고 표시 시점에 해석되며 구 문자열은 그대로 표시된다", () => {
    const expired = reconcileStudioAiComicDirectorJobs(
      [{
        id: "job-1",
        operationId: "op-1",
        kind: "generation",
        status: "running",
        progressDone: 0,
        progressTotal: 1,
        payload: {},
        result: null,
        error: null,
        leaseExpiresAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }],
      Date.now(),
    );
    const stored = expired[0]?.error ?? "";
    expect(stored).toBe(encodeAiErrorCode("studio.aiError.session.providerCompletionUnverified"));
    expect(stored).not.toMatch(HANGUL);
    setLang("ko");
    expect(resolvePersistedAiErrorText(stored)).toBe("브라우저 연결이 끊긴 동안 공급자 완료 여부를 확인하지 못했습니다.");
    setLang("en");
    expect(resolvePersistedAiErrorText(stored)).toBe("While the browser connection was lost, provider completion could not be verified.");
    expect(resolvePersistedAiErrorText("기존 한국어 오류")).toBe("기존 한국어 오류");
  });
});
