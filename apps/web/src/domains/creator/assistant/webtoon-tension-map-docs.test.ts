import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "../studio-pose-presets";

import {
  CUT_POSE_SCORE_CONFIG,
  poseCandidatesFromPresets,
  suggestCutPoses,
  type CutPoseReasonCode,
} from "./webtoon-cut-pose-suggestion";
import { CUT_POSE_TRAITS } from "./webtoon-cut-pose-traits";
import {
  CUT_CAMERA_ANGLE_LABELS,
  CUT_CAMERA_ANGLE_ORDER,
  CUT_EMOTION_LABELS,
  CUT_EMOTION_ORDER,
  CUT_SHOT_SCALE_LABELS,
  CUT_SHOT_SCALE_ORDER,
} from "./webtoon-cut-vocabulary";
import {
  TENSION_KIND_LABELS,
  TENSION_PARAMETER_LABELS,
  TENSION_SOURCE_LABELS,
} from "./webtoon-tension-copy";
import {
  TENSION_EMOTION_WEIGHT,
  TENSION_MAP_CONFIG,
  TENSION_MAP_PARAMETERS,
  TENSION_SHOT_WEIGHT,
} from "./webtoon-tension-map";
import {
  TENSION_MAP_SAMPLE_SCRIPT,
  TENSION_MAP_SCRIPT_MAX_CHARS,
  buildTensionMapView,
} from "./webtoon-tension-map-source";

import type { CharacterEmotionalTone } from "../ai/studio-ai-storyboard-director";

/**
 * 기능 문서(`docs/features/tension-map-pose-suggestion.md`)가 코드와 어긋나지 않게 묶어 두는 시험.
 * 계수·임계값·점수표·예시 결과·특성 요약을 바꾸면 이 시험이 실패하므로 문서의 표도 함께 고친다.
 * 이 기능의 수치는 전부 휴리스틱이라 문서가 값을 틀리게 적으면 "근거 있는 값"처럼 읽힌다.
 */
const REPO_ROOT = process.cwd();
const DOC = "docs/features/tension-map-pose-suggestion.md";
const CREATOR_DIR = "apps/web/src/domains/creator";

const doc = readFileSync(resolve(REPO_ROOT, DOC), "utf8");
const lines = doc.split("\n").map((line) => line.trimEnd());
const lineSet = new Set(lines);

function expectLine(line: string, where: string): void {
  expect(lineSet.has(line), `${DOC} 의 ${where} 에 다음 줄이 없습니다:\n${line}`).toBe(true);
}

/** 머리글 줄 바로 아래에서 이어지는 표의 본문 줄(머리글·구분선 제외). */
function tableRowsAfter(header: string): string[] {
  const start = lines.indexOf(header);
  expect(start, `${DOC} 에 표 머리글이 없습니다: ${header}`).toBeGreaterThanOrEqual(0);
  const rows: string[] = [];
  for (let index = start + 2; index < lines.length && lines[index].startsWith("|"); index += 1) {
    rows.push(lines[index]);
  }
  return rows;
}

const viewResult = (() => {
  const view = buildTensionMapView({ kind: "script", script: TENSION_MAP_SAMPLE_SCRIPT, panels: [] });
  if (view.status !== "ready") throw new Error(`예시 대본이 준비 상태가 아니에요: ${view.status}`);
  return view.result;
})();

