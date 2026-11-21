// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GLOBAL_ASSET_CATALOG,
  GLOBAL_ASSET_QUICK_HUBS,
  extractKoreanChoseong,
  filterGlobalAssetCatalog,
} from "@/shared/components/workspace/global-asset-search-index";
import { GlobalAssetSearchPalette } from "@/shared/components/workspace/GlobalAssetSearchPalette";
import { StudioCollaborationSessionTools } from "../virtual-space/StudioCollaborationSessionTools";
import { useStudioCollaborationSpaceTarget } from "../virtual-space/use-studio-collaboration-space-target";
import {
  SAMPLE_LONG_SERIAL_EPISODES,
  SAMPLE_STROKE_AUDIT_EVENTS,
  SAMPLE_WEBTOON_SCRIPT_LINES,
  auditLongSeriesContinuity,
  buildC2paCopyrightPackage,
  classifyDialogueEmotion,
  generateAutoLetteringLayout,
  sha256Hex,
  verifyC2paStrokeChain,
  type SeriesEpisodeRecord,
} from "./c2pa-sfx-continuity-engine";
import {
  REMOTE_SHORTCUT_DEFINITIONS,
  buildDeterministicQrMatrix,
  buildIpGoodsExportBundle,
  createPhoneRemoteDispatcher,
  createPhoneRemoteSession,
  extractCharacterMaskAndBounds,
  generateAcrylicStandCutlineSvg,
  generateKakaoEmoticonSpec,
  generatePrintCmykManifest,
  rgbToCmyk,
} from "./ip-goods-phone-remote-engine";
import { StudioCreatorSuperpowersPanel } from "./StudioCreatorSuperpowersPanel";

