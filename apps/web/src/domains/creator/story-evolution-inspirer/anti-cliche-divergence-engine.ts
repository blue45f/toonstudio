/**
 * 유사 화풍·클리셰 진단 및 독창적 비틀기 영감 생성기 (순수 클라이언트 로컬 실행)
 *
 * 작가의 로그라인·장르·키워드·주인공 성향을 분석해 대표 웹툰 클리셰 12종과의
 * 유사도(0~100%)와 전형적인 작화 무드(선화 대비·색온도·컷 밀도)를 진단하고,
 * 서로 직교하는 3가지 비틀기 방향과 결정적 시드 기반 4축 영감 스파크를 생성한다.
 */

export type StoryGenreKey =
  | "modern-fantasy"
  | "romance-fantasy"
  | "romance"
  | "action-school"
  | "murim"
  | "thriller-apocalypse"
  | "sf-mystery"
  | "slice-of-life";

export const STORY_GENRE_LABELS: Readonly<Record<StoryGenreKey, string>> = {
  "modern-fantasy": "현대 판타지 · 헌터",
  "romance-fantasy": "로맨스 판타지",
  romance: "현대 로맨스",
  "action-school": "학원 액션 · 느와르",
  murim: "무협 · 동양 판타지",
  "thriller-apocalypse": "스릴러 · 아포칼립스",
  "sf-mystery": "SF · 미스터리",
  "slice-of-life": "일상 · 드라마",
};

export interface StoryPitchInput {
  readonly logline: string;
  readonly genre: StoryGenreKey;
  readonly keywords: readonly string[];
  readonly protagonistTrait: string;
}

export interface VisualMoodProfile {
  readonly lineContrastKo: string;
  readonly lineContrastScore: number;
  readonly colorTemperatureKo: string;
  readonly colorTempKelvin: number;
  readonly panelDensityKo: string;
  readonly panelsPerMobileScreen: number;
  readonly signatureLookKo: string;
}

export interface StudioRecipeRecommendation {
  readonly brushPresetKo: string;
  readonly filterMoodKo: string;
  readonly panelRhythmKo: string;
}

interface ClicheTwistBlueprints {
  readonly inversionSummaryKo: string;
  readonly inversionLoglineTemplateKo: string;
  readonly openingCutTemplateKo: string;
  readonly pivotGenreKo: string;
  readonly pivotVisualShiftKo: string;
  readonly studioRecipe: StudioRecipeRecommendation;
  readonly povSwitchTargetKo: string;
  readonly relationshipAsymmetryKo: string;
  readonly cliffhangerHookKo: string;
}

export interface WebtoonClichePattern {
  readonly id: string;
  readonly nameKo: string;
  readonly primaryGenres: readonly StoryGenreKey[];
  readonly keywords: readonly string[];
  readonly protagonistSignals: readonly string[];
  readonly typicalBeatKo: string;
  readonly visualMood: VisualMoodProfile;
  readonly twistBlueprints: ClicheTwistBlueprints;
}

export type ClicheRiskLevel = "low" | "moderate" | "high";

export interface ClicheMatchScore {
  readonly patternId: string;
  readonly nameKo: string;
  readonly similarityPercent: number;
  readonly matchedSignals: readonly string[];
  readonly typicalBeatKo: string;
  readonly visualMood: VisualMoodProfile;
}

export type TwistDirectionKind =
  | "trope-inversion"
  | "genre-mood-pivot"
  | "pov-relationship-shift";

export interface TwistDirection {
  readonly kind: TwistDirectionKind;
  readonly orthogonalAxisKo: string;
  readonly badgeKo: string;
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly primaryProposalLabelKo: string;
  readonly primaryProposalKo: string;
  readonly secondaryProposalLabelKo: string;
  readonly secondaryProposalKo: string;
  readonly studioRecipe?: StudioRecipeRecommendation;
}

export interface ClicheDiagnosisReport {
  readonly inputSummaryKo: string;
  readonly highestSimilarityPercent: number;
  readonly riskLevel: ClicheRiskLevel;
  readonly riskLabelKo: string;
  readonly primaryMatch: ClicheMatchScore;
  readonly topMatches: readonly ClicheMatchScore[];
  readonly allMatches: readonly ClicheMatchScore[];
  readonly detectedVisualMood: VisualMoodProfile;
  readonly twistDirections: readonly [TwistDirection, TwistDirection, TwistDirection];
}

export interface SparkAxisItem {
  readonly labelKo: string;
  readonly detailKo: string;
}

export interface VisualDeviceSparkItem extends SparkAxisItem {
  readonly studioTipKo: string;
}

export interface InspirationSpark {
  readonly seed: number;
  readonly setting: SparkAxisItem;
  readonly conflict: SparkAxisItem;
  readonly visualDevice: VisualDeviceSparkItem;
  readonly emotionalArc: SparkAxisItem;
  readonly combinedPromptKo: string;
  readonly firstCutVisualKo: string;
}

