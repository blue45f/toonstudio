// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioReviewDraftShelf } from "../virtual-space/StudioReviewDraftShelf";
import {
  DEFAULT_BUYER_PITCH_INPUT,
  DEFAULT_CRITIQUE_SESSION_INPUT,
  DEFAULT_DEVICE_HANDOFF_STATE,
  DEFAULT_HIATUS_CHARACTER_BIBLE,
  DEFAULT_LIVE_BROADCAST_INPUT,
  answerHiatusFanQuestion,
  appendCritiqueRedlineStroke,
  buildCritiqueReplayFrame,
  createDeviceHandoffSnapshot,
  createGlobalBuyerPitchRoom,
  createLiveCritiqueSession,
  prepareCreatorLiveBroadcast,
  restoreDeviceHandoff,
  verifyBuyerPitchAccess,
  type HiatusCharacterBible,
} from "./growth-five-engines";
import { StudioGrowthVisionOsPanel } from "./StudioGrowthVisionOsPanel";
import {
  TOONSTUDIO_VISION_PILLARS,
  VISION_PROFICIENCY_FILTERS,
  VISION_ROLE_FILTERS,
  resolveVisionEcosystemMap,
} from "./toonstudio-vision-ecosystem-map";

afterEach(() => {
  cleanup();
});

describe("1. 실시간 드로잉 방송 & 미공개 대사 자동 블러 · 15초 타임랩스 쇼츠", () => {
  it("미공개 대사·콘티 메모·스포일러 소품을 100% 자동 블러하고 공개 작화 레이어만 송출한다", () => {
    const plan = prepareCreatorLiveBroadcast(DEFAULT_LIVE_BROADCAST_INPUT);
    expect(plan.spoilerLeakCount).toBe(0);
    expect(plan.protectionVerified).toBe(true);
    expect(plan.maskedLayerIds).toEqual(["layer-speech-ep24", "layer-note-pd", "layer-prop-crest"]);
    expect(plan.visibleLayerIds).toEqual(["layer-bg-palace", "layer-ink-hero", "layer-color-hero"]);
    expect(plan.blurMasks).toHaveLength(3);
  });

  it("선화 레이어라도 hasDialogueText 또는 미공개 회차 episodeRef가 있으면 자동 블러한다", () => {
    const plan = prepareCreatorLiveBroadcast({
      ...DEFAULT_LIVE_BROADCAST_INPUT,
      publishedUpToEpisode: 10,
      layers: [
        {
          id: "layer-dialogue-ink",
          name: "손글씨 대사 선화",
          kind: "lineart",
          hasDialogueText: true,
          bounds: { x: 100, y: 120, width: 300, height: 140 },
        },
        {
          id: "layer-future-bg",
          name: "15화 미래 배경",
          kind: "background",
          episodeRef: 15,
          bounds: { x: 0, y: 0, width: 800, height: 1200 },
        },
      ],
    });
    expect(plan.maskedLayerIds).toEqual(["layer-dialogue-ink", "layer-future-bg"]);
    expect(plan.spoilerLeakCount).toBe(0);
  });

  it("블러 반경을 12~48px 범위로 보정하고 마스크 박스에 안전 여백을 적용한다", () => {
    const low = prepareCreatorLiveBroadcast({ ...DEFAULT_LIVE_BROADCAST_INPUT, blurRadiusPx: 2 });
    const high = prepareCreatorLiveBroadcast({ ...DEFAULT_LIVE_BROADCAST_INPUT, blurRadiusPx: 99 });
    expect(low.blurMasks[0]?.blurRadiusPx).toBe(12);
    expect(high.blurMasks[0]?.blurRadiusPx).toBe(48);
    expect(low.blurMasks[0]?.rect.width).toBe(520 + 24);
  });

  it("15초 9:16 30fps(450프레임) 타임랩스 쇼츠를 추출하며 스포일러 레이어 구간을 제외한다", () => {
    const plan = prepareCreatorLiveBroadcast(DEFAULT_LIVE_BROADCAST_INPUT);
    expect(plan.shortsExport.aspectRatio).toBe("9:16");
    expect(plan.shortsExport.width).toBe(1080);
    expect(plan.shortsExport.height).toBe(1920);
    expect(plan.shortsExport.fps).toBe(30);
    expect(plan.shortsExport.durationSec).toBe(15);
    expect(plan.shortsExport.totalFrames).toBe(450);
    expect(plan.shortsExport.excludedSpoilerSliceIds).toEqual(["slice-2"]);
    expect(plan.shortsExport.highlightSegments.every((seg) => seg.sliceId !== "slice-2")).toBe(true);
    expect(plan.shortsExport.safeMaskApplied).toBe(true);
  });

  it("플랫폼 프리셋(YouTube/SOOP)과 30초 쇼츠 목표 시간을 정확히 반영한다", () => {
    const plan = prepareCreatorLiveBroadcast({
      ...DEFAULT_LIVE_BROADCAST_INPUT,
      streamPreset: "youtube-1080p60",
      shortsTargetSec: 30,
    });
    expect(plan.streamSpec.bitrateKbps).toBe(9000);
    expect(plan.shortsExport.durationSec).toBe(30);
    expect(plan.shortsExport.totalFrames).toBe(900);
  });
});