function CollabToolsHarness() {
  const target = useStudioCollaborationSpaceTarget();
  return <StudioCollaborationSessionTools target={target} board={false} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("#6 전역 소재 검색 커맨드 팔레트 (⌘K / /)", () => {
  it("1. 3D 배경 히어로 4종과 상업 무료 필터가 정확히 동작한다", () => {
    const heroes = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "3d",
      category: "3d-hero",
      freeCommercialOnly: true,
    });
    expect(heroes).toHaveLength(4);
    expect(GLOBAL_ASSET_QUICK_HUBS[0]?.href).toBe("/research/materials");
  });

  it("2. 초성 검색(ㅁㅎ/ㅅㅇ)으로 무협·서울 소재를 즉시 필터링한다", () => {
    expect(extractKoreanChoseong("무협 천마산")).toBe("ㅁㅎ ㅊㅁㅅ");
    const wuxia = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "ㅁㅎ",
      category: "all",
      freeCommercialOnly: false,
    });
    expect(wuxia.some((item) => item.id === "hero-3d-wuxia-cliff")).toBe(true);
    const seoul = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "ㅅㅇ ㅎㄷ",
      category: "3d-hero",
      freeCommercialOnly: true,
    });
    expect(seoul.map((item) => item.id)).toEqual(["hero-3d-seoul-alley"]);
  });

  it("3. 팔레트 UI에서 ArrowDown/ArrowUp/Enter 키보드 네비게이션이 동작한다", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/studio"]}>
        <GlobalAssetSearchPalette open onClose={onClose} onSelectAsset={onSelect} />
      </MemoryRouter>,
    );
    const combobox = screen.getByRole("combobox");
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("#7 C2PA + 제작 타임랩스 저작권 증빙 패키지", () => {
  it("4. 표준 FIPS 180-4 SHA-256 해시 벡터와 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("5. 스트로크 해시 체인·타임랩스 체크포인트·C2PA 2.1 매니페스트를 생성한다", () => {
    const pkg = buildC2paCopyrightPackage({
      workTitle: "북부 대공의 계약",
      authorName: "김작가",
      episodeNumber: 55,
      strokes: SAMPLE_STROKE_AUDIT_EVENTS,
    });
    expect(pkg.specVersion).toBe("c2pa-2.1");
    expect(pkg.strokeChain).toHaveLength(SAMPLE_STROKE_AUDIT_EVENTS.length);
    expect(pkg.timelapseFrames.length).toBeGreaterThanOrEqual(5);
    expect(pkg.humanAuthoredRatio).toBeCloseTo(6 / 7, 3);
    expect(pkg.aiAssistRatio).toBeCloseTo(1 / 7, 3);
    const parsed = JSON.parse(pkg.manifestJson) as { spec_version: string; assertions: unknown[] };
    expect(parsed.spec_version).toBe("c2pa-2.1");
    expect(parsed.assertions).toHaveLength(4);
  });

  it("6. 정상 C2PA 스트로크 체인은 무결성 검증을 통과한다", () => {
    const pkg = buildC2paCopyrightPackage({
      workTitle: "검증 원고",
      authorName: "김작가",
      episodeNumber: 12,
      strokes: SAMPLE_STROKE_AUDIT_EVENTS,
    });
    const res = verifyC2paStrokeChain(pkg);
    expect(res.valid).toBe(true);
    expect(res.verifiedLinks).toBe(SAMPLE_STROKE_AUDIT_EVENTS.length);
    expect(res.tamperedIndex).toBeNull();
  });

  it("7. 스트로크 1개 속성이 변조되면 정확한 인덱스를 지목한다", () => {
    const pkg = buildC2paCopyrightPackage({
      workTitle: "변조 테스트",
      authorName: "이작가",
      episodeNumber: 1,
      strokes: SAMPLE_STROKE_AUDIT_EVENTS,
    });
    const tampered = {
      ...pkg,
      sourceEvents: pkg.sourceEvents.map((ev, idx) => (idx === 3 ? { ...ev, pointCount: ev.pointCount + 1 } : ev)),
    };
    const res = verifyC2paStrokeChain(tampered);
    expect(res.valid).toBe(false);
    expect(res.tamperedIndex).toBe(3);
  });

  it("8. 스트로크 누락(삭제) 또는 타임스탬프 역전을 탐지한다", () => {
    const pkg = buildC2paCopyrightPackage({
      workTitle: "누락 테스트",
      authorName: "이작가",
      episodeNumber: 2,
      strokes: SAMPLE_STROKE_AUDIT_EVENTS,
    });
    expect(verifyC2paStrokeChain({ ...pkg, sourceEvents: pkg.sourceEvents.slice(0, -1) }).valid).toBe(false);

    const reversed = buildC2paCopyrightPackage({
      workTitle: "시간 역전",
      authorName: "이작가",
      episodeNumber: 3,
      strokes: [SAMPLE_STROKE_AUDIT_EVENTS[1]!, SAMPLE_STROKE_AUDIT_EVENTS[0]!],
    });
    expect(verifyC2paStrokeChain(reversed).valid).toBe(false);
    expect(verifyC2paStrokeChain(reversed).tamperedIndex).toBe(1);
  });

  it("9. 제네시스 해시 및 최종 서명 해시 위조를 차단한다", () => {
    const pkg = buildC2paCopyrightPackage({
      workTitle: "원본",
      authorName: "박작가",
      episodeNumber: 10,
      strokes: SAMPLE_STROKE_AUDIT_EVENTS,
    });
    expect(verifyC2paStrokeChain({ ...pkg, genesisHash: "0".repeat(64) }).valid).toBe(false);
    expect(verifyC2paStrokeChain({ ...pkg, finalChainHash: "f".repeat(64) }).valid).toBe(false);
  });
});

