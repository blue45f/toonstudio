import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";
/**
 * 파일 크기 래칫 동결 비컴포넌트 상태 문구 i18n 키 이관 계약 6
 * (A4 cat4 동결 비tsx 이관 — frozen6).
 *
 * 배경: 래칫 기준선과 동률이라 순증이 불가능한 동결 .ts 모듈 24파일의
 * 표시 채널 문구(오류 채널 setError 리터럴, 상태·사유 반환 message, 진단
 * message, 진행 라벨)가 호출부에 한국어로 하드코딩돼 en 사용자의 동선이
 * 끊겼다. 표시 정본은 studio-frozen6-status-i18n 등록 모듈의
 * `studio.frozenStatus6.*` 키이며, 코드 안의 한국어 원문은
 * `frozenStatus6Text(키, …, 한국어 폴백)`의 폴백 인자로만 남아야 한다.
 * frozen1~5 모듈은 각 테스트가 전 키의 소비 파일을 단언해 확장할 수 없어
 * 형제 모듈로 분리했다. 소비 파일의 줄 수는 이관 전과 같거나 줄어야 하며
 * (래칫 동결), 증가분은 같은 파일의 다중행 호출 접기와 중복 문구 키
 * 통합으로 상쇄한다. throw·Result error 생산자 채널, 포맷·프로토콜 상수,
 * 콘텐츠 본문·데이터는 대상이 아니다. 템플릿 폴백 호출 9곳(파라미터 치환)은
 * 폴백 추출 대상에서 제외하고 키 등록·소비 존재로만 고정한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 전부 병합해 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

/**
 * frozenStatus6Text 호출을 균형 괄호 스캔으로 전부 추출한다. 반환값은
 * [키, 폴백] 쌍이며, 폴백은 최상위 인자 중 마지막 문자열 리터럴이다.
 * 템플릿 리터럴 폴백(파라미터 치환 호출)은 추출에서 제외된다.
 */
function extractFrozenCalls(source: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  const needle = "frozenStatus6Text(";
  let idx = 0;
  for (;;) {
    const at = source.indexOf(needle, idx);
    if (at < 0) break;
    idx = at + needle.length;
    let pos = idx;
    let paren = 1;
    let brace = 0;
    let bracket = 0;
    let state: string | null = null;
    let escaped = false;
    let current = "";
    const parts: string[] = [];
    while (pos < source.length) {
      const c = source[pos] ?? "";
      if (state !== null) {
        current += c;
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === state) state = null;
        pos += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = c;
        current += c;
        pos += 1;
        continue;
      }
      if (c === "(") paren += 1;
      else if (c === ")") {
        paren -= 1;
        if (paren === 0) {
          parts.push(current);
          current = "";
          pos += 1;
          break;
        }
      } else if (c === "{") brace += 1;
      else if (c === "}") brace -= 1;
      else if (c === "[") bracket += 1;
      else if (c === "]") bracket -= 1;
      else if (c === "," && paren === 1 && brace === 0 && bracket === 0) {
        parts.push(current);
        current = "";
        pos += 1;
        continue;
      }
      current += c;
      pos += 1;
    }
    const unquote = (raw: string): string | null => {
      const match = /^"((?:[^"\\]|\\.)*)"$/s.exec(raw.trim());
      return match ? (match[1] ?? "").replace(/\\"/g, '"') : null;
    };
    const key = parts.length > 0 ? unquote(parts[0] ?? "") : null;
    const fallback = parts.length > 0 ? unquote(parts[parts.length - 1] ?? "") : null;
    if (key !== null && fallback !== null) results.push([key, fallback]);
  }
  return results;
}

const MODULE_FILE = "status-i18n/studio-frozen6-status-i18n.ts";
const PREFIX = "studio.frozenStatus6.";
const CONSUMERS = [
  "studio-pdf-conformance-profile.ts",
  "export/studio-export-presets.ts",
  "studio-screen-share.ts",
  "live/studio-peer-bulk-transfer.ts",
  "studio-cuttoon-editor/studio-cuttoon-stage-pointers-release.ts",
  "studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-armed.ts",
  "layer/studio-layer-lift-workflow.ts",
  "studio-project-archive-orchestration-runtime.ts",
  "bg3d/studio-bg3d-editor-scene-ops-host.ts",
  "bg3d/studio-bg3d-editor-placement-host.ts",
  "bg3d/studio-bg3d-editor-transform-host.ts",
  "bg3d/studio-bg3d-shot-batch-export-run.ts",
  "layer/studio-layer-operations.ts",
  "studio-page-vector-ops.ts",
  "vrm/useStudioVrmPoserRuntimeE.ts",
  "studio-cuttoon-editor/studio-deferred-stroke-commit.ts",
  "studio-page-save-pipeline.ts",
  "character-shaper/useCharacterShaperBinding.ts",
  "live/studio-live-collaboration-room.ts",
  "studio-creator-pack-runtime.ts",
  "studio-document-envelope.ts",
  "studio-writer-room-canvas-projection.ts",
  "vrm/studio-vrm-project-library.ts",
  "vrm/studio-vrm-surface-paint-tool.ts"
] as const;