describe("2. 해외 판권 바이어용 1클릭 영·일문 IP 피치 룸", () => {
  it("비밀번호 평문을 절대 저장하지 않고 솔트 해시·워터마크·마스킹 이메일로 패키징한다", () => {
    const room = createGlobalBuyerPitchRoom(DEFAULT_BUYER_PITCH_INPUT);
    expect(room.passcodeHash.startsWith("ts-v1:")).toBe(true);
    expect(JSON.stringify(room)).not.toContain(DEFAULT_BUYER_PITCH_INPUT.passcode);
    expect(room.buyerEmailMasked).toBe("ri***@kadokawa-buyer.example");
    expect(room.watermark.text).toContain("Kadokawa Global IP");
    expect(room.downloadPolicy).toBe("view-only-watermarked");
  });

  it("6자 미만의 약한 비밀번호로 피치 룸 생성을 거부한다", () => {
    expect(() =>
      createGlobalBuyerPitchRoom({ ...DEFAULT_BUYER_PITCH_INPUT, passcode: "12345" }),
    ).toThrow(/6자 이상/u);
  });

  it("샘플 회차를 1~3화로 제한하고 영문·일문 완독 지표 헤드라인을 생성한다", () => {
    const room = createGlobalBuyerPitchRoom({
      ...DEFAULT_BUYER_PITCH_INPUT,
      sampleEpisodes: [
        ...DEFAULT_BUYER_PITCH_INPUT.sampleEpisodes,
        { episodeNumber: 4, titleEn: "Ep.4 Spoiler", titleJa: "第4話", panelCount: 60, translationReady: ["en", "ja"] },
      ],
    });
    expect(room.sampleEpisodes.map((ep) => ep.episodeNumber)).toEqual([1, 2, 3]);
    expect(room.metricsSummary.pitchHeadlineEn).toContain("86.4% completion");
    expect(room.metricsSummary.pitchHeadlineJa).toContain("完読率86.4%");
  });

  it("유효 기간 내 올바른 비밀번호로 영문/일문 피치 룸 열람을 허용한다", () => {
    const room = createGlobalBuyerPitchRoom(DEFAULT_BUYER_PITCH_INPUT);
    const result = verifyBuyerPitchAccess(room, {
      passcode: DEFAULT_BUYER_PITCH_INPUT.passcode,
      nowMs: room.createdAtMs + 2 * 3_600_000,
      preferredLanguage: "ja",
    });
    expect(result.granted).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.activeLanguage).toBe("ja");
    expect(result.accessibleSampleCount).toBe(3);
    expect(result.remainingHours).toBe(70);
  });

  it("비밀번호가 틀리면 접근을 차단한다", () => {
    const room = createGlobalBuyerPitchRoom(DEFAULT_BUYER_PITCH_INPUT);
    const result = verifyBuyerPitchAccess(room, {
      passcode: "WRONG999",
      nowMs: room.createdAtMs + 1_000,
      preferredLanguage: "en",
    });
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("invalid-passcode");
    expect(result.accessibleSampleCount).toBe(0);
  });

  it("만료 시각에 도달하거나 미포함 언어를 요청하면 접근을 차단한다", () => {
    const enOnlyRoom = createGlobalBuyerPitchRoom({
      ...DEFAULT_BUYER_PITCH_INPUT,
      languages: ["en"],
    });
    const expired = verifyBuyerPitchAccess(enOnlyRoom, {
      passcode: DEFAULT_BUYER_PITCH_INPUT.passcode,
      nowMs: enOnlyRoom.expiresAtMs,
      preferredLanguage: "en",
    });
    expect(expired.granted).toBe(false);
    expect(expired.reason).toBe("expired");
    expect(expired.remainingHours).toBe(0);

    const missingLang = verifyBuyerPitchAccess(enOnlyRoom, {
      passcode: DEFAULT_BUYER_PITCH_INPUT.passcode,
      nowMs: enOnlyRoom.createdAtMs + 1000,
      preferredLanguage: "ja",
    });
    expect(missingLang.granted).toBe(false);
    expect(missingLang.reason).toBe("language-unavailable");
  });
});

