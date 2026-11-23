// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioRetentionBgmAcademyPanel } from "./StudioRetentionBgmAcademyPanel";
import {
  DEFAULT_REDPEN_CRITIQUE_INPUT,
  buildDefaultCrashRecoveryScenario,
  buildRedpenCritiqueReplayCard,
  computeFnv1a32Hex,
  computeSha256Hex,
  escapeRedpenHtml,
  evaluateRedpenReplayAtTime,
  reconcileWalCrashRecovery,
  sanitizeAssetRef,
  signCheckpointSnapshot,
  signWalDeltaEntry,
  type RedpenCritiqueReplayInput,
  type WalDeltaEntry,
} from "./crash-forensic-and-redpen-replay";
import {
  DEFAULT_BGM_TRACK_CUES,
  DEFAULT_FREE_ARC_EPISODES,
  DEFAULT_SFX_TRIGGER_CUES,
  analyzeEpisodeHookAndRetention,
  analyzeFreeArcRetention,
  evaluateScrollBgmTriggers,
  exportBgmCueSheet,
} from "./retention-coach-and-bgm-cue";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/webtoon-retention-bgm");

describe("webtoon-retention-bgm: 이탈 위험 코치 · BGM/SFX 큐시트 · OPFS 1획 복원 · 붉은펜 카드 · UI", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("무료 1~5화 이탈 위험 코치는 리듬 곡선·중반 늘어짐 구간·구체적 편집 처방을 정확히 산출한다", () => {
    const ep1 = analyzeEpisodeHookAndRetention(DEFAULT_FREE_ARC_EPISODES[0]);
    const ep2 = analyzeEpisodeHookAndRetention(DEFAULT_FREE_ARC_EPISODES[1]);
    const ep5 = analyzeEpisodeHookAndRetention(DEFAULT_FREE_ARC_EPISODES[4]);

    expect(ep1.isFreeTierEpisode).toBe(true);
    expect(ep1.rhythmCurve).toHaveLength(6);
    expect(ep1.openingHookScore).toBeGreaterThan(75);
    expect(ep1.overallRetentionScore).toBeGreaterThan(ep2.overallRetentionScore);

    // 2화는 대사 과밀·1780px 장컷·지연 후크(6컷)로 중반 늘어짐 및 4종 처방이 탐지돼야 한다.
    expect(ep2.pacingDipZones.length).toBeGreaterThanOrEqual(1);
    expect(ep2.pacingDipZones[0].startCutIndex).toBeLessThanOrEqual(3);
    expect(ep2.pacingDipZones[0].endCutIndex).toBeGreaterThanOrEqual(4);
    expect(ep2.metrics.firstHookCutIndex).toBe(6);

    const rxTypes = new Set(ep2.prescriptions.map((p) => p.type));
    expect(rxTypes.has("pull-hook-forward")).toBe(true);
    expect(rxTypes.has("trim-dialogue")).toBe(true);
    expect(rxTypes.has("split-cut")).toBe(true);
    expect(rxTypes.has("amplify-cliffhanger")).toBe(true);

    // 5화는 유료 전환 직전 약한 클리프행어 보강 처방이 critical 우선순위로 생성된다.
    const ep5CliffRx = ep5.prescriptions.find((p) => p.type === "amplify-cliffhanger");
    expect(ep5CliffRx?.priority).toBe("critical");

    // 1~5화 전체 무료 구간 코호트에서 2화가 최대 병목 회차로 집계된다.
    const freeArc = analyzeFreeArcRetention(DEFAULT_FREE_ARC_EPISODES);
    expect(freeArc.freeEpisodeCount).toBe(5);
    expect(freeArc.bottleneckEpisodeNumber).toBe(2);
    expect(freeArc.paidWallReadinessScore).toBeGreaterThan(0);

    // 빈 컷 입력 엣지 케이스도 안전하게 크래시 없이 분석된다.
    const emptyRep = analyzeEpisodeHookAndRetention({ episodeNumber: 1, title: "", cuts: [] });
    expect(emptyRep.cutCount).toBe(0);
    expect(emptyRep.riskLevel).toBe("critical");
    expect(emptyRep.prescriptions[0]?.type).toBe("pull-hook-forward");
  });

  it("스크롤 좌표(scrollY) 기준 BGM 페이드인/아웃·크로스페이드 정규화와 컷 진입 SFX 트리거·큐시트 출고를 검증한다", () => {
    // 1) 도입부 페이드인 구간 (scrollY=100 -> focalY=415 < fadeInPx 700)
    const intro = evaluateScrollBgmTriggers({
      scrollY: 100,
      previousScrollY: 0,
      viewportHeightPx: 900,
      tracks: DEFAULT_BGM_TRACK_CUES,
      sfxCues: DEFAULT_SFX_TRIGGER_CUES,
    });
    const rainIntro = intro.activeTracks.find((t) => t.trackId === "bgm-rain-alley")!;
    expect(rainIntro.phase).toBe("fade-in");
    expect(rainIntro.effectiveVolume).toBeGreaterThan(0);
    expect(rainIntro.effectiveVolume).toBeLessThan(0.78);
    expect(intro.crossfadeActive).toBe(false);

    // 2) 크로스페이드 구간 (scrollY=4685 -> focalY=5000: rain 4400..5600 fade-out & rooftop 4400..5600 fade-in)
    const crossfade = evaluateScrollBgmTriggers({
      scrollY: 4685,
      previousScrollY: 4400,
      viewportHeightPx: 900,
      tracks: DEFAULT_BGM_TRACK_CUES,
      sfxCues: DEFAULT_SFX_TRIGGER_CUES,
    });
    expect(crossfade.crossfadeActive).toBe(true);
    expect(crossfade.activeTracks.every((t) => t.phase === "crossfading")).toBe(true);
    expect(crossfade.totalNormalizedGain).toBeLessThanOrEqual(1);
    expect(crossfade.firedSfxIds).toContain("sfx-door-02");

    // 3) 천둥(1450)과 발소리(7900) 컷 진입 발화 검증
    const thunderPass = evaluateScrollBgmTriggers({
      scrollY: 1200,
      previousScrollY: 1000,
      viewportHeightPx: 900,
      tracks: DEFAULT_BGM_TRACK_CUES,
      sfxCues: DEFAULT_SFX_TRIGGER_CUES,
    });
    expect(thunderPass.firedSfxIds).toEqual(["sfx-thunder-01"]);

    const footstepsPass = evaluateScrollBgmTriggers({
      scrollY: 7650,
      previousScrollY: 7400,
      viewportHeightPx: 900,
      tracks: DEFAULT_BGM_TRACK_CUES,
      sfxCues: DEFAULT_SFX_TRIGGER_CUES,
    });
    expect(footstepsPass.firedSfxIds).toEqual(["sfx-footsteps-03"]);

    // 4) JSON/RFC4180 CSV 큐시트 출고 및 CSV 수식 인젝션 방어 검증
    const exported = exportBgmCueSheet({
      workTitle: "빗속의 계약",
      episodeCode: "EP.03",
      canvasHeightPx: 11400,
      platform: "naver-bgm-spec",
      tracks: [
        ...DEFAULT_BGM_TRACK_CUES,
        {
          ...DEFAULT_BGM_TRACK_CUES[0],
          trackId: "bgm-formula-test",
          title: "=HYPERLINK(\"evil\")",
          startY: 10000,
          endY: 11300,
        },
      ],
      sfxCues: DEFAULT_SFX_TRIGGER_CUES,
    });
    expect(exported.schemaVersion).toBe("toonstudio.bgm-cuesheet.v1");
    expect(exported.summary.trackCount).toBe(3);
    expect(exported.summary.sfxCount).toBe(4);
    expect(exported.summary.crossfadeOverlapCount).toBeGreaterThanOrEqual(2);
    expect(exported.summary.totalCoveragePct).toBeGreaterThan(95);

    const parsed = JSON.parse(exported.json) as { bgmTracks: unknown[]; sfxCues: unknown[] };
    expect(parsed.bgmTracks).toHaveLength(3);
    expect(parsed.sfxCues).toHaveLength(4);
    expect(exported.csv).toContain("cue_type,cue_id,cut_or_mood");
    expect(exported.csv).toContain("'=HYPERLINK");
  });

  it("OPFS WAL 크래시 포렌식은 SHA-256/FNV-1a 체크섬으로 손상 꼬리만 격리하고 마지막 정상 1획까지 손실 0%로 복원한다", () => {
    // 표준 FIPS 180-4 SHA-256 테스트 벡터 및 FNV-1a 결정론 검증
    expect(computeSha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(computeFnv1a32Hex("toonstudio-wal")).toMatch(/^[0-9a-f]{8}$/);

    // SHA-256 + 손상 꼬리 2건 격리 시나리오
    const shaScenario = buildDefaultCrashRecoveryScenario("sha256", true);
    const shaResult = reconcileWalCrashRecovery(shaScenario);
    expect(shaResult.receipt.checkpointVerified).toBe(true);
    expect(shaResult.receipt.status).toBe("recovered-with-tail-quarantine");
    expect(shaResult.receipt.appliedEntryCount).toBe(6);
    expect(shaResult.receipt.quarantinedEntryCount).toBe(2);
    expect(shaResult.receipt.recoveredStrokeCount).toBe(7); // base 2 + healthy WAL 5
    expect(shaResult.receipt.lastHealthySequence).toBe(106);
    expect(shaResult.receipt.lastRecoveredStrokeId).toBe("stk-wal-105");
    expect(shaResult.receipt.healthyStrokeRecoveryRatePct).toBe(100);
    expect(shaResult.receipt.zeroLossForHealthyTail).toBe(true);
    expect(shaResult.layerOpacities["tone-shadow"]).toBe(0.62);
    expect(shaResult.quarantinedEntries[0].reasonCode).toBe("truncated-tail");
    expect(shaResult.quarantinedEntries[1].reasonCode).toBe("post-corruption-tail");
    expect(shaResult.recoveredStrokes.some((s) => s.strokeId === "stk-wal-torn-107")).toBe(false);

    // FNV-1a 정상 시나리오(손상 꼬리 없음) -> clean 상태
    const fnvClean = reconcileWalCrashRecovery(buildDefaultCrashRecoveryScenario("fnv1a", false));
    expect(fnvClean.receipt.status).toBe("clean");
    expect(fnvClean.receipt.quarantinedEntryCount).toBe(0);
    expect(fnvClean.receipt.receiptHash.startsWith("fnv1a:")).toBe(true);

    // 변조된 체크섬·시퀀스 갭·지우개(stroke-erase) 리플레이 검증
    const baseCkpt = signCheckpointSnapshot({
      checkpointId: "ckpt-erase",
      documentId: "doc-erase",
      episodeLabel: "EP.01 / CUT-01",
      schemaVersion: 2,
      capturedAtIso: "2026-11-23T11:00:00.000Z",
      baseSequence: 10,
      strokes: shaScenario.checkpoint.strokes,
      checksumAlgorithm: "sha256",
    });
    const eraseEntry = signWalDeltaEntry({
      seq: 11,
      prevChecksum: baseCkpt.snapshotChecksum,
      timestampIso: "2026-11-23T11:00:05.000Z",
      op: "stroke-erase",
      targetStrokeId: "stk-base-01",
      payloadBytes: 64,
      checksumAlgorithm: "sha256",
    });
    const tamperedEntry: WalDeltaEntry = {
      ...signWalDeltaEntry({
        seq: 12,
        prevChecksum: eraseEntry.checksum,
        timestampIso: "2026-11-23T11:00:09.000Z",
        op: "stroke-commit",
        stroke: {
          strokeId: "stk-tampered",
          layerId: "ink",
          tool: "pen",
          strokeWidthPx: 3,
          opacity: 1,
          points: [{ x: 10, y: 10, pressure: 0.5, timestampOffsetMs: 0 }],
          committedAtIso: "2026-11-23T11:00:09.000Z",
        },
        payloadBytes: 128,
        checksumAlgorithm: "sha256",
      }),
      checksum: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    };
    const eraseAndTamper = reconcileWalCrashRecovery({
      checkpoint: baseCkpt,
      walEntries: [eraseEntry, tamperedEntry],
    });
    expect(eraseAndTamper.recoveredStrokes.map((s) => s.strokeId)).toEqual(["stk-base-02"]);
    expect(eraseAndTamper.quarantinedEntries[0]?.reasonCode).toBe("checksum-mismatch");

    // 체크포인트 자체가 손상되면 checkpoint-corrupt 로 안전 차단한다.
    const corruptCkptResult = reconcileWalCrashRecovery({
      checkpoint: { ...baseCkpt, snapshotChecksum: "sha256:broken" },
      walEntries: [eraseEntry],
    });
    expect(corruptCkptResult.receipt.checkpointVerified).toBe(false);
    expect(corruptCkptResult.receipt.status).toBe("checkpoint-corrupt");

    // 시퀀스 갭·해시 체인 불일치·불량 페이로드 격리 분기 검증
    const gapEntry = signWalDeltaEntry({
      seq: 13,
      prevChecksum: baseCkpt.snapshotChecksum,
      timestampIso: "2026-11-23T11:00:12.000Z",
      op: "checkpoint-marker",
      payloadBytes: 32,
      checksumAlgorithm: "sha256",
    });
    expect(reconcileWalCrashRecovery({ checkpoint: baseCkpt, walEntries: [gapEntry] }).quarantinedEntries[0]?.reasonCode).toBe("sequence-gap");

    const brokenChainEntry = signWalDeltaEntry({
      seq: 11,
      prevChecksum: "sha256:wrong-prev",
      timestampIso: "2026-11-23T11:00:12.000Z",
      op: "checkpoint-marker",
      payloadBytes: 32,
      checksumAlgorithm: "sha256",
    });
    expect(reconcileWalCrashRecovery({ checkpoint: baseCkpt, walEntries: [brokenChainEntry] }).quarantinedEntries[0]?.reasonCode).toBe("chain-break");

    const invalidPayloadEntry = signWalDeltaEntry({
      seq: 11,
      prevChecksum: baseCkpt.snapshotChecksum,
      timestampIso: "2026-11-23T11:00:12.000Z",
      op: "stroke-commit",
      payloadBytes: 32,
      checksumAlgorithm: "sha256",
    });
    expect(reconcileWalCrashRecovery({ checkpoint: baseCkpt, walEntries: [invalidPayloadEntry] }).quarantinedEntries[0]?.reasonCode).toBe("invalid-payload");
  });

  it("붉은펜 첨삭 리플레이 카드는 타임라인 동기화·Before/After 메타를 패키징하고 XSS·위험 URL을 완벽 차단한다", () => {
    const card = buildRedpenCritiqueReplayCard(DEFAULT_REDPEN_CRITIQUE_INPUT);
    expect(card.schemaVersion).toBe("toonstudio.redpen-replay-card.v1");
    expect(card.strokeCount).toBe(4);
    expect(card.subtitleCount).toBe(4);
    expect(card.improvementDelta.silhouetteClarity).toBe(31);
    expect(card.improvementDelta.eyeFlowScore).toBe(37);
    expect(card.integrityDigest.startsWith("sha256:")).toBe(true);
    expect(card.cardByteSize).toBeGreaterThan(200);
    expect(card.htmlSnippet).toContain(`data-asset="assets/academy/ep02-cut14-before.webp"`);

    // 6400ms 시점 리플레이 프레임: rp-01 완료(1), rp-02 진행중(0<p<1), 자막 sub-02 활성
    const frame = evaluateRedpenReplayAtTime(card, 6400);
    expect(frame.visibleStrokes).toHaveLength(2);
    expect(frame.visibleStrokes[0].strokeProgress).toBe(1);
    expect(frame.visibleStrokes[1].isActive).toBe(true);
    expect(frame.activeSubtitle?.cueId).toBe("sub-02");

    // XSS & 위험 URL 인젝션 방어 검증
    expect(escapeRedpenHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
    );
    expect(sanitizeAssetRef("javascript:alert(1)")).toBeNull();
    expect(sanitizeAssetRef("data:text/html,<script>evil()</script>")).toBeNull();
    expect(sanitizeAssetRef("../../etc/passwd")).toBeNull();
    expect(sanitizeAssetRef("assets/academy/cut-01.webp")).toBe("assets/academy/cut-01.webp");
    expect(sanitizeAssetRef("https://cdn.example.com/before.webp")).toBe("https://cdn.example.com/before.webp");

    const hostileInput: RedpenCritiqueReplayInput = {
      ...DEFAULT_REDPEN_CRITIQUE_INPUT,
      sessionId: `sess"><script>alert(1)</script>`,
      mentorName: `멘토<img src=x onerror=alert(1)>`,
      studentName: `수강생<svg onload=hack()>`,
      subtitles: [
        {
          cueId: "xss-sub",
          startMs: 0,
          endMs: 2000,
          speaker: `<b>악성</b>`,
          text: `<script>document.cookie</script> 시선을 정리하세요`,
        },
      ],
      comparison: {
        ...DEFAULT_REDPEN_CRITIQUE_INPUT.comparison,
        beforeSummary: `<iframe src="https://evil.invalid/frame"></iframe>`,
        beforeImageRef: "javascript:alert(1)",
        afterImageRef: "data:text/html,<script>boom()</script>",
      },
    };
    const hostileCard = buildRedpenCritiqueReplayCard(hostileInput);
    expect(hostileCard.sanitizedRefs.beforeImageRef).toBeNull();
    expect(hostileCard.sanitizedRefs.afterImageRef).toBeNull();
    expect(hostileCard.htmlSnippet).not.toContain("<script>");
    expect(hostileCard.htmlSnippet).not.toContain("<img src=x onerror");
    expect(hostileCard.htmlSnippet).not.toContain("<iframe");
    expect(hostileCard.htmlSnippet).not.toContain("javascript:");
    expect(hostileCard.htmlSnippet).not.toContain("data:text/html");
    expect(hostileCard.htmlSnippet).not.toContain("data-asset=");
    expect(hostileCard.htmlSnippet).toContain("&lt;script&gt;");
    expect(hostileCard.htmlSnippet).not.toMatch(/fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/i);
    expect(RAW_COLOR_REGEX.test(hostileCard.htmlSnippet)).toBe(false);
  });

  it("StudioRetentionBgmAcademyPanel은 모든 props 없이 3개 탭·인터랙션·KO/EN 전환이 정상 동작한다", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const onCueExport = vi.fn();
    const onRecovery = vi.fn();
    const onRedpen = vi.fn();

    render(
      <StudioRetentionBgmAcademyPanel
        onCueSheetExported={onCueExport}
        onRecoveryExecuted={onRecovery}
        onRedpenCardBuilt={onRedpen}
      />,
    );

    // 기본 탭 1: 1~5화 이탈 위험 코치
    expect(screen.getByRole("tab", { name: "1~5화 이탈 위험 코치" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("pacing-dip-zones")).toBeTruthy();
    expect(screen.getByTestId("retention-prescriptions")).toBeTruthy();

    // 회차 5화로 전환
    fireEvent.click(screen.getByRole("button", { name: "5화" }));
    expect(screen.getByText(/유료 전환 직전 클리프행어 강화/)).toBeTruthy();

    // 탭 2: BGM·SFX 스크롤 큐시트
    fireEvent.click(screen.getByRole("tab", { name: "BGM·SFX 스크롤 큐시트" }));
    expect(screen.getByTestId("bgm-crossfade-badge").textContent).toContain("크로스페이드 활성");
    fireEvent.click(screen.getByRole("button", { name: "JSON 미리보기" }));
    expect(screen.getByTestId("bgm-cuesheet-preview").textContent).toContain("toonstudio.bgm-cuesheet.v1");
    fireEvent.click(screen.getByRole("button", { name: "큐시트 JSON 출고" }));
    expect(onCueExport).toHaveBeenCalledTimes(1);

    // 탭 3: 크래시 1획 복원 · 붉은펜 첨삭 카드
    fireEvent.click(screen.getByRole("tab", { name: "크래시 1획 복원 · 붉은펜 첨삭 카드" }));
    expect(screen.getByTestId("wal-recovery-rate").textContent).toContain("100%");
    expect(screen.getByTestId("wal-recovery-summary").textContent).toContain("stk-wal-105");
    fireEvent.click(screen.getByRole("button", { name: "FNV1A" }));
    expect(screen.getByTestId("wal-recovery-summary").textContent).toContain("fnv1a:");
    fireEvent.click(screen.getByRole("button", { name: "복구 영수증 보기" }));
    expect(screen.getByTestId("wal-receipt-preview").textContent).toContain("toonstudio.opfs-crash-receipt.v1");
    fireEvent.click(screen.getByRole("button", { name: "복구 영수증 발급" }));
    expect(onRecovery).toHaveBeenCalledTimes(1);

    // 붉은펜 첨삭 HTML 미리보기 & 저장 콜백
    expect(screen.getByTestId("redpen-active-subtitle").textContent).toContain("최서연 멘토");
    fireEvent.click(screen.getByRole("button", { name: "XSS-Safe HTML 보기" }));
    expect(screen.getByTestId("redpen-card-preview").textContent).toContain("ts-redpen-card");
    fireEvent.click(screen.getByRole("button", { name: "인터랙티브 카드 저장" }));
    expect(onRedpen).toHaveBeenCalledTimes(1);

    // EN 로케일 전환 검증 (기본 props 생략 + useI18n 전환)
    cleanup();
    useI18n.setState({ lang: "en" });
    render(<StudioRetentionBgmAcademyPanel />);
    expect(screen.getByRole("tab", { name: "EP.1-5 Retention Coach" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "BGM · SFX Cue Sheet" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Crash 1-Stroke · Redpen Card" })).toBeTruthy();
  });

  it("Calm Atelier 토큰 위생·배럴 금지·원시색상/localStorage/transition-all 0건·파일 줄 수 상한을 모두 준수한다", () => {
    expect(existsSync(resolve(MODULE_DIR, "index.ts"))).toBe(false);
    expect(existsSync(resolve(MODULE_DIR, "index.tsx"))).toBe(false);

    const fileBudgets: readonly { readonly file: string; readonly maxLines: number; readonly isTest?: boolean }[] = [
      { file: "retention-coach-and-bgm-cue.ts", maxLines: 680 },
      { file: "crash-forensic-and-redpen-replay.ts", maxLines: 680 },
      { file: "StudioRetentionBgmAcademyPanel.tsx", maxLines: 460 },
      { file: "webtoon-retention-bgm.test.tsx", maxLines: 750, isTest: true },
    ];

    for (const entry of fileBudgets) {
      const source = readFileSync(resolve(MODULE_DIR, entry.file), "utf8");
      const lineCount = source.split("\n").length;
      expect(lineCount, `${entry.file} line count ${lineCount} <= ${entry.maxLines}`).toBeLessThanOrEqual(
        entry.maxLines,
      );
      expect(RAW_COLOR_REGEX.test(source), `${entry.file} must not contain raw hex/rgb/hsl colors`).toBe(false);
      if (!entry.isTest) {
        expect(source.includes("localStorage"), `${entry.file} must not use localStorage`).toBe(false);
        expect(source.includes("transition-all"), `${entry.file} must not use transition-all`).toBe(false);
      }
    }

    const panelSource = readFileSync(resolve(MODULE_DIR, "StudioRetentionBgmAcademyPanel.tsx"), "utf8");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
  });
});
