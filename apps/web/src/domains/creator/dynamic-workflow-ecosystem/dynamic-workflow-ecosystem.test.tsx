// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioDynamicWorkflowPanel } from "./StudioDynamicWorkflowPanel";
import {
  DYNAMIC_WORKFLOW_TEMPLATES,
  executeDynamicWorkflowDag,
  validateAndSortWorkflowDag,
  type DynamicWorkflowNode,
} from "./dynamic-workflow-orchestrator";
import {
  DEFAULT_DCC_LIVELINK_PACKET,
  DEFAULT_MOVING_TOON_INPUT,
  buildMovingToonOtioScene,
  createXpbdClothHairStrand,
  generateMoireFreeHalftoneTile,
  normalizeHardwareControllerProfile,
  reconcileDccLiveLinkPacket,
  routeHardwareInputEvent,
  stepXpbdClothHairStrand,
  type DccLiveLinkPacket,
} from "./moving-toon-hardware-livelink";
import {
  DEFAULT_STUDIO_SETTLEMENT_INPUT,
  SAMPLE_FDX_SCRIPT,
  SAMPLE_FOUNTAIN_SCRIPT,
  SAMPLE_NOTION_SCRIPT,
  SAMPLE_SCRIVENER_MD_SCRIPT,
  computeStudioSettlementReport,
  detectScriptFormat,
  formatSettlementCsv,
  parseNovelOrScriptToStoryboard,
} from "./novel-script-erp-settlement";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/dynamic-workflow-ecosystem");