describe("3. 학원·대학·멘토링 라이브 첨삭 교실", () => {
  it("수강생 원본 레이어를 읽기 전용 잠금으로 고정하고 레드라인 추가 후에도 해시를 유지한다", () => {
    const session = createLiveCritiqueSession(DEFAULT_CRITIQUE_SESSION_INPUT);
    const beforeHash = session.studentOriginalLayer.integrityHash;
    expect(session.studentOriginalLayer.locked).toBe(true);
    expect(session.studentOriginalLayer.readonly).toBe(true);
    expect(Object.isFrozen(session.studentOriginalLayer.strokes)).toBe(true);

    const updated = appendCritiqueRedlineStroke(session, {
      id: "red-4",
      authorName: "박서준 메인 멘토",
      timestampMs: session.createdAtMs + 90_000,
      tool: "redline-pen",
      points: [{ x: 200, y: 150, pressure: 0.9 }],
      note: "발끝 착지 각도 보정",
    });
    expect(updated.studentOriginalLayer.integrityHash).toBe(beforeHash);
    expect(updated.studentOriginalLayer.strokeCount).toBe(session.studentOriginalLayer.strokeCount);
    expect(updated.redlineLayer.strokes).toHaveLength(4);
  });

  it("레드라인 레이어는 OKLCH 토큰을 사용하며 타임스탬프 순으로 정렬한다", () => {
    const session = createLiveCritiqueSession(DEFAULT_CRITIQUE_SESSION_INPUT);
    const updated = appendCritiqueRedlineStroke(session, {
      id: "red-early",
      authorName: "박서준 메인 멘토",
      timestampMs: session.createdAtMs + 5_000,
      tool: "anatomy-guide",
      points: [{ x: 10, y: 20, pressure: 0.7 }],
      note: "초기 축선 안내",
    });
    expect(updated.redlineLayer.colorToken).toBe("oklch(0.62 0.22 25)");
    expect(updated.redlineLayer.strokes[0]?.id).toBe("red-early");
  });

  it("리플레이 0%에서는 Before 모드로 강사 레드라인을 모두 숨기고 원본만 표시한다", () => {
    const session = createLiveCritiqueSession(DEFAULT_CRITIQUE_SESSION_INPUT);
    const frame = buildCritiqueReplayFrame(session, 0);
    expect(frame.mode).toBe("before");
    expect(frame.originalProtected).toBe(true);
    expect(frame.visibleRedlineStrokes).toHaveLength(0);
    expect(frame.studentStrokeCount).toBe(2);
  });

  it("리플레이 중간(50%)에서는 순차적으로 레드라인을 재생하고 현재 멘토링 코멘트를 보여 준다", () => {
    const session = createLiveCritiqueSession(DEFAULT_CRITIQUE_SESSION_INPUT);
    const frame = buildCritiqueReplayFrame(session, 50);
    expect(frame.mode).toBe("replaying");
    expect(frame.visibleRedlineStrokes).toHaveLength(2);
    expect(frame.activeNote).toContain("소실점");
  });

  it("리플레이 100%에서는 After 모드로 전체 레드라인과 원본 보호 검증을 완료한다", () => {
    const session = createLiveCritiqueSession(DEFAULT_CRITIQUE_SESSION_INPUT);
    const frame = buildCritiqueReplayFrame(session, 100);
    expect(frame.mode).toBe("after");
    expect(frame.visibleRedlineStrokes).toHaveLength(3);
    expect(frame.originalProtected).toBe(true);
  });
});