describe("#8 감정 인식 말풍선 · 폰트 · 효과음(SFX) 자동 식자", () => {
  it("10. anger·shock 감정을 정확히 분류한다", () => {
    expect(classifyDialogueEmotion("감히 내 앞에서!! 당장 꺼져!!").emotion).toBe("anger");
    expect(classifyDialogueEmotion("설마 네가 범인이었다고?!").emotion).toBe("shock");
  });

  it("11. whisper·monologue 감정을 정확히 분류한다", () => {
    expect(classifyDialogueEmotion("쉿, 조용히 소근거리세요...").emotion).toBe("whisper");
    expect(classifyDialogueEmotion("(속마음) 그때는 미처 몰랐다.").emotion).toBe("monologue");
  });

  it("12. romance·normal 감정을 정확히 분류한다", () => {
    expect(classifyDialogueEmotion("내 심장이 두근거려 사랑해 ♡").emotion).toBe("romance");
    expect(classifyDialogueEmotion("내일 오후 3시에 회의실에서 봅시다.").emotion).toBe("normal");
  });

  it("13. 화자 추출·꼬리 방향 배정·말풍선 비중첩 세로 배치를 계산한다", () => {
    const plan = generateAutoLetteringLayout(SAMPLE_WEBTOON_SCRIPT_LINES, { locale: "ko", canvasWidth: 800 });
    expect(plan.placements).toHaveLength(6);
    expect(plan.sfxCount).toBe(4);
    expect(plan.placements[0]?.tailDirection).toBe("none");
    expect(plan.placements[1]?.speaker).toBe("황태자");
    expect(plan.placements[3]?.bubbleShape).toBe("spiky-burst");

    for (let i = 1; i < plan.placements.length; i += 1) {
      const prev = plan.placements[i - 1]!;
      const curr = plan.placements[i]!;
      expect(curr.position.y).toBeGreaterThan(prev.position.y + prev.position.height);
    }
  });

  it("14. 일본어(ja)·영어(en) 현지화 폰트 및 의성어 SFX를 자동 배치한다", () => {
    const ja = generateAutoLetteringLayout(["대공: 당장 꺼져!!", "주인공: 두근거려 ♡"], { locale: "ja" });
    expect(ja.placements[0]?.sfxText).toBe("ドゴォン!");
    expect(ja.placements[1]?.sfxText).toBe("ドキドキ");

    const en = generateAutoLetteringLayout(["Duke: Shut up!!", "Hero: What?! No way?!"], { locale: "en" });
    expect(en.placements[0]?.sfxText).toBe("BOOM!");
    expect(en.placements[1]?.sfxText).toBe("GASP!!");
  });
});

describe("#9 장기 연재(50화+) 떡밥 · 설정 오류 감지기", () => {
  it("15. 50화+ 미회수 떡밥을 critical 심각도로 우선 정렬한다", () => {
    const report = auditLongSeriesContinuity(SAMPLE_LONG_SERIAL_EPISODES);
    expect(report.latestEpisode).toBe(55);
    expect(report.resolvedThreads).toBe(1);
    expect(report.unresolvedThreads[0]?.threadId).toBe("fs-watch");
    expect(report.unresolvedThreads[0]?.unresolvedSpanEpisodes).toBe(52);
    expect(report.unresolvedThreads[0]?.severity).toBe("critical");
  });

  it("16. 부상 부위 변경(왼팔→오른팔) 충돌을 탐지한다", () => {
    const report = auditLongSeriesContinuity(SAMPLE_LONG_SERIAL_EPISODES);
    const injury = report.conflicts.find((c) => c.kind === "injury-location-mismatch");
    expect(injury).toBeDefined();
    expect(injury?.previousEpisodeNumber).toBe(3);
    expect(injury?.episodeNumber).toBe(48);
  });

  it("17. 동일 씬 의상 불일치와 호칭 불일치를 탐지한다", () => {
    const report = auditLongSeriesContinuity(SAMPLE_LONG_SERIAL_EPISODES);
    expect(report.conflicts.some((c) => c.kind === "outfit-mismatch")).toBe(true);
    expect(report.conflicts.some((c) => c.kind === "honorific-mismatch")).toBe(true);
  });

  it("18. 회상 표시 없는 시간선 역전을 탐지한다", () => {
    const report = auditLongSeriesContinuity(SAMPLE_LONG_SERIAL_EPISODES);
    const timeline = report.conflicts.find((c) => c.kind === "timeline-reversal");
    expect(timeline?.episodeNumber).toBe(48);
    expect(timeline?.severity).toBe("error");
  });

  it("19. 플래시백·명시적 환복·관계 전환·완치 기록 시 오탐 경고가 0건이다", () => {
    const clean: SeriesEpisodeRecord[] = [
      {
        episodeNumber: 1, storyDay: 10, summary: "1화",
        foreshadowing: [{ threadId: "f1", title: "열쇠", action: "plant" }],
        characters: [{ characterName: "수아", injuryKey: "cut", injuryLocation: "왼손", sceneId: "s1", outfit: "교복" }],
        honorifics: [{ speaker: "수아", target: "민호", speechLevel: "formal", titleUsed: "선배" }],
      },
      { episodeNumber: 2, storyDay: 3, isFlashback: true, summary: "2화 회상" },
      {
        episodeNumber: 3, storyDay: 12, summary: "3화 정상 전개",
        foreshadowing: [{ threadId: "f1", title: "열쇠", action: "resolve" }],
        characters: [{ characterName: "수아", injuryKey: "cut", injuryHealed: true, sceneId: "s1", outfit: "체육복", outfitChangedExplicitly: true }],
        honorifics: [{ speaker: "수아", target: "민호", speechLevel: "casual", titleUsed: "민호야", relationshipShifted: true }],
      },
    ];
    const report = auditLongSeriesContinuity(clean);
    expect(report.conflicts).toHaveLength(0);
    expect(report.unresolvedThreads).toHaveLength(0);
    expect(report.continuityHealthScore).toBe(100);
  });
});

