/**
 * 원클릭 웹툰 → IR 피치덱 · 연재 기획서 · 에피소드 콘티 발표 덱 프리셋 3종 및 기본 슬라이드 팩토리.
 * 프리셋 수치는 사용자가 편집하는 시나리오 예시 값이다.
 */

import type {
  BuildAnimationEntry,
  PptxChartBlock,
  PptxDeckInput,
  PptxDeckPresetId,
  PptxSlideInput,
  PptxSmartArtBlock,
  PptxTableModel,
} from "./ooxml-pptx-types";

export interface PptxPresetMeta {
  readonly id: PptxDeckPresetId;
  readonly label: string;
  readonly slideCount: number;
  readonly summary: string;
}

export const PPTX_DECK_PRESETS: readonly PptxPresetMeta[] = [
  {
    id: "psst-business-plan",
    label: "PSST 사업계획서 (5슬라이드)",
    slideCount: 5,
    summary: "문제인식·실현가능성·성장전략·팀 구성 IR 발표 구조",
  },
  {
    id: "webtoon-series-proposal",
    label: "웹툰 연재 기획서 (4슬라이드)",
    slideCount: 4,
    summary: "로그라인·3막 서사·매력 지표·2차 IP 순환 기획안",
  },
  {
    id: "episode-conti-pitch",
    label: "에피소드 콘티 발표 (4슬라이드)",
    slideCount: 4,
    summary: "오프닝 훅·컷 페이싱·씬 전환·편집자 리뷰 체크리스트",
  },
];

function createDefaultAnimations(prefix: string): readonly BuildAnimationEntry[] {
  return [
    {
      id: `${prefix}-anim-title`,
      target: "title",
      label: "제목 프레임",
      kind: "fade",
      order: 1,
      delayMs: 0,
      durationMs: 360,
    },
    {
      id: `${prefix}-anim-bullets`,
      target: "bullets",
      label: "핵심 요점",
      kind: "fly-in",
      order: 2,
      delayMs: 180,
      durationMs: 420,
    },
    {
      id: `${prefix}-anim-visual`,
      target: "visual",
      label: "SmartArt / 차트",
      kind: "zoom",
      order: 3,
      delayMs: 360,
      durationMs: 440,
    },
  ];
}

export function createDefaultSmartArtBlock(
  variant: PptxSmartArtBlock["variant"] = "process-chevron",
): PptxSmartArtBlock {
  if (variant === "swot-quadrant") {
    return {
      id: "smartart-swot",
      variant,
      title: "SWOT 전략 진단",
      items: [
        { id: "swot-s", label: "강점 (S)", detail: "로컬 우선 고속 편집 엔진" },
        { id: "swot-w", label: "약점 (W)", detail: "초기 브랜드 인지도 확보 필요" },
        { id: "swot-o", label: "기회 (O)", detail: "글로벌 세로 스크롤 웹툰 확장" },
        { id: "swot-t", label: "위협 (T)", detail: "기존 툴의 학습 락인 효과" },
      ],
    };
  }
  if (variant === "org-hierarchy") {
    return {
      id: "smartart-org",
      variant,
      title: "핵심 실행 조직도",
      items: [
        { id: "org-ceo", label: "대표 · 제품 총괄", detail: "전략·IR·로드맵" },
        { id: "org-eng", label: "엔진 아키텍트", detail: "캔버스·OOXML·성능" },
        { id: "org-art", label: "웹툰 디렉터", detail: "콘티·작화 워크플로우" },
        { id: "org-biz", label: "그로스 리드", detail: "스튜디오 B2B 파트너십" },
      ],
    };
  }
  if (variant === "pyramid-tiers") {
    return {
      id: "smartart-pyramid",
      variant,
      title: "가치 계층 피라미드",
      items: [
        { id: "pyr-1", label: "핵심 팬덤 전환", detail: "유료 결제 및 2차 굿즈" },
        { id: "pyr-2", label: "주간 정기 독자", detail: "에피소드 리텐션 유지" },
        { id: "pyr-3", label: "신규 유입 독자", detail: "1~3화 오프닝 훅 경험" },
      ],
    };
  }
  if (variant === "cycle-loop") {
    return {
      id: "smartart-cycle",
      variant,
      title: "IP 확장 순환 구조",
      items: [
        { id: "cyc-1", label: "주간 연재", detail: "오리지널 에피소드" },
        { id: "cyc-2", label: "독자 피드백", detail: "컷별 반응 분석" },
        { id: "cyc-3", label: "글로벌 현지화", detail: "식자·번역 패키지" },
        { id: "cyc-4", label: "2차 미디어", detail: "영상·출판·굿즈 확장" },
      ],
    };
  }
  if (variant === "timeline-milestone") {
    return {
      id: "smartart-timeline",
      variant,
      title: "단계별 실행 타임라인",
      items: [
        { id: "tl-1", label: "1단계 · MVP", detail: "핵심 캔버스·출력 검증" },
        { id: "tl-2", label: "2단계 · 베타", detail: "초기 스튜디오 파일럿" },
        { id: "tl-3", label: "3단계 · 유료화", detail: "팀 구독 및 템플릿 마켓" },
        { id: "tl-4", label: "4단계 · 확장", detail: "해외 연재 스튜디오 진출" },
      ],
    };
  }
  return {
    id: "smartart-process",
    variant: "process-chevron",
    title: "제작 파이프라인 단계",
    items: [
      { id: "proc-1", label: "기획·콘티", detail: "씬 구성 및 컷 배분" },
      { id: "proc-2", label: "선화·채색", detail: "브러시·배경 3D 통합" },
      { id: "proc-3", label: "식자·검수", detail: "다국어 말풍선·권리 확인" },
      { id: "proc-4", label: "발표·납품", detail: "실제 .pptx·웹툰 패키지" },
    ],
  };
}