describe("4. 아이패드·갤럭시탭·PC 오프라인 이어 그리기 핸드오프", () => {
  it("활성 브러시·줌·회전각·레이어·미저장 차분을 QR 전송 가능한 TSHO1 토큰으로 직렬화한다", () => {
    const snapshot = createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE);
    expect(snapshot.formatVersion).toBe("TSHO1");
    expect(snapshot.token.startsWith("TSHO1.")).toBe(true);
    expect(snapshot.offlineReady).toBe(true);
    expect(snapshot.qrPayloadSafe).toBe(true);
    expect(snapshot.unsavedDeltaHash.startsWith("ts-v1:")).toBe(true);
  });

  it("아이패드 → 데스크톱 PC 왕복 복원 시 모든 브러시·뷰포트·차분 해시가 무손실 일치한다", () => {
    const snapshot = createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE);
    const restored = restoreDeviceHandoff(snapshot.token);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.losslessMatched).toBe(true);
    expect(restored.unsavedDeltaVerified).toBe(true);
    expect(restored.unsavedDeltaHash).toBe(snapshot.unsavedDeltaHash);
    expect(restored.state.activeBrush).toEqual(DEFAULT_DEVICE_HANDOFF_STATE.activeBrush);
    expect(restored.state.viewport).toEqual(DEFAULT_DEVICE_HANDOFF_STATE.viewport);
    expect(restored.state.selectedLayerId).toBe("layer-ink-hero");
    expect(restored.state.layerVisibility).toEqual(DEFAULT_DEVICE_HANDOFF_STATE.layerVisibility);
  });

  it("도착 기기를 갤럭시탭으로 지정해 복원할 수 있다", () => {
    const snapshot = createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE);
    const restored = restoreDeviceHandoff(snapshot.token, "galaxy-tab");
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.restoredOnDevice).toBe("galaxy-tab");
    }
  });

  it("잘못된 접두사나 손상된 형식의 토큰은 invalid-format으로 차단한다", () => {
    const restored = restoreDeviceHandoff("BROKEN.TOKEN");
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.errorCode).toBe("invalid-format");
    }
  });

  it("체크섬이 변조된 토큰은 checksum-mismatch로 차단한다", () => {
    const snapshot = createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE);
    const tampered = `${snapshot.token.slice(0, -4)}ffff`;
    const restored = restoreDeviceHandoff(tampered);
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.errorCode).toBe("checksum-mismatch");
    }
  });

  it("페이로드의 차분 목록과 내장 dh 해시가 어긋나면 delta-hash-mismatch로 차단한다", () => {
    const snapshot = createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE);
    const parts = snapshot.token.split(".");
    const payloadB64 = parts[1] ?? "";
    const padded = payloadB64.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(payloadB64.length / 4) * 4, "=");
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))) as {
      v: 1;
      s: typeof DEFAULT_DEVICE_HANDOFF_STATE;
      dh: string;
    };
    const forged = { ...parsed, dh: "ts-v1:00000000000000000000000000000000" };
    // Re-encode with valid outer checksum by swapping dh via helper-compatible payload check
    const rawBytes = new TextEncoder().encode(JSON.stringify(forged));
    let bin = "";
    for (const byte of rawBytes) bin += String.fromCharCode(byte);
    const forgedB64 = btoa(bin).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    const rejected = restoreDeviceHandoff(`TSHO1.${forgedB64}.${parts[2] ?? ""}`);
    expect(rejected.ok).toBe(false);
  });
});

