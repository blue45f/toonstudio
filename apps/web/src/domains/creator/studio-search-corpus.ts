/**
 * Supplementary search corpus — the destinations that are **not** commands.
 *
 * `studio-command-catalog.ts` (Wave A) already carries 155 commands and their
 * vendor aliases. But the measured alias gap in `docs/rewrite/ux-audit-v5.md`
 * §2.8 is mostly *not* about commands: "레이어 마스크", "클리핑", "서브 도구",
 * "Auto action" and "Levels" are panels and layer/tool **properties**, so no
 * amount of command aliasing reaches them. This file declares those
 * destinations with the same `TerminologyAlias` shape the catalog uses, so one
 * index can answer for both.
 *
 * It is also the safety net for Wave D's other half: the inspector collapses
 * ~2/3 of its controls behind "고급". Collapsing is only acceptable because
 * every collapsed group is declared here and therefore reachable by name. The
 * contract test asserts that link (`studio-inspector-density.test.ts`).
 *
 * Declaration data only — no React, no store access.
 */

import type { StudioInspectorFocusTarget } from "./studio-inspector-focus";
import type {
  StudioDocumentInspectorSection,
  StudioImageInspectorSection,
  StudioInspectorPrimarySection,
} from "./studio-inspector-layout";
import type { TerminologyAlias } from "@toonstudio/studio-command-registry";

/* ------------------------------------------------------------------ types */

/**
 * Where a result lives. `command` entries come from the catalog; everything
 * else is declared in this file.
 */
export type StudioSearchKind = "command" | "property" | "panel" | "tutorial";

export type StudioSearchTarget =
  /**
   * Move the right inspector to a route (see `navigateStudioInspector`).
   *
   * The shape mirrors `StudioInspectorRoute` field for field — `primary` alone
   * lands on the right tab but the *previous* subtab, so `image`/`document`
   * must ride along or "캔버스 설정" opens the document tab on whatever the
   * user last looked at. `focusTarget` is the deep link the inspector honours
   * after the route mounts (`requestStudioInspectorFocus`).
   */
  | {
      type: "inspector";
      primary: StudioInspectorPrimarySection;
      image?: StudioImageInspectorSection;
      document?: StudioDocumentInspectorSection;
      focusTarget?: StudioInspectorFocusTarget;
    }
  /** Expand one of the two drawing palettes. */
  | { type: "palette"; paletteId: "sub-tools" | "tool-properties" }
  /** Open a lazily mounted studio panel by its stack id. */
  | { type: "panel"; panelId: string }
  /** Open the feature tutorial hub on one tutorial. */
  | { type: "tutorial"; tutorialId: string }
  /** Nothing to activate yet — the breadcrumb plus help node is the answer. */
  | { type: "help" };

export interface StudioSearchCorpusEntry {
  id: string;
  kind: Exclude<StudioSearchKind, "command" | "tutorial">;
  /** Canonical Korean name. Must be the *same* string everywhere it appears. */
  label: string;
  labelEn: string;
  /** Korean breadcrumb — "어디에 있는지". Shown even when `target` is inert. */
  location: string;
  description: string;
  aliases: readonly TerminologyAlias[];
  keywords?: readonly string[];
  helpNodeId: string;
  target: StudioSearchTarget;
  /** Keep the row searchable, but explain that navigation needs an active selection. */
  requiresSelection?: boolean;
  /**
   * Ids from `studioInspectorActions()` this entry absorbs. The navigator's own
   * corpus is merged into the same index, so without this the same destination
   * would appear twice under two section headings.
   */
  supersedes?: readonly string[];
}

/* ---------------------------------------------------------------- helpers */

const alias =
  (vendor: TerminologyAlias["vendor"], locale: TerminologyAlias["locale"]) =>
  (term: string): TerminologyAlias => ({ vendor, term, locale });

/** CLIP STUDIO PAINT — Korean UI wording. */
const csp = alias("csp", "ko");
/** CLIP STUDIO PAINT — English UI wording. */
const cspEn = alias("csp", "en");
const ps = alias("photoshop", "en");
const psKo = alias("photoshop", "ko");
const krita = alias("krita", "en");
const procreate = alias("procreate", "en");
/** Our own legacy wording, kept searchable so renames do not orphan habits. */
const ours = alias("toonstudio", "ko");

