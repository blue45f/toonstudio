import {
  StudioOpenAiCreativeAssistRequestSchema,
  type OpenAiAssistStructuredResult,
  type StudioOpenAiAssistMode,
  type StudioOpenAiCreativeAssistRequest,
} from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.dto";

export interface CreditEvaluationFixture {
  readonly id: string;
  readonly input: StudioOpenAiCreativeAssistRequest;
  readonly humanCriteria: readonly string[];
}

function fixture(id: string, mode: StudioOpenAiAssistMode, inputText: string, humanCriteria: readonly string[]): CreditEvaluationFixture {
  return {
    id,
    input: StudioOpenAiCreativeAssistRequestSchema.parse({
      mode, inputText, projectTitle: "한국어 창작 품질 합성 검증", targetPlatform: "vertical-webtoon",
    }),
    humanCriteria,
  };
}

// 실사용 원고·개인정보가 없는 고정 사례다. 자연스러움은 아래 기준으로 사람이 별도 평가한다.
export const CREDIT_EVALUATION_FIXTURES: readonly CreditEvaluationFixture[] = [
  fixture("D1-honorifics", "dialogue-polish",
    "신입 편집자 수아가 선배 민재에게 일정 연장을 요청한다. 대사: ‘오늘 안으로 보내라고 하셨지만 자료를 한 번 더 확인해야 해서 내일 오전까지 보내도 괜찮을까요?’ 상대를 존중하는 말투를 유지하고, 허락을 구하는 뜻과 내일 오전이라는 기한을 보존해 다듬어 주세요. 새로운 사정은 추가하지 마세요.",
    ["존댓말 유지", "내일 오전 기한 보존", "허락 요청을 통보나 승인으로 바꾸지 않음", "새로운 사정 추가 없음"]),
  fixture("D2-relationship", "dialogue-polish",
    "서윤과 태오는 오래된 친구다. 오늘 태오가 팀장이 되었고, 둘만 있는 자리에서 서윤이 말한다. ‘회의에서는 팀장님이라고 부를게. 끝나고는 예전처럼 편하게 얘기하자.’ 친구 사이의 반말을 유지하면서 업무 중 호칭과 사적인 친밀감의 차이가 분명하도록 다듬어 주세요. 연애 감정이나 갈등은 추가하지 마세요.",
    ["사적인 반말 유지", "업무 중 팀장님 호칭 보존", "업무와 사적 관계의 차이 유지", "연애 감정이나 갈등 추가 없음"]),
  fixture("D3-omitted-subject", "dialogue-polish",
    "소라는 유나에게 책을 빌렸다. 방과 후 소라가 유나에게 말한다. ‘내일 가져다줄게. 아직 마지막 장을 못 읽었어.’ 소라가 책을 빌린 사람이고 내일 유나에게 돌려준다는 관계를 보존해 자연스럽게 다듬어 주세요. 새 인물이나 다른 물건은 추가하지 마세요.",
    ["빌린 사람과 빌려준 사람의 관계 보존", "내일 반환과 마지막 장 미완독 보존", "불필요한 주어 반복 없음", "새 인물이나 물건 추가 없음"]),
  fixture("D4-negation", "dialogue-polish",
    "지안이 친구에게 오해를 푼다. ‘네가 싫어서 안 온 게 아니야. 같이 있고 싶었는데 용기가 안 났어.’ 상대를 싫어한 것이 아니라 함께 있고 싶었지만 용기가 없어 오지 못했다는 뜻을 정확히 유지해 다듬어 주세요.",
    ["싫어서 안 온 것이 아니라는 부정 의미 보존", "함께 있고 싶은 마음과 용기 부족 보존", "상대를 탓하는 뜻 추가 없음"]),
  fixture("D5-restraint", "dialogue-polish",
    "오래 함께 작업한 친구가 다른 도시로 떠난다. 화자는 아쉽지만 울거나 붙잡지 않고 배웅한다. 대사: ‘잘 가. 도착하면 한 줄만 남겨.’ 담담한 말투 속에 아쉬움과 걱정이 느껴지도록 다듬어 주세요. 사랑 고백이나 과장된 슬픔은 추가하지 마세요.",
    ["배웅과 도착 연락 요청 보존", "담담한 감정과 짧은 호흡", "사랑 고백·붙잡기·과장된 슬픔 추가 없음"]),
  fixture("D6-compression", "dialogue-polish",
    "대사: ‘비가 그치면 저녁 7시에 도서관 앞에서 만나자. 젖은 스케치북은 내가 가져갈 테니까 너는 색연필만 챙겨 와. 비가 계속 오면 오늘 약속은 취소하고 내일 다시 정하자.’ 모바일 말풍선에 맞게 짧게 다듬되 시간·장소·준비물 담당·우천 시 취소 조건을 모두 보존해 주세요. 필요하면 보조 말풍선을 쓰세요.",
    ["비가 그칠 때 저녁 7시 도서관 앞 조건 보존", "화자 스케치북·상대 색연필 담당 보존", "계속 비가 오면 오늘 취소하고 내일 다시 정함", "정보 누락 없이 말풍선 호흡 개선"]),
  fixture("S1-continuity", "script-to-cuts",
    "정확히 4컷으로 나눠 주세요. 비 오는 정류장에 하린과 도윤이 서 있다. 하린은 우산을 들고 있고 도윤은 우산이 없다. 하린이 말없이 우산을 도윤에게 건넨다. 도윤이 ‘넌?’이라고 묻자 하린은 정류장 지붕을 가리킨다. 마지막에는 도윤만 우산을 들고 비 속으로 나가고 하린은 지붕 아래 남는다. 새 대사와 인물은 추가하지 마세요.",
    ["우산 소유가 하린에서 도윤으로 이동", "마지막 도윤만 출발·하린은 지붕 아래", "‘넌?’ 외 새 대사 없음", "무언 컷·구도·여백이 행동을 분명하게 전달"]),
  fixture("S2-flashback", "script-to-cuts",
    "정확히 4컷으로 나눠 주세요. 현재 밤의 작업실에서 이솔이 빈 액자를 본다. 짧은 회상: 낮의 같은 작업실에서 친구가 그림을 액자에 넣으며 웃었다. 현재로 돌아오면 이솔은 액자 뒤에서 ‘완성되면 보여 줘’라고 적힌 쪽지를 발견한다. 이솔은 빈 종이를 책상에 펴고 연필을 잡는다. 친구가 현재 나타나는 장면이나 새 대사는 넣지 마세요.",
    ["현재 밤→과거 낮→현재 밤의 시간 구분", "친구는 과거에만 등장", "쪽지 문구를 발화로 바꾸지 않음", "마지막 빈 종이와 연필 행동 보존"]),
  fixture("I1-five-angles", "idea-remix",
    "소재: 작은 도서관의 반납함이 매일 아침 다음 날의 책을 돌려준다. 주인공은 사서 한 명이고, 시간여행으로 미래를 바꾸는 능력은 없다. 이 제약을 지키며 서로 다른 5가지 발상 각도를 제안해 주세요. 각 제안에는 실제로 그릴 수 있는 첫 컷을 포함하고, 기존 작품이나 유명 캐릭터를 가져오지 마세요.",
    ["사서 한 명과 미래를 바꿀 수 없다는 제약 보존", "다섯 발상이 내용상 구별됨", "첫 컷을 실제로 그릴 수 있음", "기존 작품·유명 캐릭터 차용 없음"]),
  fixture("P1-text-only", "export-preflight-coach",
    "제목: 비가 멈춘 자리. 회차 소개: ‘우산을 빌려준 하린은 정류장에 남고, 도윤은 뒤늦게 그 이유를 알아차린다.’ 원고 메모: 한 말풍선에 ‘사실 나는 처음부터 네가 우산이 없다는 걸 알고 있었지만 말을 꺼내면 네가 미안해할까 봐 아무 말도 하지 않았어’를 넣었다. 문장과 말풍선 밀도, 소개글만 점검해 주세요. 파일·이미지·글꼴·저작권 자료는 제공하지 않았습니다.",
    ["긴 말풍선에 구체적인 개선 제안", "소개글의 인물·행동 보존", "제공되지 않은 이미지·해상도·글꼴·저작권을 검사하거나 인증했다고 주장하지 않음", "새 반전이나 사건 추가 없음"]),
];