export const WEBTOON_CLICHE_PATTERNS: readonly WebtoonClichePattern[] = [
  {
    id: "regression-munchkin",
    nameKo: "회귀 먼치킨",
    primaryGenres: ["modern-fantasy", "murim", "romance-fantasy"],
    keywords: ["회귀", "과거", "10년 전", "미래 지식", "먼치킨", "최강", "다시", "전생", "만렙", "독점"],
    protagonistSignals: ["냉철", "압도적", "효율", "천재", "무패", "복수심"],
    typicalBeatKo: "죽기 직전 과거로 돌아간 주인공이 미래 정보와 압도적 무력으로 모든 기연을 독식한다.",
    visualMood: {
      lineContrastKo: "날카로운 고대비 펜선 · 굵은 외곽 먹선", lineContrastScore: 88,
      colorTemperatureKo: "차가운 청회·코발트 그림자", colorTempKelvin: 7800,
      panelDensityKo: "속도선 위주 고밀도 컷 (모바일 1화면 3.6컷)", panelsPerMobileScreen: 3.6,
      signatureLookKo: "어두운 배경에 발광 이펙트와 강렬한 클로즈업을 연타하는 전형적 각성 액션 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "미래 지식이 자산이 아니라 '세계를 망가뜨리는 부채'가 되도록 인과를 뒤집는다.",
      inversionLoglineTemplateKo: "과거로 돌아왔지만 미래의 사건을 하나 고칠 때마다 자신이 기억하던 소중한 인물의 존재가 통째로 지워진다.",
      openingCutTemplateKo: "1화 첫 컷: 미래의 승전보를 외우며 웃던 주인공의 수첩에서, 방금 구한 동료의 이름이 잉크째 번지며 사라지는 초근접 컷.",
      pivotGenreKo: "생활 밀착 회계 미스터리 × 따뜻한 수채 질감",
      pivotVisualShiftKo: "형광 각성광을 버리고, 오래된 종이 질감과 낮은 채도의 미온(4600K) 조명 속에 긴장을 숨긴다.",
      studioRecipe: {
        brushPresetKo: "연필 텍스처 HB + 건조한 수채 번짐 브러시",
        filterMoodKo: "웜 페이퍼 그레인 + 하이라이트 소프트 감쇠",
        panelRhythmKo: "정적인 2분할 여백 컷 뒤 침묵의 세로 롱컷",
      },
      povSwitchTargetKo: "주인공이 기연을 빼앗아 간 '원래 운명의 주인' 조연 시점",
      relationshipAsymmetryKo: "회귀자는 모든 답을 알지만 설명할 수 없고, 조연은 답을 모르기에 오히려 인간적인 선택을 내린다.",
      cliffhangerHookKo: "1화 엔딩: 조연이 주운 찢어진 미래 일정표 뒷면에 '다음에 버릴 말: 내 이름'이 적혀 있다.",
    },
  },
  {
    id: "contract-marriage-misunderstanding",
    nameKo: "계약결혼 오해",
    primaryGenres: ["romance-fantasy", "romance"],
    keywords: ["계약결혼", "계약", "이혼", "오해", "북부대공", "위장", "결혼", "파혼", "후회", "집착"],
    protagonistSignals: ["자립", "무심", "다정", "상처", "계산적", "냉혈"],
    typicalBeatKo: "1년 뒤 이혼하기로 한 위장 부부가 사소한 말실수로 서로의 진심을 오해하며 감정이 깊어진다.",
    visualMood: {
      lineContrastKo: "가늘고 매끈한 세필 로맨스 선화", lineContrastScore: 44,
      colorTemperatureKo: "부드러운 크림·로즈 골드 톤", colorTempKelvin: 4300,
      panelDensityKo: "감정선 중심 여유 컷 (모바일 1화면 2.2컷)", panelsPerMobileScreen: 2.2,
      signatureLookKo: "꽃잎·보케 브러시와 화려한 의상 디테일에 시선을 모으는 전형적 로판 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "오해로 미뤄지는 이혼 대신, 두 사람 다 상대의 본심을 첫날부터 완벽히 알고 협상하는 구도로 뒤집는다.",
      inversionLoglineTemplateKo: "계약서 조항을 깨기 위해 일부러 오해를 연출하는 두 사람이, 정작 진심이 튀어나오는 순간마다 위약금을 물어내며 공범이 된다.",
      openingCutTemplateKo: "1화 첫 컷: 촛불 아래 결혼 서약서 대신 붉은 펜으로 빼곡히 첨삭된 '감정 위반 벌금표'에 나란히 지장을 찍는 손 클로즈업.",
      pivotGenreKo: "코미디 법정 공방 × 목판 인쇄 하이콘트라스트",
      pivotVisualShiftKo: "꽃잎 보케를 빼고, 계약서 활자와 인장 붉은색만 포인트로 남기는 에디토리얼 2도 인쇄 무드로 전환한다.",
      studioRecipe: {
        brushPresetKo: "만년필 G펜 세필 + 스탬프 질감 브러시",
        filterMoodKo: "듀오톤 세피아-버밀리온 포인트 + 얇은 종이 결",
        panelRhythmKo: "대칭 2단 분할 대사 핑퐁 → 전신 정적 컷",
      },
      povSwitchTargetKo: "이 부부의 계약 위반을 감시해 수당을 받는 '전속 공증 서기관' 시점",
      relationshipAsymmetryKo: "당사자들은 끝까지 연극이라 우기지만, 기록자는 매주 늘어나는 예외 조항에서 사랑의 증거를 먼저 읽어 낸다.",
      cliffhangerHookKo: "1화 엔딩: 서기관이 봉인된 제0조 특약을 펼쳐 보니, 계약 발의자가 신랑이 아니라 죽은 줄 알았던 전 약혼자다.",
    },
  },
  {
    id: "academy-genius",
    nameKo: "아카데미 천재",
    primaryGenres: ["modern-fantasy", "romance-fantasy", "action-school"],
    keywords: ["아카데미", "입학", "천재", "낙제생", "서열", "마법학교", "학생회", "실기시험", "숨김", "교수"],
    protagonistSignals: ["숨긴 실력", "천재", "게으름", "분석형", "아웃사이더"],
    typicalBeatKo: "하위 반에 배정된 주인공이 실기 시험에서 숨겨 둔 압도적 재능을 드러내며 교내 서열을 뒤집는다.",
    visualMood: {
      lineContrastKo: "균일한 클린 셀애니 라인", lineContrastScore: 68,
      colorTemperatureKo: "선명한 스카이 블루 · 석양 골드 대비", colorTempKelvin: 5600,
      panelDensityKo: "리액션 컷 다용 리듬 (모바일 1화면 3.3컷)", panelsPerMobileScreen: 3.3,
      signatureLookKo: "교복과 마법진 이펙트, 주변 학생들의 놀라는 리액션 컷이 반복되는 아카데미물 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "주인공이 실력을 숨기는 천재가 아니라, '진짜 무능한 학생이 규칙의 허점을 설계해 천재들을 이기는' 구조로 전복한다.",
      inversionLoglineTemplateKo: "마력 측정치 0점의 학생이 마법 대신 시험장의 채점 규약과 감점 조항을 역설계해 수석 자리를 빼앗는다.",
      openingCutTemplateKo: "1화 첫 컷: 실기장 마력 구체가 0을 띄우며 붉게 울리는 순간, 주인공이 품에서 구겨진 학칙 제47조 사본을 꺼내 심판에게 내미는 컷.",
      pivotGenreKo: "건축 도면 퍼즐 스릴러 × 청사진 모노톤",
      pivotVisualShiftKo: "화려한 마법 이펙트 대신 교정 평면도·각도기·분필 필기를 컷 경계선으로 활용한다.",
      studioRecipe: {
        brushPresetKo: "제도용 테크니컬 펜 0.3 + 분필 텍스처 브러시",
        filterMoodKo: "청사진 쿨 시안 언더톤 + 선명한 지면 콘트라스트",
        panelRhythmKo: "가로 다이어그램 컷 + 빠른 3연속 시선 교차",
      },
      povSwitchTargetKo: "천재를 걸러 내야 하지만 매년 기준이 흔들리는 '실기 평가 감독관' 시점",
      relationshipAsymmetryKo: "학생은 졸업만 원하고 감독관은 아카데미가 숨겨 온 선발 진실을 감추려다 오히려 학생의 공범이 된다.",
      cliffhangerHookKo: "1화 엔딩: 수석 합격자 명단이 발표되자마자, 0점 주인공에게만 '졸업 불가: 영구 연구 대상' 도장이 찍힌다.",
    },
  },
  {
    id: "dungeon-awakening",
    nameKo: "던전 각성 · 상태창",
    primaryGenres: ["modern-fantasy", "sf-mystery"],
    keywords: ["던전", "게이트", "헌터", "각성", "상태창", "랭크", "길드", "보스", "레벨업", "S급"],
    protagonistSignals: ["생존형", "성장형", "고독", "냉정", "가족 부양"],
    typicalBeatKo: "최하위 E급 헌터가 죽음의 문턱에서 숨겨진 시스템 상태창을 각성해 최강 랭커로 올라선다.",
    visualMood: {
      lineContrastKo: "강한 명암 먹칠 + 네온 림라이트", lineContrastScore: 90,
      colorTemperatureKo: "차가운 청록 · 보라 던전 조명", colorTempKelvin: 8200,
      panelDensityKo: "세로 액션 스플래시 강조 (모바일 1화면 3.1컷)", panelsPerMobileScreen: 3.1,
      signatureLookKo: "반투명 푸른 UI 상태창과 어두운 동굴 속 발광 검기가 화면을 채우는 헌터물 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "레벨업이 강해지는 보상이 아니라, '능력치가 오를수록 던전 생태계에 동화되어 인간 감각을 잃는' 대가로 전복한다.",
      inversionLoglineTemplateKo: "게이트를 닫을 때마다 몬스터의 감각 기관이 몸에 이식되는 말단 청소부가, 인간으로 남기 위해 일부러 레벨 다운을 노린다.",
      openingCutTemplateKo: "1화 첫 컷: 상태창에 '축하합니다! 미각 상실 → 마력 후각 해금' 경고가 뜨자, 주인공이 방금 끓인 라면을 내려다보며 수저를 떨구는 컷.",
      pivotGenreKo: "도시 생태 르포 다큐 × 자연광 필름 누아르",
      pivotVisualShiftKo: "네온 상태창을 걷어내고, 형광등 깜빡이는 지하철 환기구와 현실적인 빗물 반사광으로 공포를 키운다.",
      studioRecipe: {
        brushPresetKo: "거친 딥펜 + Wet 콘크리트 스펀지 브러시",
        filterMoodKo: "35mm 흐린 날 필름 톤 + 저채도 녹청 그림자",
        panelRhythmKo: "밀착 클로즈업 3연타 → 광각 도시 전경 해방",
      },
      povSwitchTargetKo: "던전이 닫힌 뒤 남겨진 잔해와 몬스터 사체를 수거해 감정하는 '사후 복구반 보험 조사원' 시점",
      relationshipAsymmetryKo: "S급 헌터는 영웅으로 소비되지만 조사원은 현장의 훼손 흔적에서 헌터가 은폐한 거래를 발견한다.",
      cliffhangerHookKo: "1화 엔딩: 처치 완료 보고된 보스 몬스터의 위장에서, 어제 사망 처리된 S급 헌터의 인식표 대신 '내일 날짜 영수증'이 나온다.",
    },
  },
  {
    id: "revenge-obsession",
    nameKo: "복수 집착극",
    primaryGenres: ["romance-fantasy", "action-school", "thriller-apocalypse"],
    keywords: ["복수", "배신", "처형", "집착", "파멸", "가문", "피", "응징", "살인", "몰락"],
    protagonistSignals: ["집요", "차가움", "광기", "계산적", "상처"],
    typicalBeatKo: "모든 것을 빼앗긴 주인공이 차갑게 변모해 배신자들을 한 명씩 함정에 빠뜨리며 처절히 응징한다.",
    visualMood: {
      lineContrastKo: "거친 스크래치 해칭 · 깊은 흑백 대비", lineContrastScore: 86,
      colorTemperatureKo: "차가운 흑회색 + 진홍 포인트", colorTempKelvin: 6900,
      panelDensityKo: "압박감 있는 좁은 컷 분할 (모바일 1화면 3.8컷)", panelsPerMobileScreen: 3.8,
      signatureLookKo: "눈동자 클로즈업과 붉은 악센트, 그림자 절반을 덮은 얼굴 구도가 반복되는 복수극 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "복수 대상이 이미 무너져 있어, 주인공이 '복수할 가치를 되살려 주기 위해 적을 재건'해야 하는 역설로 뒤집는다.",
      inversionLoglineTemplateKo: "10년을 갈아 원수를 찾아냈더니 기억을 잃고 선량한 빵집 주인이 되어 있었다—주인공은 완벽한 복수를 위해 그의 기억을 되찾아 주기로 한다.",
      openingCutTemplateKo: "1화 첫 컷: 칼을 숨긴 채 들어간 골목 빵집에서, 원수가 화상 자국 난 손으로 갓 구운 식빵을 공짜로 건네며 미소 짓는 역광 컷.",
      pivotGenreKo: "블랙 코미디 심리극 × 고채도 포스터 컬러",
      pivotVisualShiftKo: "어두운 핏빛 대신 지나치게 밝은 낮 햇살과 깔끔한 일상 색감 속에 섬뜩한 내면 독백을 대비시킨다.",
      studioRecipe: {
        brushPresetKo: "플랫 마커 + 깔끔한 잉크 아웃라인 펜",
        filterMoodKo: "고명도 데이라이트 클린 + 미세 하프톤 점묘",
        panelRhythmKo: "일상 4컷 리듬을 깨는 무음의 대각선 찢김 컷",
      },
      povSwitchTargetKo: "주인공이 설계한 복수 계획의 알리바이를 매번 우연히 망쳐 놓는 '옆집 택배 기사' 시점",
      relationshipAsymmetryKo: "주인공은 상대를 체스 말로 보지만, 조연은 외로운 이웃이 무리한다고 오해해 선의로 계획을 꼬아 놓는다.",
      cliffhangerHookKo: "1화 엔딩: 기억을 잃은 줄 알았던 원수가 문이 닫히자마자 주인공의 가명을 정확한 옛 이름으로 부르며 오븐 타이머를 맞춘다.",
    },
  },
  {
    id: "time-loop",
    nameKo: "타임루프 탈출",
    primaryGenres: ["sf-mystery", "thriller-apocalypse", "romance"],
    keywords: ["타임루프", "반복", "루프", "같은 날", "시계", "죽음 반복", "탈출", "기억 유지", "시간"],
    protagonistSignals: ["집요", "피로감", "관찰형", "이성적", "고립"],
    typicalBeatKo: "비극으로 끝나는 하루를 수십 번 반복하며 단서를 모아 완벽한 루트를 찾아 루프를 깨뜨린다.",
    visualMood: {
      lineContrastKo: "중고대비 정교한 펜선 · 시계 모티프", lineContrastScore: 72,
      colorTemperatureKo: "불안한 황혼 오렌지 · 청남색 교차", colorTempKelvin: 5100,
      panelDensityKo: "반복 변주를 강조하는 그리드 컷 (모바일 1화면 3.4컷)", panelsPerMobileScreen: 3.4,
      signatureLookKo: "같은 구도의 컷을 미세하게 변주하고 시계 바늘·달력을 인서트로 넣는 미스터리 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "주인공이 루프를 깨려는 것이 아니라, '누군가 루프를 끝내려 할 때마다 오늘을 연장해 붙잡아야 하는' 구조로 전복한다.",
      inversionLoglineTemplateKo: "내일이 오면 도시 전체가 증발한다는 사실을 알게 된 시간 감시자가, 하루를 끝내려는 또 다른 루퍼를 막기 위해 매번 사고를 일으킨다.",
      openingCutTemplateKo: "1화 첫 컷: 횡단보도에서 사고를 막으려 뛰어드는 소녀의 발목을, 주인공이 일부러 걸어 넘어뜨리며 '미안, 아직 내일이 오면 안 돼'라고 속삭이는 컷.",
      pivotGenreKo: "레트로 80년대 추격 활극 × 필름 컷아웃 콜라주",
      pivotVisualShiftKo: "우울한 시계 모티프 대신 매 루프마다 색 팔레트가 미세하게 퇴색하는 아날로그 인화지 변색 연출을 쓴다.",
      studioRecipe: {
        brushPresetKo: "거친 펠트펜 + 스플래터 잉크 브러시",
        filterMoodKo: "색수차 미세 드리프트 + 코닥 웜 크로스프로세스",
        panelRhythmKo: "동일 프레임 3연속 스냅컷 → 화면 밖으로 튀는 와이드 컷",
      },
      povSwitchTargetKo: "루프 기억은 없지만 영상 타임코드가 0.3초씩 어긋나는 흔적을 추적하는 '지하철 CCTV 판독원' 시점",
      relationshipAsymmetryKo: "루퍼는 아무도 모른다 믿지만, 판독원은 타임코드 오차로 외부인의 개입을 눈치챈다.",
      cliffhangerHookKo: "1화 엔딩: 판독원이 정지시킨 화면 속 주인공이 카메라를 똑바로 올려다보며 '이번 회차엔 4분 일찍 눈치챘네?'라고 입모양으로 말한다.",
    },
  },
  {
    id: "chaebol-romance",
    nameKo: "재벌 오피스 로맨스",
    primaryGenres: ["romance", "slice-of-life"],
    keywords: ["재벌", "대표님", "본부장", "비서", "사내연애", "신입", "상속", "오피스", "갑을", "스캔들"],
    protagonistSignals: ["성실", "당찬", "까칠", "워커홀릭", "완벽주의"],
    typicalBeatKo: "완벽하지만 차가운 재벌 후계자가 당찬 말단 직원에게만 마음을 열며 사내 스캔들을 헤쳐 나간다.",
    visualMood: {
      lineContrastKo: "매끄럽고 가벼운 디지털 잉킹", lineContrastScore: 48,
      colorTemperatureKo: "화사한 파스텔 핑크 · 오피스 화이트", colorTempKelvin: 5400,
      panelDensityKo: "투샷·표정 위주 쾌적한 호흡 (모바일 1화면 2.4컷)", panelsPerMobileScreen: 2.4,
      signatureLookKo: "유리 빌딩 배경 3D 에셋과 톤업 피부 보정, 말풍선 여백이 넓은 현대 로맨스 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "재벌이 직원을 구원하는 구도를 뒤집어, '파산 직전 위장 재벌이 실무 천재 직원의 월급을 못 줘 동업자로 매달리는' 역전극으로 바꾼다.",
      inversionLoglineTemplateKo: "화려한 펜트하우스에 살지만 실은 회사 통장 잔고가 14만 원인 대표가, 퇴사를 막기 위해 경리 담당과 비밀 회생 동맹을 맺는다.",
      openingCutTemplateKo: "1화 첫 컷: 고급 수트 차림의 본부장이 비상계단에서 삼각김밥을 먹다 법인카드 정지 문자를 보고 얼어붙는데, 경리 직원이 영수증을 들이미는 컷.",
      pivotGenreKo: "생활 밀착 스타트업 하이스트 × 에디토리얼 잉크 워시",
      pivotVisualShiftKo: "뻔한 유리 빌딩 3D 배경을 줄이고, 커피 얼룩·포스트잇·야근 형광등 같은 촉감 있는 오브제를 화면 전경에 배치한다.",
      studioRecipe: {
        brushPresetKo: "부드러운 사인펜 + 드라이 구아슈 텍스처",
        filterMoodKo: "미세 웜 램프 틴트 + 하이라이트 매트 마감",
        panelRhythmKo: "좁은 시선 교차 컷 + 컷 밖으로 삐져나온 영수증 인서트",
      },
      povSwitchTargetKo: "두 사람의 비밀 거래를 전혀 모른 채 사내 연애 찌라시를 퍼뜨리는 '사내 익명 게시판 운영자' 시점",
      relationshipAsymmetryKo: "당사자들은 생존 회의를 하는데, 주변 직원들은 로맨스로 오해해 오히려 투자 유치와 사내 정치에 유리한 여론이 만들어진다.",
      cliffhangerHookKo: "1화 엔딩: 파산 위기를 숨기던 대표의 비밀 채권자가 다름 아닌 경리 직원의 어릴 적 후원 재단임이 등기부등본에 찍혀 나온다.",
    },
  },
  {
    id: "zombie-apocalypse",
    nameKo: "좀비 아포칼립스",
    primaryGenres: ["thriller-apocalypse", "action-school", "sf-mystery"],
    keywords: ["좀비", "감염", "생존", "아포칼립스", "바이러스", "백신", "피난처", "물자", "종말", "격리"],
    protagonistSignals: ["생존력", "냉정", "이타적", "의심", "실용주의"],
    typicalBeatKo: "갑작스러운 감염병 창궐 속 생존자들이 물자를 두고 갈등하며 안전지대로 이동한다.",
    visualMood: {
      lineContrastKo: "거친 러프 먹선 · 두꺼운 그림자 해칭", lineContrastScore: 92,
      colorTemperatureKo: "탁한 녹회색 · 먼지 낀 잿빛", colorTempKelvin: 6400,
      panelDensityKo: "긴박한 컷 전환과 충격 스플래시 (모바일 1화면 3.7컷)", panelsPerMobileScreen: 3.7,
      signatureLookKo: "거친 질감과 낮은 채도, 어두운 복도에서 튀어나오는 공포 연출 중심의 생존 스릴러 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "좀비가 이성을 잃은 괴물이 아니라, '감염자가 오히려 집단 기억을 공유하며 인류보다 질서 있는 사회를 세운' 세계로 전복한다.",
      inversionLoglineTemplateKo: "격리 구역 밖의 감염자들이 전기를 복구하고 농사를 짓기 시작하자, 마지막 비감염자 아파트 주민들이 역으로 '초대받지 못한 난민'이 된다.",
      openingCutTemplateKo: "1화 첫 컷: 바리케이드 너머로 침입한 줄 알았던 감염자가 현관 앞에 깔끔히 포장된 항생제와 '소음 민원 안내문'을 두고 돌아서는 컷.",
      pivotGenreKo: "사회 풍자 휴먼 드라마 × 따뜻한 햇빛 목탄화",
      pivotVisualShiftKo: "어두운 잿빛 공포 톤을 뒤집어, 정돈된 오후 햇살과 푸른 텃밭을 배경으로 묘한 위화감을 극대화한다.",
      studioRecipe: {
        brushPresetKo: "소프트 목탄 + 린넨 캔버스 오버레이",
        filterMoodKo: "오후 4시 웜 선라이트 + 부드러운 그림자 리프트",
        panelRhythmKo: "광각 풍경 정지 컷 → 인물 눈동자 무음 클로즈업",
      },
      povSwitchTargetKo: "초기 감염 후 기억의 절반만 남아 비감염자 딸에게 편지를 배달하는 '감염 우체부' 시점",
      relationshipAsymmetryKo: "인간들은 그를 괴물로 겨누지만, 그는 자신이 아직 인간이라 믿으며 매일 정확히 오후 3시에 우편함을 채운다.",
      cliffhangerHookKo: "1화 엔딩: 딸이 보낸 줄 알았던 답장 봉투 안에는 백신 성분이 아니라 '격리 아파트 내부에서 퍼진 진짜 변종 지도'가 들어 있다.",
    },
  },
  {
    id: "villainess-possession",
    nameKo: "악녀 빙의 · 사망 플래그",
    primaryGenres: ["romance-fantasy", "romance"],
    keywords: ["빙의", "악녀", "소설", "원작", "사망 플래그", "여주인공", "황태자", "단두대", "회피", "엔딩"],
    protagonistSignals: ["현실적", "유쾌", "생존형", "계산적", "눈치 빠름"],
    typicalBeatKo: "소설 속 처형 예정 악녀에 빙의한 주인공이 원작 전개를 피해 조용히 살려다 오히려 주요 인물들의 집착을 산다.",
    visualMood: {
      lineContrastKo: "화려한 장식 세필 + 섬세한 속눈썹 묘사", lineContrastScore: 46,
      colorTemperatureKo: "화려한 샴페인 골드 · 버건디 액센트", colorTempKelvin: 4200,
      panelDensityKo: "감정·독백 중심 여유 구성 (모바일 1화면 2.3컷)", panelsPerMobileScreen: 2.3,
      signatureLookKo: "드레스 레이스 브러시와 화려한 샹들리에, SD 개그 컷이 섞이는 클래식 빙의물 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "빙의자가 몸을 차지하는 대신, '원래 악녀의 영혼이 몸 안에 남아 현대인 빙의자와 교대 근무하며 복수를 코칭'하는 구조로 전복한다.",
      inversionLoglineTemplateKo: "소설 속 악녀 몸에 들어왔는데 원래 주인이 쫓겨나지 않았다—낮에는 현대인이 평판을 수습하고 밤에는 진짜 악녀가 정적을 처리한다.",
      openingCutTemplateKo: "1화 첫 컷: 거울 속 악녀가 주인공과 다른 표정으로 웃으며 립스틱으로 유리 위에 '오후 8시부터는 내 차례야'라고 적어 내려가는 컷.",
      pivotGenreKo: "이중인격 버디 정치 스릴러 × 바로크 키아로스쿠로",
      pivotVisualShiftKo: "귀여운 SD 개그 컷을 절제하고, 거울·유리·물웅덩이 반사 구도로 두 인격의 주도권 다툼을 시각화한다.",
      studioRecipe: {
        brushPresetKo: "클래식 딥펜 + 유화 글레이징 브러시",
        filterMoodKo: "촛불 웜 키라이트 + 딥 섀도우 비네팅",
        panelRhythmKo: "좌우 거울 대칭 분할 컷 → 시점 역전 틸트 컷",
      },
      povSwitchTargetKo: "악녀의 갑작스러운 성격 변화를 가장 먼저 눈치챈 '전속 시녀장' 시점",
      relationshipAsymmetryKo: "두 영혼은 서로만 아는 비밀이라 여기지만, 시녀장은 필체와 홍차 따르는 각도만으로 이미 교대 시간표를 파악해 두었다.",
      cliffhangerHookKo: "1화 엔딩: 시녀장이 건넨 원작 소설의 마지막 장은 백지가 아니라, 현대인 주인공의 실제 이름과 생일이 인쇄되어 있다.",
    },
  },
  {
    id: "murim-reincarnation",
    nameKo: "무림 환생 · 천마 귀환",
    primaryGenres: ["murim", "modern-fantasy"],
    keywords: ["무림", "천마", "화산", "환생", "문파", "검기", "내공", "장로", "중원", "비급"],
    protagonistSignals: ["호탕", "오만", "노련", "고수", "파격"],
    typicalBeatKo: "전설의 고수가 몰락한 문파의 망나니 몸으로 환생해 옛 무공으로 문파를 재건하고 중원을 호령한다.",
    visualMood: {
      lineContrastKo: "강약이 뚜렷한 동양 붓선 · 비백 효과", lineContrastScore: 84,
      colorTemperatureKo: "먹색 기반 + 청옥·주홍 검기", colorTempKelvin: 5800,
      panelDensityKo: "역동적 대각선 액션 컷 (모바일 1화면 3.2컷)", panelsPerMobileScreen: 3.2,
      signatureLookKo: "거친 먹물 브러시와 화려한 검기 이펙트, 호탕한 표정 클로즈업이 돋보이는 신무협 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "전설의 무공이 최강이 아니라, '100년 사이 무림이 완전히 현대화·규격화되어 옛 비급이 오히려 불법·구식 취급받는' 격차로 전복한다.",
      inversionLoglineTemplateKo: "천하제일 검마가 환생해 보니 무림맹이 안전규정과 특허청을 세워 놓았다—옛 살초를 쓰면 벌금과 자격 정지를 맞는 바람에 생활 무공으로 재기한다.",
      openingCutTemplateKo: "1화 첫 컷: 천마가 일검으로 바위를 가르자마자, 무림맹 공무원이 달려와 '무허가 내공 발산 과태료 300냥' 고지서를 검 끝에 꽂아 넣는 컷.",
      pivotGenreKo: "무협 생활 행정 코미디 × 수묵 담채 에디토리얼",
      pivotVisualShiftKo: "과도한 발광 검기를 빼고, 한지 여백과 담채 먹번짐 위에 관인·장부 같은 생활 소품을 선명히 올린다.",
      studioRecipe: {
        brushPresetKo: "갈필 캘리그래피 붓 + 한지 번짐 수묵 브러시",
        filterMoodKo: "따뜻한 미색 한지 텍스처 + 담채 채도 억제",
        panelRhythmKo: "여백 넓은 산수 구도 → 촘촘한 말다툼 3컷",
      },
      povSwitchTargetKo: "천마의 폭주를 말리며 문파 회계 장부를 맞추는 '열일곱 살 막내 경리 사제' 시점",
      relationshipAsymmetryKo: "천마는 무력으로 모든 걸 풀려 하고 막내 사제는 세금과 임대료를 들이밀며 천하제일 고수를 주판으로 제압한다.",
      cliffhangerHookKo: "1화 엔딩: 압류 직전 문파 창고에서 발견된 빚 문서의 채권자 서명이, 100년 전 천마 본인이 술김에 써 준 필체와 똑같다.",
    },
  },
  {
    id: "school-hierarchy-brawl",
    nameKo: "학원 서열 · 격투",
    primaryGenres: ["action-school", "thriller-apocalypse"],
    keywords: ["일진", "서열", "학교", "싸움", "전학생", "복수", "주먹", "폭력", "짱", "크루"],
    protagonistSignals: ["은둔 고수", "복수심", "정의감", "반항", "성장형"],
    typicalBeatKo: "폭력 서열이 지배하는 학교에 전학 온 주인공이 싸움 실력으로 일진 연합을 차례로 쓰러뜨린다.",
    visualMood: {
      lineContrastKo: "굵고 거친 잉크선 · 타격 집중선", lineContrastScore: 91,
      colorTemperatureKo: "강렬한 콘크리트 회색 + 경고 노랑·빨강", colorTempKelvin: 6200,
      panelDensityKo: "타격감 중심 빠른 컷 분할 (모바일 1화면 3.9컷)", panelsPerMobileScreen: 3.9,
      signatureLookKo: "과장된 원근감의 주먹 컷과 강렬한 역광, 교복 붕대 실루엣 중심의 학원 액션 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "주먹으로 서열을 제패하는 대신, '단 한 대도 때리지 않고 학교의 권력 자금줄과 여론을 무너뜨리는 비폭력 해체극'으로 전복한다.",
      inversionLoglineTemplateKo: "싸움을 못 해 전학만 네 번 다닌 전학생이, 교내 서열 1위가 운영하는 중고거래·급식 대리결제 생태계를 감사해 하룻밤에 권력을 붕괴시킨다.",
      openingCutTemplateKo: "1화 첫 컷: 옥상으로 불려 간 주인공이 주먹을 쥐는 대신, 일진 크루의 계좌 이체 내역을 정리한 프린트물을 바람에 흩날리는 컷.",
      pivotGenreKo: "청춘 탐사 저널리즘 × 리소그래프 그라픽",
      pivotVisualShiftKo: "어두운 골목 타격 이펙트 대신 교내 신문·형광펜 밑줄·CCTV 타임스탬프를 시각 모티프로 사용한다.",
      studioRecipe: {
        brushPresetKo: "거친 사인펜 + 하이라이터 형광 마커",
        filterMoodKo: "리소그래프 잉크 입자 + 고대비 오프화이트 지면",
        panelRhythmKo: "교차 편집 몽타주 4컷 → 정면 응시 클로즈업",
      },
      povSwitchTargetKo: "서열 1위에게 매번 져 주며 교내 평화를 유지하던 '실제 체육특기생 부반장' 시점",
      relationshipAsymmetryKo: "부반장은 힘으로 누르면 더 큰 폭력이 온다는 걸 알기에 참아 왔지만, 전학생의 판 깨기가 자신이 지키던 균형을 흔든다.",
      cliffhangerHookKo: "1화 엔딩: 서열 1위의 배후 자금줄을 추적한 끝자락에 학교 이사장이 아니라 주인공이 전학 오기 전 학교의 담임 이름이 뜬다.",
    },
  },
  {
    id: "constellation-stream-tower",
    nameKo: "성좌 · 탑 등반 스트리밍",
    primaryGenres: ["modern-fantasy", "sf-mystery"],
    keywords: ["성좌", "탑", "방송", "후원", "코인", "퀘스트", "시청자", "시나리오", "초월자", "랭킹"],
    protagonistSignals: ["기지", "쇼맨십", "냉철", "도박사", "생존형"],
    typicalBeatKo: "초월적 관객들이 후원하는 탑 시나리오에서 주인공이 기발한 플레이로 코인을 쓸어 담아 성장한다.",
    visualMood: {
      lineContrastKo: "선명한 디지털 라인 + 홀로그램 글로우", lineContrastScore: 80,
      colorTemperatureKo: "네온 시안 · 마젠타 방송 오버레이", colorTempKelvin: 7400,
      panelDensityKo: "채팅창·시스템창 혼합 고밀도 컷 (모바일 1화면 3.5컷)", panelsPerMobileScreen: 3.5,
      signatureLookKo: "화면 곳곳에 뜨는 성좌 메시지 팝업과 화려한 스킬 이펙트가 공존하는 탑 등반물 화풍",
    },
    twistBlueprints: {
      inversionSummaryKo: "주인공이 후원받는 참가자가 아니라, '시청률 저조로 폐지 위기에 몰린 하위 층 몬스터 무대감독'이 되어 쇼를 조작하는 구조로 전복한다.",
      inversionLoglineTemplateKo: "3층 보스방의 무대 조명과 함정을 관리하던 하급 스태프가, 구조조정을 피하기 위해 일부러 평범한 도전자 한 명을 스타로 키워 낸다.",
      openingCutTemplateKo: "1화 첫 컷: 영웅이 극적으로 함정을 피한 직후, 천장 덕트 뒤에서 레버를 몰래 풀어 준 스태프가 무전기로 '지금 후원 팝업 띄워!'라고 외치는 컷.",
      pivotGenreKo: "백스테이지 방송국 블랙코미디 × 극장 스포트라이트",
      pivotVisualShiftKo: "화려한 스킬 이펙트를 무대 장치·케이블·조명 트러스가 드러난 이면 컷과 교차시켜 메타 긴장을 만든다.",
      studioRecipe: {
        brushPresetKo: "테크니컬 잉크 펜 + 거친 스크리닝 톤 브러시",
        filterMoodKo: "백스테이지 웜 텅스텐 vs 무대 쿨 스포트라이트 2톤",
        panelRhythmKo: "방송 화면 프레임 컷 ↔ 무대 뒤 좁은 와이드 컷 교차",
      },
      povSwitchTargetKo: "후원 코인을 쏘는 신들 가운데 정작 파산 직전인 '무명 신입 성좌' 시점",
      relationshipAsymmetryKo: "도전자는 위대한 신이 자신을 택했다 믿지만, 실제로는 신입 성좌가 생활비를 쪼개 1코인씩 빌려 후원하며 함께 생존을 건다.",
      cliffhangerHookKo: "1화 엔딩: 스태프가 조종하던 도전자에게 '당신도 방송을 보고 있는 거 다 안다'는 비밀 채팅이 관리자 권한으로 도착한다.",
    },
  },
];

