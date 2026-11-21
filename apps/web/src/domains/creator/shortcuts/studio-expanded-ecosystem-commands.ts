/**
 * 확장 생태계 통합 커맨드 카탈로그(`F1` / `⌘K` 검색·별칭·Three Doors One Command 정합 검증).
 *
 * Wave 1~8 경쟁 5종 및 확장 생태계 32개 제품군에서 내재화한 모든 기능을
 * 7대 표준 메뉴(`STUDIO_STANDARD_SEVEN_MENU_GROUPS`) 중 하나에 단일 귀속하고,
 * 초기 정적 그래프(`studio-eager-graph`)를 0바이트도 늘리지 않기 위해
 * 지연 로더 ID(`panelLoaderId`)로만 연결한다.
 */
import { STUDIO_SHORTCUT_ACTIONS, normalizeStudioShortcutChordKey } from "../studio-app-settings";
import { STUDIO_STANDARD_SEVEN_MENU_GROUPS, type StudioStandardSevenMenuId } from "../studio-main-menu-group-spec";
import { STUDIO_FORBIDDEN_DEFAULT_UI_TERMS } from "../studio-product-ia";

import type { StudioEcosystemLoaderId } from "../studio-cuttoon-editor/studio-ecosystem-lazy-registry";

export type StudioCompetitorProduct =
  | "CSP" | "Photoshop" | "Figma" | "Illustrator" | "Blender" | "SketchUp"
  | "Shaper" | "Tooning Plus" | "Plotr" | "Manyfast" | "ABLER" | "Snaptoon"
  | "DesignDoll" | "Krita" | "HeavyPaint" | "PureRef" | "Eagle" | "Procreate"
  | "Cascadeur" | "Live2D" | "Rive" | "Toon Boom" | "ComfyUI" | "Typecast"
  | "Raycast" | "Linear" | "Notion" | "VRoid" | "CLO 3D" | "Substance 3D"
  | "Plasticity" | "Storyboarder";

export interface StudioEcosystemCompetitorAlias {
  readonly product: StudioCompetitorProduct;
  readonly terms: readonly string[];
  readonly conceptNote: string;
}

export interface StudioExpandedEcosystemCommand {
  readonly id: string;
  readonly group: StudioStandardSevenMenuId;
  readonly koreanLabel: string;
  readonly competitorAliases: readonly StudioEcosystemCompetitorAlias[];
  readonly shortcut?: string;
  readonly panelLoaderId: StudioEcosystemLoaderId;
  readonly unavailableReason?: string;
}

export interface StudioExpandedCommandSearchHit {
  readonly command: StudioExpandedEcosystemCommand;
  readonly score: number;
  readonly matchedField: "label" | "alias" | "product" | "id" | "shortcut";
}

export interface StudioExpandedCommandValidationIssue {
  readonly code:
    | "duplicate-id"
    | "invalid-menu-group"
    | "shortcut-conflict-internal"
    | "shortcut-conflict-core"
    | "forbidden-ui-term"
    | "missing-loader-id"
    | "dangling-loader-id"
    | "empty-aliases";
  readonly commandId: string;
  readonly message: string;
}

function al(
  product: StudioCompetitorProduct,
  terms: readonly string[],
  conceptNote: string,
): StudioEcosystemCompetitorAlias {
  return Object.freeze({ product, terms: Object.freeze(terms), conceptNote });
}

function cmd(
  id: string,
  group: StudioStandardSevenMenuId,
  koreanLabel: string,
  panelLoaderId: StudioEcosystemLoaderId,
  competitorAliases: readonly StudioEcosystemCompetitorAlias[],
  shortcut?: string,
  unavailableReason?: string,
): StudioExpandedEcosystemCommand {
  return Object.freeze({
    id,
    group,
    koreanLabel,
    panelLoaderId,
    competitorAliases: Object.freeze(competitorAliases),
    ...(shortcut ? { shortcut } : {}),
    ...(unavailableReason ? { unavailableReason } : {}),
  });
}

/**
 * 경쟁 5종 + 확장 생태계 전체 `F1`/`⌘K` 통합 커맨드 카탈로그.
 * 기본 UI 라벨은 순수 한국어로 유지하고, 타 제품 용어는 `competitorAliases`에만 보관한다.
 */
