import { describe, expect, it } from "vitest";
import {
  analyzeMobileRetentionHeatmap,
  computeLocalizedBalloonReflow,
  computeLocalOpticalFlow,
  DynamicScrollStemHrtfMixer,
  EpisodeContinuityGraphDb,
  EpisodeDialogueSpreadsheetBinder,
  evaluateMotionToonFrame,
  interpolateInbetweenFrames,
  MOBILE_VIEWPORT_PRESETS,
  PARTICLE_STATE_BOUNCED,
  PARTICLE_STATE_SETTLED,
  PARTICLE_STATE_SPLASHED,
  ProceduralVfxParticleSimulator,
  rigCutToMotionToonMesh,
  SUPERGAP_MOTION_AUDIO_MANIFEST,
  validateDepthParticleWgsl,
  WGSL_DEPTH_PARTICLE_SIM,
  type CutSilhouetteInput,
  type DialogueRowInit,
  type EpisodeCutMetricsInput,
  type NormalizedDepthMap,
  type RgbaFrameBuffer,
  type VfxParticlePreset,
} from "./index";

function createTestSilhouette(width: number, height: number): CutSilhouetteInput {
  const alphaMask = new Uint8Array(width * height);
  const cx = width * 0.5;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const headDist = Math.hypot((x - cx) / (width * 0.2), (y - height * 0.25) / (height * 0.16));
      const torsoDist = Math.hypot((x - cx) / (width * 0.32), (y - height * 0.65) / (height * 0.3));
      if (headDist <= 1 || torsoDist <= 1) alphaMask[y * width + x] = 255;
    }
  }
  return { width, height, alphaMask };
}