export interface StoryPresetSample {
  readonly id: string;
  readonly labelKo: string;
  readonly input: StoryPitchInput;
}

export const DEFAULT_STORY_PITCH_SAMPLES: readonly StoryPresetSample[] = [
  {
    id: "sample-regression-hunter",
    labelKo: "회귀 던전 헌터 초안",
    input: {
      logline: "최하위 E급 헌터로 배신당해 죽은 주인공이 10년 전으로 회귀해 숨겨진 상태창과 미래 지식으로 S급 던전을 독점한다.",
      genre: "modern-fantasy",
      keywords: ["회귀", "던전", "상태창", "각성", "먼치킨"],
      protagonistTrait: "냉철하고 효율을 중시하는 복수형 성장 주인공",
    },
  },
  {
    id: "sample-contract-rofan",
    labelKo: "계약결혼 악녀 초안",
    input: {
      logline: "소설 속 파멸 예정 악녀에 빙의한 주인공이 사망 플래그를 피하려 냉혈 북부대공과 1년 계약결혼을 맺지만 사소한 오해로 집착을 산다.",
      genre: "romance-fantasy",
      keywords: ["계약결혼", "악녀", "빙의", "오해", "북부대공"],
      protagonistTrait: "현실적이고 자립을 꿈꾸는 눈치 빠른 여주인공",
    },
  },
];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function scorePatternMatch(pattern: WebtoonClichePattern, input: StoryPitchInput): ClicheMatchScore {
  const haystack = normalizeText([input.logline, input.keywords.join(" "), input.protagonistTrait].join(" "));
  const matchedSignals: string[] = [];

  let keywordHits = 0;
  for (const kw of pattern.keywords) {
    if (haystack.includes(normalizeText(kw))) {
      keywordHits += 1;
      matchedSignals.push(kw);
    }
  }

  let traitHits = 0;
  for (const signal of pattern.protagonistSignals) {
    if (haystack.includes(normalizeText(signal))) {
      traitHits += 1;
      if (!matchedSignals.includes(signal)) matchedSignals.push(signal);
    }
  }

  const genreScore = pattern.primaryGenres.includes(input.genre) ? 18 : 4;
  const rawTotal = haystack.length === 0
    ? genreScore
    : Math.min(68, keywordHits * 17) + genreScore + Math.min(14, traitHits * 7);

  return {
    patternId: pattern.id,
    nameKo: pattern.nameKo,
    similarityPercent: Math.max(0, Math.min(100, Math.round(rawTotal))),
    matchedSignals: matchedSignals.slice(0, 5),
    typicalBeatKo: pattern.typicalBeatKo,
    visualMood: pattern.visualMood,
  };
}