describe("텐션 맵 문서와 코드의 일치 — 계산식과 계수", () => {
  it("4.3절 계수 표가 TENSION_MAP_PARAMETERS 와 한 줄도 어긋나지 않는다", () => {
    const expected = TENSION_MAP_PARAMETERS.map(
      (row) =>
        `| ${TENSION_PARAMETER_LABELS[row.id].ko} (\`${row.id}\`) | ${row.value} | ${TENSION_SOURCE_LABELS[row.source].ko} |`,
    );
    for (const line of expected) expectLine(line, "4.3절 계수 표");
    // 코드에서 사라진 계수가 문서에 남지 않게 줄 수도 맞춘다
    expect(tableRowsAfter("| 항목 | 값 | 출처 |")).toEqual(expected);
  });

  it("출처가 있는 값은 급상승 예외 여백 하나뿐이라고 적고, 코드도 그렇다", () => {
    const sourced = TENSION_MAP_PARAMETERS.filter((row) => row.source === "canvas-guide");
    expect(sourced.map((row) => row.id)).toEqual(["rush.exemptGutter"]);
    expect(doc).toContain("출처가 있는 값은 `rush.exemptGutter` 하나다");
    expect(doc).toContain("모든 수치는 휴리스틱이다");
  });

  it("체류 시간·템포·긴장도 식의 숫자가 설정 객체의 값이다", () => {
    const { weights, dwell } = TENSION_MAP_CONFIG;
    expect(doc).toContain(
      `체류 시간(초) = (이전 컷과의 여백 + 컷 높이) ÷ ${dwell.speedPxPerSec}px/s + 말풍선 수 × ${dwell.dialogueSec}초`,
    );
    expect(doc).toContain(
      `템포   = 1 − clamp((체류 시간 − ${dwell.fastSec}) ÷ (${dwell.slowSec} − ${dwell.fastSec}), 0, 1)`,
    );
    expect(doc).toContain(
      `긴장도 = (${weights.emotion} × 감정 + ${weights.shot} × 샷 + ${weights.tempo} × 템포) ÷ (아는 근거의 비중 합)`,
    );
    expect(weights.emotion + weights.shot + weights.tempo).toBeCloseTo(1, 10);
  });

  it("한도 숫자(컷 수·값 상한·말풍선·대본 글자 수)가 설정 객체의 값이다", () => {
    const { maxCuts, maxPx, maxDialogue } = TENSION_MAP_CONFIG.limits;
    expect(doc).toContain(`컷 ${maxCuts}개`);
    expect(doc).toContain(`${maxCuts}컷만 분석`);
    expect(doc).toContain(`한 값 ${maxPx.toLocaleString("en-US")}px`);
    expect(doc).toContain(`컷당 말풍선 ${maxDialogue}개`);
    expect(doc).toContain(`${TENSION_MAP_SCRIPT_MAX_CHARS.toLocaleString("en-US")}자까지`);
  });

  it("후보 구간 규칙의 기준 숫자와 경계 표현이 설정 객체와 같다", () => {
    const { segments, dwell } = TENSION_MAP_CONFIG;
    expect(doc).toContain(
      `긴장도가 ${segments.dragMaxTension} **미만**인 컷이 ${segments.dragMinRun}컷 이상 이어진다`,
    );
    expect(doc).toContain(
      `체류 시간이 ${dwell.fastSec}초 **이하**인 컷이 ${segments.rushMinRun}컷 이상 이어진다`,
    );
    expect(doc).toContain(`직전 컷보다 긴장도가 ${segments.abruptRise} 이상 오른다`);
    expect(doc).toContain(`그 컷 앞 여백이 ${segments.abruptRiseExemptGutterPx}px 이상이면`);
    expect(doc).toContain(`긴장도가 ${segments.climaxMinTension} 이상인 지역 최댓값`);
    expect(doc).toContain(`가장 높은 ${segments.climaxMaxCount}곳만`);
  });

  it("대본 가정값(컷 기준 높이·여백)을 본문에서도 같은 숫자로 말한다", () => {
    const { referencePanelHeightPx, assumedGutterPx } = TENSION_MAP_CONFIG.plan;
    expect(doc).toContain(`컷 높이 = \`panelHeightRatio\` × ${referencePanelHeightPx}px`);
    expect(doc).toContain(`컷 사이 여백 = ${assumedGutterPx}px`);
  });
});

describe("텐션 맵 문서와 코드의 일치 — 감정·샷 점수와 예시", () => {
  it("4.4절 감정 점수 표와 샷 크기 점수 표가 코드의 값이다", () => {
    const emotionRows = CUT_EMOTION_ORDER.map(
      (emotion) =>
        `| ${CUT_EMOTION_LABELS[emotion].ko} (\`${emotion}\`) | ${TENSION_EMOTION_WEIGHT[emotion].toFixed(2)} |`,
    );
    const shotRows = CUT_SHOT_SCALE_ORDER.map(
      (shot) =>
        `| ${CUT_SHOT_SCALE_LABELS[shot].ko} (\`${shot}\`) | ${TENSION_SHOT_WEIGHT[shot].toFixed(2)} |`,
    );
    expect(tableRowsAfter("| 감정 | 점수 |")).toEqual(emotionRows);
    expect(tableRowsAfter("| 샷 크기 | 점수 |")).toEqual(shotRows);
  });

  it("6절의 예시 대본이 입력창에 채워지는 글과 같다", () => {
    const start = doc.indexOf("```text\n방과 후");
    expect(start, "6절의 예시 대본 코드 블록이 없습니다").toBeGreaterThanOrEqual(0);
    const body = doc.slice(start + "```text\n".length, doc.indexOf("\n```", start));
    expect(body).toBe(TENSION_MAP_SAMPLE_SCRIPT);
  });

  it("6절 예시 결과 표가 실제 계산 결과와 한 줄도 어긋나지 않는다", () => {
    const expected = viewResult.cuts.map((cut) => {
      if (cut.emotion === null || cut.shotScale === null || cut.dwellSec === null) {
        throw new Error("예시 대본의 컷은 감정·샷·체류 시간을 모두 가져야 해요");
      }
      const flags =
        cut.flags.length === 0 ? "—" : cut.flags.map((kind) => TENSION_KIND_LABELS[kind].ko).join(", ");
      return `| ${cut.index + 1} | ${CUT_EMOTION_LABELS[cut.emotion].ko} | ${CUT_SHOT_SCALE_LABELS[cut.shotScale].ko} | ${cut.dwellSec.toFixed(1)} | ${cut.tension.toFixed(3)} | ${flags} |`;
    });
    expect(tableRowsAfter("| 컷 | 감정 | 샷 크기 | 체류(초) | 긴장도 | 후보 |")).toEqual(expected);
    expect(viewResult.peakIndex).not.toBeNull();
    expectLine(
      `평균 ${viewResult.averageTension.toFixed(3)} · 최고 컷 ${(viewResult.peakIndex ?? 0) + 1}`,
      "6절 예시 결과",
    );
  });
});

