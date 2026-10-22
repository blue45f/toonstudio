/**
 * Studio 도구 벨트 — 버튼 힌트 표(순수 데이터).
 *
 * `StudioToolBeltContent.tsx`에서 분리했다. undo/redo/history 힌트는 렌더 주체인
 * StudioToolBeltQuickActions의 QUICK_ACTION_HINTS가 단독 소유한다(여기 두지 않는다).
 */

import { studioToolHintFromLabel, type StudioToolHintSpec } from "./studio-tool-hints";
import { STUDIO_VIEW_ACTION_HINTS } from "./studio-view-action-hints";

export const TOOL_BELT_HINTS = {
  assets: studioToolHintFromLabel(
    "템플릿·에셋",
    "템플릿, 콜라주, 장면, 클립, 효과와 내 에셋을 한곳에서 찾아 캔버스에 추가합니다.",
    undefined,
    "assets"
  ),
  panelAdd: studioToolHintFromLabel(
    "컷 패널 추가",
    "현재 페이지에 새 사각 패널을 추가해 다음 컷을 배치합니다.",
    undefined,
    "panel-layout",
    "add"
  ),
  panelSplit: studioToolHintFromLabel(
    "사선 컷 추가",
    "기울어진 경계로 나뉜 두 패널을 한 번에 추가합니다.",
    undefined,
    "panel-layout",
    "split-diagonal"
  ),
  panelDiagonalize: studioToolHintFromLabel(
    "패널 사선화",
    "선택한 사각 패널을 평행사변형 형태의 사선 패널로 바꿉니다.",
    undefined,
    "panel-layout",
    "diagonalize"
  ),
  panelStraighten: studioToolHintFromLabel(
    "패널 직선화",
    "선택한 사선 패널을 다시 사각 패널로 바꿉니다.",
    undefined,
    "panel-layout",
    "straighten"
  ),
  select: studioToolHintFromLabel(
    "선택",
    "캔버스 요소를 선택해 이동하거나 크기와 속성을 편집합니다.",
    "V"
  ),
  pen: studioToolHintFromLabel(
    "펜",
    "현재 브러시와 필압 설정으로 자유롭게 선을 그립니다.",
    "B"
  ),
  eraser: studioToolHintFromLabel(
    "지우개",
    "현재 획을 브러시 크기와 필압에 맞춰 지웁니다.",
    "E"
  ),
  fill: studioToolHintFromLabel(
    "고급 채우기",
    "선택한 래스터의 닫힌 영역을 참조 경계로 인식해 현재 색으로 채웁니다.",
    "G"
  ),
  frameAnimation: studioToolHintFromLabel(
    "프레임 애니메이션",
    "선택한 이미지에 프레임을 쌓아 셀 애니메이션을 만듭니다."
  ),
  character3d: studioToolHintFromLabel(
    "3D 캐릭터",
    "베이스 캐릭터를 고른 뒤 포즈, 표정, 의상과 색상을 조정해 투명 배경 이미지로 추가합니다.",
    undefined,
    "character-3d"
  ),
  characterShaper: studioToolHintFromLabel(
    "캐릭터 만들기",
    "프리셋 카드로 얼굴·헤어·체형·의상을 고르고, 사진·웹캠으로 포즈를 잡고, 투명 PNG나 레이어 PSD로 내보냅니다.",
    undefined,
    "character-3d"
  ),
  mannequin3d: studioToolHintFromLabel(
    "기본 데생 인형",
    "모델 파일 없이 체형을 조절하고 포즈를 잡아 드로잉 참고 이미지로 캡처합니다.",
    undefined,
    "mannequin-3d"
  ),
  bg3d: studioToolHintFromLabel(
    "장면 도우미",
    "장소·인물·소품을 고르고 구도와 작화 스타일을 정해 현재 컷에 바로 적용합니다.",
    undefined,
    "background-library"
  ),
  reference: studioToolHintFromLabel(
    "참고 이미지",
    "그리는 동안 캔버스 옆에 참고 이미지를 고정해 형태와 색을 비교합니다."
  ),
  background: studioToolHintFromLabel(
    "배경·장면",
    "배경 채우기, 장면 템플릿, 톤과 3D 배경을 찾아 현재 페이지에 적용합니다.",
    undefined,
    "background-library"
  ),
  style: studioToolHintFromLabel(
    "스타일",
    "색상 팔레트와 브랜드 킷의 글꼴·로고를 작품 전체에 일관되게 적용합니다.",
    undefined,
    "style-library"
  ),
  ai: studioToolHintFromLabel(
    "AI 어시스트",
    "장면 구성, 대사, 팔레트, 이미지 생성과 AI 연동 설정을 한곳에서 엽니다.",
    undefined,
    "ai-assist"
  ),
  text: studioToolHintFromLabel(
    "텍스트",
    "클릭하면 텍스트를 추가하고, 끌어 놓으면 원하는 캔버스 위치에 바로 배치합니다."
  ),
  bubble: studioToolHintFromLabel(
    "말풍선",
    "말풍선 라이브러리에서 형태를 골라 대사와 함께 캔버스에 배치합니다.",
    undefined,
    "bubble",
    "open-library",
  ),
  image: studioToolHintFromLabel(
    "이미지 추가",
    "기기의 이미지 파일을 가져옵니다. 클립보드 이미지는 ⌘V 또는 Ctrl+V로 붙여넣을 수 있어요."
  ),
  timelapse: studioToolHintFromLabel(
    "타임랩스 녹화",
    "그리기 과정을 기록해 작업 흐름을 타임랩스 영상으로 만듭니다.",
    undefined,
    "timelapse"
  ),
  storyboard: studioToolHintFromLabel(
    "스토리보드 그리드",
    "모든 페이지를 격자로 펼쳐 컷 흐름, 밀도와 장면 전환을 한눈에 비교합니다.",
    undefined,
    "storyboard-grid"
  ),
  review: studioToolHintFromLabel(
    "페이지 검토",
    "페이지별 승인 상태, 담당자와 메모를 관리하고 검토 중 편집을 잠급니다.",
    undefined,
    "review-workflow"
  ),
  team: studioToolHintFromLabel(
    "팀 작업 공간",
    "작품 팀원을 초대하고 역할, 권한과 공동 작업 상태를 관리합니다.",
    undefined,
    "team-collaboration"
  ),
  continuity: studioToolHintFromLabel(
    "마감·품질 검사",
    "문서 무결성, 이미지 해상도, 레이어, 식자, 컷 간격, 검토 상태와 이야기 연속성을 한 번에 검사합니다.",
    undefined,
    "continuity-check"
  ),
  scrollPreview: studioToolHintFromLabel(
    "세로 스크롤 미리보기",
    "페이지를 모바일 독자 폭으로 이어 붙여 컷 간격과 읽기 흐름을 확인합니다.",
    undefined,
    "vertical-preview"
  ),
  readerPreview: studioToolHintFromLabel(
    "독자 뷰",
    "실제 모바일 폭(390px)으로 세로 스크롤 독자 화면을 미리 봅니다. 컷 간격·대사 가독성·안전영역을 검사합니다.",
    undefined,
    "reader-preview"
  ),
  timeline: studioToolHintFromLabel(
    "다중 레이어 타임라인",
    "레이어별 키프레임과 재생 구간을 시간축에서 편집합니다.",
    undefined,
    "timeline"
  ),
  zoomOut: STUDIO_VIEW_ACTION_HINTS.zoomOut,
  zoomIn: STUDIO_VIEW_ACTION_HINTS.zoomIn,
  actualSize: STUDIO_VIEW_ACTION_HINTS.actualSize,
  fitWidth: STUDIO_VIEW_ACTION_HINTS.fitWidth,
  resetView: STUDIO_VIEW_ACTION_HINTS.reset,
  workspaceFocus: studioToolHintFromLabel(
    "집중 모드",
    "좌우 속성 패널을 함께 접어 캔버스를 더 넓게 사용합니다.",
    undefined,
    "workspace-focus"
  ),
  workspaceRestore: studioToolHintFromLabel(
    "작업 패널 열기",
    "접어 둔 좌우 속성 패널을 다시 열어 편집 도구와 설정을 표시합니다.",
    undefined,
    "workspace-focus",
    "restore"
  ),
  maximizeWindow: studioToolHintFromLabel(
    "브라우저 맞춤",
    "사이트 헤더와 주변 영역을 숨기고 브라우저 창 전체를 편집기에 사용합니다. Esc로 복원할 수 있어요.",
    undefined,
    "fullscreen",
    "maximize-window"
  ),
  restoreWindow: studioToolHintFromLabel(
    "브라우저 맞춤 종료",
    "편집기 주변의 사이트 헤더와 영역을 다시 표시해 일반 화면으로 돌아갑니다.",
    "Esc",
    "fullscreen",
    "restore-window"
  ),
  fullscreen: studioToolHintFromLabel(
    "전체화면",
    "브라우저의 전체화면 모드로 전환해 편집 공간을 최대화합니다. Esc로 종료할 수 있어요.",
    "F11",
    "fullscreen",
    "fullscreen"
  ),
  exitFullscreen: studioToolHintFromLabel(
    "전체화면 종료",
    "브라우저 전체화면을 종료하고 이전 편집기 크기로 돌아갑니다.",
    "F11",
    "fullscreen",
    "exit-fullscreen"
  ),
  canvasOnly: studioToolHintFromLabel(
    "캔버스만 보기",
    "제목, 툴바와 양쪽 패널을 잠시 숨겨 캔버스에만 집중합니다. Esc로 복원할 수 있어요.",
    undefined,
    "fullscreen",
    "canvas-only"
  ),
} satisfies Record<string, StudioToolHintSpec>;