describe("#10 IP 굿즈 · 이모티콘 1클릭 추출기", () => {
  it("20. 캐릭터 레이어 배경 제거 마스킹 및 타이트 경계 박스를 추출한다", () => {
    const mask = extractCharacterMaskAndBounds({
      characterName: "엘리시아",
      sourceWidthPx: 1000,
      sourceHeightPx: 1500,
    });
    expect(mask.backgroundRemoved).toBe(true);
    expect(mask.alphaMaskRatio + mask.transparentBackgroundRatio).toBeCloseTo(1, 3);
    expect(mask.tightBoundsPx.width).toBe(720);
  });

  it("21. 카카오톡 이모티콘 360×360 PNG 투명 배경 및 안전 여백(24px) 규격을 생성한다", () => {
    const input = { characterName: "엘리시아", sourceWidthPx: 1200, sourceHeightPx: 1600 };
    const spec = generateKakaoEmoticonSpec(input, extractCharacterMaskAndBounds(input));
    expect(spec.widthPx).toBe(360);
    expect(spec.heightPx).toBe(360);
    expect(spec.format).toBe("PNG");
    expect(spec.transparentBackground).toBe(true);
    expect(spec.contentBoxPx.width).toBeLessThanOrEqual(312);
    expect(spec.contentBoxPx.height).toBeLessThanOrEqual(312);
  });

  it("22. 아크릴 스탠드 3mm 도련선 칼선(CutContour) SVG 패스를 생성한다", () => {
    const cutline = generateAcrylicStandCutlineSvg({
      characterName: "카엘",
      sourceWidthPx: 1000,
      sourceHeightPx: 1400,
      standWidthMm: 70,
      standHeightMm: 120,
      bleedMm: 3,
    });
    expect(cutline.totalWidthMm).toBe(76);
    expect(cutline.totalHeightMm).toBe(129);
    expect(cutline.svgMarkup).toContain('data-spot-color="CutContour"');
    expect(cutline.svgMarkup).toContain('data-bleed-mm="3"');
    expect(cutline.cutlinePathD.endsWith("Z")).toBe(true);
  });

  it("23. 300DPI CMYK 인쇄 매니페스트 픽셀 환산과 TAC 잉크 총량 점검이 정확하다", () => {
    expect(rgbToCmyk(0, 0, 0).k).toBe(100);
    const bundle = buildIpGoodsExportBundle({
      characterName: "엘리시아",
      sourceWidthPx: 1440,
      sourceHeightPx: 1920,
      standWidthMm: 70,
      standHeightMm: 120,
      bleedMm: 3,
    });
    expect(bundle.printManifest.dpi).toBe(300);
    expect(bundle.printManifest.colorMode).toBe("CMYK");
    expect(bundle.printManifest.exportPixelSize.width).toBe(Math.round((76 / 25.4) * 300));
    expect(bundle.printManifest.spotLayers).toEqual(["CutContour", "WhiteUnderbase"]);

    const single = generatePrintCmykManifest(
      { characterName: "단색", sourceWidthPx: 800, sourceHeightPx: 800, paletteRgb: [{ nameKo: "시안", r: 0, g: 255, b: 255 }] },
      bundle.acrylicCutline,
    );
    expect(single.swatches[0]?.c).toBe(100);
    expect(single.allSwatchesTacSafe).toBe(true);
  });
});