export const STUDIO_EXPANDED_ECOSYSTEM_COMMANDS: readonly StudioExpandedEcosystemCommand[] = Object.freeze([
  // ── 1. 파일 (`file`) ───────────────────────────────────────────────────
  cmd("eco.file.clip-vector-sut-import", "file", "외부 원고 벡터·스크린톤·브러시 소재 가져오기", "clip-vector-sut-package", [
    al("CSP", [".clip", ".sut", "clip vector", "screentone import", "브러시 소재 가져오기"], "외부 원고의 벡터 제어점·스크린톤 설정·내장 팁 텍스처를 일괄 복원"),
  ], undefined, "가져올 .clip 또는 .sut 파일을 선택하면 복원을 시작합니다."),
  cmd("eco.file.timelapse-export", "file", "작업 과정 타임랩스 내보내기", "timelapse-export-engine", [
    al("CSP", ["timelapse", "타임랩스", "녹화 내보내기"], "획 기록을 15·30·60초 SNS 세로 영상으로 일괄 렌더링"),
    al("Procreate", ["time-lapse replay", "작업 영상"], "드로잉 히스토리 기반 고속 타임랩스 생성"),
  ], undefined, "타임랩스 기록이 10획 이상 쌓이면 영상을 내보낼 수 있습니다."),
  cmd("eco.file.asset-color-smart-folder", "file", "유사 색 소재 검색·스마트 폴더", "asset-color-smart-folder-engine", [
    al("Eagle", ["color search", "smart folder", "지각 색 검색", "이글 스마트 폴더"], "색상 유사도 기반 자동 분류 및 계층 태그 검색"),
  ], undefined, "보관함에 소재를 1건 이상 등록하면 유사 색 검색이 활성화됩니다."),

  // ── 2. 편집 (`edit`) ───────────────────────────────────────────────────
  cmd("eco.edit.selection-context-bar", "edit", "선택 대상 반응형 작업 바 열기", "selection-context-prompt-bar", [
    al("Plotr", ["selection prompt bar", "컨텍스트 바", "0/1/2 선택 바"], "선택 개수(0·1·다중)에 맞춰 즉각 작업을 제안하는 하단 바"),
    al("Figma", ["contextual toolbar", "멀티 선택 바"], "다중 선택 시 정렬·그룹·편집 액션을 즉시 노출"),
  ]),
  cmd("eco.edit.mesh-warp-overlay", "edit", "다중 레이어 메쉬·퍼펫 변형", "mesh-warp-overlay", [
    al("CSP", ["mesh transformation", "liquify multi-layer", "메쉬 변형", "다중 유동화"], "선화·채색·음영 레이어를 한꺼번에 메쉬/유동화로 동시 변형"),
    al("Photoshop", ["puppet warp", "envelope warp", "퍼펫 워프"], "제어 격자와 핀으로 비파괴 형태 보정"),
  ], "Alt+Shift+T", "변형할 레이어를 1개 이상 선택하면 메쉬 격자를 조작할 수 있습니다."),
  cmd("eco.edit.vanishing-point-planes", "edit", "3D 연결 소실점 평면 편집", "vanishing-point-planes-engine", [
    al("Photoshop", ["vanishing point", "소실점 필터", "원근 복제 도장", "perspective plane"], "90도 직교 면을 뜯어내 모서리를 따라 원근 비례 복제·합성"),
  ], "Alt+Shift+Z", "캔버스에 4꼭짓점 기준 평면을 배치하면 직교 면 확장이 활성화됩니다."),
  cmd("eco.edit.auto-layout-grid", "edit", "오토 레이아웃 1D·2D 그리드 정렬", "auto-layout-grid-engine", [
    al("Figma", ["auto layout", "css grid", "smart selection", "오토 레이아웃"], "간격·패딩·격자 리사이즈를 자동 재배치하는 레이아웃 엔진"),
  ], undefined, "프레임 또는 컷 컨테이너를 선택하면 자동 배치를 적용할 수 있습니다."),
  cmd("eco.edit.live-component-tokens", "edit", "라이브 컴포넌트·디자인 토큰 연결", "live-component-token-engine", [
    al("Figma", ["components", "design tokens", "multi-edit", "dtcg", "컴포넌트 슬롯"], "마스터 컴포넌트 수정과 색상·타이포 토큰을 전체 컷에 일괄 반영"),
  ]),
  cmd("eco.edit.dynamic-snippets-quicklinks", "edit", "동적 스니펫·퀵링크·매크로 실행", "dynamic-snippets-engine", [
    al("Raycast", ["snippets", "quicklinks", "command macros", "레이캐스트 스니펫"], "변수 치환 대사·연출 템플릿과 단축 매크로를 ⌘K에서 즉시 실행"),
  ], "Alt+Shift+5"),

  // ── 3. 캔버스/레이어 (`canvas-layer`) ──────────────────────────────────
  cmd("eco.layer.shading-assist", "canvas-layer", "자동 음영 보조 실행", "shading-assist-panel", [
    al("CSP", ["shading assist", "자동 음영", "셀 음영 자동 생성"], "광원 방향에 맞춰 선화·밑색 기반 1·2단 셀 음영을 자동 생성"),
  ], "Alt+Shift+A", "참조 선화 또는 밑색 레이어가 있는 컷에서 자동 음영을 실행할 수 있습니다."),
  cmd("eco.layer.shading-light-ball", "canvas-layer", "온캔버스 광원 볼 조작", "shading-light-ball-overlay", [
    al("CSP", ["light source ball", "광원 구", "음영 광원 핸들"], "캔버스 위 3D 광원 볼을 드래그해 방위각·고도각을 실시간 조정"),
  ]),
  cmd("eco.layer.colorize-mask", "canvas-layer", "힌트 색선 자동 채색 마스크", "colorize-mask-engine", [
    al("Krita", ["colorize mask", "컬러라이즈 마스크", "힌트 채색"], "몇 가닥 색선만으로 닫힌 영역 전체에 자동 밑색 채우기"),
    al("CSP", ["close and fill", "틈 닫고 채우기"], "열린 선화 틈을 닫아 누수 없이 일괄 채색"),
  ], undefined, "선화 레이어를 참조로 지정하면 힌트 채색 마스크를 사용할 수 있습니다."),
  cmd("eco.layer.underpainting-three-layer", "canvas-layer", "3층 언더페인팅 일괄 채색", "underpainting-panel", [
    al("Plotr", ["underpainting", "3-layer fill", "A~F 마킹", "언더페인팅"], "A~F 마킹 기반 세로 장편 256px 오버랩 3층 자동 채색"),
  ], "Alt+Shift+U", "선화 레이어와 1개 이상의 색상 힌트가 필요합니다."),
  cmd("eco.layer.adjustment-inspector", "canvas-layer", "비파괴 보정 레이어 인스펙터", "adjustment-layer-inspector", [
    al("CSP", ["correction layer", "색조 보정 레이어", "그라데이션 맵"], "레벨·톤커브·그라데이션 맵·색균형을 비파괴 레이어로 중첩"),
    al("Photoshop", ["adjustment layer", "curves", "gradient map", "조정 레이어"], "하위 레이어 원본을 훼손하지 않는 실시간 색보정 스택"),
  ], "Alt+Shift+L"),
  cmd("eco.layer.blend-if", "canvas-layer", "휘도·채널 블렌드-이프 합성", "blend-if-panel", [
    al("Photoshop", ["blend if", "blending options", "블렌드 이프", "휘도 분할"], "현재·하위 레이어의 명도 구간을 부드럽게 갈라 합성"),
  ], "Alt+Shift+O"),
  cmd("eco.layer.vector-mask", "canvas-layer", "비파괴 불리언 벡터 마스크", "vector-mask-engine", [
    al("Photoshop", ["vector mask", "벡터 마스크"], "해상도에 무관하게 날카로운 경계를 유지하는 벡터 클리핑"),
    al("Krita", ["vector selection mask", "불리언 마스크"], "합·차·교집합 실시간 불리언 마스크 편집"),
  ]),
  cmd("eco.layer.smart-object", "canvas-layer", "스마트 오브젝트 링크·독립 복제", "smart-object-runtime-engine", [
    al("Photoshop", ["smart object", "new smart object via copy", "스마트 오브젝트", "링크드 레이어"], "원본 1회 수정으로 N개 인스턴스 일괄 갱신 및 개별 라이브 워프 보존"),
  ], "Alt+Shift+8"),
  cmd("eco.layer.viewport-wrap-around", "canvas-layer", "무한 랩어라운드 타일 드로잉", "viewport-wrap-around-engine", [
    al("Krita", ["wrap-around mode", "랩어라운드", "심리스 패턴 그리기"], "캔버스 상하좌우 경계를 실시간 타일로 이어 심리스 배경·패턴 작화"),
  ], "Alt+Shift+X"),
  cmd("eco.layer.pochade-blockin", "canvas-layer", "포샤드 팬·올가미 색면 블록인", "pochade-blockin-engine", [
    al("HeavyPaint", ["fan fill", "lasso fill", "color jitter", "헤비페인트", "올가미 채색"], "색온도 지터와 실시간 올가미·팬 색면 채우기로 빠른 러프 배색"),
  ]),
  cmd("eco.layer.patchmatch-inpaint", "canvas-layer", "로컬 내용 인식 채우기", "patchmatch-inpaint-engine", [
    al("Photoshop", ["content-aware fill", "patchmatch", "내용 인식 채우기", "인페인트"], "외부 서버 없이 주변 텍스처 패치를 조합해 불필요 요소를 자연 제거"),
  ], undefined, "채울 영역을 선택 도구로 지정하면 내용 인식 채우기가 활성화됩니다."),
  cmd("eco.layer.recolor-artwork", "canvas-layer", "조화 색상 휠 일괄 재배색", "recolor-artwork-engine", [
    al("Illustrator", ["recolor artwork", "color harmony wheel", "아트워크 다시 칠하기", "재배색"], "명도 대비를 지키면서 컷 전체 팔레트를 조화 휠로 한 번에 회전"),
  ], "Alt+Shift+C"),
  cmd("eco.layer.custom-pattern-tip", "canvas-layer", "선택 영역으로 브러시 팁 등록", "custom-pattern-tip-engine", [
    al("CSP", ["register material", "brush tip shape", "리본 브러시 등록", "도장 브러시 등록"], "선택 영역을 원클릭 도장 또는 심리스 리본 브러시 팁으로 즉시 등록"),
  ], undefined, "캔버스에 픽셀 선택 영역이나 콘텐츠가 있어야 팁으로 등록할 수 있습니다."),
  cmd("eco.layer.dip-pen-impasto", "canvas-layer", "만화 딥펜 레일로딩·유화 임파스토", "dip-pen-impasto-package", [
    al("Procreate", ["impasto", "wet oil", "유화 나이프", "임파스토"], "두꺼운 물감 높이장과 2-플럭스 물리 혼색 시뮬레이션"),
    al("CSP", ["g-pen", "maru pen", "딥펜 갈라짐", "펜촉 탄성"], "G펜·둥근펜 5종 닙 탄성과 필압 갈라짐 물리 브러시"),
  ]),

  // ── 4. 웹툰/식자 (`webtoon-lettering`) ─────────────────────────────────
  cmd("eco.comic.panel-knife", "webtoon-lettering", "사선·다각형 컷 분할 나이프", "panel-knife-section", [
    al("CSP", ["divide frame border", "컷 테두리 분할", "컷 나이프"], "대각선·다각형 드래그로 컷 폴더와 거터를 즉시 분할"),
  ], "Alt+Shift+K"),
  cmd("eco.comic.vector-surgery", "webtoon-lettering", "벡터 선 수술 7종 도구", "vector-surgery-engine", [
    al("CSP", ["correct line", "pinch vector", "vector eraser intersection", "선 수정", "교차점까지 지우기"], "선 집기·단순화·선폭 수정·연결·교차점 지우개를 포인터로 직접 조작"),
  ], "Alt+Shift+V", "벡터 레이어를 선택하면 선 수술 도구를 사용할 수 있습니다."),
  cmd("eco.comic.parametric-emotion-bubble", "webtoon-lettering", "8파라미터 감정 말풍선 생성기", "parametric-emotion-bubble-panel", [
    al("Tooning Plus", ["emotion bubble", "감정 말풍선", "말풍선 합치기"], "6기본형 × 9감정 × 8슬라이더로 말풍선 생성 및 불리언 결합"),
    al("CSP", ["balloon tail", "말풍선 꼬리", "대사 풍선"], "한국어 금칙 줄바꿈과 자동 꼬리 앵커 결합"),
  ], "Alt+Shift+B"),
  cmd("eco.comic.story-find-replace", "webtoon-lettering", "회차 대사 일괄 찾기·바꾸기", "story-find-replace-panel", [
    al("CSP", ["story editor", "스토리 에디터", "대사 일괄 편집"], "에피소드 전체 컷의 말풍선 대사를 한 화면에서 검색·일괄 교정"),
  ]),
  cmd("eco.comic.screentone-live-mask", "webtoon-lettering", "라이브 스크린톤·케즈리 깎기", "screentone-live-mask-engine", [
    al("CSP", ["screentone", "tone scraping", "케즈리 톤", "망점 톤"], "선수·각도·농도 실시간 조절과 톤 깎기 브러시 지원"),
  ]),
  cmd("eco.comic.character-inline-quick-bar", "webtoon-lettering", "캐릭터 인라인 표정·포즈 빠른 바", "character-inline-quick-bar", [
    al("Tooning Plus", ["character quick bar", "인라인 캐릭터 바", "표정 즉시 교체"], "컷 위의 캐릭터를 클릭해 표정·포즈·좌우 반전을 즉시 전환"),
  ]),
  cmd("eco.comic.planar-shape-builder", "webtoon-lettering", "평면 도형 빌더·라이브 페인트", "planar-shape-builder-engine", [
    al("Illustrator", ["shape builder", "live paint", "도형 구성 도구", "라이브 페인트"], "겹친 벡터 영역을 드래그로 즉시 병합·제거·면 채색"),
  ], "Alt+Shift+F"),
  cmd("eco.comic.variable-width-tool", "webtoon-lettering", "온캔버스 비대칭 가변 선폭 툴", "variable-width-tool-engine", [
    al("Illustrator", ["width tool", "variable width", "선폭 도구", "가변 폭"], "벡터 경로 임의 지점의 좌·우 선폭을 비대칭으로 직접 늘리고 축소"),
  ]),
  cmd("eco.comic.vector-network-graph", "webtoon-lettering", "평면 벡터 네트워크 그래프 편집", "vector-network-graph-engine", [
    al("Figma", ["vector networks", "벡터 네트워크", "분기 정점"], "한 정점에서 3개 이상 간선이 뻗는 자유 벡터 토폴로지 편집"),
  ]),

  // ── 5. 3D/모션 (`3d-motion`) ───────────────────────────────────────────
  cmd("eco.3d.unified-stage", "3d-motion", "통합 4단계 3D 스테이지 열기", "unified-3d-stage-shell", [
    al("Shaper", ["3d studio", "통합 3D 스테이지", "빌드 포즈 샷 잉크"], "배경·포즈·카메라·2D 굽기를 4단계 단일 스테이지로 연결"),
  ], "Alt+Shift+1"),
  cmd("eco.3d.head-mixer", "3d-motion", "3D 두상 믹서·34부위 슬라이더", "head-mixer-3d-panel", [
    al("CSP", ["3d head model", "head mixer", "3D 두상 모델", "루미스 가이드"], "9종 웹툰 기본 두상 블렌딩, 34개 세부 슬라이더 및 루미스 가이드 투영"),
  ], "Alt+Shift+H"),
  cmd("eco.3d.hand-body-pads", "3d-motion", "4영역 손 포즈·2D 체형 비율 패드", "hand-pose-triangle-pad", [
    al("CSP", ["hand pose scanner", "hand setup", "body shape pad", "손 삼각형 패드", "체형 매트릭스"], "펴기·쥐기·가리키기·집기 4영역 보간과 5손가락 개별 잠금"),
    al("Tooning Plus", ["21 body sliders", "3-part hair", "21체형 슬라이더", "3분할 헤어"], "21체형 커스터마이징과 앞·옆·뒷머리 독립 교체"),
  ], "Alt+Shift+M"),
  cmd("eco.3d.body-ratio-pad", "3d-motion", "2D 체형 비율 매트릭스 패드", "body-ratio-matrix-pad", [
    al("CSP", ["body ratio matrix", "등신 체형 패드", "근육 체격 패드"], "2D 패드 한 번의 드래그로 21개 등신·체격 파라미터를 즉시 보간"),
  ]),
  cmd("eco.3d.surface-bound-stroke", "3d-motion", "3D 모델 표면 구속 직드로잉", "surface-bound-stroke-controls", [
    al("Shaper", ["surface drawing", "3D 직드로잉", "표면 바인딩 스케치"], "포즈를 바꿔도 캐릭터 메시 표면을 따라다니는 3D 선화 작화"),
  ], "Alt+Shift+D"),
  cmd("eco.3d.twist-swing-ik", "3d-motion", "3D 관절 트위스트-스윙 IK 포징", "twist-swing-ik-engine", [
    al("Shaper", ["analytical ik", "rom clamp", "트위스트 IK", "관절 가동범위"], "어깨·팔꿈치·손가락 가동범위 클램프와 1-Euro 지터 억제 IK"),
  ], "Alt+Shift+I"),
  cmd("eco.3d.shaper-15-slot-contract", "3d-motion", "캐릭터 15슬롯·94프리셋 조합 검사", "shaper-15-slot-package", [
    al("Shaper", ["15-slot preset", "character slots", "15슬롯 캐릭터 조합"], "의상·헤어·소품 15슬롯 충돌 판정과 호환 조합 플래너"),
  ]),
  cmd("eco.3d.wall-cutaway", "3d-motion", "그림자 보존 벽 숨김·단면 절단", "bg3d-wall-cutaway-toggle", [
    al("SketchUp", ["section plane", "단면 절단", "벽 숨기기"], "카메라 앞 벽면만 가리되 실내 그림자와 채광은 그대로 유지"),
    al("ABLER", ["hide wall keep shadow", "에이블러 벽 숨김", "컷어웨이"], "실내 좁은 공간 촬영을 위한 그림자 유지 벽면 컷어웨이"),
  ], "Alt+Shift+W", "활성 3D 배경 씬을 열면 벽 숨김을 전환할 수 있습니다."),
  cmd("eco.3d.light-switchboard-water", "3d-motion", "실내 광원 스위치보드·툰 수면", "bg3d-light-switchboard-engine", [
    al("ABLER", ["light switchboard", "sky dome", "toon water", "에이블러 조명"], "실내 다중 조명 온오프, 툰 평면 물 반사, 원경 고정 하늘 돔"),
  ]),
  cmd("eco.3d.180-axis-ground-snap", "3d-motion", "180도 리버스샷 잠금·바닥 접지", "bg3d-180-axis-engine", [
    al("Plotr", ["180 degree rule", "reverse shot lock", "180도 축 잠금"], "대화 컷 전환 시 시선 방향이 뒤집히지 않게 카메라 축을 잠금"),
    al("Tooning Plus", ["ground snap", "pose transfer", "바닥 접지", "포즈 전이"], "캐릭터 발바닥 자동 접지와 템플릿 포즈 즉시 전이"),
  ]),
  cmd("eco.3d.ground-snap-transfer", "3d-motion", "캐릭터 자동 바닥 접지·포즈 전이", "bg3d-ground-snap-engine", [
    al("Tooning Plus", ["snap to floor", "template pose", "바닥에 붙이기"], "공중에 뜬 인물을 지면에 자동 안착하고 컷 템플릿 포즈 복사"),
  ]),
  cmd("eco.3d.lt-style-edge", "3d-motion", "손그림 펜촉 3D 외곽선 추출", "lt-style-builder-edge-engine", [
    al("Snaptoon", ["hand-drawn edge", "snaptoon lt", "스냅툰 선화", "손그림 외곽선"], "작가 펜촉 스캔 아틀라스와 크롭-줌 일관 굵기 3D 선화 추출"),
    al("SketchUp", ["style builder", "스타일 빌더", "스케치업 선 스타일"], "선 길이별 손그림 스트로크 맵으로 3D 모델 외곽선 렌더링"),
    al("CSP", ["lt conversion", "LT 변환", "선화 톤 추출"], "3D 배경에서 벡터 브러시 선화와 톤 레이어를 분리 추출"),
  ]),
  cmd("eco.3d.lt-vector-brush", "3d-motion", "3D 선화 추출 벡터 브러시 스타일", "lt-vector-brush-engine", [
    al("CSP", ["lt vector brush", "LT 벡터 브러시 팁"], "3D LT 추출선에 원하는 펜촉 브러시 텍스처와 필압 곡선을 적용"),
  ]),
  cmd("eco.3d.false-perspective", "3d-motion", "3D 과장 원근·부위별 투시 강조", "false-perspective-3d-engine", [
    al("DesignDoll", ["false perspective", "hand exaggerate", "디자인돌 투시 과장", "주먹 강조"], "카메라 가까운 주먹·발·무기를 액션 만화 구도로 극적 확대"),
  ], "Alt+Shift+E"),
  cmd("eco.3d.radial-pie-menu", "3d-motion", "3D 방사형 파이 메뉴·퀵 즐겨찾기", "radial-pie-3d-menu", [
    al("Blender", ["pie menu", "quick favorites", "블렌더 파이 메뉴", "방사형 메뉴"], "8방위 제스처로 모드·셰이딩·피벗을 즉각 전환하는 파이 메뉴"),
  ], "Alt+Shift+R"),
  cmd("eco.3d.spatial-grease-loft", "3d-motion", "3D 공간 벡터 작화·가이드 로프트", "bg3d-spatial-grease-loft-engine", [
    al("Blender", ["grease pencil", "그리스 펜슬", "3D 공간 드로잉"], "3D 공간 위에 필압 선을 그리고 곡면 가이드로 로프팅"),
  ]),
  cmd("eco.3d.hybrid-cad-gestures", "3d-motion", "직접 드래그 모서리 깎기·불리언 CAD", "hybrid-cad-gestures-engine", [
    al("Plasticity", ["direct fillet", "chamfer gesture", "플라스티시티", "모서리 필렛"], "3D 소품 모서리를 직접 드래그해 필렛·챔퍼·불리언 절삭"),
  ]),
  cmd("eco.3d.groom-guide-cage", "3d-motion", "절차적 3D 헤어 가이드 케이지", "groom-guide-cage-engine", [
    al("VRoid", ["hair guide cage", "브이로이드 헤어", "가이드 돔"], "가이드 돔 위에 4종 단면 가닥 커브로 3D 헤어 메시를 즉시 생성"),
  ]),
  cmd("eco.3d.vrm-garment-conform", "3d-motion", "3D 의상 자동 체형 맞춤·관통 제거", "vrm-garment-conform-engine", [
    al("VRoid", ["xwear", "conform clothing", "의상 자동 피팅"], "다른 체형 의상을 현재 캐릭터 버텍스에 자동 밀착·피부 관통 제거"),
  ]),
  cmd("eco.3d.multi-actor-ensemble", "3d-motion", "최대 6인 다인물 앙상블·접촉 포징", "multi-actor-ensemble-engine", [
    al("DesignDoll", ["multi-actor", "contact ik", "다인물 구도", "악수 포옹 포즈"], "최대 6명의 인물 배치, 접촉 IK, 소품 자동 파지, 3점 코믹 조명"),
  ]),
  cmd("eco.3d.mannequin-screen-pose", "3d-motion", "화면 공간 직관 포징·2D→3D 소품 팽창", "mannequin-screen-pose-engine", [
    al("Shaper", ["screen-space pose", "2d to 3d inflate", "직관 관절 회전"], "관절을 화면 방향 그대로 드래그 회전하고 2D 실루엣을 3D 소품으로 팽창"),
  ]),
  cmd("eco.3d.video-mocap", "3d-motion", "로컬 영상 3D 모션 캡처·발 고정", "vrm-video-mocap-engine", [
    al("Cascadeur", ["video mocap", "foot locking", "영상 포즈 추출"], "MP4·WebM 영상에서 로컬 3D 포즈를 추출하고 발 미끄럼을 보정"),
  ]),
  cmd("eco.3d.autophysics-trajectory", "3d-motion", "다중 프레임 물리 무게중심·탄도 보정", "autophysics-trajectory-engine", [
    al("Cascadeur", ["autophysics", "center of mass", "캐스커듀어 물리 포즈", "탄도 궤적"], "무게중심·지지점·점프 탄도를 물리 법칙에 맞게 자동 보정"),
  ]),
  cmd("eco.3d.shot-grammar-floorplan", "3d-motion", "대본→3D 샷 구도·평면 블로킹", "shot-grammar-floorplan-engine", [
    al("Storyboarder", ["shot generator", "floorplan blocking", "스토리보더 샷 생성"], "텍스트 대본을 3D 카메라 샷과 2D 평면 블로킹으로 즉시 배치"),
  ]),
  cmd("eco.3d.anchor-turntable-capture", "3d-motion", "4뷰 턴테이블 캐릭터 시트 자동 캡처", "anchor-3d-auto-capture-engine", [
    al("Tooning Plus", ["character sheet capture", "4뷰 턴테이블", "캐릭터 앵커 시트"], "정면·측면·후면·45도 4뷰 일관성 시트를 원클릭 자동 캡처"),
  ]),
  cmd("eco.3d.camera-perspective-ruler", "3d-motion", "3D 카메라→2D 원근 자 실시간 동기화", "camera-perspective-ruler-engine", [
    al("CSP", ["3d layer perspective ruler", "3D 원근 자 연동", "소실점 동기화"], "3D 카메라 회전·화각을 2D 3점 원근 자와 아이레벨에 실시간 반영"),
  ], "Alt+Shift+P"),
  cmd("eco.3d.pattern-sewing-drape", "3d-motion", "2D 패턴 봉제·다층 의상 드레이핑", "vrm-pattern-sewing-drape-engine", [
    al("CLO 3D", ["pattern sewing", "cloth drape", "클로 의상 봉제", "옷감 시뮬레이션"], "2D 재단 패턴을 봉제선으로 연결해 캐릭터 위 다층 의상 드레이핑"),
  ]),
  cmd("eco.3d.sdf-clay-sculpt", "3d-motion", "실시간 SDF 클레이 소품 조형", "hybrid-sdf-clay-engine", [
    al("Blender", ["sdf clay", "metaball sculpt", "womp 3d", "클레이 블렌드"], "부드럽게 녹아 붙는 SDF 프리미티브로 소품을 직관 조형해 메시 추출"),
  ]),
  cmd("eco.3d.smart-mask-triplanar", "3d-motion", "곡률·AO 스마트 마스크·트라이플래너", "smart-mask-triplanar-engine", [
    al("Substance 3D", ["smart mask", "tri-planar", "서브스턴스 스마트 마스크", "모서리 마모"], "메시 곡률과 차폐 기반 자동 음영·오염 마스크 및 무이음 투영"),
  ]),
  cmd("eco.motion.live-performing", "3d-motion", "60Hz 라이브 퍼포밍 키프레임 녹화", "live-performing-recorder-engine", [
    al("Procreate", ["performing mode", "live performing", "프로크리에이트 드림즈", "제스처 녹화"], "오디오 재생 중 손·펜 제스처를 60Hz 키프레임으로 녹화하고 채널별 오버더빙"),
  ], "Alt+Shift+2"),
  cmd("eco.motion.anim-canvas-overlay", "3d-motion", "프레임 셀 애니메이션·라이트테이블", "anim-canvas-overlay", [
    al("CSP", ["animation cels", "light table", "onion skin", "셀 애니메이션", "어니언 스킨"], "온캔버스 어니언 스킨과 프레임 재생 컨트롤 오버레이"),
  ], "Alt+Shift+N"),
  cmd("eco.motion.animatic-pacing", "3d-motion", "대사 읽기 속도 컷 타이밍·샷 리스트", "animatic-pacing-shotlist-engine", [
    al("Storyboarder", ["animatic timing", "shot list", "애니매틱 컷 타이밍"], "대사 길이에 맞춰 컷 재생 시간과 샷 리스트를 자동 계산"),
  ]),
  cmd("eco.motion.voice-lipsync", "3d-motion", "감정 성우 캐스팅·립싱크 타임라인", "neural-voice-lipsync-engine", [
    al("Typecast", ["ai voice actor", "lipsync timeline", "타입캐스트 성우", "립싱크"], "캐릭터별 감정 성우 음성과 입모양 키프레임을 리플 타임라인에 동기화"),
  ]),
  cmd("eco.motion.live2d-artmesh", "3d-motion", "2D 아트메쉬 리깅·진자 물리 모션", "planned-live2d-artmesh-rig", [
    al("Live2D", ["artmesh", "deformer", "pendulum physics", "라이브2D", "머리카락 흔들림"], "2D 일러스트 파츠를 메시 디포머와 진자 물리로 생동감 있게 구동"),
  ]),
  cmd("eco.motion.rive-state-machine", "3d-motion", "스크롤·음성 반응형 상태머신 모션", "planned-rive-state-machine", [
    al("Rive", ["state machine", "interactive motion", "라이브 상태머신"], "독자 스크롤·터치·음성 입력에 반응하는 인터랙티브 웹툰 연출"),
  ]),
  cmd("eco.motion.multiplane-z-camera", "3d-motion", "2.5D 멀티플레인 Z-카메라·페그 계층", "planned-multiplane-z-camera", [
    al("Toon Boom", ["multiplane camera", "peg hierarchy", "툰붐 멀티플레인", "컷아웃 페그"], "깊이별 레이어를 Z축 카메라로 입체 패럴랙스 연출"),
  ]),

  // ── 6. 협업/AI (`collab-ai`) ───────────────────────────────────────────
  cmd("eco.collab.story-three-view", "collab-ai", "스토리 3-뷰 동기화 워크스페이스", "story-three-view-workspace", [
    al("Manyfast", ["living spec", "3-view sync", "매니패스트 3뷰", "기획 동기화"], "스토리 개요·회차 보드·컷 콘티를 3-뷰에서 실시간 양방향 동기화"),
  ], "Alt+Shift+S"),
  cmd("eco.collab.ai-proposal-diff-gate", "collab-ai", "비파괴 AI 제안 비교·승인 게이트", "ai-proposal-diff-gate", [
    al("Manyfast", ["ai diff gate", "proposal review", "AI 제안 승인", "내가 고친 내용"], "AI 수정 제안을 원본과 나란히 비교해 항목별로 승인·보류"),
  ]),
  cmd("eco.collab.six-perspective-review", "collab-ai", "6관점 원고 증분 검수 서랍", "six-perspective-review-drawer", [
    al("Manyfast", ["six-perspective review", "drift badge", "6관점 검수", "컷 수정됨"], "개연성·페이싱·대사·구도·일관성·출고 6관점 증분 검수 및 변경 감지"),
  ], "Alt+Shift+G"),
  cmd("eco.collab.consistency-asset-strip", "collab-ai", "일관성 참고 소재 스트립 열기", "consistency-asset-strip", [
    al("Plotr", ["consistency strip", "reference strip", "일관성 소재 바"], "캐릭터·배경·소품 3분류 참고 소재를 캔버스 상단에 상시 고정"),
  ]),
  cmd("eco.collab.spatial-moodboard-dna", "collab-ai", "무한 공간 무드보드·스타일 DNA 락", "spatial-moodboard-dna-engine", [
    al("Plotr", ["moodboard dna", "style lock", "무드보드 스타일 고정"], "참고 이미지에서 색감·톤 스타일 DNA를 추출해 회차 전반에 고정"),
  ]),
  cmd("eco.collab.regional-control-stack", "collab-ai", "영역별 AI 프롬프트·컨트롤 스택", "regional-control-stack-engine", [
    al("ComfyUI", ["controlnet stack", "regional prompting", "영역 프롬프트", "멀티 컨트롤넷"], "선화·깊이·포즈 가이드를 영역별 마스크로 조합해 안전 스테이징"),
  ], undefined, "설정(/settings/ai)에서 외부 생성 모델을 연결하면 실행할 수 있습니다."),
  cmd("eco.collab.ai-node-graph", "collab-ai", "비파괴 멀티모달 AI 노드 파이프라인", "planned-ai-node-graph", [
    al("ComfyUI", ["node workflow", "comfy graph", "컴피UI 노드", "AI 노드 파이프라인"], "이미지·3D·음성 처리 노드를 그래프로 연결해 반복 작업 자동화"),
  ], undefined, "설정(/settings/ai)에서 외부 생성 모델을 연결하면 실행할 수 있습니다."),
  cmd("eco.collab.keyboard-triage-cycles", "collab-ai", "단일키 검수 트리아지·마감 사이클", "keyboard-triage-cycle-engine", [
    al("Linear", ["triage inbox", "cycles burndown", "리니어 트리아지", "마감 번다운"], "편집자 피드백과 어시스턴트 작업을 키보드 단일키로 고속 분류"),
  ], "Alt+Shift+6"),
  cmd("eco.collab.slash-script-director", "collab-ai", "슬래시(/) 대본 디렉터·@바이블 연동", "slash-script-director-engine", [
    al("Notion", ["slash commands", "mention database", "노션 슬래시", "대본 에디터"], "대본 입력 중 /연출 명령과 @캐릭터 설정 카드를 인라인 호출"),
  ], "Alt+Shift+7"),

  // ── 7. 보기/도움말 (`view-help`) ───────────────────────────────────────
  cmd("eco.view.webtoon-view-area", "view-help", "스마트폰 세로 시야 미리보기 영역", "webtoon-view-area-overlay", [
    al("CSP", ["on-screen area (webtoon)", "스마트폰 미리보기 영역", "세로 스크롤 프레임"], "독자 휴대폰 9:16·9:19.5 화면 비율로 컷 호흡과 대사 가독성 즉시 검수"),
  ], "Alt+Shift+Y"),
  cmd("eco.view.companion-pairing", "view-help", "모바일 컴패니언 QR 연결", "remote-companion-pairing-engine", [
    al("CSP", ["companion mode", "컴패니언 모드", "모바일 보조 컨트롤러"], "스마트폰을 무선 퀵액세스·컬러휠·서브뷰·세로 미리보기 보조기로 페어링"),
  ], "Alt+Shift+3"),
  cmd("eco.view.reference-pro-overlay", "view-help", "클릭-스루 트레이싱 레퍼런스 창", "reference-pro-overlay-engine", [
    al("PureRef", ["always on top", "click-through", "퓨어레프", "참고 이미지 보드"], "투명도 조절·클릭 통과·비파괴 크롭·GIF 프레임 스텝을 지원하는 참고 보드"),
  ], "Alt+Shift+4"),
]);

