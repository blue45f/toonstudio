// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STRIP_WIDTH_PX,
  StudioVoiceToBalloonPanel,
  VOICE_BALLOON_PRESETS,
  buildBalloonSvgPath,
  classifyBalloonGeometry,
  computeDynamicTypography,
  computePauseGutterPx,
  layoutVoiceToBalloons,
  measureVisualCharWidth,
  parseScriptLinesToProsodyCues,
  serializeVoiceBalloonLayout,
  splitDialogueIntoReadableSegments,
  wrapBilingualMobileLines,
  type VoiceProsodyCue,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/;

function readModuleSourceFiles(): readonly { readonly file: string; readonly text: string }[] {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(ts|tsx|css)$/u.test(name) && !name.includes(".test."))
    .map((file) => ({
      file,
      text: fs.readFileSync(path.join(dir, file), "utf8"),
    }));
}

describe("voice-to-balloon-layout: 음성 운율·대사 리듬 웹툰 말풍선 자동 조판 엔진", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("내장 프리셋 3종 모두 800px 스트립에서 0겹침(0-overlap)과 줄당 글자수 제한을 보장한다", () => {
    expect(VOICE_BALLOON_PRESETS).toHaveLength(3);

    for (const preset of VOICE_BALLOON_PRESETS) {
      for (const maxCharsPerLine of [14, 16, 18] as const) {
        const result = layoutVoiceToBalloons(preset.cues, {
          stripWidthPx: DEFAULT_STRIP_WIDTH_PX,
          maxCharsPerLine,
          includeSfx: true,
        });

        expect(result.stripWidthPx).toBe(800);
        expect(result.overlapCheck.overlapCount).toBe(0);
        expect(result.overlapCheck.overlappingPairs).toHaveLength(0);
        expect(result.balloons.length).toBeGreaterThanOrEqual(preset.cues.length);
        expect(result.maxLineVisualCharsObserved).toBeLessThanOrEqual(maxCharsPerLine + 0.1);

        for (const balloon of result.balloons) {
          expect(balloon.x).toBeGreaterThanOrEqual(0);
          expect(balloon.x + balloon.width).toBeLessThanOrEqual(800);
          expect(balloon.y + balloon.height).toBeLessThanOrEqual(result.stripHeightPx);
          const svgPath = buildBalloonSvgPath(balloon);
          expect(svgPath.startsWith("M ")).toBe(true);
          expect(svgPath.endsWith("Z")).toBe(true);
        }

        for (const sfx of result.sfxCallouts) {
          expect(sfx.x).toBeGreaterThanOrEqual(0);
          expect(sfx.x + sfx.width).toBeLessThanOrEqual(800);
        }
      }
    }
  });

  it("5종 말풍선 기하학(normal-oval·shout-spike·whisper-dashed·thought-cloud·narration-rect)을 운율에 따라 정확히 분류한다", () => {
    const baseCue: VoiceProsodyCue = {
      id: "c",
      speaker: "화자",
      alignment: "left",
      text: "오늘 날씨 참 좋네요.",
      pauseBeforeMs: 320,
      durationMs: 1400,
      peakDb: -12,
      pitchSlopeSemitones: 0.4,
      emotion: "neutral",
    };

    expect(classifyBalloonGeometry(baseCue)).toBe("normal-oval");
    expect(
      classifyBalloonGeometry({ ...baseCue, emotion: "anger", peakDb: -1.8, pitchSlopeSemitones: 6.4, text: "지금 당장 멈춰!" }),
    ).toBe("shout-spike");
    expect(
      classifyBalloonGeometry({ ...baseCue, emotion: "whisper", peakDb: -22.5 }),
    ).toBe("whisper-dashed");
    expect(
      classifyBalloonGeometry({ ...baseCue, emotion: "thought", peakDb: -16.5 }),
    ).toBe("thought-cloud");
    expect(
      classifyBalloonGeometry({ ...baseCue, emotion: "narration", peakDb: -14 }),
    ).toBe("narration-rect");
  });

  it("한글 어절 보존 및 영문 단어 경계 줄바꿈과 긴 대사 연쇄 말풍선 분할을 수행한다", () => {
    const mixedText = "Wait, 300만 원?! 보일러를 사우나 모드로 한 달 켰다고?!";
    const segments = splitDialogueIntoReadableSegments(mixedText, 14);
    expect(segments.length).toBeGreaterThanOrEqual(1);

    const wrapped = wrapBilingualMobileLines(
      "그 검을 내려놔 지금 당장 멈추지 않으면 도시 전체가 휘말려!",
      14,
    );
    expect(wrapped.length).toBeGreaterThanOrEqual(2);
    for (const line of wrapped) {
      expect(measureVisualCharWidth(line)).toBeLessThanOrEqual(14.1);
    }
    // 어절 중간(예: "멈추지"가 "멈추"/"지"로 쪼개짐)이 끊어지지 않아야 한다.
    expect(wrapped.join(" ")).toContain("멈추지");
    expect(wrapped.join(" ")).toContain("휘말려!");
  });

  it("피크 음압(dB) 증가에 따라 동적 폰트 크기가 커지고 침묵(ms) 증가에 따라 세로 여백이 단조 증가한다", () => {
    const whisperCue: VoiceProsodyCue = {
      id: "w",
      speaker: "지우",
      alignment: "left",
      text: "조용히 말해줘...",
      pauseBeforeMs: 200,
      durationMs: 1200,
      peakDb: -24,
      pitchSlopeSemitones: -1.5,
      emotion: "whisper",
    };
    const shoutCue: VoiceProsodyCue = {
      id: "s",
      speaker: "강현",
      alignment: "right",
      text: "피해!!",
      pauseBeforeMs: 200,
      durationMs: 900,
      peakDb: -1.0,
      pitchSlopeSemitones: 7.2,
      emotion: "anger",
    };

    const whisperTypo = computeDynamicTypography(whisperCue, "whisper-dashed");
    const shoutTypo = computeDynamicTypography(shoutCue, "shout-spike");
    expect(shoutTypo.fontSizePx).toBeGreaterThan(whisperTypo.fontSizePx);
    expect(shoutTypo.fontWeight).toBeGreaterThan(whisperTypo.fontWeight);

    const shortGutter = computePauseGutterPx(150, 34, "neutral");
    const longGutter = computePauseGutterPx(1100, 34, "neutral");
    expect(longGutter).toBeGreaterThan(shortGutter);
  });

  it("대본 문자열 파서와 JSON 직렬화가 결정적 스키마를 반환한다", () => {
    const cues = parseScriptLinesToProsodyCues(
      "[내레이션|narration|300|-14] 밤이 깊어졌다.\n강현: 조심해!!\n지우: 괜찮아...",
    );
    expect(cues).toHaveLength(3);
    expect(cues[0]?.emotion).toBe("narration");
    expect(cues[1]?.emotion).toBe("shock");
    expect(cues[2]?.emotion).toBe("whisper");

    const layout = layoutVoiceToBalloons(cues);
    const parsed = JSON.parse(serializeVoiceBalloonLayout(layout)) as {
      schemaVersion: string;
      stripWidthPx: number;
      overlapCount: number;
    };
    expect(parsed.schemaVersion).toBe("toonstudio.voice-balloon-layout.v1");
    expect(parsed.stripWidthPx).toBe(800);
    expect(parsed.overlapCount).toBe(0);
  });

  it("StudioVoiceToBalloonPanel이 Props 없이 단독 렌더되고 프리셋 전환·대사 추가·SFX 토글이 동작한다", () => {
    render(<StudioVoiceToBalloonPanel />);

    expect(
      screen.getByRole("img", { name: "800px 웹툰 세로 스크롤 말풍선 자동 조판 미리보기" }),
    ).toBeTruthy();
    expect(screen.getByText(/0건 \(0겹침\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "로맨스 속삭임" }));
    expect(screen.getByRole("status").textContent).toContain("로맨스 속삭임");

    fireEvent.click(screen.getByRole("button", { name: "코미디 반전" }));
    expect(screen.getAllByText(/300만 원/).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: "대사 추가" }));
    expect(screen.getByRole("status").textContent).toContain("대사 #6");

    const sfxBtn = screen.getByRole("button", { name: /키네틱 SFX/ });
    expect(sfxBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(sfxBtn);
    expect(sfxBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("모듈 소스 전체가 800줄 이하이며 원시 색상·금지 패턴을 포함하지 않는다", () => {
    const files = readModuleSourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const { file, text } of files) {
      const lineCount = text.split("\n").length;
      expect(lineCount, `${file} exceeds 800 lines (${lineCount})`).toBeLessThanOrEqual(800);
      expect(text, `${file} contains raw hex/rgb/hsl`).not.toMatch(RAW_COLOR_REGEX);
      expect(text, `${file} uses web storage`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(text, `${file} uses transition-all`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(text, `${file} uses Sparkles`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(text, `${file} uses private store Map`).not.toMatch(FORBIDDEN_PRIVATE_STORE_MAP_REGEX);
    }
  });
});