function extractCoreMotif(input: StoryPitchInput, fallbackName: string): string {
  const cleanKeywords = input.keywords.map((item) => item.trim()).filter(Boolean);
  if (cleanKeywords.length >= 2) return `'${cleanKeywords[0]}·${cleanKeywords[1]}' 설정`;
  if (cleanKeywords.length === 1 && cleanKeywords[0]) return `'${cleanKeywords[0]}' 설정`;
  const shortLine = input.logline.trim().slice(0, 26);
  return shortLine ? `"${shortLine}${input.logline.trim().length > 26 ? "…" : ""}"` : `${fallbackName} 구도`;
}

function buildOrthogonalTwists(
  primaryPattern: WebtoonClichePattern,
  secondaryPattern: WebtoonClichePattern | undefined,
  input: StoryPitchInput,
): readonly [TwistDirection, TwistDirection, TwistDirection] {
  const motif = extractCoreMotif(input, primaryPattern.nameKo);
  const traitSnippet = input.protagonistTrait.trim() || "기존 주인공 성향";
  const bp = primaryPattern.twistBlueprints;
  const secondaryHint =
    secondaryPattern && secondaryPattern.id !== primaryPattern.id
      ? ` (2순위 유사 패턴 '${secondaryPattern.nameKo}'의 익숙한 전개까지 함께 회피)`
      : "";

  return [
    {
      kind: "trope-inversion",
      orthogonalAxisKo: "서사 인과 축",
      badgeKo: "방향 1 · 서사 전복",
      titleKo: `${primaryPattern.nameKo}의 핵심 보상을 '대가'로 뒤집기`,
      summaryKo: `${motif}에서 독자가 예상하는 보상 공식을 정면으로 역전합니다. ${bp.inversionSummaryKo}${secondaryHint}`,
      primaryProposalLabelKo: "반전 로그라인 제안",
      primaryProposalKo: `${bp.inversionLoglineTemplateKo} (${traitSnippet}의 선택이 해법이 아니라 딜레마를 키웁니다.)`,
      secondaryProposalLabelKo: "1화 오프닝 컷 제안",
      secondaryProposalKo: bp.openingCutTemplateKo,
    },
    {
      kind: "genre-mood-pivot",
      orthogonalAxisKo: "시각·장르 문법 축",
      badgeKo: "방향 2 · 크로스 장르 무드 피벗",
      titleKo: `${STORY_GENRE_LABELS[input.genre]} → ${bp.pivotGenreKo}`,
      summaryKo: `기존 '${primaryPattern.visualMood.lineContrastKo}' 화풍 관성에서 벗어나, 이질적 장르 문법과 색채 리듬으로 첫 3컷 인상을 갈아엎습니다.`,
      primaryProposalLabelKo: "색채·연출 피벗 전략",
      primaryProposalKo: bp.pivotVisualShiftKo,
      secondaryProposalLabelKo: "권장 ToonStudio 작화 레시피",
      secondaryProposalKo: `브러시: ${bp.studioRecipe.brushPresetKo} · 필터: ${bp.studioRecipe.filterMoodKo} · 컷 리듬: ${bp.studioRecipe.panelRhythmKo}`,
      studioRecipe: bp.studioRecipe,
    },
    {
      kind: "pov-relationship-shift",
      orthogonalAxisKo: "시점·관계 구도 축",
      badgeKo: "방향 3 · 시점·관계 비대칭",
      titleKo: `${bp.povSwitchTargetKo}으로 카메라 옮기기`,
      summaryKo: `${motif}의 주인공을 카메라 중심에서 한 발 비켜 세우고, 정보 격차가 살아 있는 비대칭 관계로 몰입을 끌어올립니다.`,
      primaryProposalLabelKo: "관계 비대칭 구도",
      primaryProposalKo: bp.relationshipAsymmetryKo,
      secondaryProposalLabelKo: "독자 이탈 방지 1화 클리프행어 훅",
      secondaryProposalKo: bp.cliffhangerHookKo,
    },
  ];
}