export function createDefaultChartBlock(
  variant: PptxChartBlock["variant"] = "bar",
): PptxChartBlock {
  if (variant === "radar") {
    return {
      id: "chart-radar",
      variant,
      title: "작품 핵심 매력도 밸런스 (예시)",
      unit: "점",
      points: [
        { id: "r-1", label: "오프닝 훅", value: 92 },
        { id: "r-2", label: "캐릭터성", value: 88 },
        { id: "r-3", label: "세계관", value: 84 },
        { id: "r-4", label: "연출 밀도", value: 90 },
        { id: "r-5", label: "대중성", value: 80 },
      ],
    };
  }
  if (variant === "donut") {
    return {
      id: "chart-donut",
      variant,
      title: "제작 공수 비중 (시나리오 예시)",
      unit: "%",
      points: [
        { id: "d-1", label: "콘티·기획", value: 24 },
        { id: "d-2", label: "선화·채색", value: 42 },
        { id: "d-3", label: "배경·3D", value: 20 },
        { id: "d-4", label: "식자·발표", value: 14 },
      ],
    };
  }
  if (variant === "line") {
    return {
      id: "chart-line",
      variant,
      title: "컷 구간별 독자 집중도 시나리오 (예시)",
      unit: "%",
      points: [
        { id: "l-1", label: "1~10컷", value: 74 },
        { id: "l-2", label: "11~25컷", value: 82 },
        { id: "l-3", label: "26~40컷", value: 78 },
        { id: "l-4", label: "41~55컷", value: 91 },
        { id: "l-5", label: "엔딩 훅", value: 96 },
      ],
    };
  }
  return {
    id: "chart-bar",
    variant: "bar",
    title: "분기별 목표 팀 스튜디오 도입 시나리오 (예시)",
    unit: "팀",
    points: [
      { id: "b-1", label: "1분기", value: 12 },
      { id: "b-2", label: "2분기", value: 28 },
      { id: "b-3", label: "3분기", value: 54 },
      { id: "b-4", label: "4분기", value: 90 },
    ],
  };
}

export function createDefaultTableModel(title = "핵심 항목 요약표"): PptxTableModel {
  return {
    id: "table-default",
    title,
    headers: ["구분", "현재 상태", "목표 시나리오", "비고"],
    rows: [
      ["제작 시간", "분산 도구 수작업", "단일 워크벤치 통합", "예시 항목"],
      ["발표 자료", "캡처·수동 배치", "원클릭 .pptx 생성", "PowerPoint 호환"],
      ["권리 검수", "사후 확인", "출고 전 BOM 검증", "편집 가능"],
    ],
    showHeaderRow: true,
    bandedRows: true,
  };
}

