import { STUDIO_RAIL_TOOL_CATALOG, studioRailToolLabel, type StudioRailToolId } from "./studio-app-settings";
import { studioSearchTextMatches } from "./studio-search-text";

export const STUDIO_RAIL_TOOL_ALIASES: Record<StudioRailToolId, string> = {
  select: "선택 이동 포인터 오브젝트 객체 화살표 move pointer object",
  transform: "변형 자유 변형 크기 회전 기울이기 비율 조절 resize rotate scale free transform",
  hand: "핸드 손바닥 팬 캔버스 이동 화면 이동 pan move grab",
  pen: "펜 브러시 선화 잉크 드로잉 그리기 선따기 g펜 둥근펜 만년필 필압 선 보정 손떨림 보정 brush ink g-pen lineart",
  "pixel-pencil": "픽셀 펜 도트 픽셀아트 연필 스케치 러프 콘티 pixel art dot pencil sketch",
  eraser: "지우개 수정 지우기 소프트 지우개 하드 지우개 벡터 지우개 교차점 지우개 교차점 지우기 vector eraser",
  blend: "블렌드 스머지 문지르기 경계 흐리기 혼색 브러시 smudge blur blend",
  "wet-mix": "혼색 물감 수채 유화 과슈 물번짐 wet paint watercolor mixer",
  "dodge-burn": "닷지 번 명암 밝게 어둡게 하이라이트 그림자 dodge burn lighten darken",
  liquify: "픽셀 유동화 리퀴파이 왜곡 밀기 부풀리기 오목하게 성형 보정 liquify warp push",
  fill: "버킷 페인트 채우기 페인트통 밑색 틈 닫기 참조 레이어 번짐 미리보기 영역 확장 paint bucket colordrop flood fill",
  "lasso-fill": "올가미 채우기 도형 채우기 빠른 밑색 실루엣 채우기 둘러싸서 칠하기 lasso fill",
  eyedropper: "스포이드 스포이트 색상 추출 색 찍기 컬러 피커 pipette color picker",
  "marquee-rect": "마키 사각 선택 선택 범위 네모 선택 영역 지정 rectangle selection marquee",
  "marquee-circle": "원형 선택 타원 선택 동그라미 선택 영역 ellipse circle selection",
  lasso: "올가미 선택 자유 선택 다각형 올가미 부분 선택 lasso freehand selection",
  crop: "자르기 크롭 트리밍 여백 정리 캔버스 자르기 crop trim",
  "smart-shape": "스마트 도형 직선 곡선 다각형 화살표 컷 프레임 칸 나누기 컷 분할 컷 여백 quickshape panel frame",
  "shape-rect": "사각형 도형 네모 박스 테두리 컷 테두리 rectangle box frame",
  "shape-ellipse": "타원 도형 원 동그라미 도형 ellipse circle",
  text: "텍스트 글자 대사 식자 타이포 폰트 글꼴 세로쓰기 효과음 lettering typography font",
  bubble: "말풍선 대사창 외침 생각풍선 말풍선 꼬리 플래시 speech bubble balloon tail",
  image: "이미지 소재 텍스처 스크린톤 톤 효과선 말풍선 소재 불러오기 스톡 asset tone screentone import",
  comment: "위치 댓글 핀 댓글 컷 댓글 좌표 댓글 협업 검수 피드백 메모 해결 상태 comment pin review",
  perspective: "투시 가이드 원근 자 투시자 소실점 1점 투시 2점 투시 3점 투시 아이레벨 지평선 스냅 perspective ruler vanishing point",
  "frame-anim": "프레임 애니메이션 타임라인 어니언스킨 움직이는 이모티콘 움짤 모션 animation timeline onion skin",
  mannequin3d: "기본 데생 인형 3d 마네킹 인체 비율 체형 데생 포즈 참고 mannequin body",
  vrm3d: "인물 포즈 편집 3d 캐릭터 vrm 포즈 손 포즈 발 접지 시선 조절 좌우 반전 관절 제한 character pose gaze",
  "character-shaper": "캐릭터 만들기 캐릭터 셰이퍼 웹툰 캐릭터 외형 얼굴 비율 실루엣 체형 헤어 의상 프리셋 shaper avatar",
  bg3d: "장면 도우미 3d 배경 3d 배치 축 고정 바닥 맞춤 그리드 스냅 glb 단위 축 점검 카메라 연동 background scene placement",
  "hybrid-dcc": "외부 3d 편집 연결 블렌더 dcc 하이브리드 메쉬 교류 blender bridge",
  reference: "참고 이미지 레퍼런스 서브 뷰 자료 창 컬러 피킹 reference sub view",
  zoom: "화면 확대 축소 돋보기 줌 인 줌 아웃 zoom magnifier",
  "zoom-fit": "화면 맞춤 전체 보기 100% 초기화 fit screen reset view",
  "rotate-view": "화면 회전 캔버스 회전 좌우 반전 기울여 그리기 rotate canvas view",
};

/** Search uses the same names as settings, plus familiar drawing terms and shortcuts. */
export function matchesStudioRailToolQuery(
  id: StudioRailToolId,
  query: string,
  t?: (key: string) => string,
): boolean {
  if (!query.trim()) return true;
  const tool = STUDIO_RAIL_TOOL_CATALOG.find((item) => item.id === id);
  return studioSearchTextMatches(query, [
    id,
    tool?.label ?? "",
    studioRailToolLabel(id, t),
    tool?.defaultShortcut ?? "",
    STUDIO_RAIL_TOOL_ALIASES[id],
  ]);
}