/**
 * 작가의 스토리 입력을 12종 웹툰 클리셰와 비교 분석하고,
 * 유사 작화 무드 프로파일과 직교하는 3가지 비틀기 방향을 반환한다.
 */
export function analyzeStoryClicheSimilarity(input: StoryPitchInput): ClicheDiagnosisReport {
  const scored = WEBTOON_CLICHE_PATTERNS.map((pattern) => scorePatternMatch(pattern, input)).sort(
    (a, b) => b.similarityPercent - a.similarityPercent,
  );
  const primaryMatch = scored[0];
  if (!primaryMatch) throw new Error("WEBTOON_CLICHE_PATTERNS must not be empty");

  const primaryPattern =
    WEBTOON_CLICHE_PATTERNS.find((item) => item.id === primaryMatch.patternId) ??
    WEBTOON_CLICHE_PATTERNS[0];
  const secondaryMatch = scored[1];
  const secondaryPattern = secondaryMatch
    ? WEBTOON_CLICHE_PATTERNS.find((item) => item.id === secondaryMatch.patternId)
    : undefined;
  if (!primaryPattern) throw new Error("Primary cliché pattern missing");

  const highest = primaryMatch.similarityPercent;
  const riskLevel: ClicheRiskLevel = highest >= 65 ? "high" : highest >= 38 ? "moderate" : "low";
  const riskLabelKo =
    riskLevel === "high"
      ? "기시감 높음 · 비틀기 강력 권장"
      : riskLevel === "moderate"
        ? "익숙한 공식 감지 · 차별화 포인트 보강 권장"
        : "독창성 양호 · 무드·시점 변주 참고";

  return {
    inputSummaryKo: `${STORY_GENRE_LABELS[input.genre]} · 키워드 ${input.keywords.filter((k) => k.trim()).length}개 분석`,
    highestSimilarityPercent: highest,
    riskLevel,
    riskLabelKo,
    primaryMatch,
    topMatches: scored.slice(0, 3),
    allMatches: scored,
    detectedVisualMood: primaryMatch.visualMood,
    twistDirections: buildOrthogonalTwists(primaryPattern, secondaryPattern, input),
  };
}