const VALID_SEVEN_MENU_IDS: ReadonlySet<string> = new Set(STUDIO_STANDARD_SEVEN_MENU_GROUPS.map((g) => g.id));

/** `F1` / `⌘K` 커맨드 팔레트에서 한국어 라벨 · 경쟁 제품명 · 다국어 별칭 · 단축키로 즉시 검색한다. */
export function searchExpandedEcosystemCommands(
  query: string,
  commands: readonly StudioExpandedEcosystemCommand[] = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
): readonly StudioExpandedCommandSearchHit[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands.map((command) => ({ command, score: 1, matchedField: "label" as const }));

  const hits: StudioExpandedCommandSearchHit[] = [];
  for (const command of commands) {
    const labelLower = command.koreanLabel.toLowerCase();
    const idLower = command.id.toLowerCase();
    const shortcutLower = command.shortcut?.toLowerCase() ?? "";

    if (labelLower === normalized) {
      hits.push({ command, score: 100, matchedField: "label" });
      continue;
    }
    if (labelLower.includes(normalized)) {
      hits.push({ command, score: labelLower.startsWith(normalized) ? 90 : 80, matchedField: "label" });
      continue;
    }

    let bestAliasScore = 0;
    let aliasField: "alias" | "product" = "alias";
    for (const entry of command.competitorAliases) {
      if (entry.product.toLowerCase().includes(normalized) && 70 > bestAliasScore) {
        bestAliasScore = 70;
        aliasField = "product";
      }
      for (const term of entry.terms) {
        const termLower = term.toLowerCase();
        if (termLower === normalized && 95 > bestAliasScore) {
          bestAliasScore = 95;
          aliasField = "alias";
        } else if (termLower.includes(normalized) && 75 > bestAliasScore) {
          bestAliasScore = 75;
          aliasField = "alias";
        }
      }
      if (entry.conceptNote.toLowerCase().includes(normalized) && 55 > bestAliasScore) {
        bestAliasScore = 55;
        aliasField = "alias";
      }
    }

    if (bestAliasScore > 0) hits.push({ command, score: bestAliasScore, matchedField: aliasField });
    else if (shortcutLower && shortcutLower.includes(normalized)) hits.push({ command, score: 60, matchedField: "shortcut" });
    else if (idLower.includes(normalized)) hits.push({ command, score: 50, matchedField: "id" });
  }

  return hits.sort((a, b) => b.score - a.score || a.command.id.localeCompare(b.command.id));
}