export const HUMAN_EVALUATION_RUBRIC = {
  status: "not-performed",
  scale: { 0: "중요한 수정 필요", 1: "작은 수정 후 사용 가능", 2: "그대로 참고 가능" },
  axes: ["의미·사실·조건 보존", "화자·관계·말투", "자연스러운 한국어와 감정 절제", "모바일 길이·호흡·실용성", "요청한 창작 목적 충족"],
  note: "모델명을 가린 실제 응답을 사례별로 비교해야 한다. 자동 계약 통과는 한국어 품질 점수가 아니며, 10개 사례로 일반 성능 우열을 추정하지 않는다.",
} as const;

export function evaluateCreditOutput(result: OpenAiAssistStructuredResult): readonly { name: string; passed: boolean }[] {
  // JSON 파싱·필드 타입·길이 제한은 실제 서비스가 이미 검사했다. 여기서는 요청한 개수만 추가 확인한다.
  if (result.mode === "dialogue-polish") return [{ name: "three-tone-alternatives", passed: result.data.balloons.length === 3 }];
  if (result.mode === "script-to-cuts") return [{ name: "four-sequential-cuts", passed: result.data.cuts.length === 4 && result.data.cuts.every((cut, index) => cut.cutNumber === index + 1) }];
  if (result.mode === "idea-remix") return [{ name: "five-distinct-lenses", passed: result.data.angles.length === 5 && new Set(result.data.angles.map((angle) => angle.lens)).size === 5 }];
  return [{ name: "service-schema", passed: true }];
}