const SPARK_SETTINGS: readonly SparkAxisItem[] = [
  { labelKo: "해발 2,000m 폐쇄 케이블카 환승역", detailKo: "안개가 짙어지면 정거장 표지판의 지명이 바뀌는 고립 공간" },
  { labelKo: "조수 간만으로 하루 두 번 잠기는 헌책방 골목", detailKo: "썰물 4시간 동안만 문이 열리는 해안 보존 서고" },
  { labelKo: "퇴역한 우주 정거장을 개조한 야간 세탁소", detailKo: "무중력 구역에서 기억이 묻은 옷가지를 세탁하는 변방 터미널" },
  { labelKo: "1989년 서울 지하철 미개통 환승 통로", detailKo: "설계도에만 존재하던 4번 출구 아래의 비밀 경매장" },
  { labelKo: "유리 온실로 덮인 북극권 기상 관측소", detailKo: "백야 동안 그림자가 사라져 비밀 거래가 일어나는 식물원" },
  { labelKo: "사라진 악기만 수리하는 심야 공방", detailKo: "연주할 때마다 주인의 거짓말을 폭로하는 악기들이 모이는 곳" },
  { labelKo: "초고층 아파트 옥상 양봉 조합", detailKo: "도시의 전파를 꿀에 저장하는 벌집을 지키는 주민들의 자치구" },
  { labelKo: "영구 정전된 고풍스러운 오페라 극장", detailKo: "촛불과 거울 반사만으로 공연을 이어 가는 지하 극단" },
  { labelKo: "국경선 철교 위에 걸쳐 지어진 여관", detailKo: "복도 왼쪽과 오른쪽의 법과 통화가 다른 완충 지대" },
  { labelKo: "화산재로 덮인 온천 휴양 마을의 우체국", detailKo: "수신인이 사라진 편지들이 50년째 쌓여 가는 분류 창고" },
];