describe("dynamic-workflow-ecosystem: OTIO · WebHID · 3D LiveLink · Halftone/XPBD · 각본/ERP · DAG · 패널", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("OpenTimelineIO(.otio) 무빙툰 익스포터는 Z-깊이 패럴랙스·트랜지션·보이스 자막을 무손실 JSON으로 직렬화한다", () => {
    const pkg = buildMovingToonOtioScene({
      ...DEFAULT_MOVING_TOON_INPUT,
      targetProfile: "after-effects",
      fps: 24,
    });

    expect(pkg.schema).toBe("Timeline.1");
    expect(pkg.otioDocument.OTIO_SCHEMA).toBe("Timeline.1");
    expect(pkg.otioDocument.tracks.OTIO_SCHEMA).toBe("Stack.1");
    expect(pkg.otioDocument.tracks.children).toHaveLength(2);
    expect(pkg.summary.losslessVerified).toBe(true);
    expect(pkg.summary.cutCount).toBe(2);
    expect(pkg.summary.totalLayers).toBe(7);
    expect(pkg.summary.voiceLineCount).toBe(2);
    expect(pkg.summary.totalFrames).toBe(Math.round((3.5 + 2.8) * 24));

    const parsedJson = JSON.parse(pkg.otioJson) as {
      OTIO_SCHEMA: string;
      tracks: { children: { kind: string; children: { OTIO_SCHEMA: string }[] }[] };
    };
    expect(parsedJson.OTIO_SCHEMA).toBe("Timeline.1");
    const videoTrack = parsedJson.tracks.children.find((t) => t.kind === "Video");
    const audioTrack = parsedJson.tracks.children.find((t) => t.kind === "Audio");
    expect(videoTrack?.children.some((c) => c.OTIO_SCHEMA === "Transition.1")).toBe(true);
    expect(audioTrack?.children.some((c) => c.OTIO_SCHEMA === "Gap.1")).toBe(true);

    // Z-깊이 패럴랙스 물리 서열: 전경(+1.8m) > 캐릭터(+0.2m) > 중경(-1.8m) > 원경(-4.5m)
    const cut1Layers = pkg.motionScene25D.cuts[0].layers;
    const sky = cut1Layers.find((l) => l.layerId === "l-sky");
    const arch = cut1Layers.find((l) => l.layerId === "l-arch");
    const char = cut1Layers.find((l) => l.layerId === "l-serin");
    const dust = cut1Layers.find((l) => l.layerId === "l-dust");
    expect(sky && arch && char && dust).toBeTruthy();
    expect(dust!.parallaxFactor).toBeGreaterThan(char!.parallaxFactor);
    expect(char!.parallaxFactor).toBeGreaterThan(arch!.parallaxFactor);
    expect(arch!.parallaxFactor).toBeGreaterThan(sky!.parallaxFactor);

    // Live2D 리깅 파라미터 및 SRT 자막 큐 검증
    expect(pkg.motionScene25D.live2dBindings.map((b) => b.paramId)).toEqual(["ParamAngleX", "ParamMouthOpenY"]);
    expect(pkg.motionScene25D.subtitleCues[0].startSrt).toBe("00:00:00,400");
    expect(pkg.motionScene25D.subtitleCues[1].startSec).toBeCloseTo(3.75, 2);
  });

  it("WebHID 4종 창작 하드웨어(TourBox/Wacom/Stream Deck/Apple Pencil Pro)와 무선 리모컨 프로필을 정확히 라우팅한다", () => {
    const tourbox = normalizeHardwareControllerProfile({
      profileId: "tb-1",
      displayName: "TourBox Elite",
      family: "tourbox",
      sensitivity: 1.5,
      bindings: [{ controlId: "c2", action: "camera.reset.view", shortcutLabel: "Ctrl+0" }],
    });
    const tbKnob = routeHardwareInputEvent(tourbox, { controlId: "knob", eventKind: "delta", delta: 2 });
    expect(tbKnob.matched).toBe(true);
    expect(tbKnob.action).toBe("brush.size.step");
    expect(tbKnob.value).toBe(6); // delta(2) * step(2) * sensitivity(1.5)
    expect(routeHardwareInputEvent(tourbox, { controlId: "side", eventKind: "press", modifiers: ["shift"] }).action).toBe("canvas.redo");
    expect(routeHardwareInputEvent(tourbox, { controlId: "c2", eventKind: "press" }).action).toBe("camera.reset.view");

    const wacom = normalizeHardwareControllerProfile({ profileId: "wk-1", displayName: "ExpressKey Remote", family: "wacom-expresskeys" });
    expect(routeHardwareInputEvent(wacom, { controlId: "touch-ring", eventKind: "delta", delta: 1 }).action).toBe("canvas.zoom");
    expect(routeHardwareInputEvent(wacom, { controlId: "touch-ring", eventKind: "delta", delta: 2, modifiers: ["alt"] }).action).toBe("brush.size.step");

    const streamDeck = normalizeHardwareControllerProfile({ profileId: "sd-1", displayName: "Stream Deck+", family: "stream-deck" });
    expect(routeHardwareInputEvent(streamDeck, { controlId: "key-1", eventKind: "press" }).action).toBe("layer.toggle.redline");
    expect(routeHardwareInputEvent(streamDeck, { controlId: "encoder-2", eventKind: "delta", delta: 4 }).value).toBe(4);

    const pencilPro = normalizeHardwareControllerProfile({ profileId: "ap-1", displayName: "Apple Pencil Pro", family: "apple-pencil-pro" });
    const lightSqueeze = routeHardwareInputEvent(pencilPro, { controlId: "squeeze", eventKind: "squeeze", pressure: 0.2 });
    expect(lightSqueeze.matched).toBe(false);
    expect(lightSqueeze.reason).toBe("ignored-threshold");
    const firmSqueeze = routeHardwareInputEvent(pencilPro, { controlId: "squeeze", eventKind: "squeeze", pressure: 0.78 });
    expect(firmSqueeze.matched).toBe(true);
    expect(firmSqueeze.action).toBe("tool.quick.wheel");
    const barrelRoll = routeHardwareInputEvent(pencilPro, { controlId: "barrel-roll", eventKind: "barrel-roll", angleDeg: -30 });
    expect(barrelRoll.matched).toBe(true);
    expect(barrelRoll.action).toBe("brush.angle.roll");
    expect(barrelRoll.value).toBe(330);

    const wireless = normalizeHardwareControllerProfile({ profileId: "wr-1", displayName: "Phone Color Wheel", family: "mobile-wireless-remote" });
    expect(wireless.transport).toBe("webrtc-local");
    expect(routeHardwareInputEvent(wireless, { controlId: "color-wheel-hue", eventKind: "analog", delta: 22 }).action).toBe("color.hue.shift");
  });

  it("3D DCC(Blender/SketchUp/Unreal) 라이브링크 패킷을 Y-up 미터 행렬과 NPR 그림자 가이드로 동기화하고 구버전 패킷을 거부한다", () => {
    const blenderState = reconcileDccLiveLinkPacket(DEFAULT_DCC_LIVELINK_PACKET);
    expect(blenderState.status).toBe("applied");
    expect(blenderState.viewMatrix4x4).toHaveLength(16);
    // Blender Z-up [4.2, -7.8, 2.6] -> Y-up [4.2, 2.6, 7.8]
    expect(blenderState.cameraPositionMeters).toEqual([4.2, 2.6, 7.8]);
    expect(blenderState.focalLength35mm).toBeGreaterThan(40);
    expect(blenderState.nprShadowGuide.castShadowAngle2dDeg).toBe(318);
    expect(blenderState.nprShadowGuide.timeOfDayMood).toBe("daylight");

    // 구 시퀀스 패킷 무시 검증
    const stalePacket: DccLiveLinkPacket = { ...DEFAULT_DCC_LIVELINK_PACKET, sequence: 1 };
    const staleResult = reconcileDccLiveLinkPacket(stalePacket, blenderState);
    expect(staleResult.status).toBe("stale-ignored");

    // Unreal LH Z-up(cm) -> RH Y-up(m) 변환 및 노을 림라이트 검증
    const unrealState = reconcileDccLiveLinkPacket({
      sourceDcc: "unreal",
      sessionId: "ue-session",
      sequence: 5,
      timestampMs: 1_763_900_005_000,
      camera: { position: [500, 200, 180], target: [0, 0, 120], fovDeg: 50 },
      sun: { azimuthDeg: 265, elevationDeg: 10 },
    });
    expect(unrealState.cameraPositionMeters).toEqual([2, 1.8, -5]);
    expect(unrealState.nprShadowGuide.timeOfDayMood).toBe("golden-hour");
    expect(unrealState.nprShadowGuide.shadowLengthRatio).toBeGreaterThan(4);

    // SketchUp 인치 -> 미터 기본 스케일 변환 검증
    const sketchupState = reconcileDccLiveLinkPacket({
      sourceDcc: "sketchup",
      sessionId: "skp-session",
      sequence: 1,
      timestampMs: 1_763_900_006_000,
      camera: { position: [100, 0, 100], target: [0, 0, 0], fovDeg: 35 },
      sun: { azimuthDeg: 90, elevationDeg: 72 },
    });
    expect(sketchupState.cameraPositionMeters[0]).toBeCloseTo(2.54, 2);
    expect(sketchupState.nprShadowGuide.timeOfDayMood).toBe("zenith");
  });

  it("Wasm64 모아레 방지 CMYK 하프톤(45°/15°/75°/0°)과 XPBD 천/머리카락 물리가 정확히 수렴한다", () => {
    const standardTile = generateMoireFreeHalftoneTile({
      tileSize: 32,
      lpi: 133,
      dpi: 600,
      cmykCoverage: { c: 0.3, m: 0.2, y: 0.15, k: 0.45 },
    });
    expect(standardTile.isMoireFree).toBe(true);
    expect(standardTile.minCmkSeparationDeg).toBe(30);
    expect(standardTile.moireRiskScore).toBe(0);
    expect(standardTile.coverageErrorMax).toBeLessThan(0.03);
    expect(standardTile.channels.kMask.length).toBe(32 * 32);
    expect(standardTile.wasm64MemoryPlan.addressBits).toBe(64);
    expect(standardTile.wasm64MemoryPlan.requiresWasm64PlateBuffer).toBe(true);

    // 동일 각도 충돌 시 모아레 위험 탐지 검증
    const badAnglesTile = generateMoireFreeHalftoneTile({
      tileSize: 24,
      cmykCoverage: { c: 0.3, m: 0.3, y: 0.3, k: 0.3 },
      anglesDeg: { c: 45, m: 45, y: 0, k: 45 },
    });
    expect(badAnglesTile.isMoireFree).toBe(false);
    expect(badAnglesTile.moireRiskScore).toBe(1);

    // XPBD 천/머리카락 24프레임 수렴 + 루트 고정 + 구형 충돌체 관통 방지 검증
    let strand = createXpbdClothHairStrand(10, 0.08);
    const rootInit = strand.particles[0];
    const collider = { center: [0.16, -0.45, 0] as const, radius: 0.14 };
    let lastStep = stepXpbdClothHairStrand(strand, { wind: [2.5, 0, 0.4], sphereCollider: collider, substeps: 8 });
    for (let frame = 0; frame < 23; frame += 1) {
      strand = lastStep.state;
      lastStep = stepXpbdClothHairStrand(strand, { wind: [2.5, 0, 0.4], sphereCollider: collider, substeps: 8 });
    }
    expect(lastStep.state.stepCount).toBe(24);
    expect(lastStep.converged).toBe(true);
    expect(lastStep.maxStretchError).toBeLessThan(0.025);
    expect(lastStep.state.particles[0].x).toBe(rootInit.x);
    expect(lastStep.state.particles[0].y).toBe(rootInit.y);
    for (const p of lastStep.state.particles.slice(1)) {
      const distToCenter = Math.hypot(p.x - collider.center[0], p.y - collider.center[1], p.z - collider.center[2]);
      expect(distToCenter).toBeGreaterThanOrEqual(collider.radius - 0.005);
    }
  });

  it("Fountain/FDX/Scrivener/Notion 원천 각본을 자동 파싱해 콘티 컷·등장인물 설정집·말풍선 초안을 생성한다", () => {
    expect(detectScriptFormat(SAMPLE_FOUNTAIN_SCRIPT)).toBe("fountain");
    expect(detectScriptFormat(SAMPLE_FDX_SCRIPT)).toBe("fdx");
    expect(detectScriptFormat(SAMPLE_SCRIVENER_MD_SCRIPT)).toBe("scrivener-md");
    expect(detectScriptFormat(SAMPLE_NOTION_SCRIPT)).toBe("notion-script");

    const fountain = parseNovelOrScriptToStoryboard(SAMPLE_FOUNTAIN_SCRIPT);
    expect(fountain.workTitle).toBe("월광 아틀리에 계약");
    expect(fountain.episodeNumber).toBe(14);
    expect(fountain.summary.sceneCount).toBe(2);
    expect(fountain.summary.cutCount).toBeGreaterThanOrEqual(3);
    expect(fountain.summary.sfxCount).toBe(1);
    expect(fountain.characterBible.map((c) => c.name)).toContain("세린");
    expect(fountain.characterBible.map((c) => c.name)).toContain("카엘");
    expect(fountain.balloons.some((b) => b.balloonStyle === "shout")).toBe(true);
    expect(fountain.balloons.some((b) => b.balloonStyle === "thought")).toBe(true);
    expect(fountain.balloons.some((b) => b.balloonStyle === "narration-box")).toBe(true);

    const fdx = parseNovelOrScriptToStoryboard(SAMPLE_FDX_SCRIPT);
    expect(fdx.detectedFormat).toBe("fdx");
    expect(fdx.summary.sceneCount).toBe(1);
    expect(fdx.summary.balloonCount).toBe(2);
    expect(fdx.characterBible.map((c) => c.name)).toEqual(["세린", "카엘"]);

    const md = parseNovelOrScriptToStoryboard(SAMPLE_SCRIVENER_MD_SCRIPT);
    expect(md.detectedFormat).toBe("scrivener-md");
    expect(md.summary.balloonCount).toBe(2);
    expect(md.summary.sfxCount).toBe(1);

    const notion = parseNovelOrScriptToStoryboard(SAMPLE_NOTION_SCRIPT);
    expect(notion.detectedFormat).toBe("notion-script");
    expect(notion.summary.balloonCount).toBe(2);
    expect(notion.summary.sfxCount).toBe(1);
  });

  it("CP·어시스턴트·Rights BOM 정산 ERP가 3.3% 원천징수·실지급액·RFC4180 CSV를 정확히 계산한다", () => {
    const report = computeStudioSettlementReport(DEFAULT_STUDIO_SETTLEMENT_INPUT);
    expect(report.assistantLines).toHaveLength(3);

    // 박지후: 3컷 * 18,000 = 54,000 -> 3.3% = 1,782 -> 실지급 52,218
    const lineArt = report.assistantLines.find((l) => l.assistantId === "ast-line")!;
    expect(lineArt.grossAmount).toBe(54_000);
    expect(lineArt.withholdingTaxAmount).toBe(1_782);
    expect(lineArt.incomeTaxAmount + lineArt.localTaxAmount).toBe(lineArt.withholdingTaxAmount);
    expect(lineArt.netPayAmount).toBe(52_218);

    // 이서아: 2컷 * 14,000 (28,000) + 4h * 15,000 (60,000) = 88,000 -> 3.3% = 2,904 -> 실지급 85,096
    const colorist = report.assistantLines.find((l) => l.assistantId === "ast-color")!;
    expect(colorist.grossAmount).toBe(88_000);
    expect(colorist.withholdingTaxAmount).toBe(2_904);
    expect(colorist.netPayAmount).toBe(85_096);

    // 김도현: 1.5컷 * 22,000 = 33,000 -> 3.3% = 1,089 -> 실지급 31,911
    const bg = report.assistantLines.find((l) => l.assistantId === "ast-bg")!;
    expect(bg.grossAmount).toBe(33_000);
    expect(bg.withholdingTaxAmount).toBe(1_089);
    expect(bg.netPayAmount).toBe(31_911);

    expect(report.totals.totalAssistantGross).toBe(175_000);
    expect(report.totals.totalWithholdingTax).toBe(5_775);
    expect(report.totals.totalAssistantNet).toBe(169_225);
    expect(report.totals.totalRightsBomCost).toBe(114_000);
    expect(report.totals.unverifiedLicenseCount).toBe(0);
    expect(report.erpWebhookPayload.dryRunOnly).toBe(true);
    expect(report.erpWebhookPayload.commercialRightsReady).toBe(true);

    // RFC 4180 CSV 이스케이프(쉼표·쌍따옴표·CRLF) 검증
    const csvWithSpecial = formatSettlementCsv(
      computeStudioSettlementReport({
        ...DEFAULT_STUDIO_SETTLEMENT_INPUT,
        rightsBomReceipts: [
          {
            receiptId: "rcp-q",
            assetName: "대성당, \"야경\" 팩",
            vendor: "ACON3D",
            licenseType: "editorial-only",
            costAmount: 10_000,
            purchasedAtIso: "2026-11-20",
            commercialVerified: false,
            cutIds: ["cut-01"],
          },
        ],
      }),
    );
    expect(csvWithSpecial.endsWith("\r\n")).toBe(true);
    expect(csvWithSpecial).toContain("\"대성당, \"\"야경\"\" 팩\"");
    expect(csvWithSpecial).toContain("review-required");
  });

  it("다이나믹 워크플로우 DAG 오케스트레이터는 위상 정렬·순환 탐지·조건부 분기 및 3종 프리셋 전 단계 실행을 보장한다", () => {
    // 1) 순환 의존성 검출 검증
    const cyclicNodes: readonly DynamicWorkflowNode[] = [
      { id: "a", labelKo: "A", labelEn: "A", descriptionKo: "", descriptionEn: "", category: "script", adapterId: "parse-novel-script", dependsOn: ["c"], enabled: true },
      { id: "b", labelKo: "B", labelEn: "B", descriptionKo: "", descriptionEn: "", category: "qa", adapterId: "auto-qa-gate", dependsOn: ["a"], enabled: true },
      { id: "c", labelKo: "C", labelEn: "C", descriptionKo: "", descriptionEn: "", category: "publish", adapterId: "c2pa-platform-publish", dependsOn: ["b"], enabled: true },
    ];
    const cycleValidation = validateAndSortWorkflowDag(cyclicNodes);
    expect(cycleValidation.valid).toBe(false);
    expect(cycleValidation.status).toBe("cycle-detected");
    expect(cycleValidation.cyclePath.length).toBeGreaterThanOrEqual(3);

    const cycleRun = executeDynamicWorkflowDag({ nodes: cyclicNodes });
    expect(cycleRun.ok).toBe(false);
    expect(cycleRun.status).toBe("cycle-detected");

    // 2) 3종 프로덕션 프리셋 전 단계 완료 검증
    const novelTpl = DYNAMIC_WORKFLOW_TEMPLATES["novel-comics-full"];
    const novelRun = executeDynamicWorkflowDag({
      templateId: novelTpl.id,
      nodes: novelTpl.nodes,
      flags: novelTpl.defaultFlags,
    });
    expect(novelRun.ok).toBe(true);
    expect(novelRun.completedCount).toBe(9);
    expect(novelRun.skippedCount).toBe(0);
    expect(novelRun.orderedNodeIds[0]).toBe("script-parse");
    expect(novelRun.orderedNodeIds[novelRun.orderedNodeIds.length - 1]).toBe("cp-settlement");
    expect(novelRun.artifacts.storyboard?.summary.cutCount).toBeGreaterThanOrEqual(3);
    expect(novelRun.artifacts.otioPackage?.schema).toBe("Timeline.1");
    expect(novelRun.artifacts.settlementReport?.totals.totalAssistantNet).toBe(169_225);

    // 조건부 분기 스킵 검증(enableTms=false, enableOtioShorts=false)
    const conditionalRun = executeDynamicWorkflowDag({
      templateId: novelTpl.id,
      nodes: novelTpl.nodes,
      flags: { enableTms: false, enableOtioShorts: false },
    });
    expect(conditionalRun.ok).toBe(true);
    expect(conditionalRun.stepResults.find((s) => s.nodeId === "multilingual-tms")?.status).toBe("skipped-condition");
    expect(conditionalRun.stepResults.find((s) => s.nodeId === "otio-shorts")?.status).toBe("skipped-condition");

    const byotTpl = DYNAMIC_WORKFLOW_TEMPLATES["byot-hybrid-review-publish"];
    const byotRun = executeDynamicWorkflowDag({ templateId: byotTpl.id, nodes: byotTpl.nodes });
    expect(byotRun.ok).toBe(true);
    expect(byotRun.completedCount).toBe(4);
    expect(byotRun.artifacts.redlineProtected).toBe(true);
    expect(byotRun.artifacts.c2paAntiAiVerified).toBe(true);

    const bg3dTpl = DYNAMIC_WORKFLOW_TEMPLATES["bg3d-moving-toon"];
    const bg3dRun = executeDynamicWorkflowDag({ templateId: bg3dTpl.id, nodes: bg3dTpl.nodes });
    expect(bg3dRun.ok).toBe(true);
    expect(bg3dRun.completedCount).toBe(4);
    expect(bg3dRun.artifacts.dccSync?.status).toBe("applied");
    expect(bg3dRun.artifacts.halftoneTile?.isMoireFree).toBe(true);
    expect(bg3dRun.artifacts.xpbdResult?.converged).toBe(true);
    expect(bg3dRun.artifacts.otioPackage?.summary.losslessVerified).toBe(true);
  });

  it("StudioDynamicWorkflowPanel UI가 3개 탭·단계 토글·드라이런 실행·KO/EN 전환을 정상 동작한다", () => {
    const onExecuted = vi.fn();
    const { rerender } = render(<StudioDynamicWorkflowPanel onWorkflowExecuted={onExecuted} />);

    // 기본 탭 1: DAG 오케스트레이터
    expect(screen.getByRole("heading", { name: "다이나믹 워크플로우 제작 생태계" })).toBeTruthy();
    const tmsCheckbox = screen.getByLabelText(/다국어 TMS/i) as HTMLInputElement;
    expect(tmsCheckbox.checked).toBe(true);
    fireEvent.click(tmsCheckbox);
    expect(tmsCheckbox.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "원클릭 드라이런 실행" }));
    expect(onExecuted).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId("dag-status-multilingual-tms")).getByText(/스킵/)).toBeTruthy();
    expect(within(screen.getByTestId("dag-status-cp-settlement")).getByText(/완료/)).toBeTruthy();
    expect(screen.getByTestId("dag-total-latency").textContent).toContain("8/9");

    // 프리셋 전환: 3D 배경 + 무빙툰
    fireEvent.click(screen.getByRole("button", { name: /3D 배경 \+ 무빙툰 제작/ }));
    fireEvent.click(screen.getByRole("button", { name: "원클릭 드라이런 실행" }));
    expect(within(screen.getByTestId("dag-status-xpbd-cloth-hair")).getByText(/완료/)).toBeTruthy();

    // 탭 2: 노블코믹스 각본 & CP 정산
    fireEvent.click(screen.getByRole("tab", { name: "노블코믹스 각본 & CP 정산" }));
    expect(screen.getByTestId("erp-assistant-net").textContent).toBe("169,225");
    expect(screen.getByTestId("erp-withholding-tax").textContent).toBe("5,775");
    fireEvent.click(screen.getByRole("button", { name: "Final Draft (.fdx)" }));
    fireEvent.click(screen.getByRole("button", { name: "RFC4180 CSV 미리보기" }));
    expect(screen.getByTestId("erp-csv-preview").textContent).toContain("row_type,id,name");

    // 탭 3: OTIO 무빙툰 · WebHID 하드웨어 · 3D 라이브링크
    fireEvent.click(screen.getByRole("tab", { name: "OTIO 무빙툰 · WebHID 하드웨어 · 3D 라이브링크" }));
    fireEvent.click(screen.getByRole("button", { name: "Apple Pencil Pro" }));
    expect(screen.getByTestId("webhid-routed-summary").textContent).toContain("tool.quick.wheel");
    fireEvent.click(screen.getByRole("button", { name: "Unreal" }));
    expect(screen.getByTestId("dcc-livelink-summary").textContent).toContain("UNREAL");
    fireEvent.click(screen.getByRole("button", { name: ".otio JSON 미리보기" }));
    expect(screen.getByTestId("otio-json-preview").textContent).toContain("Timeline.1");

    // EN 로케일 전환 검증 (prop + useI18n 전역 스토어 양쪽 모두 검증)
    rerender(<StudioDynamicWorkflowPanel locale="en" />);
    expect(screen.getByRole("heading", { name: "Dynamic Workflow Production Ecosystem" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Dynamic Workflow DAG" })).toBeTruthy();

    useI18n.setState({ lang: "en" });
    rerender(<StudioDynamicWorkflowPanel />);
    expect(screen.getByRole("heading", { name: "Dynamic Workflow Production Ecosystem" })).toBeTruthy();
  });

  it("DAG 누락 의존성·중복 ID·연쇄 스킵·실패 중단 및 법인 VAT 10% 정산 엣지 케이스를 정확히 처리한다", () => {
    const missingDep = validateAndSortWorkflowDag([
      { id: "n1", labelKo: "N1", labelEn: "N1", descriptionKo: "", descriptionEn: "", category: "qa", adapterId: "auto-qa-gate", dependsOn: ["ghost"], enabled: true },
    ]);
    expect(missingDep.valid).toBe(false);
    expect(missingDep.status).toBe("missing-dependency");

    const dupId = validateAndSortWorkflowDag([
      { id: "dup", labelKo: "D1", labelEn: "D1", descriptionKo: "", descriptionEn: "", category: "qa", adapterId: "auto-qa-gate", dependsOn: [], enabled: true },
      { id: "dup", labelKo: "D2", labelEn: "D2", descriptionKo: "", descriptionEn: "", category: "qa", adapterId: "auto-qa-gate", dependsOn: [], enabled: true },
    ]);
    expect(dupId.valid).toBe(false);
    expect(dupId.status).toBe("duplicate-node-id");

    // cascade 모드에서 앞 단계 실패 시 후속 단계 skipped-upstream 검증
    const byotTpl = DYNAMIC_WORKFLOW_TEMPLATES["byot-hybrid-review-publish"];
    const failedRun = executeDynamicWorkflowDag({
      templateId: byotTpl.id,
      nodes: byotTpl.nodes,
      skipPropagation: "cascade",
      simulateFailureNodeId: "redline-auto-qa",
    });
    expect(failedRun.ok).toBe(false);
    expect(failedRun.status).toBe("partial-failed");
    expect(failedRun.failedCount).toBe(1);
    expect(failedRun.stepResults.find((s) => s.nodeId === "slack-signoff")?.status).toBe("skipped-upstream");
    expect(failedRun.stepResults.find((s) => s.nodeId === "c2pa-publish")?.status).toBe("skipped-upstream");

    // 법인 VAT 10% + 면세 정산 정확도 검증
    const vatReport = computeStudioSettlementReport({
      settlementPeriod: "2026-11",
      studioName: "테스트 CP",
      workTitle: "테스트 작품",
      episodeCode: "EP.01",
      assistants: [
        { assistantId: "corp", name: "배경 외주법인", role: "background", ratePerCut: 100_000, hourlyRate: 0, taxType: "corporate-vat-10" },
        { assistantId: "exempt", name: "면세 인턴", role: "lettering", ratePerCut: 20_000, hourlyRate: 0, taxType: "tax-exempt" },
      ],
      cutContributions: [
        { cutId: "cut-01", assistantId: "corp", taskType: "background", weight: 2, dateIso: "2026-11-20" },
        { cutId: "cut-01", assistantId: "exempt", taskType: "lettering", weight: 1, dateIso: "2026-11-20" },
      ],
      dailyWorkLogs: [],
      rightsBomReceipts: [],
    });
    const corpLine = vatReport.assistantLines.find((l) => l.assistantId === "corp")!;
    expect(corpLine.grossAmount).toBe(200_000);
    expect(corpLine.vatAmount).toBe(20_000);
    expect(corpLine.withholdingTaxAmount).toBe(0);
    expect(corpLine.netPayAmount).toBe(220_000);
    const exemptLine = vatReport.assistantLines.find((l) => l.assistantId === "exempt")!;
    expect(exemptLine.netPayAmount).toBe(20_000);
  });

  it("Calm Atelier 토큰 위생·배럴 금지·원시색상/localStorage/transition-all 0건·파일 줄 수 상한을 모두 준수한다", () => {
    expect(existsSync(resolve(MODULE_DIR, "index.ts"))).toBe(false);
    expect(existsSync(resolve(MODULE_DIR, "index.tsx"))).toBe(false);

    const fileBudgets: readonly { readonly file: string; readonly maxLines: number }[] = [
      { file: "moving-toon-hardware-livelink.ts", maxLines: 700 },
      { file: "novel-script-erp-settlement.ts", maxLines: 680 },
      { file: "dynamic-workflow-orchestrator.ts", maxLines: 650 },
      { file: "StudioDynamicWorkflowPanel.tsx", maxLines: 460 },
    ];

    for (const entry of fileBudgets) {
      const source = readFileSync(resolve(MODULE_DIR, entry.file), "utf8");
      const lineCount = source.split("\n").length;
      expect(lineCount, `${entry.file} line count ${lineCount} <= ${entry.maxLines}`).toBeLessThanOrEqual(entry.maxLines);
      expect(RAW_COLOR_REGEX.test(source), `${entry.file} must not contain raw hex/rgb/hsl colors`).toBe(false);
      expect(source.includes("localStorage"), `${entry.file} must not use localStorage`).toBe(false);
      expect(source.includes("transition-all"), `${entry.file} must not use transition-all`).toBe(false);
    }

    const panelSource = readFileSync(resolve(MODULE_DIR, "StudioDynamicWorkflowPanel.tsx"), "utf8");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
  });
});