export function createBlankSlide(slideNumber: number): PptxSlideInput {
  const id = `slide-custom-${slideNumber}`;
  return {
    id,
    title: `새 슬라이드 ${slideNumber}`,
    subtitle: "핵심 메시지를 한 줄로 요약해 주세요",
    bullets: [
      "첫 번째 핵심 근거 또는 장면 포인트",
      "두 번째 실행 항목 또는 독자 반응 포인트",
    ],
    shapes: [],
    table: null,
    smartArt: null,
    chart: null,
    speakerNotes: `슬라이드 ${slideNumber} 발표자 메모를 입력하세요.`,
    transition: "fade",
    transitionDurationMs: 500,
    animations: createDefaultAnimations(id),
  };
}

export function createPptxPresetDeck(presetId: PptxDeckPresetId): PptxDeckInput {
  if (presetId === "webtoon-series-proposal") {
    return {
      title: "웹툰 신규 연재 기획서 — 새벽의 옥상",
      author: "ToonStudio 크리에이터",
      slideSize: "16:9",
      themeId: "editorial-sage",
      slides: [
        {
          id: "series-1",
          title: "신규 연재 기획서: 새벽의 옥상",
          subtitle: "도시 판타지 · 드라마 | 주 1회 60컷 세로 스크롤",
          bullets: [
            "로그라인: 잠들지 못하는 건축 복원사가 사라진 옥상의 기억을 되살린다",
            "타깃 독자: 20~30대 미스터리·감성 드라마 선호 독자층",
            "차별화: 건축 투시 연출과 감정선 대비가 선명한 콘티 리듬",
          ],
          shapes: [
            {
              id: "sh-genre",
              kind: "roundRect",
              label: "장르: 도시 판타지",
              xPct: 68,
              yPct: 74,
              wPct: 24,
              hPct: 12,
              tone: "accent",
            },
          ],
          speakerNotes: "1분 안에 작품 로그라인과 핵심 정서 톤을 편집자에게 전달합니다.",
          transition: "fade",
          animations: createDefaultAnimations("series-1"),
        },
        {
          id: "series-2",
          title: "시즌 1 서사 구조 (3막 아크)",
          subtitle: "초반 3화 무료 공개 구간에서 강한 미스터리 훅 완성",
          bullets: [
            "1막(1~8화): 사건 발단과 주인공의 복원 능력 각성",
            "2막(9~24화): 의뢰인별 에피소드와 배후 조직의 단서 연결",
            "3막(25~36화): 최상층 옥상 진실 공개 및 시즌 피날레",
          ],
          smartArt: createDefaultSmartArtBlock("process-chevron"),
          speakerNotes: "유료 전환 지점(4화) 직전의 절단 신공 구조를 강조합니다.",
          transition: "push",
          animations: createDefaultAnimations("series-2"),
        },
        {
          id: "series-3",
          title: "작품 매력도 밸런스 및 핵심 캐릭터표",
          subtitle: "편집부 피드백 기반 강점 요소 시각화 (편집 가능 예시)",
          chart: createDefaultChartBlock("radar"),
          table: {
            id: "tbl-characters",
            title: "주요 인물 구성",
            headers: ["인물", "역할", "핵심 욕망", "대비 키워드"],
            rows: [
              ["서하진", "주인공 · 복원사", "사라진 동생의 흔적 추적", "정밀함 / 고독"],
              ["윤도현", "조력자 · 기록관", "도시 개발 이면의 진실 보존", "유연함 / 집요함"],
              ["백연화", "대립축 · 기획자", "기억 공간의 독점적 재편", "카리스마 / 냉정"],
            ],
            showHeaderRow: true,
            bandedRows: true,
          },
          speakerNotes: "인물 간 갈등 축이 단회성 에피소드를 관통하는 방식을 설명합니다.",
          transition: "morph",
          animations: createDefaultAnimations("series-3"),
        },
        {
          id: "series-4",
          title: "연재 마일스톤 및 2차 IP 확장 순환",
          subtitle: "글로벌 동시 식자 패키지 및 단행본·영상화 연계 전략",
          bullets: [
            "비축 6화 확보 후 런칭하여 주간 마감 리스크 최소화",
            "초기 식자 레이어 분리로 영어·일본어 현지화 속도 단축",
          ],
          smartArt: createDefaultSmartArtBlock("cycle-loop"),
          speakerNotes: "안정적 비축 분량과 글로벌 현지화 준비 상태를 강조하며 마무리합니다.",
          transition: "zoom",
          animations: createDefaultAnimations("series-4"),
        },
      ],
    };
  }

  if (presetId === "episode-conti-pitch") {
    return {
      title: "1화 에피소드 콘티 발표 덱",
      author: "ToonStudio 콘티 팀",
      slideSize: "16:9",
      themeId: "midnight-studio",
      slides: [
        {
          id: "conti-1",
          title: "1화 콘티 브리핑 — 옥상 대치 오프닝",
          subtitle: "첫 10컷 이탈 방지 훅과 시선 유도 구도 점검",
          bullets: [
            "오프닝 3컷: 정적 와이드 샷 → 클로즈업 눈빛 → 대사 훅 진입",
            "배경 3D 투시선과 말풍선 꼬리 방향을 일치시켜 가독성 확보",
            "모바일 390px 폭 기준 텍스트 14pt 이상 가독성 유지",
          ],
          shapes: [
            {
              id: "sh-hook",
              kind: "arrow",
              label: "시선 유도 흐름",
              xPct: 68,
              yPct: 75,
              wPct: 24,
              hPct: 11,
              tone: "highlight",
            },
          ],
          speakerNotes: "모바일 스크롤 속도에 맞춘 첫 5초 임팩트를 중심으로 설명합니다.",
          transition: "fade",
          animations: createDefaultAnimations("conti-1"),
        },
        {
          id: "conti-2",
          title: "구간별 컷 페이싱 및 리텐션 곡선",
          subtitle: "긴장·이완 리듬 배분 시나리오 (편집 가능 예시)",
          chart: createDefaultChartBlock("line"),
          table: {
            id: "tbl-conti-pacing",
            title: "구간별 컷 배분",
            headers: ["구간", "컷 수", "핵심 연출", "감정 목표"],
            rows: [
              ["도입", "10컷", "하이 앵글 정적 오프닝", "호기심 유발"],
              ["전개", "25컷", "대화 핑퐁 및 3D 공간 이동", "상황 몰입"],
              ["절정", "20컷", "집중선·대비 컷 연속 배치", "카타르시스"],
              ["엔딩", "5컷", "반전 대사 + 다음 화 예고", "결제 유도"],
            ],
            showHeaderRow: true,
            bandedRows: true,
          },
          speakerNotes: "중반 전개 구간에서 호흡이 늘어지지 않도록 액션 컷을 삽입했습니다.",
          transition: "wipe",
          animations: createDefaultAnimations("conti-2"),
        },
        {
          id: "conti-3",
          title: "주요 씬 전환 타임라인",
          subtitle: "장소·시간대 변화에 따른 색온도 및 카메라 전환 설계",
          smartArt: createDefaultSmartArtBlock("timeline-milestone"),
          bullets: [
            "씬 1 → 씬 2: 빗방울 낙하 매치 컷으로 자연스러운 시간 점프",
            "씬 3 → 씬 4: 무채색 플래시백 후 고채도 클라이맥스 복귀",
          ],
          speakerNotes: "각 전환 지점의 색온도 대비를 작화 팀과 합의하는 슬라이드입니다.",
          transition: "morph",
          animations: createDefaultAnimations("conti-3"),
        },
        {
          id: "conti-4",
          title: "편집자 리뷰 우선순위 피라미드",
          subtitle: "마감 전 최종 점검 항목 및 후속 수정 순서",
          smartArt: createDefaultSmartArtBlock("pyramid-tiers"),
          bullets: [
            "1순위: 1화 엔딩 훅 대사 임팩트 최종 확정",
            "2순위: 말풍선 겹침 및 배경 투시 정합성 검수",
          ],
          speakerNotes: "리뷰 회의에서 합의된 수정 사항을 바로 다음 컷에 반영합니다.",
          transition: "push",
          animations: createDefaultAnimations("conti-4"),
        },
      ],
    };
  }

  // 기본값: PSST 사업계획서 5슬라이드
  return {
    title: "PSST 사업계획서 — 웹툰 통합 제작·발표 스튜디오",
    author: "ToonStudio 팀",
    slideSize: "16:9",
    themeId: "pitch-cobalt",
    slides: [
      {
        id: "psst-1",
        title: "ToonStudio — 차세대 웹툰 제작·발표 통합 워크벤치",
        subtitle: "Problem · Solution · Scale-up · Team (PSST IR 피치 템플릿)",
        bullets: [
          "작화·콘티·3D 배경·식자·발표 덱을 하나의 로컬 우선 환경에 통합",
          "실제 PowerPoint 호환 .pptx 바이너리 출력으로 IR·편집부 보고 시간 단축",
          "작품 권리 BOM 자동 점검으로 출고 리스크 사전 차단",
        ],
        shapes: [
          {
            id: "sh-cover-badge",
            kind: "roundRect",
            label: "PSST IR 덱 · 편집 가능",
            xPct: 68,
            yPct: 76,
            wPct: 24,
            hPct: 11,
            tone: "accent",
          },
        ],
        speakerNotes: "심사위원에게 30초 안에 핵심 문제와 제품 차별점을 직관적으로 각인시킵니다.",
        transition: "fade",
        animations: createDefaultAnimations("psst-1"),
      },
      {
        id: "psst-2",
        title: "P · 문제인식 및 전략 진단 (SWOT)",
        subtitle: "분절된 제작 도구와 반복되는 발표·검수 병목 해소",
        bullets: [
          "현장 작가는 평균 4~5개 별도 도구를 오가며 파일 변환·재배치에 시간 소모",
          "연재 기획서·IR 피치덱 작성 시 콘티 이미지를 수동 캡처·재편집하는 비효율 발생",
        ],
        smartArt: createDefaultSmartArtBlock("swot-quadrant"),
        speakerNotes: "실제 창작자 현장의 반복 작업 비용과 스튜디오 협업 병목을 짚습니다.",
        transition: "push",
        animations: createDefaultAnimations("psst-2"),
      },
      {
        id: "psst-3",
        title: "S · 실현가능성 및 제품 고도화 타임라인",
        subtitle: "클린룸 브라우저 엔진 기반 단계별 검증 계획",
        bullets: [
          "현재 구현: 로컬 OPFS 저장, 정밀 레이아웃·불리언, 실제 OOXML .pptx 엔진",
          "향후 목표: 팀 실시간 협업 확장 및 글로벌 현지화 패키징 자동화",
        ],
        smartArt: createDefaultSmartArtBlock("timeline-milestone"),
        speakerNotes: "현재 구현 완료 항목과 협약 기간 목표 항목을 명확히 구분해 신뢰를 높입니다.",
        transition: "morph",
        animations: createDefaultAnimations("psst-3"),
      },
      {
        id: "psst-4",
        title: "S · 성장전략 및 단위경제성 시나리오",
        subtitle: "초기 스튜디오 거점 확보 후 B2B 팀 구독 확장 (목표 시나리오 예시)",
        chart: createDefaultChartBlock("bar"),
        table: {
          id: "tbl-psst-kpi",
          title: "단계별 목표 지표 (편집용 템플릿)",
          headers: ["지표 항목", "초기 목표(예시)", "확장 목표(예시)", "검증 방법"],
          rows: [
            ["팀 파일럿 전환", "12개 스튜디오", "90개 스튜디오", "유료 결제 계약"],
            ["덱 제작 시간", "50% 단축 목표", "70% 단축 목표", "파일럿 실측"],
            ["권리 검수 통과", "출고 전 자동화", "다국어 패키지 연동", "BOM 로그 검증"],
          ],
          showHeaderRow: true,
          bandedRows: true,
        },
        speakerNotes: "모든 목표 수치는 실제 파일럿 실측치로 업데이트할 편집 템플릿임을 안내합니다.",
        transition: "wipe",
        animations: createDefaultAnimations("psst-4"),
      },
      {
        id: "psst-5",
        title: "T · 팀 구성 및 핵심 역할 분담",
        subtitle: "웹 엔진 아키텍처와 웹툰 제작 도메인 역량의 결합",
        smartArt: createDefaultSmartArtBlock("org-hierarchy"),
        bullets: [
          "브라우저 2D/3D 렌더링과 표준 문서 포맷(OOXML) 자체 구현 역량 보유",
          "현업 웹툰 스튜디오 피드백 루프를 통한 주간 단위 제품 개선",
        ],
        speakerNotes: "핵심 팀원의 실행 이력과 역할 분담을 간결하게 마무리합니다.",
        transition: "zoom",
        animations: createDefaultAnimations("psst-5"),
      },
    ],
  };
}