const SPARK_CONFLICTS: readonly SparkAxisItem[] = [
  { labelKo: "기억 담보 대출 회수 기한 72시간", detailKo: "빚을 못 갚으면 가장 사랑했던 기억 한 토막이 경매에 넘어간다" },
  { labelKo: "사라진 증인의 대역을 7일간 연기", detailKo: "목격자를 숨기기 위해 적대 조직의 눈앞에서 가짜 증인이 되어야 한다" },
  { labelKo: "서로 다른 진실을 기록한 두 권의 일기", detailKo: "공범이었던 파트너가 남긴 기록과 내 기억이 결정적 날짜에서 어긋난다" },
  { labelKo: "금지된 치유 능력을 쓸수록 시력이 좁아짐", detailKo: "누군가를 살릴 때마다 구해 준 사람의 얼굴을 가장 먼저 잊는다" },
  { labelKo: "상속 조건: 원수의 사업을 1년 안에 흑자 전환", detailKo: "망하게 두면 자신도 파산하는 기묘한 공동 보증 계약" },
  { labelKo: "가짜 예언을 진짜처럼 실현해야 하는 사기극", detailKo: "마을을 지키려고 지어낸 예언을 믿고 진짜 강자들이 몰려든다" },
  { labelKo: "내일 철거될 건물 안에서 발견된 미결 타임캡슐", detailKo: "열면 도시 영웅의 추악한 과거가 드러나고, 닫으면 무고한 사람이 누명을 쓴다" },
  { labelKo: "감정이 격해지면 주변 전자기기가 멈추는 저주", detailKo: "병원 중환자실 앞에서 진실을 말해야만 하는 침묵의 협상" },
  { labelKo: "적대 세력의 후계자와 같은 몸의 시간을 나눠 씀", detailKo: "짝수 시간대와 홀수 시간대의 선택이 서로의 계획을 끊임없이 파괴한다" },
  { labelKo: "단 한 번만 거짓말이 사실이 되는 유물 경매", detailKo: "가장 순수해 보이는 참가자가 사실은 세계를 뒤엎을 문장을 준비했다" },
];

