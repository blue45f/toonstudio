/**
 * Plotr 1클릭 초보자 장르 템플릿 데이터 2부 (학원로맨스 · 스릴러).
 */
import type { PlotrGenreTemplate } from "./plotr-genre-templates";
import { buildStarterSpatialBoard } from "./plotr-genre-template-presets";

export const PLOTR_TEMPLATES_SECONDARY: readonly PlotrGenreTemplate[] = Object.freeze([
  {
    id: "campus-romance",
    labelKo: "학원로맨스",
    badgeKo: "청춘 · 설렘",
    summaryKo: "도서실 반납함에서 바뀐 스케치북 때문에 짝사랑 선배와 얽히는 4컷·웹툰 콘티",
    defaultFormat: "cuttoon",
    title: "우산 아래 바뀐 스케치북",
    accentOklch: "oklch(0.68 0.17 155)",
    helper: {
      genre: "학원",
      targetReader: "10~20대 로맨스 독자",
      mood: "산뜻하고 두근거리게",
      scope: "oneshot",
      length: "short",
      trendTags: ["비밀정체", "혐관로맨스"],
      logline:
        "소나기가 쏟아진 방과 후, 하린의 짝사랑 낙서가 가득한 스케치북이 미술부 선배 유준의 가방에 들어간다.",
      worldSettingNote: "6월 장마철 해안가 고등학교, 오래된 옥상 도서실과 미술실",
    },
    rawScript: `[컷 1] 소나기가 내리는 학교 현관. 하린이 젖은 앞머리를 털며 가방에서 낯선 검은 스케치북을 꺼낸다.
하린: "어… 내 노란 스케치북 어디 갔지?!"
[컷 2] 복도 끝에서 짙은 남색 우산을 접던 선배 유준이 하린의 노란 스케치북을 들고 멈춰 선다.
유준: "혹시 이거 찾는 중인가? 맨 뒷장에 내 얼굴이 세 페이지나 있길래."
[컷 3] 하린의 귀 끝이 새빨개지며 스케치북을 붙잡지만 유준이 살짝 웃으며 한 뼘 들어 올린다.
하린: "선배, 그거 절대 보시면 안 되는 건데요!"
[컷 4] 창밖 빗방울 사이로 햇살이 비치고, 유준이 스케치북 첫 장에 메모를 적어 건넨다.
유준: "대신 내일 방과 후 미술실 모델 한 번만 서 줘. 그럼 비밀 지킬게."`,
    assets: [
      {
        id: "asset-rom-harin",
        category: "character",
        name: "하린",
        visualNote: "어깨 단발 갈색 머리, 노란 머리핀, 하복 세라 카라",
        swatchOklch: "oklch(0.73 0.16 85)",
        costumeOrMaterial: "하복 셔츠 + 민트 카디건",
      },
      {
        id: "asset-rom-yujun",
        category: "character",
        name: "유준",
        visualNote: "살짝 덮은 흑발, 부드러운 눈매, 물감 묻은 소매",
        swatchOklch: "oklch(0.62 0.16 155)",
        costumeOrMaterial: "교복 셔츠 + 감청색 우산",
      },
      {
        id: "asset-rom-hallway",
        category: "location",
        name: "비 오는 학교 현관",
        visualNote: "물기 맺힌 유리문, 초여름 초록빛 운동장 역광",
        swatchOklch: "oklch(0.7 0.14 165)",
        costumeOrMaterial: "맑은 빗방울 하이라이트",
      },
      {
        id: "asset-rom-sketchbook",
        category: "prop",
        name: "노란 스케치북",
        visualNote: "크로키 스티커가 붙은 스프링 스케치북",
        swatchOklch: "oklch(0.78 0.15 95)",
        costumeOrMaterial: "노란 표지 · 연필 낙서",
      },
    ],
    scenes: [
      {
        id: "scene-rom-1",
        episodeId: "ep-1",
        title: "현관 앞 스케치북 교환 사고",
        body: "하린은 비 오는 학교 현관에서 유준 선배와 스케치북이 바뀐 걸 깨닫는다.",
        cutNotes: "1~2컷: 당황 클로즈업 → 역광 선배 등장",
        orderIndex: 0,
      },
      {
        id: "scene-rom-2",
        episodeId: "ep-1",
        title: "미술실 모델 비밀 거래",
        body: "유준은 노란 스케치북을 돌려주는 조건으로 내일 방과 후 모델 제안을 건넨다.",
        cutNotes: "3~4컷: 거리 좁히는 투샷 → 메모 클로즈업",
        orderIndex: 1,
      },
    ],
    codexEntries: [
      {
        id: "codex-harin",
        kind: "character",
        canonical: "하린",
        aliases: ["후배"],
        status: "confirmed",
        summary: "감정이 얼굴에 바로 드러나는 만화부 1학년",
        voiceTone: "발랄하고 솔직한 존댓말",
      },
      {
        id: "codex-yujun",
        kind: "character",
        canonical: "유준",
        aliases: ["선배", "미술부 선배"],
        status: "confirmed",
        summary: "다정하지만 장난기 있는 미술부 2학년",
        voiceTone: "부드럽고 여유 있는 반말",
      },
    ],
    subwayTimeline: {
      id: "tl-romance",
      title: "장마철 학원 로맨스 흐름",
      tracks: [
        { id: "trk-harin", label: "하린", kind: "character", toneToken: "oklch(0.73 0.16 85)", canvasColorPreset: "3" },
        { id: "trk-yujun", label: "유준", kind: "character", toneToken: "oklch(0.62 0.16 155)", canvasColorPreset: "4" },
      ],
      events: [
        {
          id: "ev-rom-swap",
          title: "도서실 반납함 스케치북 바뀜",
          chronologicalOrder: 1,
          eraLabel: "6월 둘째 주 금요일",
          calendarDateLabel: "오후 4시 30분",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 1,
          participantTrackIds: ["trk-harin", "trk-yujun"],
          locationPinId: "pin-rom-gate",
          revealsFactIds: ["fact-sketch-swap"],
        },
        {
          id: "ev-rom-deal",
          title: "현관 앞 미술실 모델 약속",
          chronologicalOrder: 2,
          eraLabel: "6월 둘째 주 금요일",
          calendarDateLabel: "오후 5시 10분",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 2,
          participantTrackIds: ["trk-harin", "trk-yujun"],
          locationPinId: "pin-rom-artroom",
          requiresFactIds: ["fact-sketch-swap"],
        },
      ],
      mapPins: [
        {
          id: "pin-rom-gate",
          mapId: "school",
          label: "학교 중앙 현관",
          u: 0.42,
          v: 0.62,
          category: "landmark",
          activeFromOrder: 0,
          activeUntilOrder: null,
          linkedEventIds: ["ev-rom-swap"],
        },
        {
          id: "pin-rom-artroom",
          mapId: "school",
          label: "별관 4층 미술실",
          u: 0.68,
          v: 0.34,
          category: "landmark",
          activeFromOrder: 0,
          activeUntilOrder: null,
          linkedEventIds: ["ev-rom-deal"],
        },
      ],
    },
    spatialBoard: buildStarterSpatialBoard("학원 로맨스 무드보드", "현관 소나기 장면 보드", [
      { id: "n-c1", kind: "scene-card", titleKo: "소나기 현관 컷", bodyKo: "노란 스케치북으로 시선 컬러 포인트", x: 36, y: 44, tags: ["색감", "도입"] },
      { id: "n-c2", kind: "sticky", titleKo: "설렘 호흡 메모", bodyKo: "3컷에서 4컷 넘어갈 때 빗소리 멈춤 연출", x: 300, y: 44, tags: ["연출"] },
    ]),
  },
  {
    id: "thriller",
    labelKo: "스릴러",
    badgeKo: "밀실 · 반전",
    summaryKo: "자정 막차에서 사라진 승객의 녹음 파일을 발견한 기관사의 서스펜스 콘티",
    defaultFormat: "video-storyboard",
    title: "0시 13분, 없는 정거장",
    accentOklch: "oklch(0.6 0.2 25)",
    helper: {
      genre: "스릴러",
      targetReader: "20~40대 미스터리 독자",
      mood: "서늘하고 압박감 있게",
      scope: "series-ep1",
      length: "medium",
      trendTags: ["폐쇄공간", "단서추리", "시간제한"],
      logline:
        "막차 운행 중 지도에도 없는 13번 역에 정차한 기관사 지훈이 객차 CCTV에서 어제의 자기 모습을 발견한다.",
      worldSettingNote: "비 오는 심야 지하철 순환선, 깜빡이는 형광등과 붉은 비상벨",
    },
    rawScript: `[컷 1] 0시 13분. 어두운 지하철 터널을 가르는 막차 운전실 계기판에 붉은 정차 경고등이 켜진다.
지훈: "이상하네… 이 구간엔 역이 없는데."
[컷 2] 객차 문이 저절로 열리며 안개 낀 낡은 승강장 표지판 '13번 회송역'이 드러난다.
지훈: (나레이션) 텅 빈 객차 끝에 누군가 두고 간 녹음기 하나가 깜빡이고 있었다.
[컷 3] 지훈이 녹음기 재생 버튼을 누르자, 다급한 자기 자신의 목소리가 흘러나온다.
녹음기: "지훈아, 절대 3번 칸 문을 열지 마. 지금 들어온 건 승객이 아니야."
[컷 4] 운전실 모니터 속 3번 칸 CCTV 화면에 고개를 천천히 드는 그림자가 잡힌다.
지훈: "저건… 어젯밤 퇴근하던 나잖아?!"`,
    assets: [
      {
        id: "asset-thr-jihoon",
        category: "character",
        name: "지훈",
        visualNote: "피곤한 다크서클, 단정한 남색 기관사 제복, 땀 맺힌 이마",
        swatchOklch: "oklch(0.58 0.14 245)",
        costumeOrMaterial: "철도 기관사 셔츠 + 사원증",
      },
      {
        id: "asset-thr-station",
        category: "location",
        name: "13번 회송역",
        visualNote: "녹슨 타일, 깜빡이는 차가운 백색등, 바닥 고인 빗물",
        swatchOklch: "oklch(0.54 0.17 25)",
        costumeOrMaterial: "저채도 시멘트 + 붉은 경고등",
      },
      {
        id: "asset-thr-recorder",
        category: "prop",
        name: "빨간 LED 녹음기",
        visualNote: "",
        swatchOklch: "oklch(0.62 0.22 25)",
        costumeOrMaterial: "금속 보이스 레코더",
      },
    ],
    scenes: [
      {
        id: "scene-thr-1",
        episodeId: "ep-1",
        title: "없는 역의 자동 정차",
        body: "지훈은 자정 막차가 지도에도 없는 13번 회송역에 멈추자 객차 점검에 나선다.",
        cutNotes: "1~2컷: 계기판 경고등 익스트림 클로즈업 → 긴 복도 원근",
        orderIndex: 0,
      },
      {
        id: "scene-thr-2",
        episodeId: "ep-1",
        title: "자기 목소리 녹음과 CCTV 반전",
        body: "녹음기에서 어제의 자기 경고를 들은 순간, CCTV에 또 다른 지훈이 나타난다.",
        cutNotes: "3~4컷: 녹음기 적색 LED → 모니터 반사 공포 클로즈업",
        orderIndex: 1,
      },
    ],
    codexEntries: [
      {
        id: "codex-jihoon",
        kind: "character",
        canonical: "지훈",
        aliases: ["기관사"],
        status: "confirmed",
        summary: "순환선 야간 막차를 모는 5년 차 기관사",
        voiceTone: "침착하지만 점점 흔들리는 독백",
      },
      {
        id: "codex-station13",
        kind: "location",
        canonical: "13번 회송역",
        aliases: ["없는 역"],
        status: "confirmed",
        summary: "자정 13분에만 문이 열리는 미등록 지하 승강장",
      },
    ],
    subwayTimeline: {
      id: "tl-thriller",
      title: "0시 13분 순환선 단서 타임라인",
      tracks: [
        { id: "trk-jihoon", label: "지훈(현재)", kind: "character", toneToken: "oklch(0.58 0.16 245)", canvasColorPreset: "5" },
        { id: "trk-clue", label: "녹음기 단서", kind: "foreshadow", toneToken: "oklch(0.6 0.21 25)", canvasColorPreset: "1" },
      ],
      events: [
        {
          id: "ev-thr-stop",
          title: "13번 회송역 강제 정차",
          chronologicalOrder: 10,
          eraLabel: "자정 0시 13분",
          calendarDateLabel: "1화 도입",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 1,
          participantTrackIds: ["trk-jihoon"],
          locationPinId: "pin-thr-13",
          revealsFactIds: ["fact-station-open"],
        },
        {
          id: "ev-thr-tape",
          title: "어젯밤 지훈의 경고 녹음 재생",
          chronologicalOrder: 5,
          eraLabel: "전날 0시 12분 녹음",
          calendarDateLabel: "회상 단서",
          narrativeEpisodeOrder: 1,
          narrativeSceneIndex: 2,
          participantTrackIds: ["trk-jihoon", "trk-clue"],
          locationPinId: "pin-thr-car3",
          requiresFactIds: ["fact-station-open"],
          revealsFactIds: ["fact-time-loop"],
        },
      ],
      mapPins: [
        {
          id: "pin-thr-13",
          mapId: "metro",
          label: "13번 회송역 승강장",
          u: 0.48,
          v: 0.44,
          category: "event",
          activeFromOrder: 0,
          activeUntilOrder: null,
          linkedEventIds: ["ev-thr-stop"],
        },
        {
          id: "pin-thr-car3",
          mapId: "metro",
          label: "막차 3번 객차",
          u: 0.72,
          v: 0.58,
          category: "landmark",
          activeFromOrder: 0,
          activeUntilOrder: null,
          linkedEventIds: ["ev-thr-tape"],
        },
      ],
    },
    spatialBoard: buildStarterSpatialBoard("0시 13분 서스펜스 보드", "3번 칸 CCTV 단서 보드", [
      { id: "n-t1", kind: "scene-card", titleKo: "정차 경고등 컷", bodyKo: "어둠 속 붉은 점멸로 시간제한 암시", x: 36, y: 44, tags: ["긴장", "도입"] },
      { id: "n-t2", kind: "scene-card", titleKo: "CCTV 도플갱어 반전", bodyKo: "엔딩 1컷에 정적과 클로즈업 집중", x: 300, y: 44, tags: ["반전", "훅"] },
    ]),
  },
]);