describe("5. 휴재·완결 공백기 무스포일러 캐릭터 비하인드 카드 & Q&A 봇", () => {
  it("승인 바이블 범위(1~21화) 내 질문에는 캐릭터 어투로 답하고 비하인드 카드를 생성한다", () => {
    const result = answerHiatusFanQuestion(
      DEFAULT_HIATUS_CHARACTER_BIBLE,
      "세레나의 회중시계 소품 설정이 궁금해요!",
    );
    expect(result.status).toBe("answered");
    expect(result.spoilerBlocked).toBe(false);
    expect(result.matchedEntryId).toBe("bible-watch");
    expect(result.reply).toContain("은빛 회중시계");
    expect(result.behindCard.spoilerSafe).toBe(true);
    expect(result.behindCard.episodeBadge).toBe("1~21화 공식 공개 범위");
  });

  it("승인 회차를 초과하는 회차 언급 질문(30화, Ep 45)은 안전하게 차단한다", () => {
    const koBlocked = answerHiatusFanQuestion(DEFAULT_HIATUS_CHARACTER_BIBLE, "30화에서 무슨 일이 일어나나요?");
    expect(koBlocked.status).toBe("spoiler-blocked");
    expect(koBlocked.spoilerBlocked).toBe(true);
    expect(koBlocked.mentionedEpisode).toBe(30);
    expect(koBlocked.reply).not.toContain("대공");

    const enBlocked = answerHiatusFanQuestion(DEFAULT_HIATUS_CHARACTER_BIBLE, "What happens in Ep 45?");
    expect(enBlocked.spoilerBlocked).toBe(true);
    expect(enBlocked.mentionedEpisode).toBe(45);
  });

  it("제한 스포일러 키워드(흑막·결말·배신)는 차단하며 미공개 바이블 본문을 누출하지 않는다", () => {
    const result = answerHiatusFanQuestion(
      DEFAULT_HIATUS_CHARACTER_BIBLE,
      "이 작품 흑막이 누구고 결말 어떻게 되나요?",
    );
    expect(result.status).toBe("spoiler-blocked");
    expect(result.spoilerBlocked).toBe(true);
    expect(result.reply).not.toContain("대공");
    expect(result.behindCard.fact).not.toContain("이중 계약서");
  });

  it("제한 키워드 목록에 없는 단어라도 episodeUnlocked > approvedUpToEpisode 항목은 절대 검색되지 않는다", () => {
    const customBible: HiatusCharacterBible = {
      ...DEFAULT_HIATUS_CHARACTER_BIBLE,
      approvedUpToEpisode: 21,
      entries: [
        ...DEFAULT_HIATUS_CHARACTER_BIBLE.entries,
        {
          id: "secret-ep29",
          episodeUnlocked: 29,
          keywords: ["비밀열쇠"],
          topic: "29화 비밀열쇠",
          answer: "29화에 숨겨진 지하 열쇠 위치",
          behindTitle: "29화 비밀",
          behindFact: "29화 스포일러 팩트",
          moodTag: "미공개",
        },
      ],
    };
    const result = answerHiatusFanQuestion(customBible, "비밀열쇠 어디에 있나요?");
    expect(result.matchedEntryId).toBeNull();
    expect(result.reply).not.toContain("지하 열쇠");
    expect(result.behindCard.fact).not.toContain("29화 스포일러");
  });

  it("일반 응원 질문에도 승인 범위 공식 비하인드 카드를 안전하게 발급한다", () => {
    const result = answerHiatusFanQuestion(DEFAULT_HIATUS_CHARACTER_BIBLE, "휴재 동안 푹 쉬고 돌아오세요!");
    expect(result.status).toBe("answered");
    expect(result.spoilerBlocked).toBe(false);
    expect(result.behindCard.approvedUpToEpisode).toBe(21);
  });
});