const SPARK_VISUAL_DEVICES: readonly VisualDeviceSparkItem[] = [
  { labelKo: "거짓말할 때만 색이 빠지는 단일 컬러 시선 유도", detailKo: "평소 따뜻한 세피아 톤을 유지하다 진심이 흔들리는 사물만 흑백으로 탈색", studioTipKo: "채도 마스크 레이어 + 주홍 포인트 레이어 분리 운용" },
  { labelKo: "컷 테두리가 감정 압박에 따라 좁아지는 가변 프레임", detailKo: "불안이 고조될수록 세로 스크롤 여백이 먹선으로 좁혀지며 몰입감을 조임", studioTipKo: "가변 거터 템플릿 + 거친 먹선 프레임 브러시" },
  { labelKo: "모든 결정적 진실이 유리·물웅덩이 반사로만 드러남", detailKo: "인물의 정면 표정은 평온하지만 창문 반사 속 표정은 울거나 웃고 있음", studioTipKo: "반투명 멀티플라이 반사 레이어 + 미세 가우시안 블러" },
  { labelKo: "말풍선 꼬리가 화자가 아닌 '숨은 청자'를 향함", detailKo: "대사 자체보다 누가 엿듣고 있는지를 말풍선 조형으로 암시", studioTipKo: "손글씨 말풍선 + 점선 꼬리 변형 레이어" },
  { labelKo: "시간 경과를 시계 대신 빛의 그림자 각도로 표시", detailKo: "창틀 그림자가 방바닥을 가로지르는 리듬으로 독백 없이 하루의 무게를 전달", studioTipKo: "하드 섀도우 3단계 레이어 + 웜→쿨 색온도 보간" },
  { labelKo: "기억 왜곡 구간에만 인쇄 망점(하프톤) 노이즈 삽입", detailKo: "신뢰할 수 없는 서술자의 회상일수록 화면 결이 거칠어지는 시각 단서", studioTipKo: "스크린톤 하프톤 필터 + 미스레지스트레이션 1px 오프셋" },
  { labelKo: "의성어를 배경 건축물의 간판·벽보 활자로 위장", detailKo: "화면 밖 효과음 대신 거리 간판 문구가 인물 심리를 찌르는 메타 타이포", studioTipKo: "원근 왜곡 텍스트 + 에디토리얼 명조/고딕 혼용" },
  { labelKo: "세로 스크롤 3화면 연속 롱테이크 낙하 구도", detailKo: "컷 경계를 없애고 계단·엘리베이터·빗줄기로 시선을 단숨에 끌어내림", studioTipKo: "세로 캔버스 연장 그리드 + 모션 라인 최소화" },
  { labelKo: "인물의 손동작만 확대해 심리를 번역하는 무음 3컷", detailKo: "얼굴 클로즈업을 아끼고 옷자락 잡기·찻잔 돌리기로 긴장을 축적", studioTipKo: "디테일 펜선 0.4 + 얕은 피사계 심도 배경 블러" },
  { labelKo: "비밀 문건·영수증·지도 콜라주를 컷 사이에 직접 끼워 넣기", detailKo: "독자가 탐정처럼 스크롤을 멈추고 단서를 직접 읽게 만드는 체험형 연출", studioTipKo: "종이 텍스처 스탬프 + 주석 필기체 레이어" },
];

const SPARK_EMOTIONAL_ARCS: readonly SparkAxisItem[] = [
  { labelKo: "경계 → 공범적 연대 → 담담한 이별", detailKo: "뜨거운 고백 대신 서로의 빈자리를 존중하며 끝나는 여운" },
  { labelKo: "냉소적 방관 → 작은 균열 → 서툰 헌신", detailKo: "세상을 비웃던 인물이 사소한 약속 하나 때문에 판을 뒤집는 전환" },
  { labelKo: "맹목적 신뢰 → 배신의 각성 → 스스로 세운 기준", detailKo: "누군가의 정답을 따르던 인물이 자기만의 윤리를 선언하는 성장" },
  { labelKo: "유쾌한 사기극 → 예기치 못한 죄책감 → 진심의 대가", detailKo: "가볍게 웃으며 시작해 중반 이후 묵직한 선택으로 돌아오는 반전 곡선" },
  { labelKo: "완벽한 통제 → 예측 불가능한 타인 → 불완전함의 해방", detailKo: "강박적으로 계획하던 주인공이 변수 덕분에 숨을 쉬게 되는 회복" },
  { labelKo: "억눌린 분노 → 적의 인간성 목격 → 더 날카로운 결단", detailKo: "단순한 용서가 아니라, 진실을 안 채로도 책임을 묻는 성숙한 응징" },
  { labelKo: "고독한 생존 → 임시 동맹 → 돌아갈 집의 발견", detailKo: "아무도 믿지 않던 생존자가 결국 문을 열어 두기로 택하는 온기" },
  { labelKo: "죄책감의 도피 → 과거와의 정면 대면 → 화해 없는 전진", detailKo: "모든 상처가 기적처럼 낫지 않아도 흉터를 안고 다음 날을 여는 현실감" },
  { labelKo: "호기심의 장난 → 통제 불능의 공포 → 냉정한 역전", detailKo: "사소한 관찰에서 시작해 목숨을 건 두뇌전으로 치닫는 서스펜스" },
  { labelKo: "체념한 일상 → 마지막 기회 포착 → 통쾌한 판 뒤집기", detailKo: "낮게 깔린 호흡으로 공감대를 쌓은 뒤 단숨에 카타르시스를 터뜨림" },
];

function hashSeedInput(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.abs(Math.trunc(seed)) >>> 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createMulberry32(initialSeed: number): () => number {
  let state = (initialSeed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(items: readonly T[], rng: () => number): T {
  const chosen = items[Math.floor(rng() * items.length) % items.length];
  if (chosen === undefined) throw new Error("Spark matrix array must not be empty");
  return chosen;
}

/** 결정적 시드 기반 4축 무작위 영감 조합기 (`배경 × 갈등 × 시각장치 × 감정곡선`). */
export function combineRandomInspirationSpark(seed: number | string): InspirationSpark {
  const normalizedSeed = hashSeedInput(seed);
  const rng = createMulberry32(normalizedSeed ^ 0x9e3779b9);

  const setting = pickFrom(SPARK_SETTINGS, rng);
  const conflict = pickFrom(SPARK_CONFLICTS, rng);
  const visualDevice = pickFrom(SPARK_VISUAL_DEVICES, rng);
  const emotionalArc = pickFrom(SPARK_EMOTIONAL_ARCS, rng);

  return {
    seed: normalizedSeed,
    setting,
    conflict,
    visualDevice,
    emotionalArc,
    combinedPromptKo: `[${setting.labelKo}]를 무대로, '${conflict.labelKo}'에 휘말린 인물이 [${emotionalArc.labelKo}]의 감정선을 밟아 가는 이야기. 핵심 연출은 '${visualDevice.labelKo}'로 밀어붙입니다.`,
    firstCutVisualKo: `1화 첫 컷 메모: ${setting.detailKo}를 와이드로 연 뒤, ${visualDevice.detailKo} 기법으로 '${conflict.labelKo}'의 첫 징후를 무음 인서트로 각인 (${visualDevice.studioTipKo}).`,
  };
}
