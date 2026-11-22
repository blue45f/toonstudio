import type {
  BilingualText,
  DrawingComparisonCategory,
  DrawingSupportStatus,
  DrawingToolCell,
} from "./drawing-tool-comparison-profiles";

const t = (ko: string, en: string): BilingualText => ({ ko, en });

const cell = (
  status: DrawingSupportStatus,
  koLabel: string,
  enLabel: string,
  koDetail: string,
  enDetail: string,
): DrawingToolCell => ({
  status,
  label: t(koLabel, enLabel),
  detail: t(koDetail, enDetail),
});

export const DRAWING_CATEGORIES_WORKFLOW: readonly DrawingComparisonCategory[] = [
  {
    id: "lineart-vector-fill",
    number: 4,
    shortLabel: t("④ 선화·벡터·채색", "4. Lineart & Fill"),
    title: t("선화 · 벡터 · 채색 자동화", "Lineart, Vector Ink & Auto-Coloring"),
    summary: t(
      "벡터 교차점 지우개, 틈 닫기 채우기·ColorDrop, Watershed 자동 밑색, 3D→벡터 가변 선화(HLR), PBD 천 주름 물리 비교",
      "Comparing vector intersection erasers, gap-closing fill/ColorDrop, Watershed auto-flatting, 3D-to-vector HLR lines and PBD cloth wrinkles",
    ),
    criteria: [
      {
        id: "vector-intersection-eraser",
        categoryId: "lineart-vector-fill",
        title: t("벡터 교차점 지우개 & 가변 선폭 사후 보정", "Vector Intersection Eraser & Variable Width Editing"),
        summary: t(
          "삐져나온 머리카락·교차 선분을 터치 한 번에 교차점까지 깔끔히 지우고 선 두께를 사후 수정",
          "Trimming overhanging ink strokes cleanly at intersections and adjusting stroke width after drawing",
        ),
        cells: {
          toonstudio: cell("supported", "교차 지우개 + 선폭 툴", "Intersect erase + width", "벡터 세그먼트 교차점 분할 지우개·제어점·가변 선폭 편집", "Segment intersection eraser, control points & variable-width tool"),
          csp: cell("supported", "웹툰 벡터 선화 표준", "Manga vector gold", "교차점까지 지우기·선폭 수정·단순화·벡터 자석 업계 최강", "Industry benchmark for intersection erase, width edit & vector magnet"),
          krita: cell("partial", "SVG 도형 벡터 위주", "SVG shape vectors", "벡터 레이어는 있으나 필압 기반 만화 교차 지우개는 제한", "SVG vector layers, lacks CSP-style pressure-ink intersection erase"),
          magma: cell("unsupported", "래스터 전용", "Raster only", "벡터 선화 레이어 및 교차 지우개 미지원", "No vector ink layers or intersection eraser"),
          procreate: cell("unsupported", "래스터 전용", "Raster only", "벡터 선화 레이어 미지원", "No vector layers"),
          rebelle7: cell("unsupported", "래스터 전용", "Raster only", "물리 픽셀 회화 캔버스 전용", "Physical raster canvas only"),
          photoshop: cell("partial", "도형 펜 패스 위주", "Shape pen paths", "UI·도형 패스 편집은 강하나 필압 만화 선화 교차 지우개 없음", "Shape pen paths, not pressure-sensitive manga ink"),
          "ibis-medibang": cell("partial", "ibis 벡터 레이어", "ibis vector layer", "ibisPaint는 최근 벡터 레이어·제어점 추가(MediBang 미지원)", "ibisPaint added vector layer editing; MediBang is raster-only"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "벡터 선분 교차점 해석기, 교차점 지우개 적용기, 가변 선폭 도구를 브라우저 벡터 엔진에 구현했습니다.",
            "Implements vector segment intersection solving, erase-to-intersection actions and post-stroke variable width editing.",
          ),
          implementationDiff: t(
            "CSP가 10년 넘게 다듬은 만화 벡터 지우개의 손맛을 브라우저에서 재현하되, SVG 무손실 경로 내보내기까지 한 흐름으로 묶었습니다.",
            "Brings CSP-style intersection trimming to the browser while preserving lossless SVG vector export.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/drawing-pro/studio-vector-intersection-eraser.ts",
            "apps/web/src/domains/creator/studio-vector-erase-to-intersection.ts",
            "apps/web/src/domains/creator/vector/studio-variable-width-tool.ts",
          ],
        },
      },
      {
        id: "gap-closing-fill-colordrop",
        categoryId: "lineart-vector-fill",
        title: t("틈 닫기 채우기 · 참조 레이어 · ColorDrop & QuickShape", "Gap-Closing Fill, Reference Layer, ColorDrop & QuickShape"),
        summary: t(
          "열린 선화 틈새 자동 닫기, 선화 참조 밑색 채우기, 드래그 임계값 ColorDrop과 도형 자동 보정",
          "Closing open lineart gaps, filling against reference layers, drag-threshold ColorDrop and QuickShape snapping",
        ),
        cells: {
          toonstudio: cell("supported", "틈 닫기 + ColorDrop", "Gap-close + ColorDrop", "틈 닫기 채우기·드래그 허용치 ColorDrop·QuickShape 모두 내장", "Gap-closing fill, drag-threshold ColorDrop & QuickShape built-in"),
          csp: cell("supported", "틈 닫기·에워싸고 칠하기", "Gap-close & Enclose", "참조 레이어·틈 닫기·에워싸고 칠하기·영역 확대/축소 최강", "Reference layer, gap closing & Enclose-and-Fill benchmark"),
          krita: cell("supported", "참조 + 에워싸기 채우기", "Ref + Enclose Fill", "Gap closing·Enclose and Fill·Color Labels 참조 채우기 우수", "Strong gap closing, Enclose-and-Fill & color-label reference"),
          magma: cell("partial", "기본 페인트통 + 확장", "Bucket + expand", "기본 허용치·픽셀 확장 채우기 지원(ColorDrop/QuickShape 제한)", "Basic tolerance & pixel expand fill"),
          procreate: cell("supported", "ColorDrop·QuickShape 원조", "ColorDrop/QuickShape", "드래그 허용치 ColorDrop·QuickShape·참조 레이어 매우 직관적", "Creator of ColorDrop drag threshold & QuickShape gestures"),
          rebelle7: cell("partial", "기본 채우기 툴", "Basic fill tool", "회화 중심이라 만화식 틈 닫기·에워싸기 채우기 기능은 약함", "Basic bucket fill; not tailored for comic flatting"),
          photoshop: cell("partial", "페인트통·선택 확장", "Bucket + Expand", "만화용 틈 닫기·에워싸고 칠하기는 수동 선택·액션 의존", "Lacks native manga gap-closing or enclose-and-fill"),
          "ibis-medibang": cell("supported", "틈 닫기·확장 채우기", "Gap-close & expand", "두 앱 모두 웹툰 밑색용 틈 닫기·참조 레이어 채우기 우수", "Both offer strong gap closing and reference-layer fills"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "CSP식 틈 닫기 채우기(모폴로지/브리지 폐쇄)와 Procreate식 ColorDrop 드래그 허용치·QuickShape 피팅을 함께 구현했습니다.",
            "Combines CSP-style gap-closing fill with Procreate-style drag-threshold ColorDrop and QuickShape geometric fitters.",
          ),
          implementationDiff: t(
            "CSP는 틈 닫기·에워싸기 채우기, Procreate는 ColorDrop 제스처에 각각 특화되어 있으나, ToonStudio는 두 작업 습관을 한 캔버스에서 모두 지원합니다.",
            "CSP excels at gap-closing flatting while Procreate shines at ColorDrop gestures; ToonStudio unifies both habits on one canvas.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/drawing-pro/studio-gap-closing-fill-and-dual-brush.ts",
            "apps/web/src/domains/creator/drawing-pro/studio-quickshape-and-colordrop.ts",
            "apps/web/src/domains/creator/drawing-pro/studio-colordrop-tolerance.ts",
          ],
        },
      },
      {
        id: "watershed-auto-colorize",
        categoryId: "lineart-vector-fill",
        title: t("Watershed 선화 자동 밑색 (Colorize Mask 방식)", "Watershed Auto-Flatting (Colorize Mask Style)"),
        summary: t(
          "선화 위에 색상 스트로크 몇 줄만 그으면 영역 경계를 자동 분할해 밑색을 일괄 생성(로컬 수학 알고리즘)",
          "Auto-filling entire lineart sheets from a few color scribbles via deterministic local Watershed segmentation",
        ),
        cells: {
          toonstudio: cell("supported", "로컬 Watershed 호스트", "Local Watershed", "AI 서버 없이 결정적 Watershed 선화 자동 밑색·영역 분리", "Deterministic local Watershed lineart colorizer, zero cloud AI"),
          csp: cell("partial", "클라우드 자동 채색(AI)", "Cloud AI Colorize", "서버 전송 기반 자동 채색 제공(로컬 결정적 Colorize Mask 아님)", "Cloud AI colorize hint; not a deterministic local Colorize Mask"),
          krita: cell("supported", "Colorize Mask 원조", "Colorize Mask leader", "로컬 비파괴 Colorize Mask + G'MIC Colorize [Interactive] 최강", "Industry pioneer of non-destructive local Colorize Mask"),
          magma: cell("unsupported", "미지원", "Not supported", "선화 힌트 자동 밑색 미지원", "No scribble-based auto-flatting"),
          procreate: cell("unsupported", "미지원", "Not supported", "ColorDrop 수동 영역별 채우기 방식", "Manual per-region ColorDrop only"),
          rebelle7: cell("unsupported", "미지원", "Not supported", "선화 밑색 자동화 도구 없음", "No lineart flatting automation"),
          photoshop: cell("plugin", "외부 플러그인(BPelt 등)", "Plugins (BPelt etc.)", "기본 내장 없음, 코믹 플래팅은 외부 플러그인 의존", "Requires third-party flatting plugins like BPelt"),
          "ibis-medibang": cell("partial", "ibis AI 자동 채색", "ibis AI Colorize", "ibisPaint는 서버 AI 채색 제공(결정적 밑색 마스크 아님)", "ibisPaint offers cloud AI coloring rather than flatting mask"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "선화 에지 가중치와 우선순위 큐 기반 Watershed 영역 분할 엔진을 클린룸 구현해, 틈이 있는 선화도 로컬 ₩0으로 밑색 분리합니다.",
            "Clean-room edge-weighted priority-queue Watershed segmentation flats open lineart deterministically offline at KRW 0.",
          ),
          implementationDiff: t(
            "Krita의 Colorize Mask가 검증한 결정적 밑색 UX를 브라우저에서 재현해, 클라우드 AI 자동 채색과 달리 색 경계가 깔끔하고 수정 예측성이 높습니다.",
            "Brings Krita's proven deterministic flatting workflow to the browser with crisp flat regions instead of painterly AI guesses.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/imaging-pro/studio-watershed-lineart-colorizer.ts",
            "apps/web/src/domains/creator/fill/studio-colorize-mask-host.ts",
          ],
        },
      },
      {
        id: "hlr-3d-to-vector-lineart",
        categoryId: "lineart-vector-fill",
        title: t("3D 모델 → 가변 선폭 벡터 선화 추출 (HLR)", "3D Model → Variable-Width Vector Lineart (HLR)"),
        summary: t(
          "3D 배경·소품에서 은선 제거(HLR)와 거리·각도 기반 가변 선폭을 계산해 2D 벡터 선화로 바로 추출",
          "Hidden-line removal (HLR) and distance/angle variable-width stroke extraction from 3D sets directly to 2D vector lines",
        ),
        cells: {
          toonstudio: cell("supported", "3D→벡터 HLR + 광원 동기화", "3D→Vector HLR + sync", "실루엣·주름·은선 제거 벡터 추출 + 2D 캐릭터 광원 동기화", "Silhouette/crease HLR vector extraction + 2D light sync"),
          csp: cell("supported", "EX LT 변환 표준", "EX LT conversion", "EX 판본 3D→래스터/벡터 선화+톤 추출 웹툰 현역 표준", "EX edition LT line + tone extraction is the webtoon standard"),
          krita: cell("unsupported", "3D 씬 미내장", "No 3D scene", "2D 전용(Blender Grease Pencil 외부 연동 필요)", "2D only; relies on Blender externally"),
          magma: cell("unsupported", "3D 씬 미내장", "No 3D scene", "3D 모델 선화 추출 미지원", "No 3D scene or HLR extraction"),
          procreate: cell("unsupported", "3D 텍스처만", "3D texture only", "3D 씬 카메라 배치 및 선화 추출 불가", "No 3D stage or lineart extraction"),
          rebelle7: cell("unsupported", "2D 회화 전용", "2D only", "3D 선화 추출 미지원", "No 3D support"),
          photoshop: cell("unsupported", "3D 축소", "3D deprecated", "3D 선화 추출 워크플로 미제공", "No 3D-to-vector lineart workflow"),
          "ibis-medibang": cell("partial", "간이 에지 추출 필터", "Edge-detect filter", "이미지 윤곽선 추출 필터 수준(3D 씬 HLR 아님)", "2D edge-detect filter only, not 3D HLR"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "3D 메시 실루엣·크리스 에지 가시성 판별(HLR)과 카메라 거리 기반 가변 선폭 벡터 변환기를 브라우저 3D 스테이지에 연결했습니다.",
            "Computes silhouette/crease HLR visibility and camera-distance variable-width vector paths inside the browser 3D stage.",
          ),
          implementationDiff: t(
            "CSP EX는 유료 상위 에디션(EX) 전용으로 LT 변환을 제공하며, ToonStudio는 GLB/VRM/.skp 로컬 임포트부터 HLR 벡터 선화·2D 광원 동기화까지 베타 ₩0으로 연결합니다.",
            "CSP restricts LT conversion to its higher-priced EX edition; ToonStudio couples local GLB/VRM/.skp import with HLR vector lines and 2D light sync at KRW 0 in beta.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/scene3d-pro/studio-3d-vector-lineart-hlr.ts",
            "apps/web/src/domains/creator/bg3d/studio-bg3d-2d-character-light-sync.ts",
          ],
        },
      },
      {
        id: "pbd-cloth-wrinkle-sim",
        categoryId: "lineart-vector-fill",
        title: t("PBD/XPBD 천 주름 · 의상 드레이프 시뮬레이션", "PBD/XPBD Cloth Wrinkle & Garment Drape Simulation"),
        summary: t(
          "캐릭터 포즈·바람에 따라 치마·망토·의상 주름을 실시간 물리로 계산해 작화 참고·선화로 활용",
          "Simulating garment folds and drapery under pose and wind via PBD/XPBD physics for drawing reference",
        ),
        cells: {
          toonstudio: cell("supported", "PBD/XPBD + WGSL", "PBD/XPBD + WGSL", "브라우저 내 XPBD 의상 주름·드레이프 솔버 및 VRM 연동", "In-browser XPBD cloth drape solver integrated with VRM poses"),
          csp: cell("unsupported", "정적 3D 소품만", "Static 3D props", "실시간 천 물리 시뮬레이션 미내장(외부 Marvelous/Blender 의존)", "No live cloth physics; requires external 3D sims"),
          krita: cell("unsupported", "2D 전용", "2D only", "천 물리 시뮬레이션 미지원", "No cloth physics"),
          magma: cell("unsupported", "2D 전용", "2D only", "천 물리 시뮬레이션 미지원", "No cloth physics"),
          procreate: cell("unsupported", "2D 전용", "2D only", "천 물리 시뮬레이션 미지원", "No cloth physics"),
          rebelle7: cell("unsupported", "2D 전용", "2D only", "천 물리 시뮬레이션 미지원", "No cloth physics"),
          photoshop: cell("unsupported", "2D 전용", "2D only", "천 물리 시뮬레이션 미지원", "No cloth physics"),
          "ibis-medibang": cell("unsupported", "2D 전용", "2D only", "천 물리 시뮬레이션 미지원", "No cloth physics"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "XPBD 거리·굽힘 제약과 충돌 구 솔버(CPU + WGSL)를 VRM 포즈·배경 3D 스테이지에 연결해 주름 참고를 즉시 만듭니다.",
            "Couples CPU/WGSL XPBD distance/bending constraints with VRM pose rigs to generate realistic drapery folds on demand.",
          ),
          implementationDiff: t(
            "전용 의상 DCC(Marvelous Designer/Blender)의 초정밀 패턴 재봉을 대체하려는 것이 아니라, 웹툰 작화 중 난도 높은 망토·스커트 주름 참고를 앱 전환 없이 캔버스 옆에서 얻는 데 집중합니다.",
            "Rather than replacing dedicated tailoring DCCs like Marvelous Designer, ToonStudio puts fast fold reference directly beside the 2D canvas without switching apps.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/scene3d-pro/studio-pbd-cloth-drape-solver.ts",
            "apps/web/src/domains/creator/scene3d-pro/studio-pbd-cloth-drape-wgsl.ts",
            "apps/web/src/domains/creator/studio-cloth-xpbd-kernel-v2.ts",
          ],
        },
      },
    ],
  },
  {
    id: "manga-webtoon-tools",
    number: 5,
    shortLabel: t("⑤ 만화·웹툰 특화", "5. Manga & Webtoon"),
    title: t("만화 · 웹툰 특화 드로잉 도구", "Manga & Webtoon Production Tools"),
    summary: t(
      "1/2/3/5점 어안 투시자·대칭자, 절차적 집중선/효과선, GPU 스크린톤 & JFA 외곽선, Knuth-Plass 말풍선·세로쓰기·루비, 턴어라운드·손 스탬프 비교",
      "Comparing 1/2/3/5-point fisheye/symmetry rulers, procedural speed lines, GPU screentone & JFA outlines, Knuth-Plass balloon lettering and turnaround/hand stamps",
    ),
    criteria: [
      {
        id: "perspective-fisheye-symmetry-rulers",
        categoryId: "manga-webtoon-tools",
        title: t("1/2/3/5점 어안 투시자 · 대칭자 · 3D 카메라 연동", "1/2/3/5-Point Fisheye Perspective, Symmetry & 3D Camera Bridge"),
        summary: t(
          "소실점 스냅, 광각 5점 어안 곡선 투시, 다축 대칭자, 3D 배경 카메라 소실점 자동 연동",
          "Vanishing-point snapping, 5-point fisheye curves, multi-axis symmetry and automatic 3D camera perspective sync",
        ),
        cells: {
          toonstudio: cell("supported", "1~5점 어안 + 3D 연동", "1–5pt fisheye + 3D", "5점 어안 수학 스냅·다축 대칭자·3D 카메라 투시 브리지", "5-point fisheye snap, multi-axis symmetry & 3D camera bridge"),
          csp: cell("supported", "만화 투시자 표준", "Manga ruler benchmark", "v2+ 어안 투시자·대칭자·3D 레이어 투시자 자동 생성 최강", "v2+ fisheye perspective, symmetry & 3D-linked rulers"),
          krita: cell("supported", "Assistant 도구 풍부", "Rich Assistants", "소실점·어안(Fisheye Point)·동심원·다축 대칭 스냅 강력", "Vanishing point, Fisheye Point, concentric & multibrush symmetry"),
          magma: cell("partial", "기본 대칭·직선 자", "Basic symmetry/line", "단순 미러·직선 보조 수준(어안 투시자 미지원)", "Simple symmetry & line guides; no fisheye perspective"),
          procreate: cell("supported", "Drawing Guide 스냅", "Drawing Guide snap", "1/2/3점 투시·등각·대칭 스냅 직관적(5점 어안 미지원)", "Intuitive 1/2/3pt, isometric & symmetry (no 5pt fisheye)"),
          rebelle7: cell("supported", "투시·대칭 자 지원", "Perspective/Symmetry", "1/2/3점 투시·직선·대칭 자 지원(어안·3D 연동 없음)", "1/2/3pt perspective & symmetry; no fisheye/3D bridge"),
          photoshop: cell("partial", "대칭 + 소실점 필터", "Symmetry + VP filter", "다축 대칭 브러시 지원, 실시간 드로잉 투시 스냅 자는 약함", "Great symmetry; lacks native live perspective snap rulers"),
          "ibis-medibang": cell("supported", "투시·방사·대칭 자", "Perspective/Radial", "만화용 소실점·집중선·대칭 자 완비(어안은 제한적)", "Strong comic perspective, radial & symmetry rulers"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "1/2/3점 직선 투시, 5점 어안 곡률 투시 수학 모델, 다축 대칭/분할 자, 3D 카메라 소실점 자동 투영 브리지를 구현했습니다.",
            "Implements 1/2/3-point and 5-point fisheye curve snapping, multi-axis symmetry rulers and a 3D camera vanishing-point bridge.",
          ),
          implementationDiff: t(
            "CSP·Krita와 대등한 5점 어안 투시 스냅을 브라우저에서 제공하며, 같은 탭의 3D 배경 카메라를 움직이면 2D 투시자 소실점이 즉시 갱신됩니다.",
            "Matches CSP and Krita's 5-point fisheye snapping while automatically syncing vanishing points from the live in-tab 3D stage camera.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/rulers-pro/studio-perspective-fisheye-math.ts",
            "apps/web/src/domains/creator/rulers-pro/studio-perspective-symmetry-ruler-snap.ts",
            "apps/web/src/domains/creator/rulers-pro/studio-symmetry-division-rulers.ts",
            "apps/web/src/domains/creator/ruler/studio-3d-camera-perspective-bridge.ts",
          ],
        },
      },
      {
        id: "procedural-focus-speed-lines",
        categoryId: "manga-webtoon-tools",
        title: t("절차적 집중선 · 속도선 · 만화 효과선", "Procedural Focus Lines, Speed Lines & Manga Effects"),
        summary: t(
          "밀도·간격·불규칙성·끝 가늘어짐을 슬라이더로 실시간 조절하는 비파괴 집중선/유선 생성",
          "Parametric non-destructive radial focus lines and parallel speed lines with jitter and taper controls",
        ),
        cells: {
          toonstudio: cell("supported", "절차적 효과선 패널", "Procedural lines panel", "집중선·속도선·곡선 유선 시드/밀도/테이퍼 실시간 조절", "Seedable focus, speed & curved effect lines with live taper"),
          csp: cell("supported", "집중선·유선 레이어", "Focus/Stream layers", "만화 전용 비파괴 집중선·유선 레이어와 프리셋 최강", "Industry-standard editable focus & stream line layers"),
          krita: cell("partial", "Assistant 수동 드로잉", "Manual via Assistant", "방사형 Assistant로 직접 긋기 가능, 절차적 자동 생성기 없음", "Radial assistants for manual drawing; no procedural generator"),
          magma: cell("unsupported", "수동 브러시", "Manual only", "절차적 집중선 생성기 없음", "No procedural focus-line generator"),
          procreate: cell("unsupported", "스탬프 브러시 의존", "Stamp brushes only", "절차적 효과선 레이어 미내장", "Relies on static stamp brushes"),
          rebelle7: cell("unsupported", "미지원", "Not supported", "만화 효과선 생성기 없음", "No manga effect-line tool"),
          photoshop: cell("plugin", "외부 액션/브러시", "Actions / brushes", "기본 집중선 생성기 없음, 액션·스탬프 의존", "No built-in manga focus lines; uses actions or stamps"),
          "ibis-medibang": cell("supported", "집중선·속도선 내장", "Built-in focus lines", "MediBang/ibisPaint 모두 만화용 집중선·방사선 도구 제공", "Both include comic focus-line generators and rulers"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "결정적 시드 기반 집중선·속도선·방사선 기하 생성기와 전용 만화 자·효과선 UI 패널을 구현했습니다.",
            "Provides deterministic seed-based radial focus and parallel speed line geometry generators inside the manga rulers panel.",
          ),
          implementationDiff: t(
            "스탬프 이미지 확대 시 깨지는 문제 없이 컷 크기와 중심점에 맞춰 벡터/고해상도 효과선을 즉시 재생성합니다.",
            "Regenerates crisp procedural geometry for any panel ratio instead of stretching raster stamp brushes.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/rulers-pro/studio-procedural-effect-lines.ts",
            "apps/web/src/domains/creator/brush/studio-manga-focus-lines.ts",
            "apps/web/src/domains/creator/rulers-pro/StudioMangaRulersEffectLinesPanel.tsx",
          ],
        },
      },
      {
        id: "gpu-screentone-jfa-outline",
        categoryId: "manga-webtoon-tools",
        title: t("GPU 스크린톤 & JFA 유클리드 외곽선", "GPU Compute Screentone & JFA Euclidean Outline"),
        summary: t(
          "모아레 억제 도트/선/다이아몬드 톤과 O(log R) Jump-Flooding 거리장 기반 깔끔한 굵은 테두리",
          "Moire-suppressed halftone patterns plus O(log R) Jump-Flooding Euclidean outlines without blocky corners",
        ),
        cells: {
          toonstudio: cell("supported", "WGSL 톤 + JFA 외곽선", "WGSL tone + JFA", "4패턴 컴퓨트 스크린톤·톤 깎기 + JFA 임의 두께 외곽선", "4-pattern compute screentone, scrape brush & JFA outlines"),
          csp: cell("supported", "톤 레이어·경계 효과", "Tone & Border effect", "비파괴 톤 선 수·노이즈·레이어 경계 효과 업계 표준", "Reference non-destructive tone layers and border FX"),
          krita: cell("supported", "Halftone 필터 + 스타일", "Halftone + Layer FX", "비파괴 Halftone 필터 레이어·외곽선 레이어 스타일 지원", "Non-destructive halftone filter layers & stroke styles"),
          magma: cell("unsupported", "미지원", "Not supported", "실시간 스크린톤·JFA 외곽선 미지원", "No live screentone or JFA outline"),
          procreate: cell("partial", "하프톤 필터 (파괴적)", "Destructive Halftone", "하프톤 필터는 파괴적, 레이어 실시간 외곽선 효과 부재", "Destructive halftone filter; no live layer border effect"),
          rebelle7: cell("unsupported", "미지원", "Not supported", "만화 스크린톤·외곽선 효과 미지원", "No manga screentone or outline effect"),
          photoshop: cell("supported", "하프톤 + Stroke FX", "Halftone + Stroke FX", "컬러 하프톤·패턴·레이어 Stroke 스타일 정밀 지원", "Precise halftone patterns and non-destructive Stroke FX"),
          "ibis-medibang": cell("supported", "톤·외곽선 필터", "Tones & border FX", "웹툰·만화용 톤 소재와 테두리 필터 내장", "Built-in manga tones and stroke/border filters"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "원형·다이아몬드·선형·교차 4패턴 컴퓨트 스크린톤과 Jump-Flooding Algorithm(JFA) 거리장 외곽선 WGSL/CPU 렌더러를 통합했습니다.",
            "Integrates 4-pattern compute screentones and O(log R) Jump-Flooding Algorithm (JFA) Euclidean outlines on WGSL and CPU.",
          ),
          implementationDiff: t(
            "일반 2D 컨볼루션 외곽선은 두께가 커질수록 연산량이 O(R²)로 폭증하지만, JFA 거리장은 굵은 효과음·말풍선 테두리도 O(log R) 단계로 매끄럽게 그립니다.",
            "Standard kernel outlines scale at O(R²); JFA computes thick smooth outlines for SFX and stickers in O(log R) passes.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-predict-and-screentone.ts",
            "apps/web/src/domains/creator/render/gpu-next/gpu-next-wgsl-shaders.ts",
            "apps/web/src/domains/creator/screentone/screentone-render.ts",
          ],
        },
      },
      {
        id: "balloon-typeset-knuth-plass-tategaki",
        categoryId: "manga-webtoon-tools",
        title: t("말풍선 자동 조판 (Knuth-Plass · 세로쓰기 · 루비 · 효과음)", "Balloon Typesetting (Knuth-Plass, Vertical, Ruby & SFX)"),
        summary: t(
          "타원 말풍선 곡률 맞춤 자동 줄나눔(어절 보호), 일본 수출용 세로쓰기·루비 충돌 회피, SFX 타이포",
          "Curvature-aware elliptical line breaking with Korean keep-all, vertical text, ruby collision avoidance and SFX typo",
        ),
        cells: {
          toonstudio: cell("supported", "2D DP + 세로쓰기 + 루비", "2D DP + Tategaki/Ruby", "타원 Knuth-Plass DP·한국어 어절 보호·PAVA 루비·SFX 프리셋", "Elliptical Knuth-Plass DP, Korean keep-all, PAVA ruby & SFX"),
          csp: cell("supported", "만화 식자·스토리 에디터", "Story Editor & Ruby", "말풍선·세로쓰기·루비·EX 일괄 텍스트 성숙(타원 DP 줄바꿈은 수동)", "Mature balloons, vertical/ruby & EX batch text (manual breaks)"),
          krita: cell("partial", "SVG 기본 텍스트", "Basic SVG text", "기본 텍스트 도구 개선 중이나 만화 말풍선 자동 조판·루비 약함", "Improving SVG text, lacks manga balloon DP and ruby"),
          magma: cell("partial", "단순 텍스트 박스", "Simple text box", "기본 캡션 입력 수준, 말풍선 조판 엔진 없음", "Basic text labels without comic lettering engine"),
          procreate: cell("partial", "단순 텍스트 레이어", "Basic text layer", "말풍선 곡률 줄바꿈·세로쓰기·루비 미지원", "No elliptical balloon fit, vertical CJK or ruby"),
          rebelle7: cell("unsupported", "텍스트 조판 미지원", "No text engine", "회화 전용", "Painting-focused, no text engine"),
          photoshop: cell("supported", "CJK 타이포 강력", "Strong CJK type", "세로쓰기·루비·커닝 최강(타원 말풍선은 패스·엔터 수작업)", "Strong CJK vertical/ruby; elliptical balloons need manual paths"),
          "ibis-medibang": cell("partial", "말풍선·세로쓰기 지원", "Balloons & vertical", "MediBang 말풍선·세로쓰기·클라우드 폰트 우수(타원 DP 없음)", "MediBang has balloons, vertical text & cloud fonts (no DP wrap)"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "타원 현(chord) 기반 2D Knuth-Plass DP 조판기, 단독 조사 분리 방지, 우→좌 세로쓰기·세로중가로·PAVA 루비 비겹침 엔진과 SFX 타이포 스탬프를 구현했습니다.",
            "Implements elliptical-chord 2D Knuth-Plass DP typesetting, Korean bound-particle guards, RTL tategaki with PAVA ruby and SFX typography.",
          ),
          implementationDiff: t(
            "CSP EX의 일괄 스토리 에디터와 Photoshop의 인쇄 타이포 성숙도를 인정하되, ToonStudio는 웹툰 식자에서 가장 반복적인 타원 말풍선 줄나눔과 한국어 어절 깨짐을 알고리즘으로 자동화했습니다.",
            "While CSP EX excels at batch story editing and Photoshop at print type, ToonStudio automates repetitive elliptical balloon wrapping and Korean word-break protection.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/typesetting-pro/studio-knuth-plass-balloon-typeset.ts",
            "apps/web/src/domains/creator/typesetting-pro/studio-tategaki-ruby-layout.ts",
            "apps/web/src/domains/creator/sfx-typo-pro/sfx-typo-engine.ts",
          ],
        },
      },
      {
        id: "turnaround-hand-stamps",
        categoryId: "manga-webtoon-tools",
        title: t("캐릭터 턴어라운드 시트 & 손 포즈 레퍼런스 스탬프", "Character Turnaround Sheets & Hand-Pose Stamps"),
        summary: t(
          "정면·반측·측면·후면 비례선 가이드 시트와 자주 그리는 손 각도 스탬프를 캔버스에 즉시 배치",
          "Dropping front/3-quarter/side/back turnaround proportion sheets and curated hand-pose reference stamps directly on canvas",
        ),
        cells: {
          toonstudio: cell("supported", "시트·손 스탬프 내장", "Sheets & hand stamps", "SVG 턴어라운드 비례선 생성기 + 손 포즈 스탬프 카탈로그 + VRM 포즈", "SVG turnaround sheet builder, hand-pose stamps & VRM poser"),
          csp: cell("supported", "3D 데생인형·손 스캐너", "3D Dolls & Hand Scan", "웹캠 손 포즈 스캐너·3D 포즈 소재 매우 강력", "Webcam hand pose scanner & huge 3D pose library"),
          krita: cell("partial", "레퍼런스 이미지 도커", "Reference Images tool", "외부 참고 이미지 배치 가능, 내장 턴어라운드·손 스탬프 없음", "Places external reference images; no built-in hand/sheet stamps"),
          magma: cell("partial", "레퍼런스 창", "Reference window", "이미지 참고 창 제공, 전용 손/턴어라운드 생성기 없음", "Floating reference window; no built-in turnaround/hand library"),
          procreate: cell("plugin", "외부 스탬프 브러시", "External stamp packs", "외부 턴어라운드/손 브러시 팩 구매해 사용", "Relies on external stamp brush packs"),
          rebelle7: cell("partial", "레퍼런스 이미지 창", "Reference image panel", "참고 이미지 보기만 지원", "Reference image viewer only"),
          photoshop: cell("plugin", "외부 템플릿·브러시", "External templates", "기본 내장 없음, PSD 템플릿·스탬프 의존", "Requires external PSD templates or brush stamps"),
          "ibis-medibang": cell("partial", "기본 포즈 소재 일부", "Basic pose materials", "클라우드 참고 소재 일부 제공(턴어라운드 자동 생성 없음)", "Some cloud reference stamps; no turnaround generator"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "비율선·시점별 턴어라운드 SVG 시트 생성기와 자주 쓰이는 손 포즈 스탬프 위젯을 캔버스 옆에 상시 배치했습니다.",
            "Ships an SVG turnaround proportion-sheet generator and curated hand-pose stamp widget right beside the canvas.",
          ),
          implementationDiff: t(
            "CSP의 웹캠 기반 3D 손 스캐너가 실시간 포즈 캡처에 강하고, ToonStudio는 설치·카메라 없이 즉시 찍어 쓰는 경량 SVG 턴어라운드·손 스탬프와 3D VRM 포즈를 병행합니다.",
            "CSP leads in webcam 3D hand capture; ToonStudio pairs instant camera-free SVG turnaround/hand stamps with browser VRM posing.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/reference-stamps/turnaround-sheet-svg.ts",
            "apps/web/src/domains/creator/reference-stamps/hand-pose-stamps-catalog.ts",
            "apps/web/src/domains/creator/reference-stamps/StudioReferenceStampsWidget.tsx",
          ],
        },
      },
    ],
  },
  {
    id: "collab-browser",
    number: 6,
    shortLabel: t("⑥ 협업·브라우저 실행", "6. Collab & Browser"),
    title: t("실시간 협업 & 브라우저 실행성 (Magma 중심 비교)", "Real-Time Collaboration & Browser Execution (Magma Focus)"),
    summary: t(
      "무설치 브라우저 즉시 진입, 동시 드로잉·가상 스튜디오(Yjs CRDT), 분업 RBAC/컷 리스, 오프라인 OPFS/SQLite 내구성, Wasm64·WebGPU 메모리 보호 비교",
      "Comparing zero-install browser entry, live co-drawing & virtual studio (Yjs CRDT), division RBAC/cut leases, offline OPFS/SQLite durability and Wasm64/WebGPU memory guards",
    ),
    criteria: [
      {
        id: "zero-install-browser-entry",
        categoryId: "collab-browser",
        title: t("무설치 웹 브라우저 즉시 진입 (게스트 비차단)", "Zero-Install Browser Entry (Non-Blocking Guest Launch)"),
        summary: t(
          "앱 다운로드·OS 인증·결제 등록 없이 링크 클릭 3초 안에 캔버스를 열어 바로 드로잉 시작",
          "Opening a drawing canvas within seconds from a URL with no app download, device activation or paywall",
        ),
        cells: {
          toonstudio: cell("supported", "3초 무설치 게스트 진입", "3-sec guest launch", "로그인·설치 없이 브라우저에서 즉시 풀 스튜디오 진입", "Instant full studio in browser without install or forced login"),
          csp: cell("unsupported", "OS 설치 + 기기 인증", "Install + license", "설치 파일 다운로드 및 플랜별 기기 인증 필수", "Requires desktop/tablet install and device license activation"),
          krita: cell("unsupported", "데스크톱·안드로이드 설치", "Native install", "로컬 바이너리 설치 필수(웹 실행 미지원)", "Requires native app install; no browser runtime"),
          magma: cell("supported", "링크 즉시 브라우저 진입", "Instant web link", "초대 링크 클릭만으로 브라우저에서 바로 합작 시작 최상", "Best-in-class instant URL launch for browser co-drawing"),
          procreate: cell("unsupported", "iPad 앱 구매·설치", "iPad app install", "iPadOS 기기와 App Store 설치 필수", "Requires iPad hardware and App Store install"),
          rebelle7: cell("unsupported", "데스크톱 설치 필수", "Desktop install", "Windows/macOS 설치·라이선스 인증 필수", "Windows/macOS installation and license required"),
          photoshop: cell("partial", "Photoshop Web 축소판", "Limited Web edition", "데스크톱 CC 설치가 주력, 웹판은 유료 로그인·기능 제한", "Desktop CC is primary; Web edition requires subscription & is trimmed"),
          "ibis-medibang": cell("unsupported", "앱 설치 필수", "App install", "모바일/PC 앱 설치 필수(브라우저 풀 캔버스 없음)", "Requires native mobile/PC install"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "게스트 비차단 진입 원칙(`PRODUCT.md`)에 따라 첫 방문자가 회원가입이나 설치 없이 바로 캔버스·브러시·3D 스테이지를 시험할 수 있습니다.",
            "Follows PRODUCT.md non-blocking guest entry so newcomers start drawing immediately with zero signup or install.",
          ),
          implementationDiff: t(
            "Magma와 ToonStudio만이 8종 중 본격 무설치 브라우저 캔버스를 제공합니다. Magma는 즉석 멀티플레이어 잼 진입에, ToonStudio는 1인 게스트 로컬 저장과 프로덕션 워크스페이스 즉시 연결에 강합니다.",
            "Only Magma and ToonStudio deliver true zero-install browser canvases; Magma excels at instant jam rooms while ToonStudio combines instant guest local persistence with full production tools.",
          ),
          repoPaths: [
            "PRODUCT.md",
            "apps/web/src/domains/creator/ergonomics/studio-night-comfort-guard.ts",
          ],
        },
      },
      {
        id: "realtime-crdt-virtual-studio",
        categoryId: "collab-browser",
        title: t("동시 드로잉 · 레이어 소유권 · 가상 스튜디오 (Yjs CRDT)", "Live Co-Drawing, Layer Ownership & Virtual Studio (Yjs CRDT)"),
        summary: t(
          "여러 작가가 한 캔버스에서 커서·아바타·음성 허들과 함께 실시간으로 그리며 레이어 소유권을 조율",
          "Simultaneous multi-artist drawing with presence cursors, per-user visibility, layer ownership and virtual studio huddles",
        ),
        cells: {
          toonstudio: cell("partial", "Yjs CRDT + 가상 스튜디오", "Yjs CRDT + Virtual Space", "5단계 포인터·개인 가시성·레이어 인수·P2P 화상/가상 스튜디오(대규모 잼 부하 검증 중)", "5-mode presence, local visibility, layer ownership & virtual studio (large-jam load validation ongoing)"),
          csp: cell("unsupported", "비동기 팀워크 체크아웃", "Async file checkout", "EX 페이지 단위 체크아웃만 지원, 실시간 동시 드로잉 없음", "EX async page checkout only; no live simultaneous strokes"),
          krita: cell("unsupported", "단독 데스크톱", "Solo desktop", "공식 실시간 동시 드로잉 미내장", "No built-in real-time multi-user canvas"),
          magma: cell("supported", "30인+ 실시간 잼 최강", "30+ ArtJam leader", "최대 30인+(확장 시 더 많음) 동시 드로잉·레이어 소유·ArtJam 성숙도 1위", "Proven 30+ simultaneous artist rooms, layer ownership & ArtJam UX"),
          procreate: cell("unsupported", "단독 iPad 작업", "Solo iPad", "실시간 협업 미지원", "No real-time collaboration"),
          rebelle7: cell("unsupported", "단독 데스크톱", "Solo desktop", "실시간 협업 미지원", "No real-time collaboration"),
          photoshop: cell("partial", "초대 편집(1인 교대)", "Async invite-to-edit", "동시 스트로크 불가, 1명씩 순차 편집 및 웹 코멘트", "Turn-based single-editor lock plus web comments"),
          "ibis-medibang": cell("partial", "MediBang 클라우드 팀", "Cloud team folders", "MediBang 팀 클라우드 파일 공유만 지원(실시간 동시 드로잉 없음)", "MediBang cloud team folders only; no live co-drawing"),
        },
        evidence: {
          maturity: "partial",
          rationale: t(
            "Yjs CRDT 문서 동기화, Magma형 5단계 포인터·로컬 레이어 가시성·레이어 소유권 인수 모델, P2P 음성·화상 허들과 가상 스튜디오를 통합했습니다.",
            "Combines Yjs CRDT sync, 5-mode collaborator pointers, local layer visibility, layer ownership transfer and P2P virtual studio huddles.",
          ),
          implementationDiff: t(
            "Magma는 30인 이상이 한 캔버스에 몰리는 대규모 ArtJam 지연 최적화와 소셜 잼 경험에서 검증된 선두입니다. ToonStudio는 Yjs CRDT + Cloudflare Durable Objects로 오프라인 병합과 가상 스튜디오·웹툰 분업 연동까지 확장하되, 초대형 잼 부하는 베타 검증 중입니다.",
            "Magma leads in battle-tested 30+ artist ArtJam rooms; ToonStudio extends Yjs CRDT + Durable Objects with offline merge and virtual studio spaces while continuing large-room load validation.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/live/studio-crdt-document.ts",
            "apps/web/src/domains/creator/live/studio-magma-collaboration.ts",
            "apps/web/src/domains/creator/live/huddle/StudioP2pVirtualStudio.tsx",
            "apps/web/src/domains/creator/virtual-space/crdt/studio-virtual-space-yjs-doc.ts",
          ],
        },
      },
      {
        id: "division-os-cut-leases",
        categoryId: "collab-browser",
        title: t("웹툰 분업 권한 (역할 RBAC · 컷 분할 리스 · 외주 워터마크)", "Webtoon Division RBAC, Cut-Slice Leases & Outsource Watermarks"),
        summary: t(
          "선화·밑색·배경·식자 담당자별 쓰기 잠금, 필요한 컷만 격리 반출·자동 병합, 비가시 유출 추적 워터마크",
          "Role-scoped layer locks, isolated cut leases with auto-stitching and invisible forensic leak watermarks",
        ),
        cells: {
          toonstudio: cell("supported", "분업 OS 캔버스 직결", "Canvas-native Division OS", "역할 레이어 RBAC·컷 분할 리스·AD 레드라인·LSB 포렌식 워터마크", "Role layer RBAC, cut leases, AD redline QA & LSB watermark"),
          csp: cell("partial", "EX 팀워크 파일 공유", "EX Teamwork sync", "페이지 단위 파일 체크아웃 가능, 역할 RBAC·워터마크·일정 없음", "Page-level checkout only; no layer RBAC or forensic watermarks"),
          krita: cell("unsupported", "외부 Git/클라우드", "External VCS only", "내장 분업 권한·컷 리스 없음", "No built-in role permissions or cut leases"),
          magma: cell("partial", "방 관리자·레이어 소유", "Room admin & locks", "호스트 권한·레이어 소유권 지원(웹툰 컷 리스·외주 워터마크는 없음)", "Host controls & layer ownership, no webtoon cut leases or DRM"),
          procreate: cell("unsupported", "미지원", "Not supported", "개인 작업 전용", "Solo workflow only"),
          rebelle7: cell("unsupported", "미지원", "Not supported", "개인 작업 전용", "Solo workflow only"),
          photoshop: cell("partial", "CC 팀 라이브러리", "CC Team Libraries", "파일 접근 권한·코멘트 수준, 컷 분할 리스·포렌식 워터마크 없음", "Folder permissions and comments only"),
          "ibis-medibang": cell("partial", "MediBang 팀 폴더", "MediBang team folder", "팀원 파일 접근 공유 수준, 세밀한 레이어 RBAC 없음", "Basic team folder sharing without granular layer RBAC"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "드로잉 캔버스와 분업 OS(역할 레이어 시트·컷 분할 리스·AD 검수·LSB 워터마크)를 한 앱에서 연결해 메신저 파일 버전 꼬임을 줄였습니다.",
            "Binds layer seat RBAC, cut leases, AD redlines and LSB watermarks directly to the drawing studio to eliminate chat-file chaos.",
          ),
          implementationDiff: t(
            "Magma는 자유로운 실시간 합작에 최적화된 반면, ToonStudio는 주간 연재 어시스턴트·외주 분업에서 사고가 잦은 레이어 오수정·유출·병합 충돌을 구조적으로 막습니다.",
            "Magma optimizes for freeform co-drawing jams; ToonStudio adds structured serialization safeguards against accidental layer edits, leaks and merge collisions.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/production-hub/division-os/StudioDivisionOsHub.tsx",
            "apps/web/src/domains/creator/live/StudioLiveLayerSeatDivisionBench.tsx",
          ],
        },
      },
      {
        id: "offline-opfs-sqlite-durability",
        categoryId: "collab-browser",
        title: t("오프라인 작업 내구성 (OPFS / SQLite 로컬 권위)", "Offline Work Durability (OPFS / SQLite Local Authority)"),
        summary: t(
          "인터넷이 끊겨도 브라우저 로컬 파일시스템에 원고를 안전하게 저장하고 재접속 시 멱등 동기화",
          "Durable local persistence offline with idempotent conflict-aware sync upon reconnection",
        ),
        cells: {
          toonstudio: cell("supported", "SQLite WASM + OPFS", "SQLite WASM + OPFS", "로컬 우선 저장·자가 복구·멱등 동기화 큐(브라우저 저장소 백업 권장)", "Local-first SQLite OPFS, self-heal & idempotent sync queue"),
          csp: cell("supported", "네이티브 로컬 디스크", "Native OS disk", "OS 파일 시스템 직접 저장·자동 복구 안정성 최상", "Direct OS filesystem persistence & crash recovery"),
          krita: cell("supported", "네이티브 로컬 디스크", "Native OS disk", "로컬 .kra 자동저장·백업 완전 오프라인", "Fully offline native .kra autosave & backups"),
          magma: cell("unsupported", "온라인 서버 의존", "Online-dependent", "실시간 서버 연결 중심이라 오프라인 단독 원고 편집·저장에 취약", "Online session-centric; limited offline authoring durability"),
          procreate: cell("supported", "iPad 로컬 저장", "iPad local storage", "완전 오프라인 즉시 저장(외부 백업은 수동)", "Instant offline local save (manual external backup advised)"),
          rebelle7: cell("supported", "네이티브 로컬 디스크", "Native OS disk", "로컬 .reb 파일 완전 오프라인", "Fully offline native .reb files"),
          photoshop: cell("supported", "로컬 + CC 클라우드", "Local + CC Cloud", "로컬 PSD + 클라우드 문서 오프라인 캐시", "Local PSD plus Creative Cloud offline cache"),
          "ibis-medibang": cell("supported", "로컬 앱 저장 + 클라우드", "Local app + cloud", "기기 내 오프라인 작업 가능(클라우드 소재는 온라인 필요)", "Offline local drawing; cloud materials require network"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "SQLite WASM + Origin Private File System(OPFS)을 로컬 1차 권위로 두고, 오프라인 큐 멱등 병합기와 OPFS 자가 복구 패널을 구현했습니다.",
            "Uses SQLite WASM + OPFS as local-first authority with an idempotent offline queue merger and self-heal diagnostics.",
          ),
          implementationDiff: t(
            "기존 웹 드로잉 툴(Magma 등)은 네트워크 단절 시 작업이 멈추는 약점이 있었으나, ToonStudio는 로컬 DB 권위와 멱등 병합으로 웹에서도 오프라인 연속성을 확보합니다. 다만 브라우저 캐시 초기화 대비 원본 파일 백업 안내를 병행합니다.",
            "Unlike online-only web canvases such as Magma, ToonStudio persists locally in SQLite OPFS for offline continuity while prompting explicit file backups against browser storage clears.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts",
            "apps/web/src/domains/creator/storage/StudioOpfsSelfHealPanel.tsx",
            "apps/web/src/domains/creator/storage/studio-opfs-self-heal-engine.ts",
          ],
        },
      },
      {
        id: "wasm64-vram-memory-guard",
        categoryId: "collab-browser",
        title: t("대용량 로컬 3D/캔버스(Wasm64) & WebGPU 메모리 보호", "Large Local 3D/Canvas (Wasm64) & WebGPU Memory Guard"),
        summary: t(
          "브라우저 탭 OOM·GPU Device Lost를 예방하는 동적 메모리 거버너, GPU 버퍼 풀, LRU 타일 프레임 예산",
          "Preventing browser OOM and GPU Device Lost via dynamic memory governors, GPU buffer pools and LRU tile budgets",
        ),
        cells: {
          toonstudio: cell("supported", "Wasm64 + GPU 버퍼 풀", "Wasm64 + GPU pool", "로컬 GLB/VRM 최대 1 GiB · SKP 256 MiB · LRU 타일/VRAM 보호", "Up to 1 GiB GLB/VRM, 256 MiB SKP, GPU buffer pool & LRU tiles"),
          csp: cell("supported", "네이티브 64-bit RAM", "Native 64-bit RAM", "OS 메모리 한도·가상 메모리 페이징 직접 활용", "Direct 64-bit OS RAM and virtual memory paging"),
          krita: cell("supported", "네이티브 타일 스왑", "Native tile swap", "시스템 RAM + 디스크 타일 스왑으로 대용량 캔버스 안정", "System RAM plus disk tile swapper for huge canvases"),
          magma: cell("partial", "고정 해상도 상한", "Fixed canvas caps", "웹 탭 안정성을 위해 캔버스 해상도·레이어 수에 보수적 상한", "Conservative canvas size & layer caps for web stability"),
          procreate: cell("partial", "iPad RAM 기반 레이어 상한", "RAM layer caps", "기기 RAM·해상도에 따라 최대 레이어 수 엄격 제한", "Strict layer count caps tied to iPad RAM and resolution"),
          rebelle7: cell("supported", "네이티브 GPU/RAM", "Native GPU/RAM", "데스크톱 전용 GPU VRAM과 RAM 직접 활용", "Direct desktop GPU VRAM and RAM access"),
          photoshop: cell("supported", "스크래치 디스크·PSB", "Scratch disk & PSB", "수 GB 초대형 PSB와 고속 스크래치 디스크 업계 최강", "Industry-best multi-GB PSB and scratch-disk paging"),
          "ibis-medibang": cell("partial", "모바일 RAM 제약", "Mobile RAM limits", "모바일 기기 메모리 한도로 고해상도·다중 레이어 시 저하", "Mobile RAM limits constrain high-res multi-layer work"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "4단계 Wasm64 메모리 거버너, WebGPU 버퍼 풀/비동기 프리웜업, LRU 타일 프레임 예산 가드로 웹 환경의 OOM과 Device Lost를 선제 방어합니다.",
            "Combines a 4-tier Wasm64 memory governor, WebGPU buffer pool/warmup and LRU tile frame budgets to prevent tab OOM and Device Lost.",
          ),
          implementationDiff: t(
            "네이티브 앱의 스크래치 디스크(Photoshop·Krita) 수준의 무제한 메모리는 브라우저 샌드박스 구조상 불가하지만, 웹 드로잉 툴 중 드물게 1 GiB 로컬 3D와 타일 VRAM 거버너를 명시 제어합니다.",
            "Browser sandboxes cannot match Photoshop/Krita disk scratch space, yet ToonStudio provides explicit 1 GiB local 3D budgets and WebGPU tile VRAM guards rare in web tools.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/studio-wasm64-memory-governor.ts",
            "apps/web/src/domains/creator/render/gpu-next/gpu-buffer-pool-and-warmup.ts",
            "apps/web/src/domains/creator/render/gpu-next/gpu-frame-budget-and-lru-tiles.ts",
          ],
        },
      },
    ],
  },
  {
    id: "pricing-sovereignty",
    number: 7,
    shortLabel: t("⑦ 가격·OS·주권·권리", "7. Pricing & Rights"),
    title: t("가격 · OS · 데이터 주권 · 라이선스", "Pricing, OS Reach, Data Sovereignty & Rights"),
    summary: t(
      "₩0 브라우저 로컬 기준 비용, OS/기기 제약, 개인 원고 로컬 보관, AI 무단 학습 배제·Rights BOM, 상용 라이선스 투명성 비교",
      "Comparing KRW 0 local browser cost, OS lock-in, local manuscript ownership, AI training opt-out/Rights BOM and commercial license transparency",
    ),
    criteria: [
      {
        id: "browser-local-zero-cost",
        categoryId: "pricing-sovereignty",
        title: t("₩0 브라우저 로컬 기준 비용 & 과금 구조", "KRW 0 Browser Local Cost & Pricing Structure"),
        summary: t(
          "입문·1인 작가 기준 초기 도입 비용과 장기 연재 시 구독료 부담",
          "Upfront cost for solo/emerging creators and recurring subscription burden over long serializations",
        ),
        cells: {
          toonstudio: cell("supported", "베타 전 기능 ₩0", "KRW 0 in beta", "결제 모듈 비활성 · 로컬 실행으로 인프라 고정비 최소화(정식 플랜 사전 고지)", "Billing disabled in beta; local execution minimizes fixed cost"),
          csp: cell("partial", "구독 / PC 영구판", "Sub or PC perpetual", "PC 영구판 가능(버전 업 유료), 태블릿·멀티기기는 구독 필수", "PC perpetual available (paid upgrades); tablet/multi-device requires sub"),
          krita: cell("supported", "영구 ₩0 오픈소스", "Forever KRW 0 OSS", "완전 무료 GPL-3.0, 기능 잠금·구독 없음", "Completely free GPL-3.0 with zero feature paywalls"),
          magma: cell("partial", "무료 + Blaze/Pro 구독", "Freemium + Sub", "기본 협업 무료, 고급 브러시·대형 캔버스·관리 기능은 유료 구독", "Free tier for core rooms; advanced tools & scale require subscription"),
          procreate: cell("supported", "1회 앱 구매", "One-time purchase", "구독 없는 저가 1회 구매(단 iPad + Pencil 기기 비용 별도)", "Low one-time app fee (requires iPad + Apple Pencil hardware)"),
          rebelle7: cell("partial", "영구 라이선스(Pro 차등)", "Perpetual (Pro tier)", "안료·NanoPixel은 상위 Pro 에디션 및 버전 업그레이드 유료", "Pigments & NanoPixel require higher Pro tier and paid major upgrades"),
          photoshop: cell("unsupported", "지속 구독 필수", "Subscription only", "영구 라이선스 없음, Creative Cloud 월·연 구독 유지 필수", "No perpetual option; ongoing Creative Cloud subscription required"),
          "ibis-medibang": cell("partial", "무료(광고) + 구독", "Freemium + Sub", "무료 사용 시 광고·시간/기능 제한, Prime/Pro 구독으로 해제", "Free with ads/time limits; Prime/Pro subscriptions unlock full tools"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "핵심 드로잉·필터·3D·SQLite 저장을 사용자 브라우저 로컬에서 처리해 서버 GPU 비용을 ₩0으로 설계했고, 베타 기간 전 기능을 무료 개방합니다.",
            "Runs drawing, filters, 3D and SQLite storage locally in the user's browser for KRW 0 server GPU burn, keeping all beta tiers free.",
          ),
          implementationDiff: t(
            "Krita는 영구 무료 오픈소스 데스크톱으로 비용 장벽이 없고, ToonStudio는 무설치 웹+협업+3D+식자 통합 환경의 베타 ₩0 진입을 제공합니다(향후 유료화 시 사전 공지 원칙).",
            "Krita offers permanent free desktop OSS; ToonStudio provides zero-install browser integration free in beta with advance notice before any paid tiers.",
          ),
          repoPaths: [
            "apps/web/src/app/routes/pricing-page.tsx",
            "docs/operations/infrastructure-map.md",
          ],
        },
      },
      {
        id: "cross-os-device-coverage",
        categoryId: "pricing-sovereignty",
        title: t("OS · 기기 제약 (Win · Mac · Linux · iPad · Android · Chromebook)", "OS & Device Coverage (Win, Mac, Linux, iPad, Android, Chromebook)"),
        summary: t(
          "특정 OS나 태블릿 생태계에 묶이지 않고 학교·작업실·이동 중 여러 기기에서 이어서 작업",
          "Working seamlessly across home PCs, school Chromebooks, Linux laptops and tablets without OS lock-in",
        ),
        cells: {
          toonstudio: cell("supported", "전 OS 모던 브라우저", "All modern browsers", "Windows·macOS·Linux·iPad·Android·Chromebook 동일 주소 진입", "Runs on Windows, macOS, Linux, iPad, Android & Chromebook"),
          csp: cell("supported", "Win/Mac/iPad/Android", "Win/Mac/iPad/Android", "주요 4대 OS 지원(Linux 미지원 · 기기별 플랜 차등)", "Covers 4 major OSes (no Linux; plan limits per device)"),
          krita: cell("supported", "Win/Mac/Linux/Android", "Win/Mac/Linux/Android", "Linux 지원 최강(iPadOS 미지원)", "Best Linux support; no iPadOS version"),
          magma: cell("supported", "전 OS 모던 브라우저", "All modern browsers", "브라우저 기반이라 OS 제약 거의 없음", "Browser-based with broad cross-OS reach"),
          procreate: cell("unsupported", "iPadOS 전용", "iPadOS only", "Windows·macOS·Linux·Android 미지원", "Locked exclusively to iPadOS"),
          rebelle7: cell("partial", "Win · macOS 전용", "Win & macOS only", "태블릿·Linux·웹 미지원", "Desktop Windows & macOS only"),
          photoshop: cell("partial", "Win/Mac/iPad/웹 축소", "Win/Mac/iPad/Web", "Linux 미지원, iPad·웹판은 데스크톱 대비 기능 차이 큼", "No Linux; iPad & Web editions omit desktop features"),
          "ibis-medibang": cell("supported", "모바일·PC 광범위", "Mobile & PC wide", "iOS/Android/Win/Mac 지원(Linux 미지원 · OS별 기능 차이)", "Covers iOS/Android/Win/Mac (no Linux; feature parity varies)"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "표준 웹 플랫폼(WebGPU/Canvas2D/WASM/OPFS)과 44×44px 터치 규칙(`DESIGN.md`)으로 OS·기기 종속을 없앴습니다.",
            "Standard web APIs (WebGPU/Canvas2D/WASM/OPFS) and 44×44px touch contracts eliminate OS lock-in.",
          ),
          implementationDiff: t(
            "Procreate(iPad 전용)·Rebelle 7(Win/Mac 전용)·Krita(iPad 미지원)·CSP(Linux 미지원)와 달리, 웹 표준 기반으로 학교 Chromebook이나 Linux 노트북에서도 즉시 열립니다.",
            "Unlike Procreate (iPad-only), Rebelle 7 (Win/Mac), Krita (no iPad) or CSP (no Linux), ToonStudio opens anywhere a modern browser runs.",
          ),
          repoPaths: ["DESIGN.md", "PRODUCT.md"],
        },
      },
      {
        id: "local-data-sovereignty",
        categoryId: "pricing-sovereignty",
        title: t("개인 원고 데이터 로컬 보관 & 계정 종속 탈피", "Local-First Manuscript Ownership & Zero Vendor Lock-In"),
        summary: t(
          "원고를 클라우드 서버에만 가두지 않고 기기 내 저장 및 표준 포맷(PSD/PNG/SVG/ZIP) 반출 보장",
          "Keeping primary manuscripts on the creator's device with unrestricted export to standard PSD/PNG/SVG/ZIP formats",
        ),
        cells: {
          toonstudio: cell("supported", "기기 OPFS 권위 + 반출", "Device OPFS + export", "원본은 기기 SQLite OPFS 보관 · 서버 강제 업로드 없음 · PSD/ZIP 반출", "Device SQLite OPFS authority, no forced cloud upload, PSD/ZIP export"),
          csp: cell("supported", "로컬 .clip + PSD", "Local .clip + PSD", "로컬 파일 우선 소유 및 PSD/PNG 내보내기 자유", "Local-first .clip ownership plus PSD/PNG export"),
          krita: cell("supported", "오픈 .kra/.ora 로컬", "Open .kra/.ora local", "개방형 ZIP 기반 로컬 포맷으로 영구 데이터 주권 최상", "Open ZIP-based local formats ensure maximum data sovereignty"),
          magma: cell("partial", "클라우드 룸 중심", "Cloud-room primary", "서버 기반 룸 저장이 기본(PSD/PNG 수동 다운로드로 백업)", "Cloud-hosted rooms by default; manual PSD/PNG download"),
          procreate: cell("supported", "iPad 로컬 .procreate", "Local .procreate", "기기 내 보관·PSD 반출 가능(iPad 외 직접 열기 어려움)", "Local storage & PSD export (.procreate itself is iPad-bound)"),
          rebelle7: cell("supported", "로컬 .reb + PSD", "Local .reb + PSD", "완전 로컬 저장 및 PSD 반출", "Fully local .reb storage and PSD export"),
          photoshop: cell("partial", "로컬 + 구독 종속", "Local + sub tie-in", "로컬 PSD 소유 가능하나 구독 해지 시 앱 재편집 불가", "Local PSD files, though editing stops if CC subscription lapses"),
          "ibis-medibang": cell("partial", "로컬 + 클라우드 유도", "Local + cloud ties", "로컬 저장과 PSD 내보내기 가능(일부 클라우드 소재 종속)", "Local save & PSD export with some cloud-material ties"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "원본은 기기 OPFS에, 원장은 서버에 분리하는 데이터 권위 설계(`docs/operations/infrastructure-map.md`)로 서버가 잠들어도 작업 원본이 기기에 남습니다.",
            "Separates device OPFS source authority from server ledgers so manuscripts remain on the creator's hardware even offline.",
          ),
          implementationDiff: t(
            "웹 툴인 Magma가 클라우드 서버 저장을 기본으로 삼는 것과 달리, ToonStudio는 웹에서도 로컬 OPFS 우선 보관과 표준 포맷 반출을 기본값으로 둡니다.",
            "Unlike cloud-hosted web rooms in Magma, ToonStudio makes local OPFS persistence and standard export the default even inside a browser.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/storage/StudioOpfsSelfHealPanel.tsx",
            "apps/web/src/domains/creator/storage/studio-opfs-quota-cleanup.ts",
            "docs/operations/infrastructure-map.md",
          ],
        },
      },
      {
        id: "ai-training-optout-rights-bom",
        categoryId: "pricing-sovereignty",
        title: t("AI 학습 배제 표시 & 출고 전 Rights BOM 자동 감사", "AI Training Opt-Out Controls & Fail-Closed Rights BOM"),
        summary: t(
          "작품의 AI 학습 비동의 메타데이터 명시와 원고에 쓰인 폰트·브러시·3D·오디오 상업 권리 출고 전 검증",
          "Explicit AI-training refusal signals plus automated pre-export Rights BOM checks across fonts, brushes, 3D & audio",
        ),
        cells: {
          toonstudio: cell("supported", "학습 배제 + Rights BOM", "Opt-out + Rights BOM", "작품별 AI 학습 동의/거부 명시 + 6대 자산 Fail-Closed Rights BOM", "Explicit per-work AI consent field + 6-asset Fail-Closed Rights BOM"),
          csp: cell("partial", "AI 미탑재 정책", "No Gen-AI policy", "생성 AI 미탑재 원칙 명확, 에셋 라이선스 자동 BOM 차단은 없음", "Clear no-GenAI stance; no automated multi-asset export BOM"),
          krita: cell("partial", "오프라인·학습 없음", "Offline / no training", "로컬 오픈소스라 학습 수집 없음, 출고 권리 BOM은 별도 관리", "Local OSS collects nothing; export rights BOM is manual"),
          magma: cell("partial", "AI 학습 비동의 약관", "Opt-out terms", "작품 AI 학습 배제 정책 제공, 출고 자산 BOM 자동 검증은 없음", "Art protection terms; no multi-asset export Rights BOM"),
          procreate: cell("partial", "No-GenAI 서약", "No-GenAI pledge", "생성 AI 배제 철학 뚜렷, 자산 권리 BOM 자동 추적은 없음", "Strong anti-GenAI stance; no automated asset Rights BOM"),
          rebelle7: cell("partial", "로컬·학습 없음", "Local / no training", "로컬 실행으로 학습 수집 없음, 자산 BOM 감사 기능은 없음", "Offline local app without training collection or BOM gate"),
          photoshop: cell("partial", "Content Credentials", "Content Credentials", "C2PA 출처 서명 지원, 웹툰 3D/폰트 상업 BOM 출고 차단은 별도", "C2PA Content Credentials; no webtoon multi-asset BOM gate"),
          "ibis-medibang": cell("partial", "AI 방해 필터(ibis)", "AI disturbance filter", "ibisPaint AI 학습 방해 필터 제공, 출고 자산 BOM은 없음", "ibisPaint offers AI disturbance filter; no asset BOM"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "작품별 AI 학습 비동의 필드·배지와 6대 자산(폰트·브러시·3D·효과·오디오·참고) Fail-Closed Rights BOM 검증기를 납품 패널에 직결했습니다.",
            "Connects per-work AI training consent badges and a 6-category fail-closed Rights BOM validator straight into the delivery pack panel.",
          ),
          implementationDiff: t(
            "Procreate·CSP의 AI 비학습 철학에 더해, 실제 연재 출고 사고(무료 비상업 폰트·NC 브러시·3D 좌석 위반)를 시스템이 자동 차단하는 실무 안전망을 추가했습니다.",
            "Builds on creator-first no-training principles by adding an automated export safety gate against NC fonts, brushes and 3D seat violations.",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/ai-training-consent/CreatorAiTrainingConsentField.tsx",
            "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts",
            "apps/web/src/domains/creator/delivery-pack/StudioEpisodeDeliveryPackPanel.tsx",
          ],
        },
      },
      {
        id: "commercial-license-transparency",
        categoryId: "pricing-sovereignty",
        title: t("오픈소스 · 상용 라이선스 투명성 & 제3자 고지 자동화", "Open-Source & Commercial License Audit Transparency"),
        summary: t(
          "도구 자체 의존성의 비상업·카피레프트 경계 공개, 자동 라이선스 감사 및 제3자 고지서 유지",
          "Publishing dependency license boundaries, automated audits and verified third-party notices for commercial safety",
        ),
        cells: {
          toonstudio: cell("supported", "매 빌드 590건 자동 감사", "590-dep CI audit", "audit:licenses 자동 검증 · mixbox 0건 · 성장 전환 조건 공개", "Automated CI audit across 590 deps, 0 mixbox & open scaling triggers"),
          csp: cell("supported", "상용 소프트웨어 약관", "Commercial EULA", "독점 상용 EULA 명확(내부 엔진 비공개)", "Clear proprietary commercial EULA (closed source)"),
          krita: cell("supported", "GPL-3.0 완전 공개", "Full GPL-3.0 OSS", "전체 소스·의존성 투명 공개, 산출물 상업 이용 완전 자유", "Fully transparent GPL-3.0 source; unrestricted commercial art"),
          magma: cell("supported", "SaaS 상용 약관", "Commercial SaaS", "개인·팀·기업 SaaS 이용약관 공개", "Standard commercial SaaS terms"),
          procreate: cell("supported", "상용 앱 약관", "Commercial EULA", "명확한 1회 구매 상용 앱 약관", "Clear one-time commercial app license"),
          rebelle7: cell("supported", "상용 소프트웨어 약관", "Commercial EULA", "개인·기업 상용 라이선스 구분 명확", "Clear individual and studio commercial licenses"),
          photoshop: cell("supported", "기업 상용 라이선스", "Enterprise license", "글로벌 기업 감사 대응 상용 약관 완비", "Enterprise-audited commercial licensing"),
          "ibis-medibang": cell("supported", "상용 앱 약관", "Commercial EULA", "기본 앱 상용 이용 허용(소재별 약관 분리)", "Commercial app usage allowed; separate material terms"),
        },
        evidence: {
          maturity: "current",
          rationale: t(
            "1인 기업 상용화 라이선스 감사 문서와 `audit:licenses` CI 게이트로 모든 런타임 의존성과 선택 기능 경계를 공개 유지합니다.",
            "Publishes a solo-founder commercial license audit alongside CI-enforced audit:licenses checks across all runtime dependencies.",
          ),
          implementationDiff: t(
            "상용 SaaS가 내부 엔진 권리를 약관 뒤로 숨기는 것과 달리, ToonStudio는 `/about/technology/licenses`와 감사 문서로 코드·에셋·AI·성장 전환 경계를 그대로 공개합니다.",
            "Rather than hiding engine dependencies behind opaque terms, ToonStudio publishes exact code, asset and scaling boundaries at /about/technology/licenses.",
          ),
          repoPaths: [
            "docs/legal/solo-founder-commercial-license-audit-20261122.md",
            "apps/brush-lab/src/license-policy.test.ts",
          ],
        },
      },
    ],
  },
];
