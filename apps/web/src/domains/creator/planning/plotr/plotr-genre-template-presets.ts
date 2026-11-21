/**
 * Plotr 1클릭 초보자 장르 템플릿 데이터 1부 (로판 · 회귀헌터) + 공용 공간 보드 시더.
 */
import {
  createNestedSubBoard,
  createSpatialStoryBoardDocument,
  type SpatialStoryBoardDocument,
} from "../studio-spatial-story-board-canvas";
import type { PlotrGenreTemplate } from "./plotr-genre-templates";

export function buildStarterSpatialBoard(
  rootTitle: string,
  subTitle: string,
  cards: readonly {
    readonly id: string;
    readonly kind: "scene-card" | "character-note" | "reference-image" | "sticky";
    readonly titleKo: string;
    readonly bodyKo: string;
    readonly x: number;
    readonly y: number;
    readonly tags: readonly string[];
  }[],
): SpatialStoryBoardDocument {
  let doc = createSpatialStoryBoardDocument(rootTitle);
  doc = createNestedSubBoard(doc, {
    parentBoardId: doc.rootBoardId,
    subBoardId: "board-sub-ep1",
    portalNodeId: "node-portal-ep1",
    titleKo: subTitle,
    summaryKo: "1화 핵심 장면과 연출 레퍼런스 모음",
    x: 540,
    y: 180,
  });
  const baseNodes = cards.map((card) => ({
    id: card.id,
    boardId: doc.rootBoardId,
    kind: card.kind,
    titleKo: card.titleKo,
    bodyKo: card.bodyKo,
    x: card.x,
    y: card.y,
    width: 220,
    height: 112,
    tags: card.tags,
  }));
  const subSceneNode = {
    id: "node-sub-cut-detail",
    boardId: "board-sub-ep1",
    kind: "scene-card" as const,
    titleKo: "1화 엔딩 컷 구도 메모",
    bodyKo: "로우앵글 클로즈업 + 세로 여백 200px로 다음 화 궁금증 유도",
    x: 64,
    y: 64,
    width: 240,
    height: 116,
    tags: ["엔딩훅", "구도"],
  };
  const arrows =
    baseNodes.length >= 2
      ? [
          {
            id: "arrow-root-1",
            boardId: doc.rootBoardId,
            fromNodeId: baseNodes[0]!.id,
            toNodeId: baseNodes[1]!.id,
            labelKo: "사건 연결",
            curveOffsetPx: -18,
          },
          {
            id: "arrow-root-2",
            boardId: doc.rootBoardId,
            fromNodeId: baseNodes[1]!.id,
            toNodeId: "node-portal-ep1",
            labelKo: "1화 상세 보드",
            curveOffsetPx: 14,
          },
        ]
      : [];
  return {
    ...doc,
    nodes: [...doc.nodes, ...baseNodes, subSceneNode],
    arrows,
  };
}