describe("#11 스마트폰 QR 무료 왼손 단축키 리모컨", () => {
  it("24. 페어링 세션 토큰·6자리 PIN·QR 페이로드 URL·21×21 매트릭스를 생성한다", () => {
    const session = createPhoneRemoteSession({
      origin: "https://toonstudio.app",
      workId: "ep-55",
      nowMs: 1763700000000,
      nonce: "fixed",
    });
    expect(session.sessionToken).toMatch(/^TSR-/u);
    expect(session.pinCode).toMatch(/^\d{6}$/u);
    expect(session.qrPayloadUrl).toContain(`remoteSession=${session.sessionToken}`);
    const qr = buildDeterministicQrMatrix(session.qrPayloadUrl);
    expect(qr).toHaveLength(21);
    expect(qr[0]?.[0]).toBe(true);
    expect(qr[0]?.[20]).toBe(true);
    expect(qr[20]?.[0]).toBe(true);
  });

  it("25. 웹툰 작화 왼손 단축키 8종 매핑이 모두 정의된다", () => {
    expect(REMOTE_SHORTCUT_DEFINITIONS.map((s) => s.id)).toEqual([
      "undo", "redo", "brush-up", "brush-down", "eraser", "rotate-ccw", "rotate-cw", "layer-next",
    ]);
    expect(REMOTE_SHORTCUT_DEFINITIONS.every((s) => s.hapticPattern.length > 0)).toBe(true);
  });

  it("26. 유효 세션에서 단축키 실행 및 navigator.vibrate 햅틱 피드백을 호출한다", () => {
    const vibrateMock = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrateMock, configurable: true });

    const undoSpy = vi.fn();
    const brushUpSpy = vi.fn();
    const session = createPhoneRemoteSession({ nowMs: 1000, ttlMs: 60_000, nonce: "run" });
    const dispatcher = createPhoneRemoteDispatcher(session, { undo: undoSpy, "brush-up": brushUpSpy });

    const r1 = dispatcher.dispatch("undo", { nowMs: 2000, hapticEnabled: true });
    expect(r1.accepted).toBe(true);
    expect(r1.event?.hapticTriggered).toBe(true);
    expect(undoSpy).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith([18]);

    const r2 = dispatcher.dispatch("brush-up", { nowMs: 3000, hapticEnabled: false });
    expect(r2.accepted).toBe(true);
    expect(r2.event?.hapticTriggered).toBe(false);
    expect(brushUpSpy).toHaveBeenCalledTimes(1);
    expect(dispatcher.getHistory()).toHaveLength(2);
  });

  it("27. 불일치 토큰 및 만료 세션의 원격 명령을 거부한다", () => {
    const spy = vi.fn();
    const session = createPhoneRemoteSession({ nowMs: 1000, ttlMs: 5000, nonce: "guard" });
    const dispatcher = createPhoneRemoteDispatcher(session, { undo: spy });

    expect(dispatcher.dispatch("undo", { token: "TSR-WRONG", nowMs: 2000 }).accepted).toBe(false);
    expect(dispatcher.dispatch("undo", { nowMs: 9000 }).accepted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("StudioCreatorSuperpowersPanel UI · 지연 연결 · 코드 품질 계약", () => {
  it("28. C2PA 탭에서 위변조 탐지 테스트와 원본 복구를 전환할 수 있다", () => {
    render(<StudioCreatorSuperpowersPanel projectId="demo-55" />);
    expect(screen.getByTestId("c2pa-verify-status").textContent).toContain("무결성 검증 통과");
    fireEvent.click(screen.getByTestId("c2pa-toggle-tamper"));
    expect(screen.getByTestId("c2pa-verify-status").textContent).toContain("위변조 감지");
    fireEvent.click(screen.getByTestId("c2pa-toggle-tamper"));
    expect(screen.getByTestId("c2pa-verify-status").textContent).toContain("무결성 검증 통과");
  });

  it("29. 감정 자동 식자 탭에서 대본 편집 및 일본어/영어 SFX 전환이 즉시 반영된다", () => {
    render(<StudioCreatorSuperpowersPanel initialTab="lettering" />);
    fireEvent.click(document.querySelector('[data-lettering-locale="ja"]') as HTMLButtonElement);
    expect(screen.getByTestId("lettering-placement-list").textContent).toContain("ドゴォン!");
    fireEvent.click(document.querySelector('[data-lettering-locale="en"]') as HTMLButtonElement);
    expect(screen.getByTestId("lettering-placement-list").textContent).toContain("BOOM!");
  });

  it("30. 연재 떡밥 탭에서 새 복선을 추가하고 IP 굿즈 탭에서 규격을 즉시 확인한다", () => {
    render(<StudioCreatorSuperpowersPanel initialTab="continuity" />);
    expect(screen.getByTestId("continuity-conflicts-list").querySelectorAll("li").length).toBeGreaterThanOrEqual(4);
    fireEvent.change(screen.getByLabelText("새 복선 메모 추가"), { target: { value: "56화 은빛 단검의 문장" } });
    fireEvent.click(screen.getByRole("button", { name: "복선 추가" }));
    expect(screen.getByTestId("superpower-tabpanel-continuity").textContent).toContain("56화 은빛 단검의 문장");

    fireEvent.click(document.querySelector('[data-superpower-tab="goods"]') as HTMLButtonElement);
    expect(screen.getByTestId("goods-kakao-summary").textContent).toContain("360×360 PNG");
    expect(screen.getByTestId("goods-cmyk-summary").textContent).toContain("300DPI");
  });

  it("31. 스마트폰 QR 리모컨 탭에서 8종 단축키 실행 및 새 QR 재발급이 동작한다", () => {
    const onRemote = vi.fn();
    render(<StudioCreatorSuperpowersPanel initialTab="remote" onRemoteCommand={onRemote} />);
    const tokenBefore = screen.getByTestId("remote-session-token").textContent;
    fireEvent.click(document.querySelector('[data-remote-shortcut="eraser"]') as HTMLButtonElement);
    expect(onRemote).toHaveBeenCalledWith("eraser");
    expect(screen.getByTestId("remote-dispatch-status").textContent).toContain("지우개 전환");
    fireEvent.click(screen.getByRole("button", { name: "새 QR 발급" }));
    expect(screen.getByTestId("remote-session-token").textContent).not.toBe(tokenBefore);
  });

  it("32. StudioCollaborationSessionTools의 disclosure 열기 시 창작 슈퍼파워 패널이 지연 마운트되고 품질 계약을 지킨다", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/p/comic/edit"]}>
        <Routes>
          <Route path="/studio/p/:projectId/edit" element={<CollabToolsHarness />} />
        </Routes>
      </MemoryRouter>,
    );
    const disclosure = screen.getByTestId("studio-creator-superpowers-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-creator-superpowers-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("studio-creator-superpowers-panel")).not.toBeNull();
    });

    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/creator-superpowers");
    for (const file of [
      "c2pa-sfx-continuity-engine.ts",
      "ip-goods-phone-remote-engine.ts",
      "StudioCreatorSuperpowersPanel.tsx",
      "creator-superpowers.css",
    ]) {
      const content = readFileSync(path.join(dir, file), "utf8");
      expect(content.split("\n").length, `${file} <= 800`).toBeLessThanOrEqual(800);
      const stripped = content.replace(/\/\*[\s\S]*?\*\//gu, "");
      expect(stripped.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? [], `${file} HEX`).toEqual([]);
      expect(stripped, `${file} transition-all`).not.toContain("transition-all");
      expect(stripped.match(/transition(?:-property)?\s*:\s*[^;]*\ball\b/gu) ?? [], `${file} transition: all`).toEqual([]);
      if (!file.endsWith(".css")) expect(stripped, `${file} any`).not.toMatch(/:\s*any\b|as\s+any\b/u);
      else {
        expect(stripped, `${file} reduced-motion`).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u);
        expect(stripped, `${file} 44px`).toContain("min-height: 44px");
      }
    }
  });
});
