// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deconstructFreshIdeasThesis, ingestFreshIdeasSources } from "./fresh-ideas-ingest-deconstruct";
import { generateFiveOrthogonalLenses } from "./fresh-ideas-lenses-engine";
import {
  EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG,
  FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO,
  countEpisodeDialogueChars,
  extractEpisodeTelemetryForFreshIdeas,
  type EpisodeTelemetrySourceInput,
} from "./fresh-ideas-episode-telemetry-adapter";
import {
  V3_FIVE_LENS_ANGLE_LABELS_KO,
  buildThreeCutStoryboardSeedPacket,
} from "./fresh-ideas-storyboard-seed-packet";
import { StudioFreshIdeasV2WorkbenchCard } from "./StudioFreshIdeasV2WorkbenchCard";

const { database } = vi.hoisted(() => {
  let value: string | null = null;
  return {
    database: {
      kvGet: vi.fn(async () => value),
      kvSet: vi.fn(async (_namespace: string, _key: string, raw: string) => { value = raw; }),
      reset: () => { value = null; },
    },
  };
});

vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => database,
}));

const SAMPLE_REF_URL = "https://example.com/studio/sunken-library-ep1";

function createMeasuredEpisodeInput(): EpisodeTelemetrySourceInput {
  return {
    episodeTitleKo: "침수 도서관 1화",
    episodeNumber: 1,
    pages: [
      {
        id: "page-1",
        groups: [
          { id: "grp-hidden-parent", hidden: true },
          { id: "grp-hidden-child", parentId: "grp-hidden-parent" },
        ],
        elements: [
          // 컷 1: 대사 10자 + 3D 배경 2패스(중복 카운트 금지)
          { id: "frame-1", type: "frame", x: 0, y: 0, width: 800, height: 600 },
          { id: "bg-1a", type: "image", frameClipId: "frame-1", bg3dLtBundleId: "lt-01", bg3dLtRole: "line" },
          { id: "bg-1b", type: "image", frameClipId: "frame-1", bg3dLtBundleId: "lt-01", bg3dLtRole: "tone" },
          { id: "bub-1", type: "bubble", x: 120, y: 140, width: 220, height: 100, text: "서연,\n문 열어줘" }, // 공백·줄바꿈 제외 7자
          { id: "txt-1", type: "text", frameId: "frame-1", text: "지금 바로" }, // 4자 -> 컷 1 총 11자
          // 편집용 스티키 메모·숨김 요소는 실측에서 제외되어야 한다.
          { id: "note-1", type: "text", frameId: "frame-1", stickyNotePresetId: "yellow", text: "연출 메모 제외 대상" },
          { id: "hidden-bub", type: "bubble", frameId: "frame-1", groupId: "grp-hidden-child", text: "숨김 레이어 대사" },
          // 컷 2: 무대사 액션 컷 (선화 + 집중선, 대사 0자)
          { id: "frame-2", type: "frame", x: 0, y: 650, width: 800, height: 600 },
          { id: "draw-2", type: "draw", points: [100, 720, 420, 980] },
          { id: "speed-2", type: "speedLines", x: 50, y: 700, width: 700, height: 480 },
          { id: "blank-bub", type: "bubble", frameId: "frame-2", text: "   \n  " },
          // 숨김 프레임은 컷 수에서 제외
          { id: "frame-hidden", type: "frame", x: 0, y: 1300, width: 800, height: 400, hidden: true },
        ],
      },
      {
        id: "page-2",
        elements: [
          // 컷 3: 3D 배경 무대사 액션 컷 (대사 0자, bg3dScene 포함)
          { id: "frame-3", type: "frame", x: 0, y: 0, width: 800, height: 600 },
          { id: "bg-3", type: "image", x: 20, y: 20, width: 760, height: 560, bg3dScene: { id: "scene-hall" } },
          // 컷 4: 일반 2D 대사 컷 (공백 제외 9자)
          { id: "frame-4", type: "frame", x: 0, y: 650, width: 800, height: 600 },
          { id: "bub-4", type: "bubble", x: 160, y: 760, width: 260, height: 120, text: "은인장 편지였군" }, // 7자
          { id: "txt-4", type: "text", x: 440, y: 900, width: 120, height: 60, text: "끝!" }, // 2자 -> 컷 4 총 9자
        ],
      },
    ],
  };
}