/**
 * Three Doors One Command 정합 검증기:
 * 1) 중복 ID 0건, 2) 내부·코어 단축키 충돌 0건, 3) 7대 표준 메뉴 귀속,
 * 4) 금지 내부 용어(`STUDIO_FORBIDDEN_DEFAULT_UI_TERMS`) 0건, 5) 지연 로더 ID 완결성.
 */
export function validateExpandedEcosystemCommands(
  commands: readonly StudioExpandedEcosystemCommand[] = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
  registeredLoaderIds?: ReadonlySet<string>,
): readonly StudioExpandedCommandValidationIssue[] {
  const issues: StudioExpandedCommandValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenShortcuts = new Map<string, string>();
  const coreShortcuts = new Map<string, string>();

  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    const key = normalizeStudioShortcutChordKey(action.defaultKeys);
    if (key) coreShortcuts.set(key, action.id);
  }

  for (const command of commands) {
    if (seenIds.has(command.id)) {
      issues.push({ code: "duplicate-id", commandId: command.id, message: `중복 커맨드 ID: ${command.id}` });
    }
    seenIds.add(command.id);

    if (!VALID_SEVEN_MENU_IDS.has(command.group)) {
      issues.push({
        code: "invalid-menu-group",
        commandId: command.id,
        message: `7대 표준 메뉴에 속하지 않는 그룹입니다: ${String(command.group)}`,
      });
    }

    if (command.competitorAliases.length === 0) {
      issues.push({ code: "empty-aliases", commandId: command.id, message: `검색 별칭 누락: ${command.id}` });
    }

    if (!command.panelLoaderId) {
      issues.push({ code: "missing-loader-id", commandId: command.id, message: `지연 로더 ID 누락: ${command.id}` });
    } else if (registeredLoaderIds && !registeredLoaderIds.has(command.panelLoaderId)) {
      issues.push({
        code: "dangling-loader-id",
        commandId: command.id,
        message: `지연 로더 레지스트리에 없는 ID입니다: ${command.panelLoaderId}`,
      });
    }

    if (command.shortcut) {
      const chordKey = normalizeStudioShortcutChordKey(command.shortcut);
      if (chordKey) {
        const internalHit = seenShortcuts.get(chordKey);
        if (internalHit) {
          issues.push({
            code: "shortcut-conflict-internal",
            commandId: command.id,
            message: `단축키 '${command.shortcut}'가 '${internalHit}'와 충돌합니다.`,
          });
        } else {
          seenShortcuts.set(chordKey, command.id);
        }
        const coreHit = coreShortcuts.get(chordKey);
        if (coreHit) {
          issues.push({
            code: "shortcut-conflict-core",
            commandId: command.id,
            message: `단축키 '${command.shortcut}'가 기본 스튜디오 단축키('${coreHit}')와 충돌합니다.`,
          });
        }
      }
    }

    const exposedTexts = [command.koreanLabel, command.unavailableReason ?? ""];
    for (const text of exposedTexts) {
      const lower = text.toLowerCase();
      for (const forbidden of STUDIO_FORBIDDEN_DEFAULT_UI_TERMS) {
        if (lower.includes(forbidden.toLowerCase())) {
          issues.push({
            code: "forbidden-ui-term",
            commandId: command.id,
            message: `기본 UI 문구에 금지 용어('${forbidden}')가 포함되었습니다: "${text}"`,
          });
        }
      }
    }
  }

  return issues;
}

/** 7대 표준 메뉴별로 확장 생태계 커맨드를 그룹핑해 반환한다. */
export function groupExpandedEcosystemCommandsBySevenMenus(
  commands: readonly StudioExpandedEcosystemCommand[] = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
): ReadonlyMap<StudioStandardSevenMenuId, readonly StudioExpandedEcosystemCommand[]> {
  const buckets = new Map<StudioStandardSevenMenuId, StudioExpandedEcosystemCommand[]>();
  for (const spec of STUDIO_STANDARD_SEVEN_MENU_GROUPS) buckets.set(spec.id, []);
  for (const command of commands) buckets.get(command.group)?.push(command);
  return buckets;
}