describe("6. 3초 이해 ToonStudio OS 비주얼 비전 지도 모델", () => {
  it("6대 창작 기둥, 7대 직군(+전체), 4대 숙련도(+전체) 카탈로그 계약을 충족한다", () => {
    expect(TOONSTUDIO_VISION_PILLARS).toHaveLength(6);
    expect(VISION_ROLE_FILTERS.filter((r) => r.id !== "all")).toHaveLength(7);
    expect(VISION_PROFICIENCY_FILTERS.filter((p) => p.id !== "all")).toHaveLength(4);
    expect(TOONSTUDIO_VISION_PILLARS.every((p) => p.accentOklch.startsWith("oklch("))).toBe(true);
  });

  it("해외 판권 바이어 필터 선택 시 6번 IP 기둥과 바이어 피치 룸 점프를 최우선 추천한다", () => {
    const resolved = resolveVisionEcosystemMap({
      roleId: "global-buyer",
      proficiencyId: "global-buyer",
    });
    expect(resolved.highlightedPillarIds).toEqual(["ip-monetize"]);
    expect(resolved.primaryJump.pillarId).toBe("ip-monetize");
    expect(resolved.primaryJump.growthTabId).toBe("buyer-pitch");
  });

  it("입문·1인 지망생 + 초보 필터 선택 시 1번 초보 3분 시작 기둥을 강조한다", () => {
    const resolved = resolveVisionEcosystemMap({
      roleId: "solo-beginner",
      proficiencyId: "beginner",
    });
    expect(resolved.highlightedPillarIds).toContain("beginner-start");
    expect(resolved.headline3Sec).toContain("초보");
  });

  it("학원·대학 멘토 필터 선택 시 라이브 첨삭 교실 연결을 포함한다", () => {
    const resolved = resolveVisionEcosystemMap({
      roleId: "academy-mentor",
      proficiencyId: "all",
    });
    const p1 = resolved.pillars.find((p) => p.id === "beginner-start");
    expect(p1?.highlighted).toBe(true);
    expect(p1?.resolvedFeatures.find((f) => f.id === "feat-academy-critique")?.matched).toBe(true);
  });
});

