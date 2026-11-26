import { describe, expect, it } from "vitest";

import {
  CJK_QUOTE_OUTER_HALF_TRIM_EM,
  classifyMixedScriptCodePoint,
  computeBalloonLineWidthProfileEm,
  computeCfrTimestampUs,
  computeFnv1a32Hex,
  computeOpticalPairKerningEm,
  computeSha256Hex,
  CONSECUTIVE_CJK_QUOTE_KERN_EM,
  DEFAULT_HOT_WINDOW_STEPS,
  DEFAULT_MAX_UNDO_RAM_BYTES,
  HANGUL_ALPHANUM_BREATHING_KERN_EM,
  layoutBalloonMixedTypography,
  MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM,
  MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM,
  planWebCodecsScrollReelMux,
  shapeMixedScriptOpticalRun,
  UndoCommandCoalescerGovernor,
  type EmittedOpfsSpillPacket,
  type ScrollReelFrameTelemetry,
} from "./index";

describe("hangul-optical-mixed-kerning (한글·영문·숫자·전각 문장부호 광학 커닝 및 말풍선 줄바꿈)", () => {
  it("코드포인트별 시각 계층(한글·영문 대소문자·숫자·전각 따옴표·말줄임표·종결부호)을 정확히 분류한다", () => {
    expect(classifyMixedScriptCodePoint("가".codePointAt(0) ?? 0)).toBe("hangul-syllable");
    expect(classifyMixedScriptCodePoint("힣".codePointAt(0) ?? 0)).toBe("hangul-syllable");
    expect(classifyMixedScriptCodePoint("F".codePointAt(0) ?? 0)).toBe("latin-upper");
    expect(classifyMixedScriptCodePoint("p".codePointAt(0) ?? 0)).toBe("latin-lower");
    expect(classifyMixedScriptCodePoint("7".codePointAt(0) ?? 0)).toBe("tabular-digit");
    expect(classifyMixedScriptCodePoint("「".codePointAt(0) ?? 0)).toBe("cjk-open-quote");
    expect(classifyMixedScriptCodePoint("『".codePointAt(0) ?? 0)).toBe("cjk-open-quote");
    expect(classifyMixedScriptCodePoint("」".codePointAt(0) ?? 0)).toBe("cjk-close-quote");
    expect(classifyMixedScriptCodePoint("》".codePointAt(0) ?? 0)).toBe("cjk-close-quote");
    expect(classifyMixedScriptCodePoint("…".codePointAt(0) ?? 0)).toBe("ellipsis-dash");
    expect(classifyMixedScriptCodePoint("—".codePointAt(0) ?? 0)).toBe("ellipsis-dash");
    expect(classifyMixedScriptCodePoint("!".codePointAt(0) ?? 0)).toBe("terminal-punct");
    expect(classifyMixedScriptCodePoint("?".codePointAt(0) ?? 0)).toBe("terminal-punct");
  });

  it("혼용 문장 「제1장: 120FPS 초격차!」에서 광학 커닝·고정폭 숫자·중심축 dyEm 상승을 정밀 산출한다", () => {
    const shaped = shapeMixedScriptOpticalRun("「제1장: 120FPS 초격차!」");
    expect(shaped.glyphs.length).toBe(Array.from("「제1장: 120FPS 초격차!」").length);

    // 줄 시작 여는 따옴표 「와 줄 끝 닫는 따옴표 」의 반폭 트림(-0.25em) 확인
    expect(shaped.glyphs[0]?.char).toBe("「");
    expect(shaped.glyphs[0]?.halfWidthTrimEm).toBe(CJK_QUOTE_OUTER_HALF_TRIM_EM);
    const lastGlyph = shaped.glyphs[shaped.glyphs.length - 1];
    expect(lastGlyph?.char).toBe("」");
    expect(lastGlyph?.halfWidthTrimEm).toBe(CJK_QUOTE_OUTER_HALF_TRIM_EM);

    // 공백 없이 밀착된 "제1장"의 한글↔숫자 양방향 +0.04em 광학 숨통 확인
    expect(shaped.hangulAlphanumBreathingCount).toBe(2);
    expect(shaped.glyphs[2]?.char).toBe("1");
    expect(shaped.glyphs[2]?.kernBeforeEm).toBe(HANGUL_ALPHANUM_BREATHING_KERN_EM);
    expect(shaped.glyphs[3]?.char).toBe("장");
    expect(shaped.glyphs[3]?.kernBeforeEm).toBe(HANGUL_ALPHANUM_BREATHING_KERN_EM);

    // "120FPS 액션!" 및 본문 내 영문 대문자·숫자의 세로 중심축 기준선 상승(+0.055em ~ +0.085em) 검증
    const actionRun = shapeMixedScriptOpticalRun("120FPS 액션!");
    for (const glyph of actionRun.glyphs) {
      if (glyph.glyphClass === "latin-upper" || glyph.glyphClass === "tabular-digit") {
        expect(glyph.dyEm).toBeGreaterThanOrEqual(MIN_CENTRAL_AXIS_OPTICAL_LIFT_EM);
        expect(glyph.dyEm).toBeLessThanOrEqual(MAX_CENTRAL_AXIS_OPTICAL_LIFT_EM);
      }
      if (glyph.glyphClass === "hangul-syllable") {
        expect(glyph.dyEm).toBe(0);
      }
    }

    // 연속 전각 따옴표 」「 -0.35em 광학 조임 및 고정폭 숫자 폭 불변성 검증
    expect(computeOpticalPairKerningEm("cjk-close-quote", "cjk-open-quote")).toBe(
      CONSECUTIVE_CJK_QUOTE_KERN_EM,
    );
    const consecutiveQuotes = shapeMixedScriptOpticalRun("「집중!」「돌파!」");
    expect(consecutiveQuotes.tightenedQuotePairCount).toBe(1);

    const num120 = shapeMixedScriptOpticalRun("120");
    const num987 = shapeMixedScriptOpticalRun("987");
    const num000 = shapeMixedScriptOpticalRun("000");
    expect(num120.totalAdvanceEm).toBe(num987.totalAdvanceEm);
    expect(num987.totalAdvanceEm).toBe(num000.totalAdvanceEm);
  });

  it("Knuth-Plass 동적 계획법으로 탐욕적 줄바꿈의 외톨이 어절을 제거(widowCount === 0)하고 여백 편차를 줄인다", () => {
    // 앞 어절 3개가 한 줄을 거의 꽉 채우고 마지막 짧은 어절 1개가 다음 줄로 밀리는 전형적 외톨이 유발 대사
    const dialogue = "「제1장: 120FPS 초격차!」 시작한다!";
    const layout = layoutBalloonMixedTypography({
      text: dialogue,
      maxWidthEm: 12.5,
      shape: "rectangle",
    });

    // 탐욕적 줄바꿈은 첫 줄에 3어절을 몰아넣고 마지막 줄에 "시작한다!" 1어절 외톨이를 남긴다.
    expect(layout.greedyBaseline.widowCount).toBe(1);
    expect(layout.widowCount).toBe(0);
    expect(layout.cubicRaggednessPenalty).toBeLessThan(
      layout.greedyBaseline.cubicRaggednessPenalty,
    );
    expect(layout.raggednessReductionRatio).toBeGreaterThan(0.45);

    // 어절 보존(keep-all): 모든 어절이 잘리지 않고 원문 순서대로 복원되어야 한다.
    const reconstructed = layout.lines.map((line) => line.text).join(" ");
    expect(reconstructed).toBe(dialogue);
  });

  it("타원형 말풍선 윤곽에서도 대칭 현(chord) 폭 분포와 2어절 이상 무외톨이(widowCount === 0) 불변식을 지킨다", () => {
    const profile5 = computeBalloonLineWidthProfileEm(5, 10.0, "ellipse", 0.7);
    expect(profile5).toHaveLength(5);
    // 타원 상·하단 대칭성 및 중앙 적도 최대 폭 검증
    expect(profile5[0]).toBeCloseTo(profile5[4] ?? 0, 6);
    expect(profile5[1]).toBeCloseTo(profile5[3] ?? 0, 6);
    expect(profile5[2]).toBeGreaterThan(profile5[0] ?? 0);

    const corpus = [
      "지금 바로 출발하자!",
      "120FPS 고속 스크롤에서도 흔들림 없는 식자 품질을 확인해라!",
      "「잠깐만!」「거기 누구야?」 어둠 속에서 발소리가 들렸다.",
      "단 한 줄의 외톨이 어절도 말풍선 끝에 홀로 남기지 않는다.",
    ];

    for (const sample of corpus) {
      const result = layoutBalloonMixedTypography({
        text: sample,
        maxWidthEm: 8.6,
        shape: "ellipse",
        ellipseMinChordRatio: 0.72,
      });
      expect(result.totalEojeolCount).toBeGreaterThanOrEqual(2);
      expect(result.widowCount).toBe(0);
      expect(result.lines.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("webcodecs-scroll-muxer-planner (WebCodecs 60/120fps 스크롤 릴 GOP & VBV 플래너)", () => {
  it("120fps 및 60fps 600프레임에서 무드리프트 정수 마이크로초 PTS와 엄격한 단조 증가(deltaUs > 0)를 보장한다", () => {
    const dummyFrames: ScrollReelFrameTelemetry[] = Array.from({ length: 600 }, (_, i) => ({
      frameIndex: i,
      scrollVelocityPxPerSec: 900,
      opticalFlowScore: 0.25,
      luminanceJump: 0.04,
      screentoneDensity: 0.2,
    }));

    const plan120 = planWebCodecsScrollReelMux(dummyFrames, { fps: 120 });
    expect(plan120.monotonicTimestampValid).toBe(true);
    expect(plan120.frames).toHaveLength(600);
    expect(computeCfrTimestampUs(0, 120)).toBe(0);
    expect(computeCfrTimestampUs(120, 120)).toBe(1_000_000);
    expect(plan120.totalDurationUs).toBe(5_000_000);

    for (let i = 0; i < plan120.frames.length; i += 1) {
      const frame = plan120.frames[i];
      expect(frame).toBeDefined();
      if (!frame) continue;
      expect(Number.isInteger(frame.timestampUs)).toBe(true);
      expect(frame.deltaUs).toBeGreaterThan(0);
      if (i > 0) {
        const prev = plan120.frames[i - 1];
        expect(frame.timestampUs).toBeGreaterThan(prev?.timestampUs ?? -1);
      }
    }

    const plan60 = planWebCodecsScrollReelMux(dummyFrames.slice(0, 180), { fps: 60 });
    expect(plan60.monotonicTimestampValid).toBe(true);
    expect(plan60.totalDurationUs).toBe(3_000_000);
  });

  it("급격한 장면 전환에서 IDR 키프레임을 강제하되 minGopFrames·maxGopFrames 경계를 엄격히 준수한다", () => {
    const frames: ScrollReelFrameTelemetry[] = Array.from({ length: 300 }, (_, i) => {
      // 95프레임: 정상 장면 전환(>= minGop 30), 105프레임: 10프레임 뒤 연속 섬광(< minGop 30 -> 억제 대상)
      const isSharpCut = i === 95 || i === 105;
      return {
        frameIndex: i,
        scrollVelocityPxPerSec: isSharpCut ? 2600 : 600,
        opticalFlowScore: isSharpCut ? 0.92 : 0.18,
        luminanceJump: isSharpCut ? 0.85 : 0.02,
        screentoneDensity: 0.25,
      };
    });

    const plan = planWebCodecsScrollReelMux(frames, {
      fps: 120,
      minGopFrames: 30,
      maxGopFrames: 120,
    });

    expect(plan.frames[0]?.keyFrame).toBe(true);
    expect(plan.frames[0]?.keyframeReason).toBe("stream-start");

    // 95프레임 장면 전환 강제 IDR
    expect(plan.frames[95]?.keyFrame).toBe(true);
    expect(plan.frames[95]?.keyframeReason).toBe("scene-cut-idr");
    expect(plan.sceneCutKeyframeIndices).toContain(95);

    // 105프레임은 직전 IDR(95)로부터 10프레임뿐이므로 minGopFrames(30)에 의해 억제된다.
    expect(plan.frames[105]?.keyFrame).toBe(false);
    expect(plan.frames[105]?.keyframeReason).toBe("suppressed-by-min-gop");
    expect(plan.suppressedSceneCutIndices).toContain(105);

    // 95 + 120 = 215프레임에서 maxGopFrames 상한에 도달해 자동 IDR이 삽입된다.
    expect(plan.frames[215]?.keyFrame).toBe(true);
    expect(plan.frames[215]?.keyframeReason).toBe("max-gop-ceiling");
  });

  it("600프레임 대사 홀드·고속 스크린톤 패닝 교차 시나리오에서 VBV 언더플로·오버플로 0건을 보장한다", () => {
    const frames: ScrollReelFrameTelemetry[] = Array.from({ length: 600 }, (_, i) => {
      const phase = Math.floor(i / 150);
      if (phase === 0 || phase === 2) {
        // 정적인 대사 읽기 홀드 구간
        return {
          frameIndex: i,
          scrollVelocityPxPerSec: 80,
          opticalFlowScore: 0.04,
          luminanceJump: 0.01,
          screentoneDensity: 0.08,
          dialogueHoldWeight: 0.9,
        };
      }
      // 고밀도 스크린톤 + 집중선 고속 스크롤 구간 + 시작점 장면 전환 충격
      const isCut = i === 150 || i === 450;
      return {
        frameIndex: i,
        scrollVelocityPxPerSec: 2800,
        opticalFlowScore: isCut ? 0.95 : 0.78,
        luminanceJump: isCut ? 0.88 : 0.12,
        screentoneDensity: 0.86,
        dialogueHoldWeight: 0,
      };
    });

    const plan = planWebCodecsScrollReelMux(frames, {
      fps: 120,
      targetBitrateBps: 10_000_000,
      vbvBufferSizeBits: 10_000_000,
    });

    expect(plan.vbvUnderflowCount).toBe(0);
    expect(plan.vbvOverflowCount).toBe(0);
    expect(plan.minVbvPostRemovalBits).toBeGreaterThanOrEqual(0);
    expect(plan.maxVbvPostReplenishBits).toBeLessThanOrEqual(plan.vbvBufferSizeBits);

    // 물리적 비트 보존 법칙: 초기 수위 + 총 유입 비트 - 총 할당 비트 === 최종 수위
    const sumArriving = plan.frames.reduce((acc, f) => acc + f.arrivingBits, 0);
    const sumAllocated = plan.frames.reduce((acc, f) => acc + f.allocatedBits, 0);
    expect(plan.initialVbvBits + sumArriving - sumAllocated).toBe(plan.finalVbvBits);

    // 고밀도 액션 패닝 구간이 정적 대사 홀드 구간보다 평균 프레임 비트 예산을 훨씬 많이 배정받는다.
    expect(plan.averageActionPanBits).toBeGreaterThan(plan.averageCalmHoldBits * 1.45);
  });

  it("극단적 정지 연속 후 연속 컷 폭발이 이어지는 적대적 입력에서도 VBV 수위 무결성을 지킨다", () => {
    const frames: ScrollReelFrameTelemetry[] = Array.from({ length: 480 }, (_, i) =>
      i < 240
        ? {
            scrollVelocityPxPerSec: 0,
            opticalFlowScore: 0,
            luminanceJump: 0,
            screentoneDensity: 0,
            dialogueHoldWeight: 1,
          }
        : {
            scrollVelocityPxPerSec: 3600,
            opticalFlowScore: 1,
            luminanceJump: i % 16 === 0 ? 1 : 0.35,
            screentoneDensity: 1,
            explicitCutMarker: i % 16 === 0,
          },
    );

    const plan = planWebCodecsScrollReelMux(frames, {
      fps: 60,
      targetBitrateBps: 6_000_000,
      vbvBufferSizeBits: 3_000_000,
      minGopFrames: 12,
      maxGopFrames: 60,
    });

    expect(plan.vbvUnderflowCount).toBe(0);
    expect(plan.vbvOverflowCount).toBe(0);
  });
});

describe("undo-command-coalescer-governor (미세 스크럽 병합기 및 128 MiB 콜드 스필 거버너)", () => {
  it("순수 32비트 SHA-256 및 FNV-1a 해시가 표준 NIST 테스트 벡터와 정확히 일치한다", () => {
    const enc = new TextEncoder();
    expect(computeSha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeSha256Hex(enc.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(computeFnv1a32Hex(new Uint8Array(0))).toBe("811c9dc5");
    expect(computeFnv1a32Hex(enc.encode("foobar"))).toBe("bf9cf968");
  });

  it("500건 이상의 고속 슬라이더 스크럽을 90% 이상 병합하되 브러시 획·컷 분할 배리어를 절대 침범하지 않는다", () => {
    expect(DEFAULT_MAX_UNDO_RAM_BYTES).toBe(134_217_728);
    expect(DEFAULT_HOT_WINDOW_STEPS).toBe(64);

    const governor = new UndoCommandCoalescerGovernor({ coalesceWindowMs: 180 });
    let nowMs = 1_000;

    // 1) 슬라이더 스크럽 250건 (8ms 간격, 동일 레이어·속성) -> 1단계로 병합
    for (let i = 0; i < 250; i += 1) {
      nowMs += 8;
      governor.pushCommand({
        commandId: `scrub-a-${i}`,
        kind: "slider-scrub",
        toolId: "opacity-slider",
        layerId: "layer-ink-1",
        propertyKey: "opacity",
        timestampMs: nowMs,
        beforePayload: `opacity:${i}`,
        afterPayload: `opacity:${i + 1}`,
      });
    }

    // 2) 브러시 획 배리어 1건 -> 절대 앞뒤 스크럽과 합쳐지지 않는 독립 단계
    nowMs += 10;
    governor.pushCommand({
      commandId: "stroke-1",
      kind: "brush-stroke",
      toolId: "g-pen",
      layerId: "layer-ink-1",
      propertyKey: "tile-patch",
      timestampMs: nowMs,
      beforePayload: "tile:before-stroke",
      afterPayload: "tile:after-stroke",
    });

    // 3) 브러시 획 직후 동일 슬라이더 스크럽 250건 (중간 125건 지점에 포인터 업 배리어 삽입)
    for (let i = 0; i < 250; i += 1) {
      nowMs += 8;
      governor.pushCommand({
        commandId: `scrub-b-${i}`,
        kind: "slider-scrub",
        toolId: "opacity-slider",
        layerId: "layer-ink-1",
        propertyKey: "opacity",
        timestampMs: nowMs,
        beforePayload: `opacity-post:${i}`,
        afterPayload: `opacity-post:${i + 1}`,
        explicitStrokeEndBarrier: i === 124,
      });
    }

    // 4) 컷 분할 이정표 1건
    nowMs += 12;
    governor.pushCommand({
      commandId: "cut-split-1",
      kind: "cut-split",
      toolId: "knife-cut",
      layerId: "panel-root",
      propertyKey: "cut-boundary",
      timestampMs: nowMs,
      beforePayload: "panels:1",
      afterPayload: "panels:2",
    });

    const snap = governor.getSnapshot();
    expect(snap.totalCommandsIngested).toBe(502);
    // 기대 단계: scrub-a(1) + stroke-1(1) + scrub-b 전반(1) + scrub-b 후반(1) + cut-split-1(1) = 총 5단계
    expect(snap.undoDepth).toBe(5);
    expect(snap.stackReductionRatio).toBeGreaterThan(0.98);
    expect(snap.steps.map((s) => s.kind)).toEqual([
      "slider-scrub",
      "brush-stroke",
      "slider-scrub",
      "slider-scrub",
      "cut-split",
    ]);

    // 첫 번째 병합 스크럽 단계는 최초 before("opacity:0")와 최종 after("opacity:250")를 원자적으로 보존한다.
    expect(snap.steps[0]?.coalescedEventCount).toBe(250);
  });

  it("최신 64단계 핫 윈도를 무손실 보존하고 오래된 미세 조정만 구조적 이정표를 피해 로그 키프레임으로 압축한다", () => {
    const governor = new UndoCommandCoalescerGovernor({
      coalesceWindowMs: 150,
      hotWindowSteps: 64,
    });

    let timestampMs = 10_000;
    for (let g = 0; g < 110; g += 1) {
      // 매번 500ms 간격을 두어 실시간 스크럽 병합이 아닌 개별 제스처 단계로 유입시킨다.
      timestampMs += 500;
      if (g === 20) {
        governor.pushCommand({
          commandId: "milestone-cut-20",
          kind: "cut-split",
          toolId: "cut-frame",
          layerId: "cut-layer",
          propertyKey: "split-y",
          timestampMs,
          beforePayload: "y:none",
          afterPayload: "y:640",
        });
        continue;
      }
      governor.pushCommand({
        commandId: `cam-gesture-${g}`,
        kind: "camera-orbit",
        toolId: "orbit-cam",
        layerId: "bg3d-rig",
        propertyKey: "yawDeg",
        timestampMs,
        beforePayload: `yaw:${g}`,
        afterPayload: `yaw:${g + 1}`,
      });
    }

    const snap = governor.getSnapshot();
    expect(snap.logarithmicThinMergeCount).toBeGreaterThan(10);
    expect(snap.undoDepth).toBeLessThan(110);

    // 최신 64개 단계는 모두 1:1 무손실(representedGestureCount === 1) 핫 윈도로 보존된다.
    const tail64 = snap.steps.slice(-64);
    expect(tail64).toHaveLength(64);
    for (const hotStep of tail64) {
      expect(hotStep.retentionTier).toBe("hot-lossless");
      expect(hotStep.representedGestureCount).toBe(1);
    }

    // 오래된 구간의 컷 분할 구조적 이정표는 절대 소실되지 않고 고정된다.
    const pinned = snap.steps.find((s) => s.stepId === "milestone-cut-20");
    expect(pinned?.isPinnedMilestone).toBe(true);
  });

  it("엄격한 maxRamBytes 상한 초과 시 결정론적 OPFS 콜드 디스크립터를 방출하고 무손실 복원 및 변조 감지를 수행한다", () => {
    const maxRamBytes = 4_096;
    const governor = new UndoCommandCoalescerGovernor({
      coalesceWindowMs: 120,
      hotWindowSteps: 16,
      maxRamBytes,
    });

    const coldVault = new Map<string, EmittedOpfsSpillPacket>();
    const decoder = new TextDecoder();

    // 각 브러시 획이 약 1,200B(before 600B + after 600B)를 차지하는 10단계 기록 -> 총 12,000B > 4,096B
    for (let s = 0; s < 10; s += 1) {
      const beforePayload = `stroke-${s}-before-` + "B".repeat(580);
      const afterPayload = `stroke-${s}-after-` + "A".repeat(580);
      const pushRes = governor.pushCommand({
        commandId: `heavy-stroke-${s}`,
        kind: "brush-stroke",
        toolId: "ink-pen",
        layerId: "ink-main",
        propertyKey: "tile-diff",
        timestampMs: 1_000 + s * 400,
        beforePayload,
        afterPayload,
      });

      expect(pushRes.residentRamBytes).toBeLessThanOrEqual(maxRamBytes);
      for (const pkt of pushRes.emittedSpillPackets) {
        coldVault.set(pkt.descriptor.stepId, pkt);
      }
    }

    const snap = governor.getSnapshot();
    expect(snap.residentRamBytes).toBeLessThanOrEqual(maxRamBytes);
    expect(snap.coldSpilledStepCount).toBeGreaterThanOrEqual(7);
    expect(coldVault.size).toBe(snap.coldSpilledStepCount);

    // 최상단부터 끝까지 전체 10단계를 역순 실행 취소하며 콜드 복원 무결성 검증
    for (let s = 9; s >= 0; s -= 1) {
      let outcome = governor.undo();
      expect(outcome).not.toBeNull();
      if (outcome?.status === "requires-cold-restore") {
        const storedPacket = coldVault.get(outcome.stepId);
        expect(storedPacket).toBeDefined();
        if (!storedPacket) continue;

        // 1바이트 변조 시 SHA-256 / FNV-1a 무결성 검증기가 즉시 거부해야 한다.
        const corrupted = storedPacket.framedChunkBytes.slice();
        corrupted[corrupted.length - 1] = ((corrupted[corrupted.length - 1] ?? 0) ^ 0xff) & 0xff;
        expect(() => governor.rehydrateColdStep(outcome?.stepId ?? "", corrupted)).toThrow();

        // 정상 청크 바이트 주입 시 무손실 복원 및 RAM 상한 유지
        const restoreReport = governor.rehydrateColdStep(
          outcome.stepId,
          storedPacket.framedChunkBytes,
        );
        expect(restoreReport.residentRamBytesAfterRestore).toBeLessThanOrEqual(maxRamBytes);
        for (const cascaded of restoreReport.cascadedSpillPackets) {
          coldVault.set(cascaded.descriptor.stepId, cascaded);
        }

        outcome = governor.undo();
      }

      expect(outcome?.status).toBe("applied");
      if (outcome?.status === "applied") {
        expect(outcome.stepId).toBe(`heavy-stroke-${s}`);
        expect(decoder.decode(outcome.beforeBytes).startsWith(`stroke-${s}-before-`)).toBe(true);
        expect(decoder.decode(outcome.afterBytes).startsWith(`stroke-${s}-after-`)).toBe(true);
      }
    }
  });
});