describe("포즈 추천 문서와 코드의 일치", () => {
  const config = CUT_POSE_SCORE_CONFIG;

  it("7.3절 점수식과 적합도 표가 설정 객체의 값이다", () => {
    expect(doc).toContain(
      `점수 = round(100 × (${config.weights.emotion} × 감정 적합 + ${config.weights.shot} × 샷 적합 + ${config.weights.angle} × 앵글 적합))`,
    );
    expect(config.weights.emotion + config.weights.shot + config.weights.angle).toBeCloseTo(1, 10);

    expect(tableRowsAfter("| 감정 순위 | 적합도 |")).toEqual(
      ["첫째", "둘째", "셋째"].map((label, index) => `| ${label} | ${config.emotionRankFit[index]} |`),
    );
    expect(tableRowsAfter("| 샷 크기 | 상체 포즈(upper) | 전신 포즈(full) |")).toEqual(
      CUT_SHOT_SCALE_ORDER.map(
        (shot) =>
          `| ${CUT_SHOT_SCALE_LABELS[shot].ko} | ${config.shotFit.upper[shot]} | ${config.shotFit.full[shot]} |`,
      ),
    );
    expect(tableRowsAfter("| 앵글 경우 | 적합도 |")).toEqual([
      `| 아이레벨 | ${config.angleFit.eyeLevel} |`,
      `| 포즈가 특히 살아나는 앵글 | ${config.angleFit.match} |`,
      `| 앵글 특성이 없는 포즈 | ${config.angleFit.neutral} |`,
      `| 다른 앵글에서 더 잘 읽히는 포즈 | ${config.angleFit.mismatch} |`,
    ]);
    expectLine(
      `모르는 샷 ${config.unknown.shot} · 모르는 앵글 ${config.unknown.angle} · "잘 읽혀요" ${config.readableShotFit} 이상 · "잘릴 수 있어요" ${config.croppedShotFit} 이하 · 기본 ${config.defaultLimit}개 · 최대 ${config.maxLimit}개`,
      "7.3절 임계값 줄",
    );
  });

  it("7.4절 이유 코드 표가 함수가 낼 수 있는 이유 코드와 같다", () => {
    // 포즈를 하나씩 카탈로그로 넣어 본다. 순위와 무관하게 "그 포즈에 붙을 수 있는 이유"를 모두 모은다 —
    // 대안 동작(emotion-alternative)처럼 점수가 낮아 실제 상위 목록에는 거의 못 드는 이유도 빠지지 않는다.
    const seen = new Set<CutPoseReasonCode>();
    for (const preset of poseCandidatesFromPresets(NATURAL_IDLE_POSES, EXTRA_POSE_PRESETS)) {
      for (const emotion of CUT_EMOTION_ORDER) {
        for (const shotScale of [null, ...CUT_SHOT_SCALE_ORDER]) {
          for (const cameraAngle of [null, ...CUT_CAMERA_ANGLE_ORDER]) {
            for (const suggestion of suggestCutPoses({ emotion, shotScale, cameraAngle }, [preset])) {
              for (const reason of suggestion.reasons) seen.add(reason.code);
            }
          }
        }
      }
    }
    expect(seen.size).toBe(7);
    const documented = tableRowsAfter("| 코드 | 성격 | 문장(한국어) |").map(
      (row) => /^\| `([a-z-]+)` \|/u.exec(row)?.[1],
    );
    expect([...documented].sort()).toEqual([...seen].sort());
  });

  it("7.5절 특성 요약이 특성 표(CUT_POSE_TRAITS)에서 센 값이고 72종을 다룬다", () => {
    const traits = Object.values(CUT_POSE_TRAITS);
    expect(traits).toHaveLength(NATURAL_IDLE_POSES.length + EXTRA_POSE_PRESETS.length);
    expect(doc).toContain(`${traits.length}종 각각의`);
    const count = (emotion: CharacterEmotionalTone, rank: number) =>
      traits.filter((entry) => entry.emotions.indexOf(emotion) === rank).length;
    const body = (emotion: CharacterEmotionalTone, kind: "upper" | "full") =>
      traits.filter((entry) => entry.emotions.includes(emotion) && entry.body === kind).length;
    expect(tableRowsAfter("| 감정 | 주 동작 | 보조 동작 | 대안 동작 | 상체 | 전신 |")).toEqual(
      CUT_EMOTION_ORDER.map(
        (emotion) =>
          `| ${CUT_EMOTION_LABELS[emotion].ko} | ${count(emotion, 0)} | ${count(emotion, 1)} | ${count(emotion, 2)} | ${body(emotion, "upper")} | ${body(emotion, "full")} |`,
      ),
    );
  });

  it("7.7절 추천 예시가 실제 추천 결과와 같다", () => {
    const catalog = poseCandidatesFromPresets(NATURAL_IDLE_POSES, EXTRA_POSE_PRESETS);
    const cases = [
      { emotion: "rage", shotScale: "full-shot", cameraAngle: "low-angle" },
      { emotion: "shock", shotScale: "extreme-close-up", cameraAngle: "eye-level" },
      { emotion: "sorrow", shotScale: "close-up", cameraAngle: "high-angle" },
      { emotion: "calm", shotScale: "medium-shot", cameraAngle: "eye-level" },
      { emotion: "joy", shotScale: null, cameraAngle: null },
    ] as const;
    for (const input of cases) {
      const label = [
        CUT_EMOTION_LABELS[input.emotion].ko,
        input.shotScale === null ? "샷 미지정" : CUT_SHOT_SCALE_LABELS[input.shotScale].ko,
        input.cameraAngle === null ? "앵글 미지정" : CUT_CAMERA_ANGLE_LABELS[input.cameraAngle].ko,
      ].join(" · ");
      const heading = lines.indexOf(`입력: ${label}`);
      expect(heading, `${DOC} 7.7절에 '입력: ${label}' 이 없습니다`).toBeGreaterThanOrEqual(0);
      const rows: string[] = [];
      for (let index = heading + 4; index < lines.length && lines[index].startsWith("|"); index += 1) {
        rows.push(lines[index]);
      }
      expect(rows).toEqual(
        suggestCutPoses(input, catalog).map(
          (suggestion) =>
            `| ${suggestion.rank} | ${suggestion.label} (\`${suggestion.presetId}\`) | ${suggestion.score} |`,
        ),
      );
    }
  });
});