function createFiveLensesFixture() {
  const bundle = ingestFreshIdeasSources([
    {
      id: "src-v3-1",
      title: "침수 도서관 1화 연출 리포트",
      kind: "article",
      content:
        "서연이 침수 도서관 문턱에서 은인장 편지를 줍지만, 등불지기 길드의 통제 규칙 때문에 진실을 바로 말하지 못한다. 3D 배경 컷 비중이 50%를 넘으면 인물 선굵기 정합이 흔들리기 쉽다.",
      url: SAMPLE_REF_URL,
    },
  ]);
  const decon = deconstructFreshIdeasThesis(bundle);
  return { bundle, lenses: generateFiveOrthogonalLenses(bundle, decon) };
}

beforeEach(() => {
  database.reset();
  database.kvSet.mockClear();
});

afterEach(cleanup);

describe("fresh-ideas-episode-telemetry-adapter (#076–#080)", () => {
  it("열린 원고 페이지·컷 데이터에서 컷 수·평균 대사·3D 배경 비율·무대사 액션 비율을 순수 실측 추출한다", () => {
    expect(countEpisodeDialogueChars("서연,\n문 열어줘")).toBe(7);

    const snapshot = extractEpisodeTelemetryForFreshIdeas(createMeasuredEpisodeInput());

    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.isEmptyDocument).toBe(false);
    expect(snapshot.mode).toBe("measured-episode");
    expect(snapshot.pageCount).toBe(2);
    expect(snapshot.cutCount).toBe(4);
    // 컷1(11자) + 컷2(0자) + 컷3(0자) + 컷4(9자) = 총 20자 / 4컷 = 5.0자/컷
    expect(snapshot.totalDialogueChars).toBe(20);
    expect(snapshot.averageDialogueCharsPerCut).toBe(5);
    expect(snapshot.dialogueCutCount).toBe(2);
    // 컷1, 컷3 = 2/4 = 50%
    expect(snapshot.bg3dCutCount).toBe(2);
    expect(snapshot.bg3dCutRatio).toBe(0.5);
    expect(snapshot.bg3dCutPercent).toBe(50);
    // 컷2, 컷3 = 2/4 = 50%
    expect(snapshot.silentActionCutCount).toBe(2);
    expect(snapshot.silentActionCutRatio).toBe(0.5);
    expect(snapshot.silentActionCutPercent).toBe(50);
    expect(snapshot.unmeasuredFields).toHaveLength(0);
    expect(snapshot.metricsDisplayKo.cutCountKo).toBe("4컷");
    expect(snapshot.metricsDisplayKo.averageDialogueCharsKo).toBe("5자/컷");
    expect(snapshot.metricsDisplayKo.bg3dCutRatioKo).toBe("50% (2/4컷)");
    expect(snapshot.metricsDisplayKo.silentActionCutRatioKo).toBe("50% (2/4컷)");
    expect(snapshot.badgeSummaryKo).not.toContain("NaN");
  });

  it("히든 디테일(#080): 빈 새 문서(0컷)에서는 NaN·0 나눗셈 없이 첫 1화 오프닝 3컷 설계 모드로 안전 폴백하고 [측정 필요]를 명시한다", () => {
    const emptyCases: readonly (EpisodeTelemetrySourceInput | null | undefined)[] = [
      undefined,
      null,
      { episodeTitleKo: "새 빈 원고", pages: [] },
      { episodeTitleKo: "빈 페이지 원고", pages: [{ id: "blank-1", elements: [] }] },
      {
        episodeTitleKo: "숨김 프레임만 있는 원고",
        pages: [{ id: "blank-2", elements: [{ id: "f-hide", type: "frame", hidden: true }] }],
      },
    ];

    for (const emptyInput of emptyCases) {
      const snapshot = extractEpisodeTelemetryForFreshIdeas(emptyInput);
      expect(snapshot.isEmptyDocument).toBe(true);
      expect(snapshot.cutCount).toBe(0);
      expect(snapshot.mode).toBe("first-episode-opening-3cut");
      expect(snapshot.modeLabelKo).toBe(FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO);
      expect(snapshot.averageDialogueCharsPerCut).toBeNull();
      expect(snapshot.bg3dCutRatio).toBeNull();
      expect(snapshot.bg3dCutPercent).toBeNull();
      expect(snapshot.silentActionCutRatio).toBeNull();
      expect(snapshot.silentActionCutPercent).toBeNull();
      expect(snapshot.unmeasuredFields).toEqual([
        "averageDialogueCharsPerCut",
        "bg3dCutRatio",
        "silentActionCutRatio",
      ]);
      expect(snapshot.metricsDisplayKo.cutCountKo).toBe("0컷 (빈 원고)");
      expect(snapshot.metricsDisplayKo.averageDialogueCharsKo).toBe(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
      expect(snapshot.metricsDisplayKo.bg3dCutRatioKo).toBe(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
      expect(snapshot.metricsDisplayKo.silentActionCutRatioKo).toBe(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
      expect(snapshot.badgeSummaryKo).toContain(FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO);
      expect(snapshot.badgeSummaryKo).toContain(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
      expect(snapshot.badgeSummaryKo).not.toMatch(/NaN|Infinity/u);
      expect(snapshot.sourceMetricsSummaryKo).not.toMatch(/NaN|Infinity/u);
    }
  });

  it("명시적 cuts 입력과 비유한 수치(NaN) 및 풀블리드 단일 페이지를 안전하게 처리한다", () => {
    const explicit = extractEpisodeTelemetryForFreshIdeas({
      episodeTitleKo: "컷 리스트 원고",
      cuts: [
        { id: "c1", dialogueCharCount: Number.NaN, hasBg3d: true },
        { id: "c2", dialogueTexts: ["가나다라", "마바"], hasBg3d: false },
        { id: "c3", dialogueTexts: [], isSilentAction: true },
      ],
    });
    expect(explicit.cutCount).toBe(3);
    expect(explicit.totalDialogueChars).toBe(6);
    expect(explicit.averageDialogueCharsPerCut).toBe(2);
    expect(explicit.bg3dCutPercent).toBe(33.3);
    expect(explicit.silentActionCutPercent).toBe(66.7);

    const fullBleed = extractEpisodeTelemetryForFreshIdeas({
      pages: [
        {
          id: "fb-1",
          elements: [
            { id: "img-1", type: "image", layerRole: "bg3d" },
            { id: "b-1", type: "bubble", text: "한 컷 전개" },
          ],
        },
      ],
    });
    expect(fullBleed.cutCount).toBe(1);
    expect(fullBleed.bg3dCutPercent).toBe(100);
    expect(fullBleed.silentActionCutPercent).toBe(0);
    expect(fullBleed.averageDialogueCharsPerCut).toBe(4);
  });
});

describe("fresh-ideas-storyboard-seed-packet (5렌즈 → 결정론 3컷 콘티 시드)", () => {
  it("5대 렌즈(역발상·현장 공감·실측 근거·실전 플레이북·히든 디테일) 각각을 결정론 3컷 패킷으로 변환한다", () => {
    const { lenses } = createFiveLensesFixture();
    const measuredTelemetry = extractEpisodeTelemetryForFreshIdeas(createMeasuredEpisodeInput());
    const seenPacketIds = new Set<string>();
    const expectedAngles = ["역발상", "현장 공감", "실측 근거", "실전 플레이북", "히든 디테일"];

    expect(Object.values(V3_FIVE_LENS_ANGLE_LABELS_KO)).toEqual(expectedAngles);
    expect(lenses).toHaveLength(5);

    lenses.forEach((lens, index) => {
      const first = buildThreeCutStoryboardSeedPacket({
        lens,
        telemetry: measuredTelemetry,
        sourceTitle: "침수 도서관 1화",
        register: "haeyo",
      });
      const second = buildThreeCutStoryboardSeedPacket({
        lens,
        telemetry: measuredTelemetry,
        sourceTitle: "침수 도서관 1화",
        register: "haeyo",
      });

      // 결정론 검증: 동일 입력 -> 바이트 수준 동일 결과
      expect(first).toEqual(second);
      expect(first.v3LensAngleKo).toBe(expectedAngles[index]);
      expect(seenPacketIds.has(first.packetId)).toBe(false);
      seenPacketIds.add(first.packetId);

      // 정확히 3컷 + 구도·대사 초안·조명 힌트 + 스크립트/캔버스 시드 호환
      expect(first.cuts).toHaveLength(3);
      expect(first.parsedScript.hasExplicitMarkers).toBe(true);
      expect(first.parsedScript.cuts).toHaveLength(3);
      expect(first.canvasSeed.totalCutCount).toBe(3);
      expect(first.canvasSeed.totalDialogueCount).toBe(3);
      expect(first.preservedUrls).toEqual([SAMPLE_REF_URL]);
      expect(first.clipboardMarkdownKo).toContain(SAMPLE_REF_URL);
      expect(first.scriptText).not.toContain("!");
      expect(first.clipboardMarkdownKo).not.toMatch(/[🔥📖📊✅🎯💡✨]/u);

      for (const cut of first.cuts) {
        expect(cut.compositionKo.length).toBeGreaterThan(8);
        expect(cut.dialogueDraftKo.length).toBeGreaterThan(6);
        expect(cut.lightingHintKo.length).toBeGreaterThan(8);
        expect(cut.dialogueCharacterCount).toBeGreaterThan(0);
      }
    });
  });

  it("0컷 빈 문서에서 첫 1화 오프닝 3컷 설계 모드 패킷으로 폴백하고 [측정 필요]를 유지한다", () => {
    const { lenses } = createFiveLensesFixture();
    const dataLens = lenses.find((l) => l.id === "data-evidence-angle")!;
    const packet = buildThreeCutStoryboardSeedPacket({
      lens: dataLens,
      telemetrySource: { episodeTitleKo: "새 프로젝트 1화", pages: [] },
      register: "haera",
    });

    expect(packet.generationMode).toBe("first-episode-opening-3cut");
    expect(packet.generationModeLabelKo).toBe(FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO);
    expect(packet.telemetryBasisKo).toContain(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
    expect(packet.telemetryBasisKo).not.toMatch(/NaN|Infinity/u);
    expect(packet.cuts).toHaveLength(3);
    expect(packet.cuts[0].beatRoleKo).toContain("1화 오프닝");
    expect(packet.cuts[0].bg3dGuidanceKo).toContain(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
    expect(packet.cuts[1].dialogueDraftKo).toContain(EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG);
  });
});

describe("StudioFreshIdeasV2WorkbenchCard v3 실측 배지 & 1클릭 3컷 콘티 브리지", () => {
  it("빈 새 문서(0컷)에서는 오프닝 3컷 설계 모드와 [측정 필요] 배지를 표시하고 1클릭 3컷 패킷을 생성한다", async () => {
    const onCreateStoryboardSeedPacket = vi.fn();
    const onStatusChange = vi.fn();
    render(
      <StudioFreshIdeasV2WorkbenchCard
        sourceTitle="새 연재 1화 초안"
        sourceSummaryKo="주인공이 금지된 서고의 문을 처음 여는 장면을 설계한다."
        episodeTelemetrySource={{ episodeTitleKo: "새 연재 1화 초안", pages: [] }}
        onCreateStoryboardSeedPacket={onCreateStoryboardSeedPacket}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByTestId("fresh-ideas-v3-telemetry-mode").textContent).toBe(
      FIRST_EPISODE_OPENING_3CUT_MODE_LABEL_KO,
    );
    expect(screen.getByTestId("fresh-ideas-v3-metric-cuts").textContent).toContain("0컷 (빈 원고)");
    expect(screen.getByTestId("fresh-ideas-v3-metric-dialogue").textContent).toContain(
      EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG,
    );
    expect(screen.getByTestId("fresh-ideas-v3-metric-bg3d").textContent).toContain(
      EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG,
    );
    expect(screen.getByTestId("fresh-ideas-v3-metric-silent").textContent).toContain(
      EPISODE_TELEMETRY_MEASUREMENT_NEEDED_TAG,
    );
    expect(screen.getByTestId("fresh-ideas-v2-capability-badge").textContent).toContain("Unslop 100점");

    const generateBtn = screen.getByTestId("fresh-ideas-v3-generate-storyboard-btn");
    expect(generateBtn.className).toContain("min-h-11");
    expect(generateBtn.className).toContain("motion-reduce:transition-none");
    fireEvent.click(generateBtn);

    await waitFor(() => expect(onCreateStoryboardSeedPacket).toHaveBeenCalledTimes(1));
    const packet = onCreateStoryboardSeedPacket.mock.calls[0]?.[0];
    expect(packet.generationMode).toBe("first-episode-opening-3cut");
    expect(packet.cuts).toHaveLength(3);

    expect(screen.getByTestId("fresh-ideas-v3-storyboard-packet-preview")).toBeTruthy();
    expect(screen.getByTestId("fresh-ideas-v3-storyboard-cut-1").textContent).toContain("구도:");
    expect(screen.getByTestId("fresh-ideas-v3-storyboard-cut-2").textContent).toContain("대사 초안:");
    expect(screen.getByTestId("fresh-ideas-v3-storyboard-cut-3").textContent).toContain("조명 힌트:");
    expect(screen.getByTestId("studio-fresh-ideas-v2-workbench").textContent).not.toMatch(/NaN|Infinity|[🔥📖📊✅🎯💡✨]/u);
    expect(onStatusChange).toHaveBeenCalled();
  });

  it("열린 원고 실측 4컷을 바인딩하고 5렌즈 전환 후 1클릭으로 해당 각도의 3컷 콘티 초안 패킷을 생성한다", async () => {
    const onCreateStoryboardSeedPacket = vi.fn();
    render(
      <StudioFreshIdeasV2WorkbenchCard
        sourceTitle="침수 도서관 1화"
        sourceSummaryKo="서연이 침수 도서관에서 은인장 편지를 발견하고 길드 규칙과 충돌한다."
        episodeTelemetrySource={createMeasuredEpisodeInput()}
        onCreateStoryboardSeedPacket={onCreateStoryboardSeedPacket}
      />,
    );

    expect(screen.getByTestId("fresh-ideas-v3-telemetry-mode").textContent).toBe("열린 원고 실측 바인딩");
    expect(screen.getByTestId("fresh-ideas-v3-metric-cuts").textContent).toContain("4컷");
    expect(screen.getByTestId("fresh-ideas-v3-metric-dialogue").textContent).toContain("5자/컷");
    expect(screen.getByTestId("fresh-ideas-v3-metric-bg3d").textContent).toContain("50% (2/4컷)");
    expect(screen.getByTestId("fresh-ideas-v3-metric-silent").textContent).toContain("50% (2/4컷)");

    // 5렌즈 중 05(히든 디테일) 선택 -> 1클릭 패킷 생성
    fireEvent.click(screen.getByTestId("fresh-ideas-v2-lens-05"));
    fireEvent.click(screen.getByTestId("fresh-ideas-v3-generate-storyboard-btn"));

    await waitFor(() => expect(onCreateStoryboardSeedPacket).toHaveBeenCalledTimes(1));
    const hiddenDetailPacket = onCreateStoryboardSeedPacket.mock.calls[0]?.[0];
    expect(hiddenDetailPacket.lensId).toBe("what-they-missed");
    expect(hiddenDetailPacket.v3LensAngleKo).toBe("히든 디테일");
    expect(hiddenDetailPacket.generationMode).toBe("measured-episode");
    expect(hiddenDetailPacket.telemetry.cutCount).toBe(4);
    expect(screen.getByTestId("fresh-ideas-v3-storyboard-packet-preview").textContent).toContain("히든 디테일");

    // 다른 렌즈(03 실측 근거)로 전환하면 이전 렌즈 미리보기가 정리되고 새 각도로 즉시 재생성된다
    fireEvent.click(screen.getByTestId("fresh-ideas-v2-lens-03"));
    expect(screen.queryByTestId("fresh-ideas-v3-storyboard-packet-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("fresh-ideas-v3-generate-storyboard-btn"));

    await waitFor(() => expect(onCreateStoryboardSeedPacket).toHaveBeenCalledTimes(2));
    const dataPacket = onCreateStoryboardSeedPacket.mock.calls[1]?.[0];
    expect(dataPacket.lensId).toBe("data-evidence-angle");
    expect(dataPacket.v3LensAngleKo).toBe("실측 근거");
    expect(dataPacket.cuts).toHaveLength(3);
    expect(screen.getByTestId("fresh-ideas-v3-storyboard-packet-preview").textContent).toContain("실측 근거");
  });
});