/** 이관 전 줄 수(래칫 기준선) — 소비 파일은 이 줄 수를 넘을 수 없다. */
const BASELINE_LINES: Record<(typeof CONSUMERS)[number], number> = {
  "studio-pdf-conformance-profile.ts": 2060,
  "export/studio-export-presets.ts": 808,
  "studio-screen-share.ts": 996,
  "live/studio-peer-bulk-transfer.ts": 806,
  "studio-cuttoon-editor/studio-cuttoon-stage-pointers-release.ts": 820,
  "studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-armed.ts": 846,
  "layer/studio-layer-lift-workflow.ts": 862,
  "studio-project-archive-orchestration-runtime.ts": 847,
  "bg3d/studio-bg3d-editor-scene-ops-host.ts": 934,
  "bg3d/studio-bg3d-editor-placement-host.ts": 832,
  "bg3d/studio-bg3d-editor-transform-host.ts": 1018,
  "bg3d/studio-bg3d-shot-batch-export-run.ts": 1062,
  "layer/studio-layer-operations.ts": 955,
  "studio-page-vector-ops.ts": 879,
  "vrm/useStudioVrmPoserRuntimeE.ts": 878,
  "studio-cuttoon-editor/studio-deferred-stroke-commit.ts": 1094,
  "studio-page-save-pipeline.ts": 985,
  "character-shaper/useCharacterShaperBinding.ts": 1146,
  "live/studio-live-collaboration-room.ts": 2587,
  "studio-creator-pack-runtime.ts": 928,
  "studio-document-envelope.ts": 1656,
  "studio-writer-room-canvas-projection.ts": 1130,
  "vrm/studio-vrm-project-library.ts": 860,
  "vrm/studio-vrm-surface-paint-tool.ts": 858
};

/** 이관 뒤 탐지기 표시 채널 위반 수(실측 고정) — 24파일 전부 0. */
const EXPECTED_VIOLATIONS: Record<(typeof CONSUMERS)[number], number> = {
  "studio-pdf-conformance-profile.ts": 0,
  "export/studio-export-presets.ts": 0,
  "studio-screen-share.ts": 0,
  "live/studio-peer-bulk-transfer.ts": 0,
  "studio-cuttoon-editor/studio-cuttoon-stage-pointers-release.ts": 0,
  "studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-armed.ts": 0,
  "layer/studio-layer-lift-workflow.ts": 0,
  "studio-project-archive-orchestration-runtime.ts": 0,
  "bg3d/studio-bg3d-editor-scene-ops-host.ts": 0,
  "bg3d/studio-bg3d-editor-placement-host.ts": 0,
  "bg3d/studio-bg3d-editor-transform-host.ts": 0,
  "bg3d/studio-bg3d-shot-batch-export-run.ts": 0,
  "layer/studio-layer-operations.ts": 0,
  "studio-page-vector-ops.ts": 0,
  "vrm/useStudioVrmPoserRuntimeE.ts": 0,
  "studio-cuttoon-editor/studio-deferred-stroke-commit.ts": 0,
  "studio-page-save-pipeline.ts": 0,
  "character-shaper/useCharacterShaperBinding.ts": 0,
  "live/studio-live-collaboration-room.ts": 0,
  "studio-creator-pack-runtime.ts": 0,
  "studio-document-envelope.ts": 0,
  "studio-writer-room-canvas-projection.ts": 0,
  "vrm/studio-vrm-project-library.ts": 0,
  "vrm/studio-vrm-surface-paint-tool.ts": 0
};

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("frozen non-tsx status i18n r7frz6", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(Object.keys(blocks.en).sort()).toEqual(ALL_KEYS);
    for (const key of ALL_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("플레이스홀더가 ko/en에서 정확히 일치한다", () => {
    for (const key of ALL_KEYS) {
      const koPh = [...(blocks.ko[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      const enPh = [...(blocks.en[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      expect(enPh, `placeholder mismatch: ${key}`).toEqual(koPh);
    }
  });

  it("전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of ALL_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(new RegExp(`"(${PREFIX.replace(/\./g, "\\.")}[A-Za-z0-9.]+)"`, "g"))].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(ALL_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("소비 파일의 폴백 인자가 등록된 ko 원문과 일치한다", () => {
    for (const file of CONSUMERS) {
      for (const [key, fallback] of extractFrozenCalls(readSource(file))) {
        expect(fallback, `${file}: fallback mismatch for ${key}`).toBe(blocks.ko[key]);
      }
    }
  });

  it("이관 파일의 탐지기 위반이 파일별 고정값을 넘지 않는다", () => {
    for (const file of CONSUMERS) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations.length, `${file}: ${JSON.stringify(violations)}`).toBe(EXPECTED_VIOLATIONS[file]);
    }
  });

  it("소비 파일 줄 수가 래칫 기준선을 넘지 않는다 (줄중립)", () => {
    for (const file of CONSUMERS) {
      const source = readSource(file);
      const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lines, `${file} lines ${lines} > baseline ${BASELINE_LINES[file]}`).toBeLessThanOrEqual(BASELINE_LINES[file]);
    }
  });

  it("등록 모듈이 800줄 상한을 넘지 않는다", () => {
    const source = readSource(MODULE_FILE);
    const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
    expect(lines, `module lines ${lines} > 800`).toBeLessThanOrEqual(800);
  });
});
