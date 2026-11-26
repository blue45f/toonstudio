import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · web-platform · Waves 25–31 자율 초격차 마감 엔진:
 * 한글 혼용 광학 커닝·WebCodecs VBV·Undo 거버너(Wave 25), LMS 색각 보정·임파스토 사광·연속성 원장(Wave 26),
 * 무샘플 마찰 음향·말풍선 DAG·EPUB 3.3(Wave 27), 동적 대칭·전정 안전 셰이크·중복 제거(Wave 28),
 * 2D 들로네 퍼펫·오디오 의성어·인지 부하(Wave 29), 36항목 마스터 프리플라이트·발열 거버너(Wave 30),
 * 82% 성역 뷰포트·만화 자·무드리프트 줌(Wave 31).
 */
export const ENGINEERING_ATLAS_WEB_PLATFORM_WAVES25TO31_AUTONOMY: readonly EngineeringAtlasEntry[] = [
  {
    id: "waves25-to-28-kerning-cvd-epub3-vestibular-qa",
    category: "web-platform",
    name: "Hangul Kerning · LMS CVD · EPUB 3.3 · Vestibular QA",
    title: t(
      "한글 광학 커닝 · LMS 색각 보정 · EPUB 3.3 · 전정 안전 셰이크",
      "Hangul optical kerning, LMS CVD daltonizer, EPUB 3.3 & vestibular-safe shake",
    ),
    status: "experimental",
    tagline: t(
      "말풍선 광학 조판·색각 대비 보정·읽기 순서 DAG·EPUB 3.3·멀미 억제 셰이크·50화 중복 제거를 통합했습니다.",
      "Unites Hangul optical kerning, LMS CVD daltonizing, balloon DAG, EPUB 3.3, safe shake and 50-episode dedup.",
    ),
    background: [
      t(
        "장기 연재 웹툰 마감에서는 말풍선 내 영숫자 처짐과 외톨이 어절, 적·녹 진영 색약 혼동, 말풍선 대사 역전, 좌우 반전 흉터 실수, 액션 셰이크 멀미, 회차 간 배경·의상 에셋 중복 용량이 동시에 품질 병목을 일으킵니다.",
        "Long-running webtoon production faces mixed-script baseline sag, red-green CVD confusion, inverted speech balloons, mirrored scar mistakes, nauseating camera shake and duplicated assets across episodes.",
      ),
      t(
        "Waves 25~27 커널은 한글 중심축 dyEm·Knuth-Plass 무외톨이 줄바꿈·WebCodecs VBV(언더/오버플로 0)·Undo 128 MiB 거버너, Brettel LMS 색각 시뮬레이션·OKLCH 보정·임파스토 사광·좌우 반전 원장, 48kHz 펜 마찰음·말풍선 DAG·EPUB 3.3 패키저를 순수 TS 로 구현합니다.",
        "Waves 25–27 implement Hangul central-axis kerning & Knuth-Plass line breaking, WebCodecs VBV & 128 MiB undo governor, Brettel LMS daltonizing & flip-scar continuity, plus 48 kHz stylus friction audio, balloon DAG and EPUB 3.3 packaging.",
      ),
      t(
        "Wave 28 은 동적 대칭 여백(>=28%) 코치, 롤 <=2.5°·0.1~0.45Hz 고역통과 멀미 차단 역경직 셰이크, FNV-1a+SHA-256 2단계 지문 기반 50화 에셋 중복 제거기(70%+ 절감, 끊어진 참조 0)를 더합니다(Current: 단위 검증 완료·0B 초기 번들, Target: 출고·편집 보조 패널 연결).",
        "Wave 28 adds dynamic-symmetry (>=28% negative space) coaching, <=2.5 deg roll vestibular-safe hit-stop shake and FNV-1a+SHA-256 cross-episode deduplication (>70% savings, 0 dangling refs; Current: unit-verified, 0 B eager; Target: studio QA panel wiring).",
      ),
    ],
    keyPoints: [
      t("한글 중심축 dyEm · Knuth-Plass 무외톨이 줄바꿈 · WebCodecs VBV 무결성", "Hangul dyEm, Knuth-Plass widow-free wrap & zero-overflow WebCodecs VBV"),
      t("Brettel D65 LMS 색각 보정 · 임파스토 사광 · 정·후면 패리티 반전 검수", "Brettel D65 LMS daltonizer, impasto raking light & flip-parity audit"),
      t("무샘플 48kHz 펜 마찰 음향 · 말풍선 Z/역Z DAG · EPUB 3.3 가이드 뷰", "Zero-sample 48 kHz stylus audio, balloon Z/reverse-Z DAG & EPUB 3.3"),
      t("동적 대칭 구도 · 멀미 차단 역경직 셰이크 · 50화 SHA-256 중복 제거", "Dynamic symmetry, vestibular-safe hit-stop shake & SHA-256 series dedup"),
    ],
    diagram: {
      id: "waves25-to-28-kerning-cvd-epub3-vestibular-qa-diagram",
      kind: "layers",
      title: t("Waves 25–28 조판·접근성·유통·연속성 검증 계층", "Waves 25–28 typography, accessibility, distribution & continuity stack"),
      caption: t(
        "서버 비용 ₩0 · 초기 번들 유입 0B 조건에서 조판·색각·음향·유통·연재 용량을 함께 검증합니다.",
        "Validates typography, CVD contrast, acoustics, EPUB 3.3 and series storage at ₩0 server cost and 0 B eager weight.",
      ),
      alt: t(
        "맨 위 조판·구도 계층(한글 광학 커닝·말풍선 DAG·동적 대칭)에서 접근성·감각 계층(LMS 색각 보정·전정 안전 셰이크·펜 마찰음), 출고·보존 계층(WebCodecs VBV·EPUB 3.3·50화 SHA-256 중복 제거)으로 내려갑니다.",
        "Top to bottom: typography & composition (Hangul kerning, balloon DAG, dynamic symmetry), sensory & accessibility safety (LMS daltonizer, vestibular shake, stylus audio), and export & archival (WebCodecs VBV, EPUB 3.3, SHA-256 series dedup).",
      ),
      layers: [
        { id: "typo", label: t("광학 조판 · 말풍선 DAG · 동적 대칭", "Optical kerning, balloon DAG & symmetry"), sub: t("Knuth-Plass 무외톨이 · Z/역Z 읽기 순서 · 여백 >=28%", "Widow-free wrap, Z/reverse-Z order, >=28% margin"), tone: "good", chips: ["Knuth-Plass", "DAG"] },
        { id: "a11y", label: t("LMS 색각 보정 · 멀미 차단 셰이크", "LMS daltonizer & vestibular-safe shake"), sub: t("D65 회색축 보존 · 롤 <=2.5° · 0.1~0.45Hz 감쇠", "D65 neutral lock, <=2.5 deg roll, nausea high-pass"), tone: "ai", chips: ["OKLCH", "WCAG"] },
        { id: "tact", label: t("48kHz 펜 마찰음 · 임파스토 · 반전 원장", "48 kHz stylus audio, impasto & flip ledger"), sub: t("4지질×4펜촉 PCM · GGX 사광 · 좌우 반전 흉터 검수", "4-paperx4-nib PCM, GGX relief, mirror-scar check"), tone: "local", chips: ["WebAudio", "GGX"] },
        { id: "dist", label: t("WebCodecs VBV · EPUB 3.3 · 50화 중복 제거", "WebCodecs VBV, EPUB 3.3 & series dedup"), sub: t("언더플로 0건 · Guided-View · SHA-256 참조 카운트 GC", "0 VBV underflow, Guided-View, SHA-256 ref-count GC"), tone: "neutral", chips: ["EPUB 3.3", "SHA-256"] },
      ],
    },
    usage: [
      {
        feature: t("한글 혼용 광학 커닝 · WebCodecs VBV · LMS 색각 보정", "Hangul optical kerning, WebCodecs VBV & LMS CVD remapper"),
        role: t(
          "말풍선 영숫자 중심축 보정·무외톨이 줄바꿈, 60/120fps VBV 비트 배분, 적·녹·청황색맹 OKLCH 분리를 수행합니다.",
          "Handles mixed-script baseline alignment, 60/120 fps VBV bit allocation and protan/deutan/tritan OKLCH separation.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave25-acoustic-typography-qa/hangul-optical-mixed-kerning.ts",
          "apps/web/src/domains/creator/wasm64-wave26-color-blindness-subsurface-qa/cvd-lms-palette-remapper.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("말풍선 읽기 순서 DAG · EPUB 3.3 패키저 · 전정 안전 셰이크", "Balloon reading-order DAG, EPUB 3.3 packager & vestibular shake"),
        role: t(
          "대사 순서 역전 최소 이동 교정, EPUB 3.3 고정 레이아웃 생성, 멀미 대역 차단 역경직 셰이크 및 50화 중복 제거를 수행합니다.",
          "Resolves balloon order inversions, emits EPUB 3.3 pre-paginated manifests, clamps nauseating shake and deduplicates series blobs.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave27-audio-haptic-print-mastery/balloon-reading-order-dag-validator.ts",
          "apps/web/src/domains/creator/wasm64-wave28-panel-composition-motion-qa/motion-sickness-safe-camera-shake.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("전정 안전 롤 각도 클램프 및 동작 줄이기 즉시 정지", "Vestibular roll clamp & reduced-motion zeroing"),
        language: "ts",
        ...sampleSource([
          ["export function clampVestibularShake(dx: number, dy: number, rollDeg: number, reduced: boolean) {"],
          ["  if (reduced) return { dx: 0, dy: 0, rollDeg: 0 };", "동작 줄이기 설정 시 모든 흔들림 즉시 0", "zero motion when prefers-reduced-motion is active"],
          ["  const safeRoll = Math.max(-2.5, Math.min(2.5, rollDeg));"],
          ["  return { dx, dy, rollDeg: safeRoll };"],
          ["}"],
        ]),
        explain: t(
          "실제 motion-sickness-safe-camera-shake.ts 는 2차 버터워스 고역통과 필터로 0.1~0.45Hz 멀미 대역까지 85% 이상 감쇠합니다.",
          "motion-sickness-safe-camera-shake.ts adds a 2nd-order Butterworth high-pass filter attenuating the 0.1–0.45 Hz nausea band by >85%.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave28-panel-composition-motion-qa/motion-sickness-safe-camera-shake.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · EPUB 3.3 Fixed-Layout Properties",
        url: "https://www.w3.org/TR/epub-33/",
        kind: "spec",
        note: t("pre-paginated 고정 레이아웃 및 스파인 진행 방향 표준", "Pre-paginated fixed-layout and reading progression specification"),
      },
      {
        title: "W3C · WCAG 2.2 Contrast & Motion Accessibility",
        url: "https://www.w3.org/TR/WCAG22/",
        kind: "spec",
        note: t("비텍스트·텍스트 색각 대비 및 전정 동작 안전 기준", "Contrast minimum and motion-from-interaction accessibility criteria"),
      },
    ],
    chapterIds: ["quality", "performance"],
    talk: {
      pitch: t(
        "한글 말풍선 광학 커닝부터 색약 독자용 LMS 팔레트 보정, 말풍선 순서 DAG, EPUB 3.3 서점 패키징, 멀미 없는 액션 셰이크, 50화 중복 에셋 제거까지 연재 마감 전 구간을 서버 비용 ₩0으로 검증합니다.",
        "Covers Hangul optical kerning, LMS daltonizing, balloon reading-order DAG, EPUB 3.3 packaging, nausea-free shake and 50-episode dedup at ₩0 server cost.",
      ),
      analogy: t(
        "식자 장인, 색채 감리자, 교정 편집자, 전자책 제본소, 보관 창고지기 다섯 전문가가 출고 직전 원고를 동시에 점검하는 마감 데스크입니다.",
        "Like five specialists—typesetter, colorist, copy editor, e-book binder and archivist—checking every page right before release.",
      ),
      questions: [
        {
          question: t("캐릭터 뒷모습 컷에서도 흉터나 가르마 좌우 반전 경고가 잘못 울리지 않나요?", "Do back-view shots trigger false horizontal-flip warnings on scars or hair partings?"),
          answer: t(
            "아닙니다. 카메라 전·후면 포즈(front vs back) 기하 패리티를 먼저 계산해 정상 뒷모습은 통과시키고 실제 정면 좌우 반전 실수만 잡아냅니다.",
            "No—camera front/back parity is resolved geometrically first, so genuine back views pass with zero false positives.",
          ),
        },
      ],
    },
    technologies: ["TypeScript", "WebCodecs", "WebAudio", "EPUB 3.3"],
    facts: [
      { value: "< 1e-4", label: t("D65 회색축 LMS 색각 시뮬레이션 오차 상한", "Max D65 neutral drift under LMS CVD"), source: "apps/web/src/domains/creator/wasm64-wave26-color-blindness-subsurface-qa/wasm64-wave26-color-blindness-subsurface-qa.test.ts" },
      { value: "2.5 deg", label: t("전정 멀미 억제 카메라 롤 회전 상한", "Vestibular comfort roll ceiling"), source: "apps/web/src/domains/creator/wasm64-wave28-panel-composition-motion-qa/motion-sickness-safe-camera-shake.ts" },
    ],
    reviewedAt: "2026-11-27",
  },
  {
    id: "waves29-to-31-puppet-master-preflight-sacred-viewport",
    category: "web-platform",
    name: "2D Puppet · 36-Gate Preflight · Sacred 82% Viewport",
    title: t(
      "2D 들로네 퍼펫 · 36항목 마스터 프리플라이트 · 82% 성역 뷰포트",
      "2D Delaunay puppet, 36-check master preflight & >=82% sacred viewport",
    ),
    status: "experimental",
    tagline: t(
      "무라이선스 2D 퍼펫·음향 의성어, Waves 1~30 역량 레지스트리·36항목 출고 게이트·발열 거버너, 82% 뷰포트·만화 자를 묶었습니다.",
      "Unites a 2D puppet rig, audio-to-SFX contours, a 36-check release gate, thermal governor and >=82% canvas solver.",
    ),
    background: [
      t(
        "홍보용 모션 코믹 제작에는 유료 외부 툴 없이도 숨 쉬고 눈 깜빡이는 2D 퍼펫과 효과음 연동 의성어 벡터가 필요하며, 모바일 독자에게는 과밀 대사 병목을 덜어 줄 여백 진단이 필요합니다.",
        "Promotional motion comics need zero-license 2D breathing/blinking puppets and audio-reactive SFX vectors, while mobile strips need wall-of-text cognitive-load pacing.",
      ),
      t(
        "Wave 29 는 반전 삼각형 0건의 Bowyer-Watson 들로네 퍼펫·오디오 포락선 의성어 합성기·390×844 모바일 인지 부하 감사기를 제공하고, Wave 30 은 초기 번들 0B Waves 1~30 역량 카탈로그·6범주 36항목 출고 마스터 프리플라이트·펜 120Hz 불변 발열/배터리 거버너를 구축합니다.",
        "Wave 29 ships a flip-free Bowyer-Watson 2D puppet, audio-to-SFX Bézier synthesizer and 390x844 cognitive-load auditor; Wave 30 adds a 0 B Waves 1–30 registry, 36-check master preflight gate and stylus-unthrottled thermal governor.",
      ),
      t(
        "Wave 31 은 PRODUCT.md 의 44px 단일 컨텍스트 바·7메뉴 예산·82% 이상 캔버스 가시 면적과 비중첩 HUD 배치를 수학적으로 강제하고, 소실점·동심 타원·N축 대칭 만화 자 스냅을 제공합니다(Current: 단위 검증 완료·0B 초기 번들, Target: 편집기 셸·프리플라이트 모달 직결).",
        "Wave 31 enforces PRODUCT.md's 44 px context bar, <=7-menu budget, >=82% unobstructed canvas and non-overlapping HUDs alongside perspective/ellipse/symmetry comic rulers (Current: unit-verified, 0 B eager; Target: shell & preflight modal wiring).",
      ),
    ],
    keyPoints: [
      t("수밀 Bowyer-Watson 2D 퍼펫 · 오디오 의성어 벡터 · 모바일 인지 부하 감사", "Watertight 2D Delaunay puppet, audio SFX contours & mobile load audit"),
      t("초기 번들 0B Waves 1~30 역량 카탈로그 & 3계층 하드웨어 폴백 리졸버", "0 B Waves 1–30 capability catalog & 3-tier hardware fallback resolver"),
      t("포털·인쇄·오디오·접근성·권리·PII 36항목 출고 마스터 프리플라이트", "36-check omnichannel preflight across slice, CMYK, LUFS, a11y, BOM & PII"),
      t("펜 120Hz 불변 발열 거버너 · >=82% 성역 뷰포트 · 정밀 소실점/대칭 만화 자", "120 Hz stylus-safe thermal governor, >=82% canvas solver & comic rulers"),
    ],
    diagram: {
      id: "waves29-to-31-puppet-master-preflight-sacred-viewport-diagram",
      kind: "layers",
      title: t("Waves 29–31 성역 뷰포트 · 2D 모션 · 36항목 출고 거버넌스", "Waves 29–31 sacred viewport, 2D motion & 36-check release governance"),
      caption: t(
        "창작 화면(>=82% 캔버스·만화 자)에서 단말 발열 보호(펜 120Hz 유지)를 거쳐 36항목 출고 검증으로 이어집니다.",
        "Flows from >=82% canvas & comic rulers through stylus-safe thermal governance to the 36-check release gate.",
      ),
      alt: t(
        "맨 위 >=82% 성역 캔버스·44px 바·만화 자 계층 아래로 2D 들로네 퍼펫·오디오 의성어·모바일 인지 부하 계층, 무팬 태블릿 발열·배터리 거버너 및 Waves 1~30 3계층 폴백 계층, 마지막 36항목 출고 마스터 프리플라이트 게이트가 놓입니다.",
        "Top to bottom: >=82% sacred canvas & comic rulers, 2D Delaunay puppet & audio SFX + mobile cognitive pacing, tablet thermal/battery governor & Waves 1–30 tier resolver, and the 36-check master preflight gate.",
      ),
      layers: [
        { id: "vp", label: t(">=82% 성역 캔버스 · 정밀 만화 자", ">=82% sacred canvas & comic rulers"), sub: t("44px 바 · <=7메뉴 · HUD 충돌 0 · 소실점/대칭 스냅", "44 px bar, <=7 menus, 0 HUD overlap, ruler snap"), tone: "local", chips: ["82% Canvas", "44px"] },
        { id: "rig", label: t("2D 들로네 퍼펫 · 음향 의성어 · 인지 부하", "2D Delaunay puppet, audio SFX & pacing"), sub: t("반전 삼각형 0건 · 4종 베지어 의성어 · 390×844 여백", "0 flipped tris, 4-style SFX paths, 390x844 pacing"), tone: "good", chips: ["Delaunay", "SVG"] },
        { id: "gov", label: t("발열/배터리 거버너 · Waves 1~30 카탈로그", "Thermal governor & Waves 1–30 catalog"), sub: t("펜 120Hz 무감속 불변 · WebGPU→WebGL2→Canvas2D", "120 Hz stylus invariant, 3-tier hardware fallback"), tone: "ai", chips: ["120Hz Pen", "0B Eager"] },
        { id: "gate", label: t("36항목 옴니채널 마스터 프리플라이트", "36-check omnichannel master preflight"), sub: t("슬라이스 · TAC<=300% · -14 LUFS · BOM · PII 0건", "Slice, TAC<=300%, -14 LUFS, Rights BOM, 0 PII"), tone: "good", chips: ["36 Checks", "SHA-256"] },
      ],
    },
    usage: [
      {
        feature: t("2D 들로네 퍼펫 아이들러 · 오디오 의성어 · 모바일 인지 부하 감사", "2D Delaunay puppet idler, audio SFX contours & mobile load auditor"),
        role: t(
          "정지 레이어 일러스트의 호흡·눈깜빡임·진자 변형, 음향 기반 의성어 윤곽선 생성, 과밀 대사 여백 추천을 수행합니다.",
          "Animates layered 2D characters, synthesizes audio-driven Korean SFX paths and recommends mobile breathing gutters.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave29-live2d-rig-balloon-sfx/delaunay-puppet-micro-idler.ts",
          "apps/web/src/domains/creator/wasm64-wave29-live2d-rig-balloon-sfx/scroll-cognitive-load-auditor.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("Waves 1~30 역량 레지스트리 · 36항목 출고 게이트 · 82% 뷰포트/만화 자", "Waves 1–30 registry, 36-check preflight & >=82% viewport/comic rulers"),
        role: t(
          "3계층 하드웨어 폴백, 36항목 출고 차단·서명 지문 발급, 발열 예산 제어 및 >=82% 성역 캔버스·소실점 만화 자 스냅을 담당합니다.",
          "Resolves hardware fallback tiers, runs 36 release checks, governs tablet thermals and enforces >=82% canvas & ruler snap.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave30-grand-milestone-verify/episode-master-preflight-gate.ts",
          "apps/web/src/domains/creator/wasm64-wave31-monolith-layout-kernel/sacred-canvas-viewport-solver.ts",
          "apps/web/src/domains/creator/wasm64-wave32-subpixel-halftone-color-proof/stochastic-rosette-halftone-proofer.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("성역 캔버스 가시 면적 비율(>= 82%) 판정", "Sacred unobstructed canvas ratio (>= 82%) check"),
        language: "ts",
        ...sampleSource([
          ["export function computeCanvasAreaRatio(viewW: number, viewH: number, barH: number, dockW: number): number {"],
          ["  const total = Math.max(1, viewW * viewH);"],
          ["  const free = Math.max(0, viewW - dockW) * Math.max(0, viewH - barH);"],
          ["  return free / total;", "0.82 미만이면 도크를 플로팅 시트로 접어 캔버스 확보", "collapse side docks if ratio < 0.82"],
          ["}"],
        ]),
        explain: t(
          "실제 sacred-canvas-viewport-solver.ts 는 44px 상단 바·7개 메뉴 예산과 플로팅 HUD 배지 간 >=8px 비중첩 배치를 함께 풉니다.",
          "sacred-canvas-viewport-solver.ts jointly enforces the 44 px bar, <=7 menus and >=8 px non-overlapping HUD placement.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave31-monolith-layout-kernel/sacred-canvas-viewport-solver.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "ITU-R BS.1770-5 · Loudness & True-Peak Audio Measurement",
        url: "https://www.itu.int/rec/R-REC-BS.1770/en",
        kind: "spec",
        note: t("36항목 출고 프리플라이트의 -14 LUFS 및 -1.0 dBTP 기준", "-14 LUFS loudness and -1.0 dBTP true-peak broadcast standard"),
      },
      {
        title: "MDN · PointerEvent getCoalescedEvents()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents",
        kind: "docs",
        note: t("발열 제어 중에도 감속하지 않는 고주사율 펜 입력 샘플링 표준", "High-rate stylus input capture preserved unthrottled under thermal load"),
      },
    ],
    chapterIds: ["architecture", "quality", "performance"],
    talk: {
      pitch: t(
        "캔버스 가시 면적 82% 수호와 정밀 만화 자부터 무라이선스 2D 퍼펫, 펜 120Hz를 지키는 발열 거버너, 출고 직전 36항목 마스터 프리플라이트까지 스튜디오 전 주기를 단일 규율로 완성했습니다.",
        "Completes the studio loop from >=82% canvas protection and comic rulers to 2D puppets, 120 Hz stylus-safe thermal governance and a 36-check release gate.",
      ),
      analogy: t(
        "화판 위를 넓게 비워 주는 작업대(82% 뷰포트), 건드리면 숨 쉬는 종이 인형(2D 퍼펫), 더워도 손끝 펜선은 늦추지 않는 냉각 장치, 출항 전 36개 체크리스트를 찍는 관제탑입니다.",
        "Like an uncluttered drafting desk, a breathing paper puppet, a smart cooler that never slows your pen and a 36-point launch tower.",
      ),
      questions: [
        {
          question: t("태블릿이 심하게 발열(critical)하면 펜 선이 끊기거나 입력 주기가 줄어드나요?", "Does critical tablet heat throttle stylus stroke sampling?"),
          answer: t(
            "아닙니다. 유휴 백그라운드 스크러빙(0ms)과 그림자 캐스케이드·파티클 배율만 먼저 내리고, 펜 접촉 중 포인터 샘플링(stylusSamplingUnthrottled)은 항상 100% 유지합니다.",
            "Never—background idle work and secondary visual effects shed first while active stylus sampling stays 100% unthrottled.",
          ),
        },
      ],
    },
    technologies: ["TypeScript", "WebGPU", "WebAssembly", "SVG"],
    facts: [
      { value: "36 checks", label: t("옴니채널 출고 마스터 프리플라이트 검증 항목", "Omnichannel master preflight checks"), source: "apps/web/src/domains/creator/wasm64-wave30-grand-milestone-verify/episode-master-preflight-gate.ts" },
      { value: ">= 82%", label: t("PRODUCT.md 성역 캔버스 최소 가시 면적 비율", "Sacred unobstructed canvas area ratio"), source: "apps/web/src/domains/creator/wasm64-wave31-monolith-layout-kernel/sacred-canvas-viewport-solver.ts" },
    ],
    reviewedAt: "2026-11-27",
  },
];
