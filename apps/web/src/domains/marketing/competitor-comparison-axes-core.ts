import type { BilingualCopy, ComparisonAxis } from "./competitor-comparison-profiles";

const bi = (ko: string, en: string): BilingualCopy => ({ ko, en });

export const COMPARISON_AXES_CORE: readonly ComparisonAxis[] = [
  {
    id: "drawing-spectral",
    order: 1,
    tabLabel: bi("① 드로잉·분광 안료", "1. Drawing & Spectral"),
    title: bi("드로잉 · 브러시 · 7밴드 분광 안료(WebGPU)", "Drawing, Brushes & 7-Band Spectral Pigment (WebGPU)"),
    subtitle: bi(
      "실시간 펜 입력, 자연매체 혼색, GPU 컴퓨트 가속 및 상업 라이선스 안전성 비교",
      "Comparing stylus input, natural-media pigment mixing, GPU compute acceleration & license safety",
    ),
    whenToUseGuide: bi(
      "초고밀도 수채·유화 물 번짐 아트워크 단독 제작은 Rebelle, iPad 휴대 드로잉은 Procreate, 10년치 .sut 소재 생태계 활용은 CSP가 강합니다. ToonStudio는 설치 없이 브라우저에서 상업 안전 7밴드 분광 KM + Hokusai 자연매체 + WebGPU 가속을 바로 이어 쓸 때 유리합니다.",
      "Choose Rebelle for dedicated fluid watercolor/oil realism, Procreate for portable iPad sketching, or CSP for its decade-old .sut asset library. Choose ToonStudio for zero-install browser painting with commercial-safe 7-band spectral KM, Hokusai natural media & WebGPU compute.",
    ),
    criteria: [
      {
        id: "spectral-pigment-km7",
        title: bi("물리 분광 안료 혼색 (Kubelka-Munk)", "Physical Spectral Pigment Mixing (Kubelka-Munk)"),
        summary: bi(
          "파랑+노랑 혼색 시 회색 탁함 없이 자연스러운 녹색을 내는 감산 안료 연산",
          "Subtractive pigment mixing (e.g. blue + yellow → natural green without muddy gray)",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "mixbox(CC BY-NC) 완전 제거 후 클린룸 7밴드(420–670nm) KM WebGPU Compute + CPU 동등 엔진, 상업 안전 브러시 5종·안료 필터 4종 통합 완료",
            "Clean-room 7-band (420–670nm) KM WebGPU Compute + CPU-equivalent engine with 5 commercial-safe brushes & 4 pigment filters; mixbox (CC BY-NC) fully removed",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts",
            "apps/web/src/domains/creator/brush-lab/brush-studio-v6-recipe-catalog-km7-spectral.ts",
            "docs/legal/solo-founder-commercial-license-audit-20261122.md",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("클린룸 7밴드 KM", "Clean-room 7-band KM"),
            detail: bi("WebGPU Compute + CPU 폴백 · 상업 안전(permissive-only)", "WebGPU Compute + CPU fallback · commercial-safe"),
          },
          csp: {
            status: "native-strength",
            label: bi("지각적 혼색 지원", "Perceptual mixing"),
            detail: bi("v2.0+ 지각적 색혼합 내장, 7밴드 분광 필터는 별도", "Built-in perceptual mixing since v2.0"),
          },
          procreate: {
            status: "limited",
            label: bi("sRGB/P3 블렌딩", "sRGB/P3 blending"),
            detail: bi("일반 디지털 혼색 중심, 물리 분광 엔진 미내장", "Standard digital blending without spectral KM"),
          },
          photoshop: {
            status: "limited",
            label: bi("믹서 브러시(RGB)", "Mixer Brush (RGB)"),
            detail: bi("습식 믹서 브러시 제공, 분광 감산 안료는 플러그인 의존", "Wet mixer brush; spectral mixing requires plugins"),
          },
          rebelle: {
            status: "native-strength",
            label: bi("실시간 안료·유체 최상", "Top-tier pigment & fluid"),
            detail: bi("Pigments + 3D 유체·종이 섬유 시뮬레이션 업계 최상위", "Benchmark real-time pigment & fluid paper simulation"),
          },
          blender: {
            status: "none",
            label: bi("2D 안료 특화 아님", "Not 2D pigment-focused"),
            detail: bi("텍스처 페인트·Grease Pencil 중심", "Texture painting & Grease Pencil focused"),
          },
          creco: { status: "none", label: bi("드로잉 미제공", "No drawing"), detail: bi("협업·일정 관리 전용", "Production management only") },
          acon3d: { status: "none", label: bi("드로잉 미제공", "No drawing"), detail: bi("3D 소재 마켓 전용", "3D marketplace only") },
        },
      },
      {
        id: "gpu-pipeline-latency",
        title: bi("GPU 가속·예측 스타일러스·HDR 디더링", "GPU Acceleration, Stylus Prediction & HDR Dithering"),
        summary: bi(
          "고해상도 캔버스 확대/변형, 필압 예측, 그라데이션 밴딩 방지 파이프라인",
          "High-res canvas zoom/warp, predictive stylus latency reduction & anti-banding HDR output",
        ),
        toonStudioEvidence: {
          maturity: "partial",
          summary: bi(
            "WebGPU 버퍼 풀·비동기 프리웜업·HDR 디더링·서브픽셀 예측·Lanczos3 컴퓨트 변형·Mipmap 컬링 엔진 구현 완료(일부 런타임은 명시 선택 provider 단계)",
            "WebGPU buffer pool, async shader warmup, HDR dithering, subpixel prediction, Lanczos3 compute warp & mipmap culling implemented; Canvas2D remains primary commit authority",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/gpu-next/gpu-buffer-pool-and-warmup.ts",
            "apps/web/src/domains/creator/render/gpu-next/gpu-hdr-dither-and-frame-budget.ts",
            "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-predict-and-screentone.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-transform-resample-wgsl.ts",
            "docs/engines/renderer-roles.md",
          ],
        },
        cells: {
          toonstudio: {
            status: "partial",
            label: bi("WebGPU 코어 + Canvas2D 권위", "WebGPU core + Canvas2D commit"),
            detail: bi("WGSL 컴퓨트 모듈 완료 · 기본 커밋 레인 전면 전환은 진행 중", "WGSL compute modules ready; full primary GPU commit transition ongoing"),
          },
          csp: {
            status: "native-strength",
            label: bi("네이티브 C++ 안정", "Mature native C++"),
            detail: bi("대형 캔버스·타블렛 드라이버 성숙도 높음", "Mature tablet driver & large-canvas stability"),
          },
          procreate: {
            status: "native-strength",
            label: bi("Metal 120Hz 초저지연", "Metal 120Hz ultra-low latency"),
            detail: bi("Valkyrie Metal 엔진 + Apple Pencil 최적화 최상", "Valkyrie Metal engine tuned specifically for iPad"),
          },
          photoshop: {
            status: "native-strength",
            label: bi("16/32bit GPU 합성", "16/32-bit GPU compositing"),
            detail: bi("고심도 색보정·스마트 필터·대용량 PSB 최강", "Unmatched 16/32-bit grading & huge PSB files"),
          },
          rebelle: {
            status: "native-strength",
            label: bi("NanoPixel GPU 시뮬레이션", "NanoPixel GPU simulation"),
            detail: bi("유체 물리 연산은 GPU 사양 요구가 높음", "Real-time fluid simulation; demands desktop GPU"),
          },
          blender: {
            status: "limited",
            label: bi("3D 뷰포트 GPU 특화", "3D viewport GPU-focused"),
            detail: bi("Vulkan/Metal/CUDA는 3D 렌더 중심", "GPU pipelines centered on 3D rendering"),
          },
          creco: { status: "none", label: bi("해당 없음", "N/A"), detail: bi("뷰어·피드백 중심", "Review & viewer focused") },
          acon3d: { status: "none", label: bi("해당 없음", "N/A"), detail: bi("에셋 스토어", "Asset marketplace") },
        },
      },
      {
        id: "natural-media-brushes",
        title: bi("자연매체(연필·수채·유화)·절차 브러시", "Natural Media (Pencil, Watercolor, Oil) & Procedural Brushes"),
        summary: bi(
          "종이 결·붓모 탄성·습식 엣지 블룸과 커스텀 브러시 제작·이식성",
          "Paper tooth, bristle dynamics, wet-edge bloom & custom brush portability",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "Hokusai Rust WASM 자연매체 권위 + libmypaint WASM parity + KM7 상업 브러시 5종 + 독립 Brush Lab 검증",
            "Hokusai Rust WASM natural-media authority + libmypaint WASM parity + 5 KM7 commercial brushes + standalone Brush Lab",
          ),
          repoPaths: [
            "docs/engines/renderer-roles.md",
            "apps/web/src/domains/creator/brush-lab/brush-studio-v6-recipe-catalog-km7-spectral.ts",
            "apps/brush-lab/src/license-policy.test.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("Hokusai WASM + KM7 5종", "Hokusai WASM + 5 KM7"),
            detail: bi("Dedicated Worker 자연매체 + ABR 가져오기 지원", "Dedicated Worker natural media + ABR import"),
          },
          csp: {
            status: "native-strength",
            label: bi("방대한 .sut 생태계", "Huge .sut library"),
            detail: bi("만화 G펜·스크린톤·커뮤니티 브러시 수만 종", "Tens of thousands of manga pens & screentones"),
          },
          procreate: {
            status: "native-strength",
            label: bi("Brush Studio 직관성", "Intuitive Brush Studio"),
            detail: bi("터치 기반 브러시 튜닝과 연필 기울기 표현 우수", "Fast touch brush tuning & Apple Pencil tilt"),
          },
          photoshop: {
            status: "native-strength",
            label: bi("ABR 업계 표준", "ABR industry standard"),
            detail: bi("컨셉 아트·포토 배싱 브러시 생태계 최대", "Largest concept-art & photobashing brush pool"),
          },
          rebelle: {
            status: "native-strength",
            label: bi("실사 화구 재현 1위", "Leading traditional feel"),
            detail: bi("수채·유화·파스텔·금박·물감 두께 물리 재현", "Best-in-class watercolor, oil, pastel & metallic foil"),
          },
          blender: {
            status: "limited",
            label: bi("Grease Pencil 브러시", "Grease Pencil brushes"),
            detail: bi("3D 공간 드로잉에 특화, 전통 2D 회화용은 제한적", "Built for 3D space strokes rather than 2D painting"),
          },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("검수 펜 마크업 수준", "Review markup only") },
          acon3d: { status: "none", label: bi("미제공", "None"), detail: bi("3D 배경·소품 마켓", "3D assets marketplace") },
        },
      },
      {
        id: "screentone-filters",
        title: bi("컴퓨트 스크린톤·안료 필터·색보정", "Compute Screentone, Pigment Filters & Color Grading"),
        summary: bi(
          "웹툰·만화 톤 패턴, 분광 그라디언트 맵, 비파괴 후보정 기능",
          "Manga screentones, spectral gradient maps & non-destructive post-processing",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "WebGPU 컴퓨트 스크린톤(4패턴·모아레 억제) + KM7 안료 필터 4종(그라디언트 맵·색온도·글레이징·하모나이저) 통합",
            "WebGPU compute screentone (4 patterns, moire suppression) + 4 KM7 pigment filters integrated in filter gallery",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-predict-and-screentone.ts",
            "apps/web/src/domains/creator/render/studio-webgpu-tile-viewport-culling.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("컴퓨트 톤 + KM7 필터 4종", "Compute tone + 4 KM7 filters"),
            detail: bi("모아레 억제 스크린톤 · 분광 글레이징/색온도 필터", "Moire-suppressed screentone & spectral grading"),
          },
          csp: {
            status: "native-strength",
            label: bi("만화 톤 레이어 정교", "Precision tone layers"),
            detail: bi("비파괴 톤 선 수·각도·노이즈 제어 업계 기준", "Reference-grade non-destructive manga screentones"),
          },
          procreate: {
            status: "limited",
            label: bi("기본 조정 필터", "Basic adjustments"),
            detail: bi("하프톤·커브 제공, 비파괴 조정 레이어 부재", "Halftone & curves; lacks non-destructive adjustment layers"),
          },
          photoshop: {
            status: "native-strength",
            label: bi("비파괴 조정 레이어 최강", "Top adjustment layers"),
            detail: bi("Camera Raw·LUT·스마트 필터·CMYK 프로파일 완벽", "Full Camera Raw, LUT, Smart Filters & CMYK"),
          },
          rebelle: {
            status: "limited",
            label: bi("색상·광원 보정", "Color & lighting filters"),
            detail: bi("회화 마감 중심, 만화 톤 전용 기능은 약함", "Painterly finishing; not built for manga screentones"),
          },
          blender: {
            status: "limited",
            label: bi("3D 컴포지터 노드", "3D Compositor nodes"),
            detail: bi("렌더 패스 후처리 강력, 2D 컷 편집 흐름과 분리", "Powerful render compositor, separate from 2D cuts"),
          },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("제작 관리 전용", "Production management only") },
          acon3d: { status: "none", label: bi("미제공", "None"), detail: bi("3D 소재 마켓", "3D marketplace") },
        },
      },
    ],
  },
  {
    id: "scene3d-vector",
    order: 2,
    tabLabel: bi("② 3D 배경·캐릭터·벡터", "2. 3D, VRM & Vector"),
    title: bi("3D 배경 · 캐릭터 포즈 · 벡터 선화 브리지", "3D Backgrounds, Character Posing & Vector Lineart Bridge"),
    subtitle: bi(
      "대용량 SketchUp/GLB/VRM 로컬 로딩, 3D→2D 조명 동기화·툰 선화, 벡터 경로 편집 비교",
      "Comparing large local SketchUp/GLB/VRM loading, 3D-to-2D light sync, toon lines & vector paths",
    ),
    whenToUseGuide: bi(
      "복잡한 건축·메카닉 자체 모델링과 하이엔드 렌더링은 Blender, 한국 웹툰 특화 기성 배경 구매는 ACON3D가 정석입니다. ToonStudio는 구매·제작한 .skp/GLB/VRM을 브라우저 로컬(최대 1 GiB)로 바로 불러 카메라 컷·조명 동기화·2D 컷 합성을 한 화면에서 끝낼 때 가장 빠릅니다.",
      "Use Blender for complex scratch modeling/rendering and ACON3D for ready-made Korean webtoon background packs. Use ToonStudio to load those .skp/GLB/VRM assets locally (up to 1 GiB) and compose shots, light sync & 2D cut integration in one screen.",
    ),
    criteria: [
      {
        id: "wasm64-3d-import",
        title: bi("대용량 3D/VRM/.skp 로컬 임포트 (Wasm64)", "Large Local 3D/VRM/.skp Import (Wasm64)"),
        summary: bi(
          "서버 업로드 없이 기기 메모리·OPFS로 대용량 배경(.skp/GLB)과 VRM 캐릭터 수용",
          "Loading large .skp/GLB environments & VRM characters locally via OPFS without server upload",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "Wasm64 메모리 거버너 기반 4단계 동적 정책(GLB/VRM 128 MiB~1 GiB, OpenSKP .skp 최대 256 MiB, OPFS 16 GiB 누적) · 서버 12 MiB 보안 경계 분리 완료",
            "4-tier Wasm64 memory governor policy (GLB/VRM 128 MiB–1 GiB, OpenSKP .skp up to 256 MiB, 16 GiB OPFS pool) cleanly separated from 12 MiB cloud sync limit",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/import-safety/studio-3d-upload-limit-policy.ts",
            "apps/web/src/domains/creator/studio-wasm64-memory-governor.ts",
            "apps/web/src/domains/creator/bg3d/studio-bg3d-skp-preflight.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("GLB/VRM 1 GiB · SKP 256 MiB", "1 GiB GLB/VRM · 256 MiB SKP"),
            detail: bi("OpenSKP Worker 브라우저 직접 변환 · 서버 전송 ₩0", "Browser OpenSKP worker conversion · KRW 0 server cost"),
          },
          csp: {
            status: "native-strength",
            label: bi("FBX/OBJ/VRM 안정 지원", "FBX/OBJ/VRM supported"),
            detail: bi("3D 데생인형·배경 배치 우수, .skp는 직접 변환 제약", "Strong 3D dolls & sets; .skp often needs external conversion"),
          },
          procreate: {
            status: "limited",
            label: bi("3D 모델 텍스처 페인트", "3D texture painting"),
            detail: bi("USDZ/OBJ 페인팅만 지원, 배경 씬 카메라 구성 불가", "USDZ/OBJ painting only; no multi-prop 3D stage"),
          },
          photoshop: {
            status: "limited",
            label: bi("3D 기능 단계적 축소", "3D features deprecated"),
            detail: bi("Substance 3D 별도 제품군으로 분리", "Moved to separate Substance 3D suite"),
          },
          rebelle: { status: "none", label: bi("3D 씬 미제공", "No 3D scene"), detail: bi("2D 회화 전용", "2D painting only") },
          blender: {
            status: "native-strength",
            label: bi("네이티브 RAM 한도 풀 3D", "Full native RAM 3D"),
            detail: bi("수 GB 대형 씬·커스텀 셰이더·애드온 무제한급", "Handles multi-GB scenes, custom shaders & add-ons"),
          },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("제작 관리 툴", "Production tool") },
          acon3d: {
            status: "native-strength",
            label: bi("SKP·스냅툰 방대한 카탈로그", "Huge SKP & Snaptoon catalog"),
            detail: bi("모델 공급원 역할(자체 드로잉 캔버스 없음)", "Asset supplier rather than full drawing editor"),
          },
        },
      },
      {
        id: "3d-to-2d-light-sync",
        title: bi("3D→2D 조명 동기화 · 툰 선화 · 물리", "3D→2D Light Sync, Toon Lines & Physics"),
        summary: bi(
          "3D 배경 광원을 2D 캐릭터 명암·림라이트에 맞추고 은선·물리를 컷에 반영",
          "Syncing 3D set lighting to 2D character shading, toon line extraction & deterministic physics",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "Three.js+VRM 기본 3D 권위 + Babylon.js 전문 패스 분리 + 3D→2D 캐릭터 조명 동기화 + Rapier3D(Apache-2.0) 결정적 물리 통합",
            "Three.js+VRM primary 3D + isolated Babylon.js specialist passes + 3D→2D character light sync + Rapier3D (Apache-2.0) physics",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/bg3d/studio-bg3d-2d-character-light-sync.ts",
            "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-specialist-entry.ts",
            "apps/web/src/domains/creator/vrm/StudioVrmActor.tsx",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("3D→2D 광원 동기화 + VRM", "3D→2D light sync + VRM"),
            detail: bi("배경 광원 색온도→2D 명암 연동 · Rapier Apache-2.0", "Maps 3D sun/ambient to 2D shading + Apache-2.0 Rapier"),
          },
          csp: {
            status: "native-strength",
            label: bi("EX LT 변환·3D 쉐이딩", "EX LT conversion & shading"),
            detail: bi("EX 판본의 LT 선화·톤 추출은 웹툰 업계 현역 표준", "EX LT line/tone extraction is a proven webtoon standard"),
          },
          procreate: { status: "none", label: bi("미제공", "None"), detail: bi("2D 브러시 중심", "2D brush-centric") },
          photoshop: { status: "none", label: bi("미제공", "None"), detail: bi("수동 2D 조명 합성", "Manual 2D lighting composites") },
          rebelle: { status: "none", label: bi("미제공", "None"), detail: bi("2D 안료 중심", "2D pigment-centric") },
          blender: {
            status: "native-strength",
            label: bi("Line Art·NPR 셰이더 최강", "Top Line Art & NPR shaders"),
            detail: bi("Grease Pencil Line Art·Freestyle·EEVEE 툰 제어 정밀", "Deep Grease Pencil Line Art & EEVEE toon shader control"),
          },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("협업 관리 전용", "Collaboration only") },
          acon3d: {
            status: "limited",
            label: bi("에이블러/스냅툰 뷰어", "ABLER / Snaptoon viewers"),
            detail: bi("3D 렌더링·선화 추출 보조, 2D 원고 편집은 타 앱 필요", "3D render/line extraction helpers; requires external 2D app"),
          },
        },
      },
      {
        id: "vector-lineart-ops",
        title: bi("벡터 선화 편집·제어점·SVG 경로 연산", "Vector Lineart, Control Points & SVG Path Ops"),
        summary: bi(
          "선 두께 수정, 제어점 편집, SVG 무손실 경로 연산 및 품질 엔진",
          "Stroke width editing, control points, lossless SVG path operations & retained rendering",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "Skia WebGL2 retained 벡터 표면 + CanvasKit PathOps 품질 워커 + Vello/ThorVG/Paper.js provider + VectorStrokeEditor 구현",
            "Skia WebGL2 retained vector surface + CanvasKit PathOps worker + Vello/ThorVG/Paper.js providers + VectorStrokeEditor",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/vector-layer/VectorStrokeEditor.tsx",
            "apps/web/src/domains/creator/vector-layer/vector-control-points.ts",
            "docs/engines/renderer-roles.md",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("Skia + 제어점 + SVG 내보내기", "Skia + control points + SVG"),
            detail: bi("벡터 선화 모델·제어점 편집·CanvasKit PathOps 워커", "Vector stroke model, control points & PathOps worker"),
          },
          csp: {
            status: "native-strength",
            label: bi("벡터 교차 지우개 표준", "Vector eraser benchmark"),
            detail: bi("웹툰 선화용 벡터 레이어·선폭 수정·교차점 지우기 최강", "Gold standard for manga vector lineart cleanup"),
          },
          procreate: { status: "none", label: bi("래스터 전용", "Raster only"), detail: bi("벡터 레이어 미지원", "No vector layer support") },
          photoshop: {
            status: "limited",
            label: bi("펜 툴 셰이프 위주", "Pen shapes only"),
            detail: bi("UI/도형 패스용이며 만화 필압 벡터 선화용은 아님", "Shape paths rather than pressure-sensitive manga ink"),
          },
          rebelle: { status: "none", label: bi("래스터 전용", "Raster only"), detail: bi("물리 픽셀 캔버스 전용", "Physical raster canvas only") },
          blender: {
            status: "native-strength",
            label: bi("Grease Pencil 3D 벡터", "Grease Pencil 3D vectors"),
            detail: bi("애니메이션·3D 연동 벡터 드로잉에 매우 강력", "Powerful for 3D-integrated animated vector strokes"),
          },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("드로잉 기능 없음", "No drawing engine") },
          acon3d: { status: "none", label: bi("미제공", "None"), detail: bi("3D 소재 마켓", "3D marketplace") },
        },
      },
      {
        id: "cad-parametric-3d",
        title: bi("3D 공간 조립 · CAD/BIM 정밀 모델링 경계", "3D Staging & CAD/BIM Precision Modeling"),
        summary: bi(
          "웹툰 배경 커스텀 배치부터 정밀 CAD·리깅까지의 역할 분리",
          "Separating rapid webtoon staging from full CAD/rigging depth",
        ),
        toonStudioEvidence: {
          maturity: "partial",
          summary: bi(
            "브라우저 내 3D 공간/포즈/카메라 컷 조립과 OpenCASCADE WASM(LGPL 동적 분리) 실험 도구를 제공하되, 풀 하이엔드 스컬프팅은 Blender 연동을 권장",
            "Browser 3D staging, posing & shot cameras plus dynamically isolated OpenCASCADE WASM; recommends Blender round-trip for heavy sculpting",
          ),
          repoPaths: [
            "docs/legal/solo-founder-commercial-license-audit-20261122.md",
            "apps/web/src/domains/creator/bg3d/StudioBg3dProductionPassPreflightPanel.tsx",
          ],
        },
        cells: {
          toonstudio: {
            status: "partial",
            label: bi("웹툰 컷 조립 특화 (실험 포함)", "Webtoon staging (+ labs)"),
            detail: bi("공간·포즈·샷 중심 · 하이엔드 스컬프팅은 Blender 호환", "Set/pose/shot focused; pairs with Blender via GLB"),
          },
          csp: {
            status: "limited",
            label: bi("배치·카메라 위주", "Placement & camera only"),
            detail: bi("직접 폴리곤 모델링·리깅 제작 기능은 없음", "No native polygon modeling or rigging"),
          },
          procreate: { status: "none", label: bi("미제공", "None"), detail: bi("모델링 불가", "No 3D modeling") },
          photoshop: { status: "none", label: bi("미제공", "None"), detail: bi("3D 모델링 미지원", "No 3D modeling") },
          rebelle: { status: "none", label: bi("미제공", "None"), detail: bi("2D 전용", "2D only") },
          blender: {
            status: "native-strength",
            label: bi("풀 DCC 모델링·스컬프팅", "Full DCC modeling & sculpt"),
            detail: bi("지오메트리 노드·UV·리깅·시뮬레이션 완전 지원", "Complete Geometry Nodes, UV, rigging & simulation"),
          },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("협업 툴", "Production tool") },
          acon3d: {
            status: "limited",
            label: bi("완성 배경 구매·조합", "Curated asset purchase"),
            detail: bi("직접 모델링 대신 완성 에셋 구매로 시간 단축", "Saves modeling time via ready-made packs"),
          },
        },
      },
    ],
  },
];