function createMovingBlockFrame(
  width: number,
  height: number,
  rectX: number,
  rectY: number,
  rectSize: number,
): RgbaFrameBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const inBox = x >= rectX && x < rectX + rectSize && y >= rectY && y < rectY + rectSize;
      if (inBox) {
        data[o] = Math.round(130 + ((x - rectX) / Math.max(1, rectSize)) * 120);
        data[o + 1] = Math.round(110 + ((y - rectY) / Math.max(1, rectSize)) * 80);
        data[o + 2] = 220;
        data[o + 3] = 255;
      } else {
        data[o] = 16;
        data[o + 1] = 18;
        data[o + 2] = 24;
        data[o + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

function computeBrightCentroidX(rgba: Uint8ClampedArray, width: number, height: number): number {
  let sumX = 0;
  let sumW = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const lum = (rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3;
      if (lum > 80) {
        sumX += x * lum;
        sumW += lum;
      }
    }
  }
  return sumW > 0 ? sumX / sumW : 0;
}

describe("Super-Gap Pillar C & F — ₩0 로컬 엔진 통합 검증", () => {
  it("매니페스트가 8개 핵심 아이디어(#10,#11,#12,#13,#21,#22,#23,#24)를 0토큰·지연로딩으로 선언한다", () => {
    const ids = SUPERGAP_MOTION_AUDIO_MANIFEST.map((m) => m.ideaNumber).sort((a, b) => a - b);
    expect(ids).toEqual([10, 11, 12, 13, 21, 22, 23, 24]);
    expect(SUPERGAP_MOTION_AUDIO_MANIFEST.every((m) => m.aiTokensUsed === 0 && m.lazyOnly)).toBe(true);
  });

  describe("#10 Pre-Publish 10-Second Mobile Reader Retention & Thumb-Scroll Rhythm Heatmap", () => {
    it("390×844 및 360×800 모바일 뷰포트에서 40컷 에피소드를 10ms 미만·0토큰으로 분석한다", () => {
      const cuts: EpisodeCutMetricsInput[] = Array.from({ length: 40 }, (_, i) => ({
        cutId: `cut-${i + 1}`,
        widthPx: 800,
        heightPx: i % 5 === 0 ? 1100 : 760,
        gutterAfterPx: 140,
        contrastRatio: i % 3 === 0 ? 0.82 : 0.54,
        visualEntropy: i % 4 === 0 ? 0.78 : 0.56,
        hasImpactHook: i === 0 || i === 18 || i === 39,
        shotScale: i % 5 === 0 ? "splash" : i % 2 === 0 ? "closeup" : "medium",
        balloons: [
          { balloonId: `b-${i}-1`, text: "지금 바로 옥상으로 올라가야 해!", x: 70, y: 90, width: 240, height: 110, orderIndex: 0 },
          { balloonId: `b-${i}-2`, text: "뒤쪽 문은 이미 잠겼어.", x: 420, y: 360, width: 230, height: 100, orderIndex: 1 },
        ],
      }));

      const iphoneReport = analyzeMobileRetentionHeatmap(cuts, { viewportPreset: "iphone15" });
      const galaxyReport = analyzeMobileRetentionHeatmap(cuts, { viewportPreset: "galaxyS" });

      expect(iphoneReport.viewport).toEqual(MOBILE_VIEWPORT_PRESETS.iphone15);
      expect(galaxyReport.viewport).toEqual(MOBILE_VIEWPORT_PRESETS.galaxyS);
      expect(iphoneReport.aiTokensUsed).toBe(0);
      expect(iphoneReport.elapsedMs).toBeLessThan(10);
      expect(galaxyReport.elapsedMs).toBeLessThan(10);
      expect(iphoneReport.overallRetentionScore).toBeGreaterThanOrEqual(75);
      expect(iphoneReport.first10SecRetentionScore).toBeGreaterThanOrEqual(75);
      expect(iphoneReport.screens.length).toBeGreaterThan(10);
      expect(iphoneReport.thumbScrollRhythm.length).toBe(iphoneReport.screens.length);
    });

    it("대사 과부하·빈 여백 지루함·시선 역주행·임팩트 평탄화·약한 10초 훅을 모두 탐지한다", () => {
      const heavyText =
        "그날 밤 마탑 최상층에서 벌어진 모든 계약과 금지된 룬의 배열은 사실 백 년 전 왕실 서고에 봉인된 고대 문서에서 비롯되었으며 아무도 그 진실을 알지 못했다.";

      const riskyCuts: EpisodeCutMetricsInput[] = [
        {
          cutId: "cut-overload",
          widthPx: 800,
          heightPx: 1400,
          gutterAfterPx: 120,
          contrastRatio: 0.25,
          visualEntropy: 0.28,
          shotScale: "medium",
          balloons: [
            { balloonId: "ob-1", text: heavyText, x: 40, y: 780, width: 340, height: 260, orderIndex: 0 },
            { balloonId: "ob-2", text: heavyText, x: 410, y: 120, width: 340, height: 260, orderIndex: 1 },
            { balloonId: "ob-3", text: heavyText, x: 50, y: 420, width: 340, height: 260, orderIndex: 2 },
            { balloonId: "ob-4", text: "너무 길어서 읽기 힘들다!", x: 420, y: 1060, width: 320, height: 180, orderIndex: 3 },
          ],
        },
        {
          cutId: "cut-dead-gutter",
          widthPx: 800,
          heightPx: 500,
          gutterAfterPx: 2600,
          contrastRatio: 0.2,
          visualEntropy: 0.1,
          balloons: [],
        },
        ...Array.from({ length: 6 }, (_, idx) => ({
          cutId: `cut-flat-${idx}`,
          widthPx: 800,
          heightPx: 720,
          gutterAfterPx: 80,
          contrastRatio: 0.24,
          visualEntropy: 0.26,
          shotScale: "medium" as const,
          balloons: [],
        })),
      ];

      const report = analyzeMobileRetentionHeatmap(riskyCuts, { viewportPreset: "iphone15" });
      const allFlagKinds = new Set<string>();
      for (let i = 0; i < report.screens.length; i += 1) {
        for (let f = 0; f < report.screens[i].flags.length; f += 1) {
          allFlagKinds.add(report.screens[i].flags[f].kind);
        }
      }

      expect(allFlagKinds.has("text-density-overload")).toBe(true);
      expect(allFlagKinds.has("eye-flow-backtracking")).toBe(true);
      expect(allFlagKinds.has("dead-gutter-boredom")).toBe(true);
      expect(allFlagKinds.has("weak-10s-hook")).toBe(true);
      expect(allFlagKinds.has("low-impact-contrast")).toBe(true);
      expect(report.flaggedDropoffSpans.length).toBeGreaterThanOrEqual(2);
      expect(report.overallRetentionScore).toBeLessThan(65);
      expect(report.thumbScrollRhythm.some((r) => r.rhythmState === "bored-flick")).toBe(true);
    });

    it("의도적 극적 정적(isDramaticPause) 여백은 일반 빈 여백보다 이탈 패널티를 완화하며 빈 에피소드도 안전 처리한다", () => {
      const dramatic = analyzeMobileRetentionHeatmap([
        { cutId: "d-1", widthPx: 800, heightPx: 600, gutterAfterPx: 1400, visualEntropy: 0.7, contrastRatio: 0.8, hasImpactHook: true, isDramaticPause: true, balloons: [] },
      ]);
      const unmotivated = analyzeMobileRetentionHeatmap([
        { cutId: "u-1", widthPx: 800, heightPx: 600, gutterAfterPx: 1400, visualEntropy: 0.7, contrastRatio: 0.8, hasImpactHook: true, isDramaticPause: false, balloons: [] },
      ]);
      expect(dramatic.overallRetentionScore).toBeGreaterThanOrEqual(unmotivated.overallRetentionScore);

      const empty = analyzeMobileRetentionHeatmap([]);
      expect(empty.screens).toEqual([]);
      expect(empty.overallRetentionScore).toBe(0);
      expect(empty.aiTokensUsed).toBe(0);
    });
  });

  describe("#11 Bi-Directional Episode Dialogue Spreadsheet ↔ Canvas Live Binder", () => {
    function build64CutEpisodeRows(): DialogueRowInit[] {
      const rows: DialogueRowInit[] = [];
      for (let cut = 0; cut < 64; cut += 1) {
        for (let b = 0; b < 2; b += 1) {
          rows.push({
            balloonId: `b-${cut + 1}-${b + 1}`,
            cutId: `cut-${cut + 1}`,
            cutOrder: cut,
            orderInCut: b,
            speakerId: b === 0 ? "hero" : "rival",
            speakerName: b === 0 ? "도현" : "세진",
            x: b === 0 ? 60 : 410,
            y: b === 0 ? 110 : 380,
            localeTexts: {
              ko: b === 0 ? `${cut + 1}컷 대사: 여기서 물러설 수 없어!` : "그렇다면 검을 뽑아라.",
              en: b === 0 ? `Cut ${cut + 1}: I will not step back from this threshold!` : "Then draw your blade right now.",
              ja: b === 0 ? `カット${cut + 1}：ここから退くわけにはいかない！` : "ならば剣を抜け。",
              zh: b === 0 ? `第${cut + 1}格：我绝不会在这里退缩！` : "那就拔剑吧。",
            },
          });
        }
      }
      return rows;
    }

    it("64컷(128개 말풍선) 배치 편집·다국어 리플로우·보이스 큐·결정론적 Undo/Redo·TSV를 양방향 동기화한다", () => {
      const binder = new EpisodeDialogueSpreadsheetBinder(build64CutEpisodeRows());
      expect(binder.getCutCount()).toBe(64);
      expect(binder.getRowCount()).toBe(128);
      expect(binder.detectVoiceCueOverlaps()).toEqual([]);

      let canvasEvents = 0;
      let sheetEvents = 0;
      const unsubCanvas = binder.subscribeCanvasSync(() => {
        canvasEvents += 1;
      });
      const unsubSheet = binder.subscribeSpreadsheetSync(() => {
        sheetEvents += 1;
      });

      const batchPatches = Array.from({ length: 30 }, (_, i) => ({
        balloonId: `b-${i + 1}-1`,
        speakerId: "mentor",
        speakerName: "스승",
        emotionTag: "shout" as const,
        text: `긴급 지령 ${i + 1}: 지금 즉시 결계를 전개하고 모든 대원들을 북쪽 성벽으로 집결시켜라!`,
      }));
      const batchDiff = binder.applySpreadsheetBatchEdit(batchPatches, "bulk-rewrite-act1");
      expect(batchDiff.entries.length).toBeGreaterThanOrEqual(30);
      expect(batchDiff.checksum).toMatch(/^[0-9a-f]{8}$/);
      expect(canvasEvents).toBe(1);
      expect(binder.detectVoiceCueOverlaps()).toEqual([]);

      const updatedFirst = binder.getBalloon("b-1-1");
      expect(updatedFirst?.row.speakerId).toBe("mentor");
      expect(updatedFirst?.canvas.speakerId).toBe("mentor");
      expect(updatedFirst?.canvas.heightPx).toBeGreaterThan(60);

      expect(binder.switchEpisodeLocale("en").entries.length).toBe(128);
      expect(binder.getBalloon("b-1-2")?.canvas.text).toBe("Then draw your blade right now.");

      expect(binder.switchEpisodeLocale("ja", "vertical").entries.length).toBe(128);
      expect(binder.getBalloon("b-2-1")?.canvas.writingDirection).toBe("vertical");

      expect(binder.switchEpisodeLocale("zh", "horizontal").entries.length).toBe(128);
      expect(binder.getBalloon("b-2-2")?.canvas.text).toBe("那就拔剑吧。");

      const canvasDiff = binder.applyCanvasBalloonUpdate({
        balloonId: "b-10-1",
        x: 145,
        y: 220,
        widthPx: 260,
        heightPx: 140,
        text: "캔버스에서 직접 수정한 대사",
      });
      expect(canvasDiff.source).toBe("canvas");
      expect(sheetEvents).toBeGreaterThanOrEqual(1);
      expect(binder.getBalloon("b-10-1")?.row.text).toBe("캔버스에서 직접 수정한 대사");
      expect(binder.getBalloon("b-10-1")?.row.manualSizeOverride).toBe(true);

      expect(binder.undo()?.source).toBe("undo");
      expect(binder.getBalloon("b-10-1")?.canvas.x).toBe(60);
      expect(binder.getBalloon("b-10-1")?.row.text).toBe("第10格：我绝不会在这里退缩！");

      expect(binder.redo()?.source).toBe("redo");
      expect(binder.getBalloon("b-10-1")?.canvas.x).toBe(145);

      const tsv = binder.exportToTsv();
      const importDiff = binder.importFromTsv(tsv.replace("那就拔剑吧。", "立刻拔剑吧！"));
      expect(importDiff.entries.length).toBeGreaterThanOrEqual(1);
      expect(binder.getBalloon("b-1-2")?.row.localeTexts.zh).toBe("立刻拔剑吧！");

      unsubCanvas();
      unsubSheet();
    });

    it("computeLocalizedBalloonReflow가 영문 단어 단위 줄바꿈과 CJK 세로쓰기를 정확히 계산한다", () => {
      const enBox = computeLocalizedBalloonReflow(
        "Unbreakable solidarity across every single chapter of this series",
        "en",
        { maxWidthPx: 180, fontSizePx: 15 },
      );
      expect(enBox.lineCount).toBeGreaterThanOrEqual(3);
      expect(enBox.lines.every((line) => !line.startsWith(" "))).toBe(true);
      expect(enBox.widthPx).toBeLessThanOrEqual(180);

      const jaVert = computeLocalizedBalloonReflow("運命の扉が今開かれる", "ja", {
        writingDirection: "vertical",
        maxHeightPx: 140,
      });
      expect(jaVert.writingDirection).toBe("vertical");
      expect(jaVert.lineCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("#13 Cross-Episode Character Graph & Foreshadowing/Chekhov-Gun Tracker", () => {
    it("120화 장기 연재 데이터를 역색인 검색·관계 그래프 BFS·연속성 모순 감사로 검증한다", () => {
      const db = new EpisodeContinuityGraphDb();

      db.upsertCharacter({
        characterId: "hero",
        name: "강도현",
        aliases: ["은빛 검사", "도현"],
        firstAppearanceEpisode: 1,
        lastAppearanceEpisode: 120,
        appearanceEpisodes: Array.from({ length: 120 }, (_, i) => i + 1),
        traits: ["검술", "냉정"],
        arcSummary: "마탑의 음모를 파헤치는 주인공",
      });
      db.upsertCharacter({
        characterId: "mentor",
        name: "백운 사부",
        aliases: ["백운"],
        status: "deceased",
        firstAppearanceEpisode: 2,
        deathEpisode: 42,
        appearanceEpisodes: [2, 10, 42, 65, 98],
        flashbackEpisodes: [65],
        traits: ["대마법사"],
        arcSummary: "42화에서 주인공을 구하고 희생",
      });
      db.upsertCharacter({
        characterId: "villain",
        name: "카르마 공작",
        firstAppearanceEpisode: 18,
        lastAppearanceEpisode: 118,
        appearanceEpisodes: [18, 42, 88, 118],
        traits: ["배신", "마탑 수장"],
      });

      for (let i = 0; i < 30; i += 1) {
        db.upsertCharacter({
          characterId: `npc-${i + 1}`,
          name: `기사단원 ${i + 1}`,
          firstAppearanceEpisode: i * 3 + 1,
          lastAppearanceEpisode: Math.min(120, i * 3 + 15),
        });
      }

      db.upsertRelationship({
        edgeId: "rel-mentor-hero",
        fromCharacterId: "mentor",
        toCharacterId: "hero",
        kind: "mentor",
        startEpisode: 2,
        endEpisode: 42,
        strength: 0.95,
        evidenceEpisodes: [2, 20, 42],
        notes: "검술과 룬 각인을 전수",
      });
      db.upsertRelationship({
        edgeId: "rel-hero-villain-bug",
        fromCharacterId: "hero",
        toCharacterId: "villain",
        kind: "rival",
        startEpisode: 5,
        strength: -0.9,
        evidenceEpisodes: [5, 88],
        notes: "마탑 배신 사건",
      });

      db.upsertKeyProp({
        propId: "crimson-blade",
        name: "붉은 성검",
        category: "weapon",
        introducedEpisode: 8,
        currentStatus: "active",
        description: "마탑 지하 제단에서 발견된 고대 붉은 검",
        ownerHistory: [
          { episode: 8, holderCharacterId: "mentor", location: "마탑", status: "active" },
          { episode: 42, holderCharacterId: "hero", location: "성벽", status: "destroyed" },
          { episode: 95, holderCharacterId: "villain", location: "왕궁", status: "active" },
        ],
      });

      db.plantForeshadowHook({
        hookId: "hook-seal",
        title: "봉인된 문장",
        summary: "목걸이 뒷면의 붉은 문장",
        plantedEpisode: 4,
        expectedPayoffByEpisode: 60,
        importance: "major",
        involvedCharacterIds: ["hero"],
      });
      db.addHookCallback("hook-seal", 31);
      db.resolveForeshadowHook("hook-seal", 54, "왕실 혈통의 증표로 판명");

      db.plantForeshadowHook({
        hookId: "hook-chekhov",
        title: "시계탑 지하의 붉은 검 열쇠",
        summary: "12화에 언급된 검은 열쇠가 아직 사용되지 않음",
        plantedEpisode: 12,
        expectedPayoffByEpisode: 90,
        importance: "arc-critical",
        involvedCharacterIds: ["hero", "villain"],
        involvedPropIds: ["crimson-blade", "missing-prop-id"],
      });

      db.plantForeshadowHook({ hookId: "hook-paradox", title: "역전된 예언서", summary: "시간 역전 오류", plantedEpisode: 70 });
      db.resolveForeshadowHook("hook-paradox", 50, "잘못된 회수 화수");

      const searchHits = db.search("붉은 검");
      expect(searchHits.length).toBeGreaterThanOrEqual(2);
      expect(searchHits.some((h) => h.entityId === "crimson-blade")).toBe(true);
      expect(searchHits.some((h) => h.entityId === "hook-chekhov")).toBe(true);

      const hood = db.getCharacterNeighborhood("hero", 2);
      expect(hood.visitedCharacterIds).toContain("mentor");
      expect(hood.visitedCharacterIds).toContain("villain");
      expect(hood.linkedProps.some((p) => p.propId === "crimson-blade")).toBe(true);
      expect(hood.linkedHooks.some((h) => h.hookId === "hook-chekhov")).toBe(true);

      const audit = db.runContinuityAudit(120);
      expect(audit.aiTokensUsed).toBe(0);
      expect(audit.resolvedHookCount).toBe(2);
      expect(audit.unresolvedHookCount).toBe(1);
      expect(audit.indexedTermCount).toBeGreaterThan(30);

      const diagKinds = new Set(audit.diagnostics.map((d) => d.kind));
      expect(diagKinds.has("deceased-character-reappearance")).toBe(true);
      expect(diagKinds.has("relationship-before-first-appearance")).toBe(true);
      expect(diagKinds.has("prop-custody-conflict")).toBe(true);
      expect(diagKinds.has("unresolved-chekhov-gun")).toBe(true);
      expect(diagKinds.has("resolved-before-planted")).toBe(true);
      expect(diagKinds.has("orphaned-hook-entity")).toBe(true);

      const mentorReappear = audit.diagnostics.filter(
        (d) => d.kind === "deceased-character-reappearance" && d.entityId === "mentor",
      );
      expect(mentorReappear.length).toBe(1);
      expect(mentorReappear[0].episode).toBe(98);
    });
  });

  describe("#21 Single-Cut 2D→2.5D Auto-Mesh Rigging & MotionToon Animator", () => {
    it("실루엣 삼각화 메시와 정규화된 본 가중치(합=1.0)를 생성하고 60fps 호흡·머리카락·눈깜빡임을 평가한다", () => {
      const rig = rigCutToMotionToonMesh(createTestSilhouette(128, 160), { gridCols: 14, gridRows: 18 });
      expect(rig.vertexCount).toBeGreaterThan(60);
      expect(rig.triangleCount).toBeGreaterThan(80);
      expect(rig.bones.length).toBe(10);
      expect(rig.silhouetteCoverage).toBeGreaterThan(0.2);

      for (let i = 0; i < rig.indices.length; i += 1) {
        expect(rig.indices[i]).toBeLessThan(rig.vertexCount);
      }
      for (let v = 0; v < rig.vertexCount; v += 1) {
        const b = v * 4;
        const sum = rig.boneWeights[b] + rig.boneWeights[b + 1] + rig.boneWeights[b + 2] + rig.boneWeights[b + 3];
        expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
      }

      const inhaleFrame = evaluateMotionToonFrame(rig, 1.0, {
        breathHz: 0.5,
        breathAmplitudePx: 8,
        windStrength: 0,
        forceBlinkWeight: 0,
      });
      expect(inhaleFrame.breathingPhase).toBeGreaterThan(0.95);
      expect(inhaleFrame.boneTransforms.find((b) => b.id === "chest")?.dy).toBeLessThan(-6);

      const blinkFrame = evaluateMotionToonFrame(rig, 0.2, { forceBlinkWeight: 1.0 });
      expect(blinkFrame.blinkWeight).toBe(1);
      expect(blinkFrame.boneTransforms.find((b) => b.id === "eye-left")?.scaleY).toBeLessThan(0.15);

      const reuseBuf = new Float32Array(rig.restPositions.length);
      let maxFrameMs = 0;
      for (let f = 0; f < 60; f += 1) {
        const evalFrame = evaluateMotionToonFrame(rig, f / 60, { windStrength: 1.4, parallaxX: 0.6, parallaxY: -0.3 }, reuseBuf);
        if (evalFrame.elapsedMs > maxFrameMs) maxFrameMs = evalFrame.elapsedMs;
      }
      expect(maxFrameMs).toBeLessThan(16.67);
    });
  });

  describe("#22 Local Optical-Flow + Vector-Path In-Between Frame Interpolator", () => {
    it("키프레임 A→B 광학 흐름을 추정하고 t=0.25,0.5,0.75 래스터+벡터 중간 프레임을 0토큰으로 합성한다", () => {
      const frameA = createMovingBlockFrame(48, 36, 10, 10, 12);
      const frameB = createMovingBlockFrame(48, 36, 18, 10, 12);

      const flow = computeLocalOpticalFlow(frameA, frameB, { gridStep: 4, windowRadius: 2, searchRadius: 10 });
      expect(flow.meanMagnitudePx).toBeGreaterThan(0.5);
      expect(flow.meanConfidence).toBeGreaterThan(0.5);

      const report = interpolateInbetweenFrames(
        {
          frameId: "kf-A",
          raster: frameA,
          strokes: [
            { strokeId: "sword-arc", widthPx: 4, points: [{ x: 10, y: 10, pressure: 0.6 }, { x: 10, y: 30, pressure: 1.0 }] },
            { strokeId: "fade-out-line", widthPx: 2, opacity: 1, points: [{ x: 2, y: 2 }, { x: 6, y: 6 }] },
          ],
        },
        {
          frameId: "kf-B",
          raster: frameB,
          strokes: [
            { strokeId: "sword-arc", widthPx: 8, points: [{ x: 30, y: 10, pressure: 0.8 }, { x: 30, y: 30, pressure: 1.0 }] },
          ],
        },
        { tValues: [0.25, 0.5, 0.75], gridStep: 4, searchRadius: 10, vectorResamplePoints: 10 },
      );

      expect(report.aiTokensUsed).toBe(0);
      expect(report.matchedStrokePairs).toBe(1);
      expect(report.frames.length).toBe(3);

      const c25 = computeBrightCentroidX(report.frames[0].rgba!, 48, 36);
      const c50 = computeBrightCentroidX(report.frames[1].rgba!, 48, 36);
      const c75 = computeBrightCentroidX(report.frames[2].rgba!, 48, 36);
      expect(c25).toBeLessThan(c50);
      expect(c50).toBeLessThan(c75);
      expect(Math.abs(c50 - 19.5)).toBeLessThan(2.5);

      const midStroke = report.frames[1].strokes.find((s) => s.strokeId === "sword-arc");
      expect(midStroke?.points.length).toBe(10);
      expect(midStroke?.points[0].x).toBeCloseTo(20, 2);
      expect(midStroke?.widthPx).toBeCloseTo(6, 2);
      expect(report.frames[1].strokes.find((s) => s.strokeId === "fade-out-line")?.opacity).toBeCloseTo(0.5, 2);
    });
  });

  describe("#23 3D Depth-Colliding WebGPU Procedural Particle VFX Node Engine", () => {
    it("WGSL 셰이더 계약을 검증하고 5종 프리셋 전체가 3D 뎁스맵 충돌·바운스·스플래시·안착 상태를 갱신한다", () => {
      const wgslReport = validateDepthParticleWgsl(WGSL_DEPTH_PARTICLE_SIM);
      expect(wgslReport.valid).toBe(true);
      expect(wgslReport.workgroupSize).toBe(64);
      expect(wgslReport.hasDepthSampling).toBe(true);
      expect(wgslReport.hasCollisionResponse).toBe(true);

      const depthData = new Float32Array(32 * 32);
      depthData.fill(0.32);
      const depthMap: NormalizedDepthMap = { width: 32, height: 32, data: depthData };

      const presets: readonly VfxParticlePreset[] = ["rain", "cherry-petals", "embers", "shockwave-debris", "magic-circle"];
      for (const preset of presets) {
        const sim = new ProceduralVfxParticleSimulator({ preset, maxParticles: 96, seed: 4242 });
        expect(sim.buildWebGpuUniformBuffer(1 / 60, depthMap).byteLength).toBe(48);
        expect(sim.exportGpuParticleBuffer().length).toBe(96 * 12);

        let lastMetrics = sim.step(1 / 60, depthMap);
        for (let step = 0; step < 50; step += 1) lastMetrics = sim.step(1 / 60, depthMap);

        expect(lastMetrics.totalCollisions).toBeGreaterThan(0);
        const snaps = sim.getSnapshots(96);
        if (preset === "rain") expect(snaps.some((p) => p.state === PARTICLE_STATE_SPLASHED)).toBe(true);
        else if (preset === "cherry-petals") expect(snaps.some((p) => p.state === PARTICLE_STATE_SETTLED)).toBe(true);
        else expect(snaps.some((p) => p.state === PARTICLE_STATE_BOUNCED)).toBe(true);
      }
    });
  });

  describe("#12 & #24 Scroll-Velocity Dynamic Stem Mixer + Binaural 3D HRTF Spatial AudioToon", () => {
    it("#12 스크롤 속도 급가속·정지 및 대사 활성 상태에 따라 스템 게인과 덕킹을 부드럽게 조절한다", () => {
      const mixer = new DynamicScrollStemHrtfMixer({ attackSec: 0.12, releaseSec: 0.4 });

      let state = mixer.updateScrollDynamics({ scrollVelocityPxPerSec: 30, dtSec: 0.2, sceneMood: "emotional" });
      for (let i = 0; i < 8; i += 1) {
        state = mixer.updateScrollDynamics({ scrollVelocityPxPerSec: 30, dtSec: 0.2, sceneMood: "emotional" });
      }
      expect(state.intensityBand).toBe("still");
      expect(state.gains.emotional).toBeGreaterThan(state.gains.action);

      let sprintState = state;
      for (let i = 0; i < 8; i += 1) {
        sprintState = mixer.updateScrollDynamics({
          scrollVelocityPxPerSec: 1150,
          dtSec: 0.12,
          sceneMood: "battle",
          sfxImpactIntensity: 0.85,
        });
      }
      expect(sprintState.intensityBand).toBe("action-sprint");
      expect(sprintState.gains.action).toBeGreaterThan(0.7);
      expect(sprintState.gains.sfx).toBeGreaterThan(0.75);

      const dialogueState = mixer.updateScrollDynamics({
        scrollVelocityPxPerSec: 160,
        dtSec: 0.2,
        sceneMood: "calm",
        activeDialogueCount: 2,
      });
      expect(dialogueState.dialogueDuckingDb).toBeLessThan(-2);
      expect(dialogueState.gains.dialogue).toBeGreaterThan(0.5);
    });

    it("#24 말풍선 캔버스 좌표·깊이로 물리적 ITD/ILD·거리감쇠·바이노럴 스테레오 PCM을 정확히 계산한다", () => {
      const mixer = new DynamicScrollStemHrtfMixer({ sampleRate: 48000 });

      const center = mixer.computeBalloonHrtf({ sourceId: "center", x: 400, y: 640, canvasWidth: 800, canvasHeight: 1280, depthMeters: 1.5 });
      expect(center.itdMicroseconds).toBe(0);
      expect(center.ildDb).toBe(0);
      expect(center.leftGain).toBeCloseTo(center.rightGain, 4);

      const rightNear = mixer.computeBalloonHrtf({ sourceId: "right-near", x: 740, y: 520, canvasWidth: 800, canvasHeight: 1280, depthMeters: 1.2 });
      const leftNear = mixer.computeBalloonHrtf({ sourceId: "left-near", x: 60, y: 520, canvasWidth: 800, canvasHeight: 1280, depthMeters: 1.2 });
      const rightFar = mixer.computeBalloonHrtf({ sourceId: "right-far", x: 740, y: 520, canvasWidth: 800, canvasHeight: 1280, depthMeters: 6.5 });

      expect(rightNear.itdMicroseconds).toBeGreaterThan(150);
      expect(rightNear.itdMicroseconds).toBeLessThan(700);
      expect(rightNear.leftDelaySamples).toBeGreaterThan(0);
      expect(rightNear.rightDelaySamples).toBe(0);
      expect(rightNear.rightGain).toBeGreaterThan(rightNear.leftGain);
      expect(rightNear.leftLowpassHz).toBeLessThan(rightNear.rightLowpassHz);
      expect(leftNear.itdMicroseconds).toBeCloseTo(-rightNear.itdMicroseconds, 1);
      expect(leftNear.ildDb).toBeCloseTo(-rightNear.ildDb, 1);
      expect(rightFar.distanceAttenuation).toBeLessThan(rightNear.distanceAttenuation);

      const mono = new Float32Array(256);
      for (let i = 0; i < mono.length; i += 1) {
        mono[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000) * 0.7;
      }
      const mix = mixer.renderBinauralStereoMix(
        [{ sourceId: "right-voice", x: 0.92, y: 0.5, normalizedCoords: true, depthMeters: 1.2 }],
        { "right-voice": mono },
        256,
      );

      let rmsL = 0;
      let rmsR = 0;
      for (let i = 0; i < 256; i += 1) {
        rmsL += mix.left[i] * mix.left[i];
        rmsR += mix.right[i] * mix.right[i];
      }
      expect(rmsR).toBeGreaterThan(rmsL * 1.8);
    });
  });
});
