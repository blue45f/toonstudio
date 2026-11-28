import {
  StudioOpenAiAssistModeSchema,
  StudioOpenAiCreativeAssistRequestSchema,
  type StudioOpenAiAssistMode,
  type StudioOpenAiCreativeAssistRequest,
} from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.dto";

import { CREDIT_EVALUATION_FIXTURES } from "./studio-openai-credit-evaluation-fixtures";

type AstraInputFixture = { readonly id: string; readonly input: StudioOpenAiCreativeAssistRequest };
type OriginalScene = Pick<StudioOpenAiCreativeAssistRequest, "inputText" | "projectTitle" | "targetPlatform"> & { id: string };

// 문자열은 기존 크레딧 평가 사례의 ID다. 모드가 늘어나면 누락된 원고를 타입 검사에서 찾는다.
const scenesByMode = {
  "idea-remix": "I1-five-angles",
  "script-to-cuts": "S1-continuity",
  "dialogue-polish": "D6-compression",
  "export-preflight-coach": "P1-text-only",
  "character-bible-forge": {
    id: "A1-character-speech", projectTitle: "고장 난 안내 방송", targetPlatform: "cuttoon",
    inputText: "이름은 한결. 첫 출근한 야간 극장 안내원이다. 관객에게는 꼭 존댓말을 쓰고, 혼잣말할 때만 ‘천천히, 한 번 더’ 하고 중얼거린다. 손전등은 왼손에 든다. 상영 도중 큰 소리를 낼 수 없어 길을 잃은 아이에게 종이별로 방향을 알려 준다. 동료는 종이별을 쓰레기로 오해한다. 다음 회차 작화팀에 넘길 캐릭터 시트를 써 주세요. 정해지지 않은 성별과 나이는 미정으로 남겨 주세요.",
  },
  "continuity-plot-audit": {
    id: "A2-continuity-key", projectTitle: "열쇠 보관함", targetPlatform: "vertical-webtoon",
    inputText: "1컷 현재 오전 8시. 은솔은 유일한 파란 열쇠를 우편함에 넣고 뚜껑을 잠근다. 2컷의 갈색 테두리와 ‘어제 오후’ 자막은 회상 표시다. 동생이 그 열쇠를 은솔에게 건넨다. 3컷 ‘현재’ 자막. 은솔이 걸어서 수영장에 도착한다. 4컷 은솔이 주머니에서 같은 열쇠를 꺼낸다. 회상 속 소유 변화와 현재의 소품 오류를 구분하고, 새로운 열쇠를 만들지 않고 고칠 컷을 짚어 주세요.",
  },
  "bg3d-camera-blocking": {
    id: "A3-camera-workshop", projectTitle: "마지막 활자", targetPlatform: "page-comic",
    inputText: "세로 5m, 가로 4m인 작은 활판 인쇄소다. 바닥은 Y=0, 작업대는 원점, 서쪽 벽에만 창이 있다. 재인은 작업대 왼쪽에서 핀셋을 들고, 보조는 오른쪽에서 뒤집힌 활자를 가리킨다. 첫 패널은 두 사람의 위치, 다음 패널은 활자의 흠집을 보여 준다. 두 인물의 화면 좌우가 바뀌지 않도록 카메라 위치·주목점·렌즈와 서쪽 창의 오후 빛을 제안해 주세요. 위치 단위는 m로 통일하세요.",
  },
  "color-mood-director": {
    id: "A4-palette-owned", projectTitle: "새벽 첫차", targetPlatform: "vertical-webtoon",
    inputText: "첫차가 오기 전 빈 승강장이다. 작화팀 지정색은 순서대로 배경 타일 #34495E, 낡은 노선표 #EBCB8B, 주인공의 소매 #B48EAD다. 승강장 유리에는 흰 말풍선이 겹친다. 세 지정색을 이름과 용도에 맞춰 보존하고, 조명과 글자의 대비를 조절하는 방법을 제안해 주세요. 추가 색은 예시로 구분하고 실제 이미지의 대비를 측정했다고 쓰지 마세요.",
  },
  "sfx-onomatopoeia-lab": {
    id: "A5-sfx-quiet", projectTitle: "빈 온실", targetPlatform: "vertical-webtoon",
    inputText: "빈 온실에서 세 소리가 차례로 난다. 낡은 빗장이 뻑뻑하게 밀리고, 양철 물받이에 물이 딱 한 방울 떨어진다. 마지막 컷에서 먼 바깥 자갈길로 작은 발소리가 멀어진다. 한국어·일본어·영어 효과음과 크기·위치를 제안해 주세요. 두 번째 컷의 ‘누구야?’ 말풍선은 우상단을 차지한다. 빗방울을 소나기로 키우거나 마지막 발소리의 주인을 밝히지 마세요.",
  },
  "photoshop-fx-recipe": {
    id: "A6-fx-glass", projectTitle: "유리 너머 편지", targetPlatform: "page-comic",
    inputText: "밤의 문구점 쇼윈도. 분리된 레이어는 연필 선화, 유리 반사, 인물, 따뜻한 간판이다. 간판 가장자리의 번짐 때문에 유리 너머 편지의 연한 글씨가 묻힌다. 간판의 따뜻함과 연필 결을 유지하면서 편지만 또렷해지는 비파괴 레이어 순서·혼합 모드·수치 시작점을 제안해 주세요. 원본 선화나 편지 레이어를 합치지 말고, 보정 전후 차이를 확인할 위치도 짚어 주세요.",
  },
  "scroll-pacing-auditor": {
    id: "A7-scroll-beats", projectTitle: "빈 의자 한 칸", targetPlatform: "vertical-webtoon",
    inputText: "가로 800px 세로 원고다. 1~3컷에서 아이가 버스 좌석을 하나씩 세며 컷 사이 여백은 40px다. 4컷은 매일 동행하던 친구의 빈 의자이고, 5컷에서 아이가 가방으로 그 자리를 맡는다. 초안은 3→4와 4→5도 각각 40px라 표정이 지나친다. 세는 리듬과 빈자리를 알아차린 뒤의 정적을 구분해 한 회차 안의 구간별 권장 여백을 px로 제시하고 평균을 맞춰 주세요. 실제 이탈률 데이터는 없습니다.",
  },
  "thumbnail-hook-optimizer": {
    id: "A8-thumbnail-no-spoiler", projectTitle: "저울에 남은 무게", targetPlatform: "vertical-webtoon",
    inputText: "과일가게 문을 닫을 때마다 빈 저울 바늘이 한 칸 올라간다. 이번 화에서 주인공은 저울 옆 바닥에 찍힌 작은 젖은 발자국을 처음 본다. 발자국 주인과 저울이 움직이는 이유는 아직 밝혀지지 않는다. 제목 후보 세 개는 각각 저울, 발자국, 주인공의 행동에 초점을 두세요. 1:1과 16:9 모두에서 바늘과 발자국이 읽히도록 크롭을 제안하고 범인을 짐작해 카피에 넣지 마세요.",
  },
  "localization-glossary-check": {
    id: "A9-localization-titles", projectTitle: "파도 기록소", targetPlatform: "vertical-webtoon",
    inputText: "설정집에서 ‘파도 기록소’의 영어 명칭은 Tide Archive, 일본어 명칭은 潮の記録所로 승인됐다. ‘물매듭’은 저장된 기억을 푸는 도구이고 ‘잠긴 밀물’은 그 도구로도 열 수 없는 상태명이다. 견습 유리는 작업 중 은재를 ‘기록장님’, 퇴근하면 ‘언니’라고 부른다. 원고 속 Tide Archives와 물 매듭을 찾아 표기를 통일하고 한·영·일 용어집을 만들어 주세요. 유리와 은재의 한자 이름은 미정이며 좁은 말풍선 축약은 정식 표기와 구분해 주세요.",
  },
  "mcp-workflow-macro": {
    id: "A10-macro-local-preview", projectTitle: "골목의 장판교", targetPlatform: "vertical-webtoon",
    inputText: "800×1280 크기의 새 세로 캔버스에 로컬 3D 골목 모형을 놓고, 두 인물이 건널목 양쪽에 보이게 카메라를 맞춘 뒤, 맨 앞 인물의 외곽광선을 별도 레이어에 얹고 내보내기 전 규격을 점검하고 싶다. 사용할 수 있는 도구는 studio.canvas.create, studio.bg3d.compose_scene, studio.photoshop.apply_layer_fx, studio.export.preflight_check다. 앞 단계 결과를 다음 단계에서 구분해 쓸 수 있도록 인자와 실행 순서를 담은 무료 도구 실행 계획을 작성해 주세요. 실제 출판이나 파일 삭제는 요청하지 않습니다.",
  },
} satisfies Record<StudioOpenAiAssistMode, string | OriginalScene>;

export const ASTRA_INPUT_FIXTURES: readonly AstraInputFixture[] = StudioOpenAiAssistModeSchema.options.map((mode) => {
  const scene = scenesByMode[mode];
  if (typeof scene === "string") {
    const existing = CREDIT_EVALUATION_FIXTURES.find((fixture) => fixture.id === scene && fixture.input.mode === mode);
    if (!existing) throw new Error(`${mode} 모드에서 재사용할 합성 평가 사례 ${scene}를 찾을 수 없습니다.`);
    return { id: existing.id, input: existing.input };
  }
  const { id, ...input } = scene;
  return { id, input: StudioOpenAiCreativeAssistRequestSchema.parse({ mode, ...input }) };
});
