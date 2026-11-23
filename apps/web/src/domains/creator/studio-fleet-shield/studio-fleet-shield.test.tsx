// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFleetShieldPanel } from "./StudioFleetShieldPanel";
import {
  correlateReaderReactionToCuts,
  createDemoReaderReactionEpisode,
  createDemoStudioFleet50Series,
  evaluateStudioFleetQaRadar,
} from "./fleet-qa-radar-and-reader-heatmap";
import {
  applyAdversarialSpectralShield,
  buildDmcaTakedownPackage,
  buildMotionPosterLoopPlan,
  computeBufferPsnrDb,
  computeSha256Hex,
  createDemoArtworkBuffer,
  createDemoLeakTraceMetadata,
  createSecondScreenCompanionSession,
  dispatchCompanionCommand,
  embedLeakTraceForensicPayload,
  extractLeakTraceForensicPayload,
  type RgbaImageBuffer,
} from "./spectral-shield-motion-companion";

afterEach(cleanup);

describe("옵트인 스펙트럼 실드(PSNR >= 38dB) · 포렌식 유출 역추적 · DMCA 신고서", () => {
  it("스펙트럼 실드는 옵트인 해제 시 원본 무변경을 지키고, 활성화 시 3단계 강도 모두 PSNR >= 38dB와 중·고주파 위상 교란을 보장한다", () => {
    expect(computeSha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    const source = createDemoArtworkBuffer(64, 64);
    const disabled = applyAdversarialSpectralShield(source, { enabled: false });
    expect(disabled.applied).toBe(false);
    expect(disabled.mse).toBe(0);
    expect(disabled.psnrDb).toBe(99.99);
    expect(disabled.buffer.data).toEqual(source.data);

    for (const strength of ["subtle", "balanced", "maximum"] as const) {
      const res = applyAdversarialSpectralShield(source, { enabled: true, strength, targetMinPsnrDb: 38 });
      expect(res.applied).toBe(true);
      expect(res.psnrDb).toBeGreaterThanOrEqual(38);
      expect(res.midFreqEnergyShiftRatio).toBeGreaterThan(0);
      expect(res.highFreqPhaseFlipRatio).toBeGreaterThan(0);
      expect(res.featureDisruptionScore).toBeGreaterThan(0);
      expect(res.preservedDcFidelityPct).toBeGreaterThanOrEqual(96);
      expect(res.receiptSha256).toHaveLength(64);
    }

    // 높은 목표 PSNR(41dB) 폐루프 제어 검증
    const strictRes = applyAdversarialSpectralShield(source, { enabled: true, strength: "maximum", targetMinPsnrDb: 41 });
    expect(strictRes.psnrDb).toBeGreaterThanOrEqual(41);
  });

  it("유출 역추적 포렌식 워터마크는 스펙트럼 실드 중첩 및 경미한 ±1 노이즈에서도 출고처·회차·시각을 100% 복원하고 오키를 거부한다", () => {
    const source = createDemoArtworkBuffer(64, 64);
    const shielded = applyAdversarialSpectralShield(source, { enabled: true, strength: "balanced", targetMinPsnrDb: 38 });
    const meta = createDemoLeakTraceMetadata("PARTNER-JP-04");
    const embedded = embedLeakTraceForensicPayload(shielded.buffer, meta);

    expect(embedded.psnrDb).toBeGreaterThanOrEqual(42);
    const combinedQuality = computeBufferPsnrDb(source, embedded.buffer);
    expect(combinedQuality.psnrDb).toBeGreaterThanOrEqual(38);

    const recovered = extractLeakTraceForensicPayload(embedded.buffer, meta.watermarkKey);
    expect(recovered.recovered).toBe(true);
    expect(recovered.checksumValid).toBe(true);
    expect(recovered.metadata).toEqual({
      recipientId: "PARTNER-JP-04",
      distributionChannel: "global-partner-review",
      workId: meta.workId,
      episodeNumber: 42,
      issuedAtIso: meta.issuedAtIso,
    });
    expect(recovered.forensicSignatureHex).toBe(embedded.forensicSignatureHex);

    // 20% 픽셀에 ±1 경미 노이즈 주입 후 다수결 복원 검증
    const noisyData = new Uint8ClampedArray(embedded.buffer.data);
    for (let i = 0; i < noisyData.length; i += 20) {
      noisyData[i] = Math.min(255, Math.max(0, (noisyData[i] ?? 0) + (i % 40 === 0 ? 1 : -1)));
    }
    const noisyBuffer: RgbaImageBuffer = { width: embedded.buffer.width, height: embedded.buffer.height, data: noisyData };
    const noisyRecovered = extractLeakTraceForensicPayload(noisyBuffer, meta.watermarkKey);
    expect(noisyRecovered.recovered).toBe(true);
    expect(noisyRecovered.metadata?.recipientId).toBe("PARTNER-JP-04");

    // 잘못된 키·미삽입 버퍼 거부
    const wrongKey = extractLeakTraceForensicPayload(embedded.buffer, "wrong-studio-key");
    expect(wrongKey.recovered).toBe(false);
    expect(wrongKey.failureReason).toBe("KEY_MISMATCH_OR_NO_WATERMARK");
    expect(extractLeakTraceForensicPayload(source, meta.watermarkKey).recovered).toBe(false);
  });

  it("1클릭 DMCA 신고 패키지는 포렌식 귀속·법정 5요건·한영 신고서·SHA-256 증적 봉인을 생성하고 누락 필드를 차단한다", () => {
    const source = createDemoArtworkBuffer(64, 64);
    const meta = createDemoLeakTraceMetadata("PRESS-EMB-01");
    const embedded = embedLeakTraceForensicPayload(source, meta);
    const extracted = extractLeakTraceForensicPayload(embedded.buffer, meta.watermarkKey);

    const pkg = buildDmcaTakedownPackage({
      copyrightOwner: "ToonStudio Original Lab",
      studioName: "ToonStudio CP",
      contactEmail: "rights@toonstudio.cloud",
      workTitle: "별빛 회귀자",
      workId: meta.workId,
      episodeNumber: meta.episodeNumber,
      originalPublicationUrl: "https://www.toonstudio.cloud/series/eclipse/42",
      infringingUrls: ["https://pirate.example/eclipse-42-raw"],
      hostingProvider: "CloudEdge Abuse",
      discoveredAtIso: "2026-11-23T12:00:00Z",
      forensicExtraction: extracted,
    });

    expect(pkg.readyToSubmit).toBe(true);
    expect(pkg.missingRequirements).toHaveLength(0);
    expect(pkg.caseId).toMatch(/^DMCA-2026-[0-9A-F]{8}$/);
    expect(pkg.evidenceSha256).toHaveLength(64);
    expect(pkg.attributedLeakSource?.recipientId).toBe("PRESS-EMB-01");
    expect(pkg.statutoryChecklist.every((item) => item.satisfied)).toBe(true);
    expect(pkg.noticeTextEn).toContain("17 U.S.C. § 512(c)(3)");
    expect(pkg.noticeTextEn).toContain("PRESS-EMB-01");
    expect(pkg.noticeTextKo).toContain("저작권법 제103조");

    const incomplete = buildDmcaTakedownPackage({
      copyrightOwner: "",
      studioName: "ToonStudio CP",
      contactEmail: "invalid-email",
      workTitle: "별빛 회귀자",
      workId: meta.workId,
      episodeNumber: 42,
      originalPublicationUrl: "",
      infringingUrls: [],
      hostingProvider: "CloudEdge Abuse",
      discoveredAtIso: "2026-11-23T12:00:00Z",
    });
    expect(incomplete.readyToSubmit).toBe(false);
    expect(incomplete.missingRequirements).toEqual(expect.arrayContaining(["rights-holder", "work-identification", "infringing-locations"]));
  });
});

describe("3초 루프 모션 포스터(24fps · 72프레임) & 2nd-Screen QR 무선 보조화면", () => {
  it("24fps 72프레임 무이음 3초 모션 포스터 키프레임·APNG/WebP/GIF 매니페스트·원시색 없는 SVG 프리뷰를 생성한다", () => {
    const plan = buildMotionPosterLoopPlan({
      workTitle: "별빛 회귀자",
      cutId: "ep42-cut07",
      durationSeconds: 3,
      fps: 24,
      eyeBlinkIntensity: 0.95,
      hairSwayIntensity: 0.85,
      lightMotesIntensity: 0.8,
      microZoomIntensity: 0.75,
    });

    expect(plan.fps).toBe(24);
    expect(plan.durationSeconds).toBe(3);
    expect(plan.totalFrames).toBe(72);
    expect(plan.keyframes).toHaveLength(72);
    expect(plan.seamlessLoopVerified).toBe(true);
    expect(plan.boundaryDelta).toBeLessThan(1e-4);

    const minEye = Math.min(...plan.keyframes.map((k) => k.eyeOpenness));
    const maxEye = Math.max(...plan.keyframes.map((k) => k.eyeOpenness));
    const minHair = Math.min(...plan.keyframes.map((k) => k.hairSwayDeg));
    const maxHair = Math.max(...plan.keyframes.map((k) => k.hairSwayDeg));
    const maxZoom = Math.max(...plan.keyframes.map((k) => k.zoomScale));
    expect(minEye).toBeLessThan(0.25);
    expect(maxEye).toBe(1);
    expect(minHair).toBeLessThan(-3);
    expect(maxHair).toBeGreaterThan(3);
    expect(maxZoom).toBeGreaterThan(1.02);

    expect(plan.exportManifests.map((m) => m.format)).toEqual(["apng", "webp", "gif"]);
    expect(plan.exportManifests.every((m) => m.loopCount === 0 && m.totalFrames === 72)).toBe(true);
    expect(plan.svgPreviewMarkup).toContain("<animateTransform");
    expect(plan.svgPreviewMarkup).toContain("<animate ");
    expect(plan.svgPreviewMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("QR 2nd-Screen 세션은 21x21 매트릭스·토큰/만료/미페어링/역순 시퀀스를 검증하고 4대 컨트롤러 명령을 라우팅한다", () => {
    const session = createSecondScreenCompanionSession({
      hostWorkspaceId: "ws-alpha",
      createdAtIso: "2026-11-23T11:30:00.000Z",
      ttlSeconds: 120,
    });

    expect(session.qrMatrix).toHaveLength(21);
    expect(session.qrMatrix[0]).toHaveLength(21);
    expect(session.qrMatrix[0]?.[0]).toBe(true);
    expect(session.qrMatrix[0]?.[20]).toBe(true);
    expect(session.qrMatrix[20]?.[0]).toBe(true);
    expect(session.pairingCode).toMatch(/^TS-\d{4}$/);

    // 페어링 전 제어 명령 차단
    const prePair = dispatchCompanionCommand(session, {
      type: "rotate-canvas", seq: 1, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:10.000Z", deltaDeg: 15,
    });
    expect(prePair.ok).toBe(false);
    expect(prePair.errorCode).toBe("NOT_PAIRED");

    // 잘못된 토큰 및 만료 시간 차단
    const badToken = dispatchCompanionCommand(session, {
      type: "pair-device", seq: 1, pairingToken: "invalid-token", atIso: "2026-11-23T11:30:10.000Z", deviceName: "Phone", deviceKind: "smartphone",
    });
    expect(badToken.errorCode).toBe("INVALID_TOKEN");

    const expired = dispatchCompanionCommand(session, {
      type: "pair-device", seq: 1, pairingToken: session.pairingToken, atIso: "2026-11-23T11:35:00.000Z", deviceName: "Phone", deviceKind: "smartphone",
    });
    expect(expired.errorCode).toBe("SESSION_EXPIRED");
    expect(expired.session.status).toBe("expired");

    // 정상 페어링 -> 색상환 -> 브러시 다이얼 -> 캔버스 회전(15도 스냅) -> 레퍼런스 -> 퀵액션 -> 역순 시퀀스 차단 -> 연결 종료
    const paired = dispatchCompanionCommand(session, {
      type: "pair-device", seq: 1, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:05.000Z", deviceName: "Galaxy Tab S10", deviceKind: "tablet", latencyMs: 11,
    });
    expect(paired.ok).toBe(true);
    expect(paired.session.status).toBe("paired");

    const colorRes = dispatchCompanionCommand(paired.session, {
      type: "set-color-wheel", seq: 2, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:06.000Z", hueDeg: 385, chroma: 0.22, lightness: 0.58, label: "Warm Ochre",
    });
    expect(colorRes.session.colorWheel.hueDeg).toBe(25);

    const brushRes = dispatchCompanionCommand(colorRes.session, {
      type: "adjust-brush-dial", seq: 3, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:07.000Z", sizePx: 999, opacityPct: 120, stabilizationPct: 68,
    });
    expect(brushRes.session.brushDial.sizePx).toBe(500);
    expect(brushRes.session.brushDial.opacityPct).toBe(100);
    expect(brushRes.session.brushDial.stabilizationPct).toBe(68);

    const rotRes = dispatchCompanionCommand(brushRes.session, {
      type: "rotate-canvas", seq: 4, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:08.000Z", deltaDeg: 22, snapTo15Deg: true, flipHorizontal: true,
    });
    expect(rotRes.session.canvasTransform.rotationDeg).toBe(15);
    expect(rotRes.session.canvasTransform.flipHorizontal).toBe(true);

    const refRes = dispatchCompanionCommand(rotRes.session, {
      type: "control-reference", seq: 5, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:09.000Z", activeRefId: "ref-alley-lighting", grayscale: true, opacityPct: 70,
    });
    expect(refRes.session.referencePin.grayscale).toBe(true);
    expect(refRes.session.referencePin.activeRefId).toBe("ref-alley-lighting");

    const staleRes = dispatchCompanionCommand(refRes.session, {
      type: "trigger-quick-action", seq: 5, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:10.000Z", action: "reset-rotation",
    });
    expect(staleRes.ok).toBe(false);
    expect(staleRes.errorCode).toBe("STALE_SEQUENCE");

    const resetRes = dispatchCompanionCommand(refRes.session, {
      type: "trigger-quick-action", seq: 6, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:11.000Z", action: "reset-rotation",
    });
    expect(resetRes.session.canvasTransform.rotationDeg).toBe(0);

    const discRes = dispatchCompanionCommand(resetRes.session, {
      type: "disconnect", seq: 7, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:12.000Z",
    });
    expect(discRes.session.status).toBe("disconnected");
    const afterDisc = dispatchCompanionCommand(discRes.session, {
      type: "trigger-quick-action", seq: 8, pairingToken: session.pairingToken, atIso: "2026-11-23T11:30:13.000Z", action: "undo",
    });
    expect(afterDisc.errorCode).toBe("SESSION_DISCONNECTED");
  });
});

describe("CP 50작품 Fleet QA 레이더 · 독자 반응·이탈 히트맵 원고 역추적", () => {
  it("50개 연재작의 마감 위험·자동 QA·30일 내 Rights BOM 만료·어시스턴트 과부하를 집계·우선순위 정렬한다", () => {
    const report = evaluateStudioFleetQaRadar(createDemoStudioFleet50Series("2026-11-23T12:00:00Z"));

    expect(report.totalSeriesCount).toBe(50);
    expect(report.priorityQueue).toHaveLength(50);
    expect(report.tierCounts.critical + report.tierCounts.high + report.tierCounts.watch + report.tierCounts.healthy).toBe(50);
    expect(report.expiredRightsAssetCount).toBeGreaterThanOrEqual(2);
    expect(report.totalExpiringRightsAssets30d).toBeGreaterThan(report.expiredRightsAssetCount);
    expect(report.overloadedAssistantCount).toBeGreaterThanOrEqual(4);
    expect(report.rebalancingSuggestions.length).toBeGreaterThanOrEqual(1);

    // 우선순위 내림차순 정렬 불변식 검증
    for (let i = 1; i < report.priorityQueue.length; i += 1) {
      const prev = report.priorityQueue[i - 1];
      const curr = report.priorityQueue[i];
      if (!prev || !curr) continue;
      expect(prev.compositePriorityScore).toBeGreaterThanOrEqual(curr.compositePriorityScore);
    }

    // 재배치 권고는 동일 파트(specialty) 과부하 -> 여유 인력 매칭 보장
    for (const plan of report.rebalancingSuggestions) {
      expect(plan.fromUtilizationPct).toBeGreaterThan(plan.toUtilizationPct);
      expect(plan.suggestedTransferLoadPct).toBeGreaterThan(0);
    }

    expect(report.alerts.map((a) => a.code)).toEqual(
      expect.arrayContaining(["RIGHTS_BOM_EXPIRED", "DEADLINE_CRITICAL", "ASSISTANT_OVERLOAD", "RIGHTS_BOM_EXPIRING_30D"]),
    );
  });

  it("독자 반응 히트맵은 댓글 폭주·이탈 절벽·체류 시간을 원고 Y좌표에 역추적하고 차기 화 연출 권고안을 산출한다", () => {
    const report = correlateReaderReactionToCuts(createDemoReaderReactionEpisode());

    expect(report.cutCount).toBe(10);
    expect(report.peakCommentCutId).toBe("cut-07");
    expect(report.peakCommentSurgeIndex).toBeGreaterThanOrEqual(3);
    expect(report.worstDropOffCutId).toBe("cut-04");
    expect(report.worstDropOffRatePct).toBe(9.8);

    const cut4 = report.cutOverlays.find((c) => c.cutId === "cut-04");
    const cut7 = report.cutOverlays.find((c) => c.cutId === "cut-07");
    expect(cut4?.heatClass).toBe("dropoff-cliff");
    expect(cut4?.yStartPx).toBe(4100);
    expect(cut4?.yEndPx).toBe(5700);
    expect(cut7?.heatClass).toBe("viral-peak");

    // 누적 잔존율 단조 감소 검증
    for (let i = 0; i < report.cutOverlays.length; i += 1) {
      const c = report.cutOverlays[i];
      if (!c) continue;
      expect(c.retentionAfterPct).toBeLessThanOrEqual(c.retentionBeforePct);
    }

    expect(report.nextEpisodeRecommendations.map((r) => r.category)).toEqual(
      expect.arrayContaining(["dialogue-pacing", "viral-callback", "cliffhanger-payoff"]),
    );

    // 초반 3컷 이탈 급증 시 opening-hook 고우선순위 권고 생성 검증
    const weakOpeningInput = createDemoReaderReactionEpisode();
    const weakOpening = correlateReaderReactionToCuts({
      ...weakOpeningInput,
      reactions: weakOpeningInput.reactions.map((r) => (r.cutId === "cut-01" || r.cutId === "cut-02" ? { ...r, dropOffRatePct: 9.5 } : r)),
    });
    expect(weakOpening.openingThreeCutRetentionPct).toBeLessThan(88);
    expect(weakOpening.nextEpisodeRecommendations.some((r) => r.category === "opening-hook" && r.priority === "high")).toBe(true);
  });
});

describe("StudioFleetShieldPanel UI · 3탭 · KO/EN · Calm Atelier 토큰 위생 계약", () => {
  it("props 없이 마운트되고 3개 탭의 인터랙션과 콜백이 정상 동작한다", () => {
    const onDmcaGenerated = vi.fn();
    const onCompanionCommand = vi.fn();
    render(<StudioFleetShieldPanel locale="ko" onDmcaGenerated={onDmcaGenerated} onCompanionCommand={onCompanionCommand} />);

    // 탭 1: 스펙트럼 실드 · 유출 역추적 · 모션 포스터
    expect(screen.getByTestId("shield-psnr-tile").textContent).toMatch(/(3[89]|[4-9]\d)\.\d{2} dB/);
    expect(screen.getByTestId("forensic-recovery-tile").textContent).toContain("NAVER-KR-DESK");
    fireEvent.click(screen.getByRole("button", { name: "PARTNER-JP-04" }));
    expect(screen.getByTestId("forensic-recovery-tile").textContent).toContain("PARTNER-JP-04");
    fireEvent.click(screen.getByRole("button", { name: /1클릭 DMCA 신고 패키지 생성/i }));
    expect(onDmcaGenerated).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("motion-poster-metrics").textContent).toContain("24fps · 72f");
    expect(screen.getByTestId("poster-manifest-webp")).toBeTruthy();

    // 탭 2: 2nd-Screen QR 보조화면
    fireEvent.click(screen.getByRole("tab", { name: /2nd-Screen QR 보조화면/i }));
    expect(screen.getByTestId("companion-pairing-code").textContent).toMatch(/^TS-\d{4}$/);
    fireEvent.click(screen.getByRole("button", { name: /태블릿 1초 페어링/i }));
    expect(screen.getByTestId("companion-status-badge").textContent).toContain("iPad Pro 13");
    fireEvent.click(screen.getByRole("button", { name: /회전 \+15°/i }));
    expect(screen.getByTestId("companion-canvas-state").textContent).toContain("15°");
    fireEvent.click(screen.getByRole("button", { name: /레퍼런스 흑백 토글/i }));
    expect(screen.getByTestId("companion-ref-state").textContent).toContain("흑백 명암");
    expect(onCompanionCommand).toHaveBeenCalledTimes(3);

    // 탭 3: CP 50작품 Fleet 레이더 · 독자 히트맵
    fireEvent.click(screen.getByRole("tab", { name: /CP 50작품 Fleet 레이더/i }));
    expect(screen.getByTestId("fleet-total-tile").textContent).toContain("50");
    fireEvent.click(screen.getByRole("button", { name: "Rights BOM 30일" }));
    expect(screen.getByTestId("fleet-priority-list").children.length).toBeGreaterThan(0);
    expect(screen.getByTestId("heatmap-kpi-badge").textContent).toContain("cut-07");
    expect(screen.getByTestId("heatmap-cut-cut-04").textContent).toContain("4100–5700px");
  });

  it("영어(en) 로케일과 Calm Atelier 토큰·배럴 금지·파일 크기·localStorage 금지 위생 계약을 전수 충족한다", () => {
    render(<StudioFleetShieldPanel locale="en" />);
    expect(screen.getByRole("tab", { name: /2nd-Screen QR Companion/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /CP 50-Series Fleet Radar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate 1-Click DMCA Package/i })).toBeTruthy();

    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/studio-fleet-shield");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);
    expect(existsSync(resolve(dir, "index.tsx"))).toBe(false);

    const files = [
      { name: "spectral-shield-motion-companion.ts", maxLines: 700 },
      { name: "fleet-qa-radar-and-reader-heatmap.ts", maxLines: 680 },
      { name: "StudioFleetShieldPanel.tsx", maxLines: 460 },
      { name: "studio-fleet-shield.test.tsx", maxLines: 750 },
    ] as const;

    for (const file of files) {
      const source = readFileSync(resolve(dir, file.name), "utf8");
      const lineCount = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lineCount).toBeLessThanOrEqual(file.maxLines);
      if (file.name !== "studio-fleet-shield.test.tsx") {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
        expect(source).not.toContain("localStorage");
      }
      if (file.name === "StudioFleetShieldPanel.tsx") {
        expect(source).not.toContain("transition-all");
        expect(source).toContain("[word-break:keep-all]");
        expect(source).toContain("tabular-nums");
      }
    }
  });
});
