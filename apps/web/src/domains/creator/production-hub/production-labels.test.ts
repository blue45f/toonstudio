import { describe, expect, it } from "vitest";

import {
  productionActivityLabel,
  productionProcessDisplayLabel,
  submissionStatusLabel,
  PRODUCTION_PROCESS_LABELS,
} from "./production-labels";

const ko = (text: string) => text;
const en = (_ko: string, text: string) => text;

describe("제작 관리 이름표", () => {
  it("활동 기록의 명령 이름을 사람이 읽는 말로 바꾼다", () => {
    expect(productionActivityLabel("upsert-clarification", ko)).toBe("질문·답변 저장");
    expect(productionActivityLabel("record-review-decision", ko)).toBe("검수 결정 기록");
    expect(productionActivityLabel("project-created", en)).toBe("Project created");
  });

  it("모르는 기록은 숨기지 않고 원문 그대로 보여 준다", () => {
    expect(productionActivityLabel("future-command", ko)).toBe("future-command");
    expect(productionActivityLabel("toString", ko)).toBe("toString");
  });

  it("제출본 상태를 한국어·영어 이름으로 보여 준다", () => {
    expect(submissionStatusLabel("in-review", ko)).toBe("검수 중");
    expect(submissionStatusLabel("changes-requested", en)).toBe("Changes requested");
  });
});

describe("공정 표시 이름 (내부 코드 노출 방지)", () => {
  // packages/contracts production-workflow.ts의 PRODUCTION_WORKFLOW_PRESETS 단계 키 전수.
  // 프리셋에 단계가 추가되면 이 목록과 PRODUCTION_PROCESS_LABELS를 함께 갱신해야 한다.
  const PRESET_PROCESS_KEYS = [
    "planning",
    "story-lock",
    "storyboard",
    "name-board",
    "sketch",
    "line-art",
    "ink",
    "background",
    "background-draft",
    "background-compose",
    "color",
    "tone",
    "lettering",
    "first-proof",
    "proof-revision",
    "final-proof",
    "rights-preflight",
    "joint-proof",
    "publication",
  ] as const;

  it("프리셋 단계 키 전부에 이름표가 있어 내부 코드가 화면에 나가지 않는다", () => {
    for (const key of PRESET_PROCESS_KEYS) {
      expect(PRODUCTION_PROCESS_LABELS[key], key).toBeDefined();
      expect(productionProcessDisplayLabel(key, ko)).not.toBe(key);
    }
  });

  it("별칭 키(story·thumbnail)도 정규 이름으로 표시한다", () => {
    expect(productionProcessDisplayLabel("story", ko)).toBe("스토리");
    expect(productionProcessDisplayLabel("thumbnail", ko)).toBe("콘티");
    expect(productionProcessDisplayLabel("line-art", ko)).toBe("선화");
    expect(productionProcessDisplayLabel("line-art", en)).toBe("Line art");
  });

  it("이름표에 없는 키는 내부 코드 대신 대체 이름을 돌려준다", () => {
    expect(productionProcessDisplayLabel("some-future-step", ko)).toBe("기타 공정");
    expect(productionProcessDisplayLabel("some-future-step", en)).toBe("Other step");
  });
});