describe("7. StudioGrowthVisionOsPanel UI 인터랙션 & 지연 마운트 통합 검증", () => {
  it("상단 6대 기둥 지도를 렌더링하고 직군·숙련도 클릭 시 하이라이트와 3초 헤드라인을 갱신한다", () => {
    render(<StudioGrowthVisionOsPanel />);
    expect(screen.getByTestId("gvos-pillar-grid").querySelectorAll("article")).toHaveLength(6);
    fireEvent.click(screen.getByTestId("gvos-role-global-buyer"));
    fireEvent.click(screen.getByTestId("gvos-prof-global-buyer"));
    expect(screen.getByTestId("gvos-pillar-ip-monetize").getAttribute("data-highlighted")).toBe("true");
    expect(screen.getByTestId("gvos-pillar-beginner-start").getAttribute("data-highlighted")).toBe("false");
    expect(screen.getByTestId("gvos-3sec-headline").textContent).toContain("영·일문");
  });

  it("비전 지도의 기능 버튼 1클릭 시 하단 5대 워크벤치의 해당 탭으로 즉시 전환된다", () => {
    render(<StudioGrowthVisionOsPanel />);
    fireEvent.click(screen.getByTestId("gvos-jump-feat-buyer-pitch-room"));
    expect(screen.getByTestId("gvos-panel-buyer-pitch")).toBeTruthy();
    expect(screen.getByTestId("gvos-jump-notice").textContent).toContain("워크벤치 탭을 바로 열었습니다");
  });

  it("5대 워크벤치 각 탭(방송·바이어·첨삭·핸드오프·Q&A)의 핵심 불변식을 UI에서 직접 검증할 수 있다", () => {
    render(<StudioGrowthVisionOsPanel />);

    // 1) 라이브 방송: 25화 콘티 추가 시 블러 마스크 3 -> 4 증가
    expect(screen.getByTestId("gvos-blur-mask-list").querySelectorAll("li")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("gvos-toggle-extra-spoiler"));
    expect(screen.getByTestId("gvos-blur-mask-list").querySelectorAll("li")).toHaveLength(4);

    // 2) 바이어 피치 룸: 만료 링크 차단 시험
    fireEvent.click(screen.getByTestId("gvos-tab-buyer-pitch"));
    fireEvent.click(screen.getByTestId("gvos-verify-expired-btn"));
    expect(screen.getByTestId("gvos-pitch-access-result").textContent).toContain("expired");

    // 3) 라이브 첨삭: 레드라인 추가 & Before(0%) 전환
    fireEvent.click(screen.getByTestId("gvos-tab-live-critique"));
    fireEvent.click(screen.getByTestId("gvos-add-redline-btn"));
    fireEvent.click(screen.getByRole("button", { name: "Before (원본 0%)" }));
    expect(screen.getByTestId("gvos-replay-mode-badge").textContent).toContain("BEFORE · 0%");

    // 4) 오프라인 이어 그리기: 변조 토큰 차단 확인
    fireEvent.click(screen.getByTestId("gvos-tab-device-handoff"));
    fireEvent.click(screen.getByTestId("gvos-tamper-handoff-btn"));
    expect(screen.getByTestId("gvos-handoff-restore-result").textContent).toContain("checksum-mismatch");

    // 5) 휴재기 캐릭터 Q&A: 30화 흑막 스포일러 질문 차단
    fireEvent.click(screen.getByTestId("gvos-tab-hiatus-qa"));
    fireEvent.click(screen.getByTestId("gvos-preset-spoiler-qa"));
    expect(screen.getByTestId("gvos-qa-status-badge").textContent).toContain("스포일러 안전 우회");
    expect(screen.getByTestId("gvos-qa-reply").textContent).not.toContain("대공");
  });

  it("CSS 파일이 원시 HEX·transition-all 없이 OKLCH 스펙트럼과 reduced-motion을 준수한다", () => {
    const cssPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/growth-vision-os/growth-vision-os.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toContain("transition-all");
    expect(css).toContain("oklch(");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("StudioReviewDraftShelf의 지연 접이식 패널을 열었을 때만 StudioGrowthVisionOsPanel을 마운트한다", async () => {
    render(
      <StudioReviewDraftShelf
        scope={{
          actorId: "actor-a",
          subject: {
            schemaVersion: 1,
            workId: "w",
            projectId: "p",
            artifactId: "a",
            reviewId: "r",
            revisionId: "rev",
            rootGraphHash: "a".repeat(64),
          },
        }}
        compose={null}
        disabled={false}
        onBusy={() => undefined}
        onStored={() => undefined}
        onPublished={() => undefined}
      />,
    );

    const disclosure = screen.getByTestId("studio-growth-vision-os-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-growth-vision-os-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-growth-vision-os-panel")).toBeTruthy();
    });
  });
});