describe("텐션 맵 문서의 형식과 참조", () => {
  it("상태 표기(current·target·legacy exception)와 휴리스틱 고지를 담는다", () => {
    for (const word of ["current", "target", "legacy exception", "휴리스틱"]) {
      expect(doc, `${DOC} 에 '${word}' 가 없습니다`).toContain(word);
    }
    expect(doc).toContain("작성 기준일: 2026-10-15");
    expect(doc).toMatch(/기준 커밋: `[0-9a-f]{40}`/u);
  });

  it("본문이 가리키는 파일이 모두 실제로 있다", () => {
    const tokens = [...doc.matchAll(/`([A-Za-z0-9_./-]+\.(?:tsx?|mjs|md))`/gu)].map((match) => match[1]);
    expect(tokens.length).toBeGreaterThan(10);
    const bases = ["", `${CREATOR_DIR}/`, `${CREATOR_DIR}/assistant/`];
    for (const token of new Set(tokens)) {
      const found = bases.some((base) => existsSync(resolve(REPO_ROOT, `${base}${token}`)));
      expect(found, `${DOC} 가 가리키는 파일이 없습니다: ${token}`).toBe(true);
    }
  });

  it("상대 링크가 가리키는 문서가 있다", () => {
    const targets = [...doc.matchAll(/\]\((?!https?:|mailto:|#)([^)#\s]+)(?:#[^)]*)?\)/gu)].map(
      (match) => match[1],
    );
    expect(targets.length).toBeGreaterThanOrEqual(3);
    for (const target of targets) {
      expect(
        existsSync(resolve(REPO_ROOT, dirname(DOC), target)),
        `${DOC} 의 링크 대상이 없습니다: ${target}`,
      ).toBe(true);
    }
  });
});
