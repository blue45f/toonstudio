// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { altTextToAudioWebtoonScript, estimateAltTextTtsDurationSec } from "./claude-alt-text";
import { formatCommandPlanCheatSheet } from "./claude-command-plan";
import { ClaudeAltTextResult } from "./ClaudeAltTextResult";
import { ClaudeArtDirectorResult } from "./ClaudeArtDirectorResult";
import { ClaudeCommandPlanResult } from "./ClaudeCommandPlanResult";
import { ClaudeLocalizeResult } from "./ClaudeLocalizeResult";

describe("claude-dialogs-webtoon-upgrades", () => {
  it("ClaudeArtDirectorResult가 리얼드로우 4레이어 공정 배지와 요약 카드를 표시한다", () => {
    render(
      <ClaudeArtDirectorResult
        highlight={null}
        onHighlight={vi.fn()}
        result={{
          model: "claude-haiku-5-5",
          usage: {
            inputTokens: 120,
            outputTokens: 80,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          estimatedUsd: 0.001,
          review: {
            summary: "투시 소실점과 역광 대비를 보강하면 컷 타격감이 살아납니다.",
            scores: { composition: 4, readability: 5, mood: 4 },
            strengths: ["말풍선 시선 유도가 자연스럽습니다."],
            readingOrder: [{ step: 1, label: "상단 주인공 눈빛", region: null }],
            issues: [
              {
                id: "issue-persp",
                category: "perspective",
                severity: "high",
                confidence: "high",
                title: "복도 배경 소실점 어긋남",
                detail: "인물 발바닥 접지면과 배경 타일 투시가 어긋나 있습니다.",
                fix: "3D 카메라 수평선을 낮추고 소실점을 맞추세요.",
                region: null,
              },
              {
                id: "issue-contrast",
                category: "contrast",
                severity: "medium",
                confidence: "high",
                title: "역광 림라이트 대비 부족",
                detail: "인물 실루엣이 어두운 배경에 묻힙니다.",
                fix: "어깨 외곽에 청록색 스크린 림라이트를 추가하세요.",
                region: null,
              },
            ],
            nextActions: ["배경 카메라 앵글 재정렬"],
            trimmed: 0,
          },
        }}
      />,
    );

    expect(document.querySelector('[data-art-director-layer-badge="background-3d"]')).toBeTruthy();
    expect(
      document.querySelector('[data-art-director-layer-badge="cel-shading-light"]'),
    ).toBeTruthy();
    expect(document.querySelector('[data-art-director-layer-summary="true"]')).toBeTruthy();
  });

  it("ClaudeLocalizeResult가 모바일 42자 말풍선 적합도 배지와 짧은 대안 일괄 적용 버튼을 동작시킨다", () => {
    const onEdit = vi.fn();
    render(
      <ClaudeLocalizeResult
        view={{
          lines: [
            {
              index: 1,
              source: "여기서 물러서면 우리가 지켜온 모든 약속이 무너진다!",
              translation:
                "If we step back right now, every single promise we have fought to protect will collapse completely!",
              shorter: "Step back now, and every promise we kept falls apart!",
              note: "모바일 말풍선 폭 압축 권장",
              missing: false,
            },
          ],
          warnings: [],
          discarded: 0,
          indexShifted: false,
          trimmed: 0,
        }}
        edits={new Map()}
        onEdit={onEdit}
        budget="comfortable"
        glossary={[]}
        languages={{ source: "ko", target: "en" }}
        usageText="100 tokens"
      />,
    );

    const healthBanner = document.querySelector('[data-claude-localize-bubble-health="true"]');
    expect(healthBanner).toBeTruthy();
    expect(healthBanner?.textContent).toContain("모바일 말풍선 가독성 적합도 0%");

    const applyAllBtn = document.querySelector(
      '[data-claude-localize-apply-all-shorter="true"]',
    ) as HTMLButtonElement | null;
    expect(applyAllBtn).toBeTruthy();
    fireEvent.click(applyAllBtn!);
    expect(onEdit).toHaveBeenCalledWith(
      1,
      "Step back now, and every promise we kept falls apart!",
    );
  });

  it("ClaudeAltTextResult가 오디오 웹툰(Audio-Toon) 큐시트와 예상 TTS 낭독 시간을 생성한다", () => {
    const view = {
      short: "붉은 성소에서 검을 뽑아 든 서진",
      long: "무너진 신전 기둥 사이로 달빛이 쏟아지고 서진이 결연한 표정으로 검을 들어 올린다.",
      panels: [
        {
          step: 1,
          description: "서진의 클로즈업 눈빛",
          text: ["서진: 이제 끝낼 시간이야.", "효과음: 스릉-"],
        },
      ],
      warnings: [],
      trimmed: 0,
    };
    const sec = estimateAltTextTtsDurationSec(view);
    expect(sec).toBeGreaterThanOrEqual(5);
    const script = altTextToAudioWebtoonScript(view);
    expect(script).toContain("# [오디오 웹툰 & 화면해설 큐시트]");
    expect(script).toContain("[Cut 1 화면해설] 서진의 클로즈업 눈빛");

    render(
      <ClaudeAltTextResult
        run={{
          model: "claude-haiku-5-5",
          scope: "detailed",
          usage: {
            inputTokens: 100,
            outputTokens: 90,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          estimatedUsd: 0.001,
          view,
        }}
        short={view.short}
        long={view.long}
        onShort={vi.fn()}
        onLong={vi.fn()}
      />,
    );

    expect(document.querySelector('[data-claude-alt-audiotoon-box="true"]')).toBeTruthy();
  });

  it("ClaudeCommandPlanResult가 단축키 매크로 동선 치트시트를 표시한다", () => {
    const steps = [
      { commandId: "view.toggleGrid", label: "격자 표시", reason: "투시 정렬" },
      { commandId: "view.toggleRulers", label: "눈금자 표시", reason: "여백 확인" },
    ];
    const shortcuts = new Map([
      ["view.toggleGrid", "⌘'"],
      ["view.toggleRulers", "⌘R"],
    ]);
    expect(formatCommandPlanCheatSheet(steps, shortcuts)).toBe(
      "1. 격자 표시 (⌘') → 2. 눈금자 표시 (⌘R)",
    );

    render(
      <ClaudeCommandPlanResult
        outcome={{
          model: "claude-haiku-5-5",
          usage: {
            inputTokens: 80,
            outputTokens: 50,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          estimatedUsd: 0.0005,
          plan: {
            intent: "투시 격자와 눈금자를 함께 켭니다.",
            steps,
            questions: [],
            rejected: [],
          },
        }}
        stale={false}
        selected={new Set(["view.toggleGrid", "view.toggleRulers"])}
        onToggle={vi.fn()}
        onRun={vi.fn()}
        running={false}
        busy={false}
        results={[]}
        shortcuts={shortcuts}
        usageText="130 tokens"
      />,
    );

    const summary = document.querySelector('[data-claude-plan-shortcut-summary="true"]');
    expect(summary).toBeTruthy();
    expect(summary?.textContent).toContain("1. 격자 표시 (⌘') → 2. 눈금자 표시 (⌘R)");
  });
});
