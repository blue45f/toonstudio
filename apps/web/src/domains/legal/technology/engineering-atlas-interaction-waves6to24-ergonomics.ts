import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · interaction · Waves 6·11·12·21·24 스크롤 시네마·시선 도약·숏폼 디렉터·마르코프 프리페치·피츠 방사형 HUD 2종 카드.
 */
export const ENGINEERING_ATLAS_INTERACTION_WAVES6TO24_ERGONOMICS: readonly EngineeringAtlasEntry[] = [
  {
    id: "wave6-to-21-scroll-cinema-saccade-shortform",
    category: "interaction",
    name: "Waves 6·11·12·21 Scroll Cinema · Saccade · 180° Axis · 9:16 Director",
    title: t(
      "Waves 6·11·12·21 임계 감쇠 스크롤 · 안구 도약 · 180° 연출축 & 9:16 숏폼 디렉터",
      "Waves 6·11·12·21 damped scroll rig, saccade load, 180° axis & 9:16 shortform director",
    ),
    status: "experimental",
    tagline: t(
      "임계 감쇠 스크롤·Bellman-Ford 서사 검증, 안구 도약·180° 축 검사, 9:16 릴스 자동 카메라와 120px 썸네일 감사를 묶었습니다.",
      "Unites critically damped scroll, Bellman-Ford timeline QA, saccade/180°-axis checks, 9:16 Reels framing and 120 px thumbnail audits.",
    ),
    background: [
      t(
        "세로 스크롤 웹툰에서 출렁이는 언더댐프 스프링은 멀미를 유발하고, 말풍선 동선이 역-Z자로 꼬이거나 대화 도중 카메라가 180° 연출 축을 넘어가면 독자가 화자를 혼동하며, 세로 원고를 9:16 숏폼 영상이나 120×120px 스토어 썸네일로 줄일 때 말풍선 잘림과 식별력 저하가 빈번합니다.",
        "Bouncy scroll springs trigger motion discomfort, reverse-Z balloon layouts and 180°-axis violations confuse readers, and cropping vertical strips into 9:16 Reels or 120×120 thumbnails often clips dialogue.",
      ),
      t(
        "Wave 6 은 오버슈트 없는 해석적 임계 감쇠(ζ = 1) 4평면 시차 스크롤 리그와 Bellman-Ford 음수 사이클 시간선 모순 탐지기를 제공하고, Wave 11·12 는 안구 도약(Saccade) 독서 피로도 추정기 및 180° 연출 축 연속성·다국어 팽창 말풍선 맞춤 솔버를 구현합니다.",
        "Wave 6 provides an analytical critically damped (ζ = 1) 4-plane scroll rig and a Bellman-Ford narrative timeline solver, while Waves 11–12 audit oculomotor saccade load and 180° camera-axis continuity.",
      ),
      t(
        "Wave 21 shortform-director-thumbnail-auditor.ts 는 세로 원고에서 말풍선 잘림 0건(0 clipped balloons)을 보장하는 1080×1920(9:16) 비트 동기화 Ken-Burns 카메라 궤적과 120×120·160×210 모바일 스토어 썸네일 가독성 감사를 수행합니다(Current: 단위 검증 완료·0B 번들, Target: 리더 프리뷰·홍보 영상 익스포터 연동).",
        "Wave 21 directs beat-synced 1080×1920 (9:16) Ken-Burns shortform camera paths with 0 clipped balloons and audits 120×120 / 160×210 storefront thumbnail legibility (Current: unit-verified; Target: reader preview & promo exporter).",
      ),
    ],
    keyPoints: [
      t("오버슈트 0건 해석적 임계 감쇠(ζ=1) 스크롤 & Bellman-Ford 시간선 검증", "Zero-overshoot critically damped (ζ=1) scroll & Bellman-Ford timeline QA"),
      t("안구 도약(Saccade)·역-Z 시선 교차 검수 & 180° 카메라 연출축 감시", "Oculomotor saccade/reverse-Z load audit & 180° action-axis checker"),
      t("말풍선 잘림 0건 1080×1920(9:16) 릴스·쇼츠 비트 동기화 카메라 연출", "0-clipped-balloon 1080×1920 (9:16) beat-synced Ken-Burns director"),
      t("120×120 · 160×210 모바일 목록 썸네일 대비·초점 가독성 사전 감사", "120×120 & 160×210 mobile storefront thumbnail legibility auditor"),
    ],
    diagram: {
      id: "wave6-to-21-scroll-cinema-saccade-shortform-diagram",
      kind: "graph",
      title: t("서사·시선·연출축 사전 검수에서 세로 리더·9:16 숏폼 배급까지", "From narrative, gaze & 180°-axis QA to scroll reader & 9:16 shortform"),
      caption: t(
        "시간선과 시선 동선·카메라 축을 먼저 검증한 뒤 멀미 없는 세로 스크롤과 말풍선 무손실 9:16 숏폼으로 내보냅니다.",
        "Audits timeline logic, saccade flow and 180° camera axes before driving damped vertical scroll and 9:16 shortform exports.",
      ),
      alt: t(
        "왼쪽 원고 컷·대사 배치가 Bellman-Ford 시간선 검증기와 안구 도약·180° 축 검사기를 통과한 뒤, 오른쪽 위 임계 감쇠 세로 스크롤 리더와 오른쪽 아래 9:16 숏폼 디렉터·120px 썸네일 감사기로 이어집니다.",
        "Episode cuts pass through Bellman-Ford timeline checks and saccade/180°-axis auditors before branching into the critically damped scroll rig and the 9:16 shortform director + 120 px thumbnail auditor.",
      ),
      nodes: [
        { id: "cut", label: t("컷 · 말풍선 배치", "Cuts & balloons"), sub: t("시간 제약 · 카메라 샷", "Timeline & shots"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "nar", label: t("Bellman-Ford 서사", "Narrative solver"), sub: t("시간 역전·부상 연속성", "Cycle & state QA"), tone: "good", at: [1, 0] },
        { id: "gaz", label: t("시선 도약 · 180°축", "Saccade & 180°"), sub: t("역-Z 교차 · 시선 반전", "Reverse-Z & axis"), tone: "warn", at: [1, 2] },
        { id: "scr", label: t("임계 감쇠 스크롤", "ζ=1 scroll rig"), sub: t("4평면 시차 · 모션 저감", "4-plane, a11y safe"), tone: "local", at: [2, 0] },
        { id: "sft", label: t("9:16 숏폼 · 썸네일", "9:16 & 120px QA"), sub: t("말풍선 잘림 0 · 대비", "0 clip & legibility"), tone: "good", at: [2, 2] },
      ],
      edges: [
        { from: "cut", to: "nar", label: t("장면 순서", "Scenes") },
        { from: "cut", to: "gaz", label: t("시선·앵글", "Gaze") },
        { from: "nar", to: "scr", label: t("검증 통과", "Valid") },
        { from: "gaz", to: "sft", label: t("안전 프레이밍", "Safe crop") },
      ],
    },
    usage: [
      {
        feature: t("임계 감쇠 스크롤 시네마 리그 & Bellman-Ford 시간선 연속성 솔버", "Critically damped scroll cinema rig & Bellman-Ford timeline solver"),
        role: t(
          "프레임률 독립적인 해석적 임계 감쇠 카메라 스텝과 회차 간 시간·부상·복장 상태머신 모순 탐지를 수행합니다.",
          "Steps framerate-independent critically damped parallax cameras and detects cross-episode timeline contradictions.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave6-moonshot/spring-scroll-cinema-rig.ts",
          "apps/web/src/domains/creator/wasm64-wave6-moonshot/temporal-narrative-solver.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("안구 도약 · 180° 연출축 검사기 & 9:16 숏폼 디렉터 · 120px 썸네일 감사기", "Saccade & 180°-axis checker, 9:16 shortform director & thumbnail auditor"),
        role: t(
          "말풍선 시선 이동 부하·180° 축 침범 경보와 말풍선 무절단 9:16 홍보 영상 카메라 궤적·소형 썸네일 식별력을 검증합니다.",
          "Audits reading saccades, 180° axis flips, balloon-safe 9:16 Ken-Burns framing and 120 px storefront thumbnails.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave11-apex/saccade-kubelka-homography.ts",
          "apps/web/src/domains/creator/wasm64-wave12-crown/axis180-speedline-balloon-fit.ts",
          "apps/web/src/domains/creator/wasm64-wave21-horizon/shortform-director-thumbnail-auditor.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("프레임 간격(dt) 무관 해석적 임계 감쇠(ζ = 1) 스프링 위치 갱신", "Framerate-independent analytical critically damped (ζ = 1) spring step"),
        language: "ts",
        ...sampleSource([
          ["export function stepCriticallyDamped(pos: number, vel: number, target: number, omega: number, dtSec: number): readonly [number, number] {"],
          ["  const x0 = pos - target;"],
          ["  const expTerm = Math.exp(-omega * dtSec);"],
          ["  const c2 = vel + omega * x0;"],
          ["  const nextPos = target + (x0 + c2 * dtSec) * expTerm;", "오버슈트 진동 없이 최단 시간 수렴", "converges without oscillatory overshoot"],
          ["  const nextVel = (vel - c2 * omega * dtSec) * expTerm;"],
          ["  return [nextPos, nextVel];"],
          ["}"],
        ]),
        explain: t(
          "오일러 수치 적분 대신 닫힌 해(Closed-form) 지수 공식을 쓰므로 60Hz 기기와 120Hz 기기에서 동일한 스크롤 도착 지점을 보장하며, prefers-reduced-motion 켜짐 시 즉시 시차를 끕니다.",
          "Closed-form exponential evaluation guarantees identical trajectories at 60 Hz and 120 Hz while honoring prefers-reduced-motion.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave6-moonshot/spring-scroll-cinema-rig.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "James F. Allen · Maintaining Knowledge about Temporal Intervals",
        url: "https://dl.acm.org/doi/10.1145/182.358434",
        kind: "paper",
        note: t("서사 시간 구간 선후·포함 제약 그래프 모델링의 고전 논문", "Foundational CACM paper on interval-based temporal constraint reasoning"),
      },
      {
        title: "MDN · prefers-reduced-motion Media Feature",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion",
        kind: "docs",
        note: t("전정기관 민감 독자를 위한 스크롤 시차·카메라 모션 감쇠 기준", "Accessibility media query disabling parallax motion when requested"),
      },
    ],
    chapterIds: ["product-intent", "quality"],
    talk: {
      pitch: t(
        "독자의 눈동자가 말풍선을 따라가며 겪는 피로도와 카메라 180° 축 혼란을 미리 잡아 주고, 세로 원고 한 벌에서 말풍선이 하나도 안 잘리는 9:16 티저 카메라까지 자동 설계합니다.",
        "Catches reverse-Z reading fatigue and 180° camera flips upfront while auto-framing 0-clipped-balloon 9:16 teaser videos.",
      ),
      analogy: t(
        "콘티 단계에서 시선 동선과 시간표를 검수하는 연출 조감독과, 세로 만화를 스마트폰 쇼츠 화면비로 깔끔하게 리프레이밍하는 촬영 기사 역할을 겸합니다.",
        "Like pairing a storyboard script supervisor with a short-form camera operator who never clips a speech balloon.",
      ),
      questions: [
        {
          question: t("모바일 스토어 120×120px 썸네일 감사는 어떤 실패를 걸러 내나요?", "What defects does the 120×120 px storefront thumbnail auditor catch?"),
          answer: t(
            "면적 평균(Area-Box) 축소 후 주인공 얼굴 영역의 국소 휘도 대비와 윤곽 에지 밀도가 기준치 밑으로 무너져 목록에서 회색 덩어리로 보이는 표지를 사전에 경고합니다.",
            "After exact area-box downsampling, it flags covers whose focal face contrast or silhouette edge density collapses into an indistinct blur.",
          ),
        },
      ],
    },
    technologies: ["Critically Damped Spring", "Bellman-Ford", "Oculomotor Model", "9:16 Auto-Framing"],
    facts: [
      { value: "ζ = 1.0", label: t("오버슈트 없는 해석적 임계 감쇠 계수", "Overshoot-free critical damping ratio"), source: "apps/web/src/domains/creator/wasm64-wave6-moonshot/spring-scroll-cinema-rig.ts" },
      { value: "1080×1920", label: t("말풍선 무절단 9:16 숏폼 디렉터 목표 해상도", "Balloon-safe 9:16 shortform target frame"), source: "apps/web/src/domains/creator/wasm64-wave21-horizon/shortform-director-thumbnail-auditor.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave24-markov-prefetch-fitts-radial-hud",
    category: "interaction",
    name: "Wave 24 Speculative Markov Prefetch · Fitts Radial HUD & Chord Solver",
    title: t(
      "Wave 24 2차 마르코프 ≤2ms 선행 프리페처 & 피츠 법칙 44px 방사형 HUD · 단축키 최적화",
      "Wave 24 2nd-order Markov <=2 ms prefetcher, Fitts >=44 px radial HUD & chord solver",
    ),
    status: "experimental",
    tagline: t(
      "2차 라플라스 마르코프 전이 예측으로 다음 공정 모듈을 ≤2ms 유휴 시간에 예열하고 Fitts 법칙 ≥44×44px 8분할 HUD를 배치합니다.",
      "Prewarms next-stage modules in <=2 ms idle windows via 2nd-order Markov chains and optimizes >=44×44 px 8-slice Fitts radial menus.",
    ),
    background: [
      t(
        "초기 번들 0B 원칙을 지키기 위해 20여 개 고급 wasm64-* 엔진을 전부 지연 로드하면 첫 도구 전환 순간 미세한 청크 로드 대기가 생길 수 있고, 태블릿 펜 작업 중 화면 구석 작은 아이콘을 찾아 왕복하거나 브라우저 예약 단축키(⌘W·⌘T·⌘R)와 충돌하는 문제도 잦습니다.",
        "Lazy-loading 20+ advanced wasm64-* engines keeps eager bundle impact at 0 B but risks a cold-load pause on stage switches, while tiny corner icons and browser-reserved shortcuts slow down tablet pen workflows.",
      ),
      t(
        "Wave 24 markov-intent-prefetch-orchestrator.ts 는 8대 스튜디오 공정(콘티→3D배경→선화→밑색→명암·톤→식자→프리플라이트→출고) 사이의 작가 작업 이력을 라플라스 평활화 2차→1차 백오프 마르코프 연쇄로 온라인 학습해, 데이터 절약 모드·발열 쓰로틀링이 아닐 때만 ≤2ms 유휴 예산 안에서 다음 모듈을 조용히 예열합니다.",
        "Wave 24 learns 2nd-to-1st-order Laplace-smoothed Markov transitions across the 8 canonical studio stages and prewarms top-k lazy modules inside <=2 ms idle slices while respecting Save-Data and thermal guards.",
      ),
      t(
        "fitts-radial-hud-chord-optimizer.ts 와 single-hand-chord-resolver.ts 는 섀넌-피츠 난이도 지수 ID = log2(1 + D/W) 분기 한정(Branch-and-Bound) 탐색으로 고빈도 도구를 동·서·남·북 1차 축에 배치하고 모든 슬라이스·터치 패드에 ≥44×44px 비겹침 히트 영역과 무충돌 한 손 단축키를 보장합니다(Current: 단위 검증 완료·0B 번들, Target: 스튜디오 펜 파이 메뉴·단축키 편집기 연동).",
        "fitts-radial-hud-chord-optimizer.ts uses Shannon-Fitts ID = log2(1 + D/W) branch-and-bound to assign frequent tools to cardinal slices with >=44×44 px non-overlapping hit boxes and conflict-free single-hand chords (Current: unit-verified; Target: Studio pen pie-menu & shortcut editor).",
      ),
    ],
    keyPoints: [
      t("라플라스 평활화 2차→1차 백오프 마르코프 공정 전이 확률 온라인 학습", "Online Laplace-smoothed 2nd-to-1st-order Markov stage prediction"),
      t("Save-Data · 발열 상태 존중 및 ≤2.0ms 유휴 시간 상한 무간섭 프리페치", "Save-Data & thermal-aware <=2.0 ms idle-budget lazy module prewarm"),
      t("섀넌-피츠 ID = log2(1 + D/W) 분기 한정 8분할 방사형 파이 메뉴 배치", "Shannon-Fitts ID = log2(1 + D/W) branch-and-bound 8-slice pie menu"),
      t("전 슬라이스·모디파이어 패드 ≥44×44px 비겹침 보장 & 예약 단축키 충돌 해소", "Guaranteed >=44×44 px non-overlapping targets & chord conflict solver"),
    ],
    diagram: {
      id: "wave24-markov-prefetch-fitts-radial-hud-diagram",
      kind: "sequence",
      title: t("마르코프 공정 예측 예열과 피츠 법칙 44px 방사형 HUD 상호작용", "Markov idle module prewarming & Fitts 44 px radial HUD interaction"),
      caption: t(
        "펜을 쓰는 동안에는 방사형 44px 메뉴로 손 이동을 줄이고, 유휴 2ms 틈에는 다음에 쓸 지연 모듈을 미리 불러 둡니다.",
        "Minimizes pen travel via >=44 px radial slices during strokes and prewarms predicted lazy modules during <=2 ms idle gaps.",
      ),
      alt: t(
        "작가가 현재 공정에서 펜 작업을 수행하면 피츠 8분할 HUD가 ≥44×44px 비겹침 타깃과 무충돌 한 손 단축키로 즉시 도구를 전환하고, 공정 이력을 받은 2차 마르코프 오케스트레이터가 발열·네트워크 점검 후 ≤2ms 유휴 시간에 다음 wasm64 모듈을 선행 로드합니다.",
        "Author strokes trigger >=44×44 px Fitts 8-slice radial switches and conflict-free chords, while stage transitions feed the 2nd-order Markov orchestrator to prewarm upcoming wasm64 modules within <=2 ms idle windows.",
      ),
      actors: [
        { id: "pen", label: t("작가 펜 · 왼손", "Pen & left hand"), sub: t("공정 전환 · 플릭", "Stage & flick"), tone: "local" },
        { id: "hud", label: t("Fitts 8분할 HUD", "Fitts radial HUD"), sub: t("≥44×44px · 무충돌", ">=44px & chords"), tone: "good" },
        { id: "mkv", label: t("2차 마르코프 예측", "2nd-order Markov"), sub: t("라플라스 평활화", "Laplace backoff"), tone: "ai" },
        { id: "laz", label: t("지연 모듈 로더", "Lazy wasm64 pool"), sub: t("0B 초기 · ≤2ms 예열", "0B eager, <=2ms"), tone: "local" },
      ],
      messages: [
        { from: "pen", to: "hud", label: t("펜 끝 중심 파이 호출 · 한 손 코드 입력", "Invoke cursor pie menu or single-hand chord") },
        { from: "hud", to: "mkv", label: t("확정된 공정 전이 기록 (예: 선화 → 밑색)", "Record stage transition (e.g. ink -> flat)") },
        { from: "mkv", to: "laz", label: t("상위 확률 다음 공정 예열 (발열·절약 정상 시)", "Prewarm top-k next stage if thermal/net safe") },
        { from: "laz", to: "pen", label: t("다음 공정 진입 시 대기 0ms 즉시 활성화", "Instant 0-wait activation on stage switch"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("2차 마르코프 스튜디오 공정 전이 학습 & ≤2ms 유휴 프리페처", "2nd-order Markov workflow transition learner & <=2 ms idle prefetcher"),
        role: t(
          "초기 번들 0B를 유지한 채 작가의 이전 2단계 공정 흐름에서 다음 지연 모듈을 예측하고 안전 조건에서만 선행 로드합니다.",
          "Predicts upcoming lazy wasm64 capabilities from 2-step stage history and prewarms them safely within <=2 ms.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/markov-intent-prefetch-orchestrator.ts",
          "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/wasm64-wave24-master-orchestrator.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("피츠 법칙 8분할 방사형 HUD & 한 손 무충돌 코드 단축키 최적화기", "Fitts-law 8-slice radial HUD & single-hand chord conflict optimizer"),
        role: t(
          "도구 사용 빈도와 방향 편향을 반영해 기대 이동 시간을 줄이고 ≥44×44px 히트 박스 및 OS 예약 단축키 회피를 강제합니다.",
          "Minimizes expected Fitts movement time while enforcing >=44×44 px hit rects and browser-safe single-hand chords.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/fitts-radial-hud-chord-optimizer.ts",
          "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/single-hand-chord-resolver.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("섀넌-피츠 난이도 지수(Shannon Formulation) 및 라플라스 스무딩 확률", "Shannon-Fitts Index of Difficulty & Laplace-smoothed Markov probability"),
        language: "ts",
        ...sampleSource([
          ["export function shannonFittsDifficultyBits(distancePx: number, targetWidthPx: number): number {"],
          ["  return Math.log2(1 + Math.max(0, distancePx) / Math.max(44, targetWidthPx));", "최소 44px 폭 보장으로 난이도 상한 억제", ">=44px width floor caps pointing difficulty"],
          ["}"],
          ["export function laplaceTransitionProb(count: number, rowTotal: number, stateCount: number, alpha = 0.5): number {"],
          ["  return (count + alpha) / (rowTotal + alpha * Math.max(1, stateCount));"],
          ["}"],
        ]),
        explain: t(
          "방사형 링 반경도 8개 44×44px 타깃 상자가 서로 겹치지 않는 최소 안전 반경 이상으로 자동 확장해 펜 탭 오작동을 막습니다.",
          "The radial ring radius auto-expands so all eight >=44×44 px slice hit boxes remain strictly non-overlapping.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/fitts-radial-hud-chord-optimizer.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "I. Scott MacKenzie · Fitts' Law as a Research and Design Tool in HCI",
        url: "https://www.yorku.ca/mack/hci92.html",
        kind: "paper",
        note: t("항상 양수를 보장하는 섀넌 공식 ID = log2(1 + D/W) 정립 논문", "Seminal HCI paper establishing the Shannon ID = log2(1 + D/W) formulation"),
      },
      {
        title: "W3C · WCAG 2.2 Success Criterion 2.5.8 Target Size (Minimum) & 2.5.5 (44×44px)",
        url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html",
        kind: "spec",
        note: t("터치·펜 입력 오조작 방지를 위한 44×44 CSS 픽셀 포인터 타깃 기준", "W3C accessibility guidance for >=44×44 CSS pixel pointer targets"),
      },
    ],
    chapterIds: ["performance", "quality"],
    talk: {
      pitch: t(
        "초기 로딩은 0바이트로 가볍게 유지하면서도 작가가 선화를 마칠 즈음 밑색 엔진을 2밀리초 유휴 틈에 미리 데워 두고, 펜 끝에서 44px 파이 메뉴로 즉시 꺼내 쓰게 합니다.",
        "Keeps initial load at 0 B while prewarming flatting kernels in 2-ms idle gaps as ink wraps up, surfaced via a 44 px cursor pie menu.",
      ),
      analogy: t(
        "집도의의 다음 순서를 기억해 기구를 미리 소독대에 올려 두는 수술실 간호사와, 손목만 까딱하면 닿는 동그란 팔레트를 결합한 작업대입니다.",
        "Like a scrub nurse laying out the next instrument ahead of time paired with an ergonomic thumb-reach palette.",
      ),
      questions: [
        {
          question: t("모바일 테더링이나 배터리 발열 상태에서도 마르코프 프리페처가 백그라운드 로딩을 강행하나요?", "Does the Markov prefetcher still download chunks on metered data or hot devices?"),
          answer: t(
            "아닙니다. saveData 켜짐, 2g/slow-2g 네트워크, 또는 발열 상태(serious/critical)가 감지되면 즉시 프리페치를 건너뛰고 명시적 사유(save-data-enabled, thermal-throttled)를 기록합니다.",
            "No. Save-Data, slow-2g/2g links or serious/critical thermal states immediately suppress prefetching with an explicit skip reason.",
          ),
        },
      ],
    },
    technologies: ["Markov Chain", "Fitts' Law", "WCAG 44×44px", "Lazy Prefetch"],
    facts: [
      { value: "≥ 44×44 px", label: t("8분할 방사형 메뉴 및 왼손 패드 최소 히트 영역", "Minimum radial slice & modifier pad hit rect"), source: "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/fitts-radial-hud-chord-optimizer.ts" },
      { value: "≤ 2.0 ms", label: t("마르코프 지연 모듈 예열 유휴 프레임 시간 상한", "Max idle budget per speculative prefetch tick"), source: "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/markov-intent-prefetch-orchestrator.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