export const PLOTR_TEMPLATES_PRIMARY: readonly PlotrGenreTemplate[] = Object.freeze([
  {
    id: "rofan",
    labelKo: "로판",
    badgeKo: "회귀 · 계약",
    summaryKo: "파혼 직전으로 돌아온 영애가 북부 공작에게 역제안하는 1화 콘티",
    defaultFormat: "webtoon",
    title: "유리시계 공작가의 계약",
    accentOklch: "oklch(0.65 0.19 340)",
    helper: {
      genre: "로판",
      targetReader: "20대 여성 독자",
      mood: "우아하고 긴장감 있게",
      scope: "series-ep1",
      length: "medium",
      trendTags: ["계약결혼", "회귀각성"],
      logline:
        "파혼식 10분 전으로 회귀한 세레나가 적대하던 북부 공작 카시안에게 1년 계약을 먼저 제안한다.",
      worldSettingNote:
        "19세기 유리온실 제국, 시간 마력이 깃든 은빛 회중시계가 가문 계승의 증표",
    },
    rawScript: `[컷 1] 샹들리에 불빛이 쏟아지는 유리온실 연회장. 세레나가 손바닥의 붉은 시계 자국을 내려다본다.
세레나: (나레이션) 분명 처형대에 섰었는데… 파혼식 10분 전으로 돌아왔다.
[컷 2] 연회장 문이 열리며 검은 망토를 두른 북부 공작 카시안이 차가운 시선으로 걸어 들어온다.
카시안: "늦지 않았군. 오늘 밤 끝날 약혼을 보러 왔소."
[컷 3] 세레나가 황태자 대신 카시안 앞에 다가가 은빛 회중시계를 내민다. 주변 귀족들이 숨을 삼킨다.
세레나: "파혼은 제가 먼저 합니다. 대신 공작님, 1년만 제 남편이 되어 주시죠."
[컷 4] 카시안의 눈동자가 가늘어지며 회중시계에 깃든 푸른 빛을 알아본다.
카시안: "그 시계가 아직 움직인다면… 거래 조건부터 들어 보지."`,
    assets: [
      {
        id: "asset-rofan-serena",
        category: "character",
        name: "세레나",
        visualNote: "은발 반묶음, 에메랄드 눈동자, 진주 장식 상아색 드레스",
        swatchOklch: "oklch(0.68 0.17 340)",
        costumeOrMaterial: "상아색 레이스 드레스 + 붉은 손목 문양",
      },
      {
        id: "asset-rofan-cassian",
        category: "character",
        name: "카시안",
        visualNote: "흑발 올백, 날카로운 회청색 눈, 은장 브로치 검은 망토",
        swatchOklch: "oklch(0.58 0.15 255)",
        costumeOrMaterial: "북부 제복 + 짙은 남색 망토",
      },
      {
        id: "asset-rofan-hall",
        category: "location",
        name: "유리온실 연회장",
        visualNote: "아치형 유리 천장, 금빛 샹들리에, 밤안개 낀 장미 정원 배경",
        swatchOklch: "oklch(0.72 0.14 85)",
        costumeOrMaterial: "대리석 바닥 · 따뜻한 촛불 조명",
      },
      {
        id: "asset-rofan-watch",
        category: "prop",
        name: "은빛 회중시계",
        visualNote: "",
        swatchOklch: "oklch(0.69 0.15 215)",
        costumeOrMaterial: "푸른 마력 빛이 도는 태엽 시계",
      },
    ],
    scenes: [
      {
        id: "scene-rofan-1",
        episodeId: "ep-1",
        title: "연회장 회귀 각성",
        body: "세레나는 유리온실 연회장 거울 앞에서 손목의 시계 문양을 확인한다. 파혼식이 열리기 딱 10분 전이다.",
        cutNotes: "1~2컷: 샹들리에 부감 → 손목 클로즈업",
        orderIndex: 0,
      },
      {
        id: "scene-rofan-2",
        episodeId: "ep-1",
        title: "북부 공작에게 역제안",
        body: "세레나는 카시안 앞에 서서 은빛 회중시계를 꺼내 들며 1년 계약 결혼을 제안한다.",
        cutNotes: "3~4컷: 투샷 역광 → 회중시계 마력 플래시",
        orderIndex: 1,
      },
    ],
    codexEntries: [
      {
        id: "codex-serena",
        kind: "character",
        canonical: "세레나",
        aliases: ["영애", "공녀"],
        status: "confirmed",
        summary: "회귀 후 운명을 스스로 뒤집는 주인공",
        voiceTone: "단호하고 우아한 존댓말",
        lastSeenEpisode: "1화",
      },
      {
        id: "codex-cassian",
        kind: "character",
        canonical: "카시안",
        aliases: ["북부 공작", "공작님"],
        status: "confirmed",
        summary: "시간 마력의 비밀을 쫓는 북부 대공",
        voiceTone: "낮고 절제된 하오체",
        lastSeenEpisode: "1화",
      },
      {
        id: "codex-old-curse",
        kind: "lore",
        canonical: "구버전 붉은 저주",
        aliases: ["붉은 저주"],
        status: "deprecated",
        summary: "초기 기획에서 폐기된 저주 설정 (은빛 회중시계로 대체됨)",
      },
    ],
    subwayTimeline: {
      id: "tl-rofan",
      title: "유리시계 공작가 이중 연대기",
      tracks: [
        { id: "trk-serena", label: "세레나", kind: "character", toneToken: "oklch(0.65 0.19 340)", canvasColorPreset: "6" },
        { id: "trk-cassian", label: "카시안", kind: "character", toneToken: "oklch(0.58 0.16 255)", canvasColorPreset: "5" },
        { id: "trk-watch", label: "회중시계 복선", kind: "foreshadow", toneToken: "oklch(0.68 0.16 200)", canvasColorPreset: "4" },
      ],
      events: [
        {
          id: "ev-rofan-future",
          title: "처형대의 마지막 종소리",
          chronologicalOrder: 30,
          eraLabel: "회귀 전 제국력 412년",
          calendarDateLabel: "겨울 12월",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 1,
          participantTrackIds: ["trk-serena", "trk-watch"],
          locationPinId: "pin-rofan-capital",
          revealsFactIds: ["fact-clock-rewind"],
        },
        {
          id: "ev-rofan-banquet",
          title: "유리온실 파혼식 역제안",
          chronologicalOrder: 10,
          eraLabel: "회귀 직후 제국력 411년",
          calendarDateLabel: "봄 4월",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 2,
          participantTrackIds: ["trk-serena", "trk-cassian", "trk-watch"],
          locationPinId: "pin-rofan-greenhouse",
          requiresFactIds: ["fact-clock-rewind"],
          revealsFactIds: ["fact-contract-signed"],
        },
        {
          id: "ev-rofan-north",
          title: "북부 성채 시계탑 개방",
          chronologicalOrder: 20,
          eraLabel: "계약 3개월 차",
          calendarDateLabel: "여름 7월",
          narrativeEpisodeOrder: 2,
          narrativeSceneIndex: 1,
          participantTrackIds: ["trk-serena", "trk-cassian"],
          locationPinId: "pin-rofan-fortress",
          requiresFactIds: ["fact-contract-signed"],
        },
      ],
      mapPins: [
        {
          id: "pin-rofan-greenhouse",
          mapId: "empire",
          label: "황궁 유리온실",
          u: 0.46,
          v: 0.52,
          category: "landmark",
          activeFromOrder: 0,
          activeUntilOrder: null,
          linkedEventIds: ["ev-rofan-banquet"],
        },
        {
          id: "pin-rofan-fortress",
          mapId: "empire",
          label: "북부 흑요석 성채",
          u: 0.72,
          v: 0.24,
          category: "faction-hq",
          activeFromOrder: 10,
          activeUntilOrder: null,
          linkedEventIds: ["ev-rofan-north"],
        },
        {
          id: "pin-rofan-capital",
          mapId: "empire",
          label: "황도 중앙 광장",
          u: 0.3,
          v: 0.68,
          category: "city",
          activeFromOrder: 0,
          activeUntilOrder: 40,
          linkedEventIds: ["ev-rofan-future"],
        },
      ],
    },
    spatialBoard: buildStarterSpatialBoard("유리시계 공작가 스토리보드", "1화 파혼식 서브보드", [
      { id: "n-r1", kind: "scene-card", titleKo: "오프닝: 손목 시계 문양", bodyKo: "처형대 기억에서 연회장으로 단숨에 전환", x: 36, y: 44, tags: ["도입", "회귀"] },
      { id: "n-r2", kind: "character-note", titleKo: "카시안의 숨은 목적", bodyKo: "회중시계 마력을 확인하고 계약을 수락한다", x: 300, y: 44, tags: ["인물", "복선"] },
      { id: "n-r3", kind: "reference-image", titleKo: "온실 야간 조명 무드", bodyKo: "청남색 유리 천장 + 금빛 샹들리에 대비", x: 36, y: 196, tags: ["조명", "배경"] },
    ]),
  },
  {
    id: "regression-hunter",
    labelKo: "회귀헌터",
    badgeKo: "탑 등반 · 역전",
    summaryKo: "99층에서 전멸한 말단 포터가 1층 초보 던전으로 돌아와 숨은 보스를 독식하는 1화",
    defaultFormat: "webtoon",
    title: "99층 짐꾼의 역주행",
    accentOklch: "oklch(0.62 0.2 250)",
    helper: {
      genre: "현판",
      targetReader: "10~30대 액션 독자",
      mood: "속도감 있고 통쾌하게",
      scope: "series-ep1",
      length: "medium",
      trendTags: ["회귀각성", "역전사이다"],
      logline:
        "99층에서 배신당한 짐꾼 강도윤이 F급 측정실로 돌아와 아무도 모르는 0번 숨겨진 게이트를 연다.",
      worldSettingNote: "서울 지하철 폐역마다 열린 이계 게이트, 시계형 마력 측정기",
    },
    rawScript: `[컷 1] 붉은 균열이 갈라진 99층 하늘. 깨진 방패를 든 강도윤이 마지막 숨을 내뱉는다.
강도윤: (나레이션) 10년을 짐만 나르다 끝날 줄 알았다. 그 창이 열리기 전까지는.
[컷 2] 눈을 뜨자 눈부신 형광등 아래 서울 헌터 측정실. 전광판에 'F급 — 각성 보류'가 찍힌다.
측정관: "강도윤 씨, 마력 수치 3입니다. 그냥 물류 지원반으로 가시죠."
[컷 3] 도윤의 눈앞에만 푸른 상태창이 겹쳐지며 10년 전 첫 번째 숨은 던전 좌표가 뜬다.
강도윤: "딱 30분 남았네. 이번엔 내가 먼저 가져간다."
[컷 4] 폐쇄된 을지로 지하 통로. 녹슨 철문 너머 푸른 균열을 향해 도윤이 낡은 단검을 쥔다.
강도윤: (나레이션) 99층의 공략법을 아는 F급이 지금 입장한다.`,
    assets: [
      {
        id: "asset-hunt-doyun",
        category: "character",
        name: "강도윤",
        visualNote: "짧은 흑발, 왼쪽 눈썹 흉터, 짙은 회색 기능성 점퍼",
        swatchOklch: "oklch(0.6 0.19 250)",
        costumeOrMaterial: "실용 작업복 점퍼 + 가죽 단검 집",
      },
      {
        id: "asset-hunt-gate",
        category: "location",
        name: "을지로 폐역 게이트",
        visualNote: "젖은 콘크리트 승강장, 비상등 붉은 반사광, 푸른 공간 균열",
        swatchOklch: "oklch(0.56 0.16 215)",
        costumeOrMaterial: "폐지하철 타일 · 청록 마력 안개",
      },
      {
        id: "asset-hunt-dagger",
        category: "prop",
        name: "낡은 강철 단검",
        visualNote: "",
        swatchOklch: "oklch(0.7 0.15 160)",
        costumeOrMaterial: "푸른 룬이 희미하게 켜지는 단검",
      },
    ],
    scenes: [
      {
        id: "scene-hunt-1",
        episodeId: "ep-1",
        title: "99층 최후와 F급 회귀",
        body: "강도윤은 99층 전멸 직후 서울 헌터 측정실로 회귀해 F급 판정을 다시 받는다.",
        cutNotes: "1~2컷: 세로 속도선 전환 → 전광판 컷인",
        orderIndex: 0,
      },
      {
        id: "scene-hunt-2",
        episodeId: "ep-1",
        title: "0번 숨은 게이트 단독 진입",
        body: "도윤은 길드보다 30분 먼저 을지로 폐역 게이트 앞에 서서 단검을 뽑는다.",
        cutNotes: "3~4컷: 상태창 반사 클로즈업 → 로우앵글 게이트 개방",
        orderIndex: 1,
      },
    ],
    codexEntries: [
      {
        id: "codex-doyun",
        kind: "character",
        canonical: "강도윤",
        aliases: ["도윤", "짐꾼"],
        status: "confirmed",
        summary: "99층 공략 기억을 그대로 가진 회귀 F급 헌터",
        voiceTone: "담백하고 계산 빠른 반말",
        lastSeenEpisode: "1화",
      },
      {
        id: "codex-gate0",
        kind: "location",
        canonical: "을지로 폐역 게이트",
        aliases: ["0번 게이트", "을지로 지하 통로"],
        status: "confirmed",
        summary: "최초 히든 유물이 잠든 지하 던전",
      },
    ],
    subwayTimeline: {
      id: "tl-hunter",
      title: "99층 회귀 작전 타임라인",
      tracks: [
        { id: "trk-doyun", label: "강도윤", kind: "character", toneToken: "oklch(0.6 0.19 250)", canvasColorPreset: "5" },
        { id: "trk-guild", label: "대형 길드", kind: "faction", toneToken: "oklch(0.64 0.18 28)", canvasColorPreset: "1" },
      ],
      events: [
        {
          id: "ev-hunt-99",
          title: "99층 보스전 배신",
          chronologicalOrder: 99,
          eraLabel: "회귀 전 2036년",
          calendarDateLabel: "10년 차",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 1,
          participantTrackIds: ["trk-doyun", "trk-guild"],
          revealsFactIds: ["fact-betrayal"],
        },
        {
          id: "ev-hunt-measure",
          title: "측정실 F급 판정과 회귀 확인",
          chronologicalOrder: 1,
          eraLabel: "회귀 직후 2026년",
          calendarDateLabel: "1일 차",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 2,
          participantTrackIds: ["trk-doyun"],
          locationPinId: "pin-hunt-center",
          requiresFactIds: ["fact-betrayal"],
          revealsFactIds: ["fact-gate-coord"],
        },
        {
          id: "ev-hunt-euljiro",
          title: "을지로 0번 게이트 선점",
          chronologicalOrder: 2,
          eraLabel: "회귀 30분 후",
          calendarDateLabel: "1일 차 밤",
          narrativeEpisodeOrder: 2,
          narrativeSceneIndex: 1,
          participantTrackIds: ["trk-doyun", "trk-guild"],
          locationPinId: "pin-hunt-euljiro",
          requiresFactIds: ["fact-gate-coord"],
        },
      ],
      mapPins: [
        {
          id: "pin-hunt-center",
          mapId: "seoul",
          label: "서울 헌터 측정실",
          u: 0.34,
          v: 0.42,
          category: "faction-hq",
          activeFromOrder: 0,
          activeUntilOrder: null,
          linkedEventIds: ["ev-hunt-measure"],
        },
        {
          id: "pin-hunt-euljiro",
          mapId: "seoul",
          label: "을지로 폐역 게이트",
          u: 0.64,
          v: 0.56,
          category: "event",
          activeFromOrder: 1,
          activeUntilOrder: null,
          linkedEventIds: ["ev-hunt-euljiro"],
        },
      ],
    },
    spatialBoard: buildStarterSpatialBoard("99층 짐꾼 액션 보드", "1화 던전 진입 보드", [
      { id: "n-h1", kind: "scene-card", titleKo: "99층 추락 오프닝", bodyKo: "강렬한 낙하선으로 1컷부터 시선 고정", x: 36, y: 44, tags: ["액션", "도입"] },
      { id: "n-h2", kind: "character-note", titleKo: "F급 역전 포인트", bodyKo: "수치는 3이지만 공략 기억으로 완벽 반전", x: 300, y: 44, tags: ["사이다"] },
    ]),
  },
]);