/* ---------------------------------------------------------------- corpus */

export const STUDIO_SEARCH_CORPUS: readonly StudioSearchCorpusEntry[] =
  Object.freeze([
    /* ---- 레이어 속성 (인스펙터 · 기본/고급) ---- */
    {
      id: "property.layer-mask",
      kind: "property",
      label: "레이어 마스크",
      labelEn: "Layer mask",
      location: "인스펙터 › 대상 › 마스크",
      description: "비파괴 마스크를 추가하고 반전하거나 직접 칠합니다.",
      aliases: [
        csp("레이어 마스크"),
        cspEn("Layer Mask"),
        ps("Layer Mask"),
        psKo("레이어 마스크"),
        krita("Transparency Mask"),
        procreate("Mask"),
        ours("마스크"),
      ],
      keywords: ["mask", "비파괴", "반전", "페인팅", "alpha"],
      helpNodeId: "help/property/layer-mask",
      target: { type: "inspector", primary: "properties", image: "mask" },
      supersedes: ["image-mask"],
    },
    {
      id: "property.clipping",
      kind: "property",
      label: "아래 레이어에 클리핑",
      labelEn: "Clip to layer below",
      location: "인스펙터 › 대상 › 혼합",
      description: "바로 아래 레이어의 불투명 영역으로 이 레이어를 가둡니다.",
      aliases: [
        csp("아래 레이어에서 클리핑"),
        cspEn("Clip at Layer Below"),
        ps("Clipping Mask"),
        psKo("클리핑 마스크"),
        krita("Inherit Alpha"),
        procreate("Clipping Mask"),
        ours("클리핑"),
      ],
      keywords: ["clip", "clipping", "클리핑", "가두기", "inherit alpha"],
      helpNodeId: "help/property/clipping",
      target: { type: "inspector", primary: "properties" },
      requiresSelection: true,
    },
    {
      id: "property.blend-mode",
      kind: "property",
      label: "혼합 모드",
      labelEn: "Blend mode",
      location: "인스펙터 › 대상 › 혼합",
      description: "곱하기·스크린·오버레이 등 레이어 합성 방식을 고릅니다.",
      aliases: [
        csp("합성 모드"),
        cspEn("Blending Mode"),
        ps("Blending Mode"),
        psKo("혼합 모드"),
        krita("Blending Mode"),
        procreate("Blend Mode"),
        ours("블렌드 모드"),
      ],
      keywords: ["blend", "multiply", "screen", "overlay", "곱하기", "스크린"],
      helpNodeId: "help/property/blend-mode",
      target: { type: "inspector", primary: "properties" },
      requiresSelection: true,
    },
    {
      id: "property.opacity",
      kind: "property",
      label: "불투명도",
      labelEn: "Opacity",
      location: "인스펙터 › 대상 › 혼합",
      description: "선택한 요소나 레이어의 불투명도를 조절합니다.",
      aliases: [
        csp("불투명도"),
        ps("Opacity"),
        krita("Opacity"),
        procreate("Opacity"),
      ],
      keywords: ["opacity", "alpha", "투명도"],
      helpNodeId: "help/property/opacity",
      target: {
        type: "inspector",
        primary: "properties",
        focusTarget: "selection.geometry",
      },
      requiresSelection: true,
    },
    {
      id: "property.transform-numeric",
      kind: "property",
      label: "위치·크기",
      labelEn: "Position and size",
      location: "인스펙터 › 대상 › 배치",
      description: "X·Y·너비·높이·회전을 숫자로 입력합니다.",
      aliases: [
        csp("확대·축소·회전"),
        cspEn("Scale/Rotate"),
        ps("Free Transform"),
        psKo("자유 변형"),
        krita("Transform Tool"),
        procreate("Transform"),
      ],
      keywords: ["transform", "layout", "position", "size", "rotation", "x", "y", "width", "height", "위치", "크기", "회전", "배치"],
      supersedes: ["selection-layout"],
      helpNodeId: "help/property/transform-numeric",
      target: {
        type: "inspector",
        primary: "properties",
        focusTarget: "selection.geometry",
      },
      requiresSelection: true,
    },
    {
      id: "property.layer-style",
      kind: "property",
      label: "레이어 스타일",
      labelEn: "Layer style",
      location: "인스펙터 › 대상 › 효과",
      description: "그림자·테두리·광선 같은 레이어 효과를 켭니다.",
      aliases: [
        csp("경계 효과"),
        cspEn("Border Effect"),
        ps("Layer Style"),
        psKo("레이어 스타일"),
        ps("Drop Shadow"),
        krita("Layer Style"),
      ],
      keywords: ["style", "shadow", "stroke", "glow", "그림자", "테두리"],
      helpNodeId: "help/property/layer-style",
      target: { type: "inspector", primary: "properties" },
      requiresSelection: true,
    },

    /* ---- 색보정 (이미지 보정 패널 섹션) ---- */
    {
      id: "property.levels",
      kind: "property",
      label: "레벨 보정",
      labelEn: "Levels",
      location: "인스펙터 › 대상 › 보정 › 레벨",
      description: "입력·출력 레벨과 감마로 밝기 분포를 다시 맞춥니다.",
      aliases: [
        csp("레벨 보정"),
        cspEn("Level Correction"),
        ps("Levels"),
        psKo("레벨"),
        krita("Levels"),
        ours("레벨"),
      ],
      keywords: ["levels", "레벨", "감마", "gamma", "histogram", "히스토그램"],
      helpNodeId: "help/property/levels",
      target: { type: "inspector", primary: "properties", image: "quick" },
    },
    {
      id: "property.tone-curve-panel",
      kind: "property",
      label: "톤 커브",
      labelEn: "Tone curve",
      location: "인스펙터 › 대상 › 보정 › 톤 커브",
      description: "RGB 채널별 곡선으로 명암을 세밀하게 조절합니다.",
      aliases: [
        csp("톤 커브"),
        cspEn("Tonal Correction"),
        ps("Curves"),
        psKo("곡선"),
        krita("Color Adjustment Curves"),
        procreate("Curves"),
      ],
      keywords: ["curve", "커브", "곡선", "rgb", "명암"],
      helpNodeId: "help/property/tone-curve",
      target: { type: "inspector", primary: "properties", image: "quick" },
    },

    /* ---- 팔레트·패널 ---- */
    {
      id: "panel.sub-tools",
      kind: "panel",
      label: "서브 도구",
      labelEn: "Sub tool",
      location: "그리기 독 › 서브 도구 팔레트",
      description: "현재 도구의 프리셋 목록을 열고 브러시를 갈아 끼웁니다.",
      aliases: [
        csp("보조 도구"),
        cspEn("Sub Tool"),
        ps("Tool Presets"),
        psKo("도구 사전 설정"),
        krita("Brush Presets"),
        procreate("Brush Library"),
        ours("서브 도구"),
      ],
      keywords: ["subtool", "preset", "프리셋", "브러시 목록"],
      helpNodeId: "help/panel/sub-tools",
      target: { type: "palette", paletteId: "sub-tools" },
    },
    {
      id: "panel.tool-properties",
      kind: "panel",
      label: "도구 속성",
      labelEn: "Tool properties",
      location: "그리기 독 › 도구 속성 팔레트",
      description: "현재 도구의 크기·불투명도·보정 등 세부 설정을 엽니다.",
      aliases: [
        csp("도구 속성"),
        cspEn("Tool Property"),
        ps("Options Bar"),
        psKo("옵션 막대"),
        krita("Tool Options"),
        procreate("Brush Studio"),
      ],
      keywords: ["tool", "options", "옵션", "속성", "브러시 설정"],
      helpNodeId: "help/panel/tool-properties",
      target: { type: "palette", paletteId: "tool-properties" },
    },
    {
      id: "panel.auto-actions",
      kind: "panel",
      label: "자동 액션",
      labelEn: "Auto action",
      location: "인스펙터 › 자동화 › 자동 액션",
      description: "반복 작업을 녹화해 한 번의 클릭으로 다시 실행합니다.",
      aliases: [
        csp("오토 액션"),
        cspEn("Auto Action"),
        ps("Actions"),
        psKo("액션"),
        krita("Recorder"),
        krita("Macro"),
        ours("매크로"),
      ],
      keywords: ["auto action", "액션", "매크로", "macro", "녹화", "batch"],
      helpNodeId: "help/panel/auto-actions",
      target: { type: "panel", panelId: "auto-actions" },
    },
    {
      id: "panel.brush-studio",
      // 목적지가 인스펙터 컨트롤 그룹(`tool.brush-studio`)이라 "속성"이다.
      // `studio-inspector-density.ts` 의 같은 그룹이 `searchEntryId` 로 이
      // 행을 가리키고, 형제인 `tool.brush-engines` 도 property 로 들어온다.
      // (id 는 다른 파일이 참조하므로 legacy `panel.` 접두사를 유지한다.)
      kind: "property",
      label: "현재 브러시 편집",
      labelEn: "Edit current brush",
      location: "인스펙터 › 대상 › 그리기 › 현재 브러시 편집",
      description: "캔버스를 떠나지 않고 현재 브러시의 끝·산포·필압 곡선을 빠르게 편집합니다.",
      aliases: [
        ours("브러시 스튜디오"),
        csp("보조 도구 상세"),
        cspEn("Sub Tool Detail"),
        ps("Brush Settings"),
        psKo("브러시 설정"),
        krita("Brush Editor"),
        procreate("Brush Studio"),
      ],
      keywords: ["brush", "브러시", "필압", "산포", "scatter"],
      helpNodeId: "help/panel/brush-studio",
      target: {
        type: "inspector",
        primary: "properties",
        focusTarget: "tool.brush-studio",
      },
      // 빌더가 액션의 `focusTarget` 을 싣기 시작하면서 인스펙터 액션
      // `brush-studio` 와 목적지·라벨이 완전히 같아졌다 — 흡수하지 않으면
      // "브러시" 한 번에 같은 이름 두 줄이 두 구획에 나뉘어 뜬다.
      supersedes: ["brush-studio"],
    },
    {
      // 이 패널을 이름으로 찾을 수 있게 하는 행. 명령 카탈로그에는 여닫는 명령이 있지만 그쪽은
      // `>` 명령 모드(원격 색인)에서만 답하고, 기본 '전체' 탭이 오프라인으로 뒤지는 것은 이
      // 코퍼스다. 형제인 `panel.layer-list` 만 여기 있고 정작 그 옆 패널이 빠져 있어서
      // "작업 패널"·"속성 패널" 둘 다 0건이었다.
      id: "panel.work",
      kind: "panel",
      label: "작업 패널",
      labelEn: "Work Panel",
      location: "인스펙터 › 대상",
      description: "선택한 대상의 속성과 그리기 도구 설정을 조절합니다.",
      aliases: [
        // 이 저장소가 쓰던 옛 이름. 손버릇이 끊기지 않게 별칭으로 남긴다.
        ours("속성 패널"),
        csp("도구 속성"),
        cspEn("Tool Property"),
        ps("Properties Panel"),
        psKo("속성 패널"),
        krita("Tool Options Docker"),
        procreate("Adjustments"),
      ],
      keywords: ["작업", "속성", "패널", "대상", "properties", "inspector", "panel"],
      helpNodeId: "help/panel/work",
      target: { type: "inspector", primary: "properties" },
    },
    {
      // 캐릭터 셰이퍼는 명령 카탈로그에도 있지만, 기본 '전체' 탭이 오프라인으로 뒤지는 것은 이
      // 코퍼스다. "셰이퍼"·"캐릭터 만들기"·"프리셋" 같은 손버릇이 0건이 되지 않게 여기 둔다.
      id: "panel.character-shaper",
      kind: "panel",
      label: "캐릭터 셰이퍼",
      labelEn: "Character Shaper",
      location: "3D › 캐릭터 셰이퍼",
      description: "프리셋 카드로 얼굴·헤어·체형·의상을 고르고 포즈를 잡아 투명 PNG·레이어 PSD로 내보냅니다.",
      aliases: [
        ours("셰이퍼"),
        ours("캐릭터 만들기"),
        ours("프리셋"),
        ours("3D 캐릭터"),
        ours("포즈"),
        ours("의상"),
        ours("VRM"),
      ],
      keywords: ["셰이퍼", "shaper", "캐릭터 만들기", "프리셋", "preset", "3D 캐릭터", "포즈", "pose", "의상", "vrm"],
      helpNodeId: "help/panel/character-shaper",
      target: { type: "panel", panelId: "character-shaper" },
    },
    {
      id: "panel.layer-list",
      kind: "panel",
      label: "레이어 목록",
      labelEn: "Layers",
      location: "인스펙터 › 레이어",
      description: "레이어 순서·그룹·표시·잠금을 관리합니다.",
      aliases: [
        csp("레이어 팔레트"),
        cspEn("Layer Palette"),
        ps("Layers Panel"),
        psKo("레이어 패널"),
        krita("Layers Docker"),
        procreate("Layers"),
      ],
      keywords: ["layer", "레이어", "그룹", "폴더"],
      helpNodeId: "help/panel/layer-list",
      target: { type: "inspector", primary: "layers" },
      supersedes: ["layers"],
    },

    /* ---- 전문가 드로잉 · 채색 보조 · 3D 배치 · 협업 검수 한국어 별칭 ---- */
    {
      id: "property.stroke-stabilization",
      kind: "property",
      label: "선 보정 · 손떨림 보정",
      labelEn: "Stroke stabilization",
      location: "그리기 독 › 도구 속성 › 선 보정",
      description: "손떨림 보정 강도 프리셋을 고르고 빠른 손동작에서도 끝점과 필압을 보존합니다.",
      aliases: [
        csp("손떨림 보정"),
        cspEn("Stabilization"),
        ps("Smoothing"),
        psKo("보정"),
        krita("Stabilizer"),
        procreate("StreamLine"),
        ours("선 보정"),
      ],
      keywords: ["손떨림", "선 보정", "보정", "stabilization", "smoothing", "streamline", "끝점", "필압"],
      helpNodeId: "help/property/stroke-stabilization",
      target: { type: "palette", paletteId: "tool-properties" },
    },
    {
      id: "property.pressure-tilt-curve",
      kind: "property",
      label: "필압·기울기 곡선",
      labelEn: "Pressure and tilt curve",
      location: "인스펙터 › 대상 › 그리기 › 필압·기울기",
      description: "실시간 스트로크 샘플을 보며 필압·기울기 곡선을 조절하고 마우스 대체 테이퍼와 기본값 복원을 지원합니다.",
      aliases: [
        csp("필압 검지 레벨 조절"),
        cspEn("Pen Pressure Settings"),
        ps("Transfer"),
        krita("Pressure Curve"),
        procreate("Pressure & Smoothing"),
        ours("필압 곡선"),
        ours("기울기 곡선"),
      ],
      keywords: ["필압", "기울기", "곡선", "커브", "pressure", "tilt", "마우스", "기본값 복원"],
      helpNodeId: "help/property/pressure-tilt-curve",
      target: {
        type: "inspector",
        primary: "properties",
        focusTarget: "tool.brush-studio",
      },
    },
    {
      id: "property.color-fill-assist",
      kind: "property",
      label: "참조 레이어 · 틈 닫기 채우기",
      labelEn: "Reference layer and close-gap fill",
      location: "인스펙터 › 대상 › 이미지 › 채우기·선화",
      description: "선화를 참조 레이어로 지정해 끊긴 선의 틈 닫기와 번짐 범위를 미리보고 밑색을 채웁니다.",
      aliases: [
        csp("참조 레이어"),
        csp("틈 닫기"),
        cspEn("Close Gap"),
        cspEn("Refer Multiple"),
        ps("Sample All Layers"),
        krita("Close Gap"),
        procreate("Reference"),
        ours("번짐 미리보기"),
        ours("밑색 채우기"),
      ],
      keywords: ["참조 레이어", "틈 닫기", "번짐", "영역 확장", "밑색", "채색 보조", "close gap", "reference layer"],
      helpNodeId: "help/property/color-fill-assist",
      target: { type: "inspector", primary: "properties", image: "fill" },
    },
    {
      id: "property.vector-ink-edit",
      kind: "property",
      label: "벡터 교차점 지우기 · 선 굵기 수정",
      labelEn: "Vector intersection erase and line width",
      location: "그리기 독 › 도구 속성 › 벡터 잉크 편집",
      description: "벡터 선화의 교차점까지 깔끔하게 지우거나 그린 뒤에도 선 굵기를 비파괴로 수정합니다.",
      aliases: [
        csp("벡터용 지우개"),
        csp("선 폭 수정"),
        cspEn("Vector Eraser"),
        cspEn("Correct Line Width"),
        ours("교차점 지우기"),
        ours("교차점 지우개"),
        ours("벡터 선 굵기"),
      ],
      keywords: ["벡터", "교차점", "지우개", "선 굵기", "선 폭", "비파괴", "vector", "intersection"],
      helpNodeId: "help/property/vector-ink-edit",
      target: { type: "palette", paletteId: "tool-properties" },
    },
    {
      id: "property.perspective-ruler-snap",
      kind: "property",
      label: "원근 자 · 소실점 스냅",
      labelEn: "Perspective ruler and vanishing-point snap",
      location: "인스펙터 › 문서 › 캔버스 › 가이드",
      description: "1·2·3점 투시 소실점과 3D 카메라를 연동하고 원근 스냅 토글 상태를 한눈에 확인합니다.",
      aliases: [
        csp("퍼스 자"),
        cspEn("Perspective Ruler"),
        ps("Vanishing Point"),
        krita("Perspective Assistant"),
        procreate("Drawing Guide"),
        ours("원근 자"),
        ours("투시자"),
        ours("소실점"),
      ],
      keywords: ["원근", "투시", "원근 자", "투시자", "소실점", "스냅", "3d 카메라", "perspective", "vanishing point"],
      helpNodeId: "help/property/perspective-ruler-snap",
      target: {
        type: "inspector",
        primary: "document",
        document: "canvas",
        focusTarget: "canvas.guide-lines",
      },
    },
    {
      id: "property.comic-cut-frame",
      kind: "property",
      label: "컷 분할 · 프레임 여백과 마스크",
      labelEn: "Panel split, gutter, and cut mask",
      location: "인스펙터 › 문서 › 캔버스 › 컷 프레임",
      description: "웹툰 컷 프레임을 분할·정렬·여백 조절하고 컷 밖 그리기 제한을 켜고 끕니다.",
      aliases: [
        csp("컷 테두리 분할"),
        csp("프레임 폴더"),
        cspEn("Divide Frame Border"),
        krita("Comic Panels"),
        ours("칸 나누기"),
        ours("컷 분할"),
        ours("컷 여백"),
        ours("컷 밖 그리기 제한"),
      ],
      keywords: ["컷", "칸 나누기", "프레임", "분할", "여백", "정렬", "컷 밖", "panel", "gutter", "frame"],
      helpNodeId: "help/property/comic-cut-frame",
      target: { type: "inspector", primary: "document", document: "canvas" },
    },
    {
      id: "property.bg3d-placement",
      kind: "property",
      label: "3D 배치 · 축 고정과 바닥 맞춤",
      labelEn: "3D placement, axis lock, and floor snap",
      location: "3D › 장면 도우미 › 배치·스냅",
      description: "3D 배경 소품을 축 고정·그리드 스냅·바닥 맞춤으로 배치하고 GLB 단위·축 상태를 안내합니다.",
      aliases: [
        csp("3D 소재 배치"),
        cspEn("3D Object Placement"),
        ours("3D 배치"),
        ours("축 고정"),
        ours("바닥 맞춤"),
        ours("GLB 단위"),
      ],
      keywords: ["3d", "배치", "축 고정", "스냅", "바닥 맞춤", "glb", "단위", "z-up", "placement", "floor snap"],
      helpNodeId: "help/property/bg3d-placement",
      target: { type: "inspector", primary: "properties" },
    },
    {
      id: "property.collab-cut-review",
      kind: "property",
      label: "협업 검수 · 컷 좌표 댓글과 이력 복구",
      labelEn: "Cut coordinate comments and history restore",
      location: "상단 메뉴 › 검수 · 댓글 및 버전 이력",
      description: "컷·좌표별 핀 댓글과 해결 상태를 관리하고 역할별 권한 확인 및 이전 체크포인트를 복구합니다.",
      aliases: [
        ours("협업 검수"),
        ours("컷 댓글"),
        ours("좌표 댓글"),
        ours("핀 댓글"),
        ours("이력 복구"),
        ours("버전 복구"),
      ],
      keywords: ["협업", "검수", "댓글", "핀", "해결", "역할", "권한", "이력", "복구", "review", "history"],
      helpNodeId: "help/property/collab-cut-review",
      target: { type: "inspector", primary: "publish" },
    },
  ]);

/** Corpus entries keyed by id. */
export const STUDIO_SEARCH_CORPUS_BY_ID: ReadonlyMap<
  string,
  StudioSearchCorpusEntry
> = new Map(STUDIO_SEARCH_CORPUS.map((entry) => [entry.id, entry]));
