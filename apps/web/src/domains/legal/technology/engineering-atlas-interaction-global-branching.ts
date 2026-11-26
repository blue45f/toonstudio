import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · interaction · 4대 문화권 현지화·읽기방향 반전(대합 보장) · 내러티브 시선 동선 ·
 * 무-eval 정적 인터랙티브 분기 웹툰 익스포터 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_INTERACTION_GLOBAL_BRANCHING: readonly EngineeringAtlasEntry[] = [
  {
    id: "global-4culture-flipper-branching-webtoon-narrative",
    category: "interaction",
    name: "4-Culture Flipper · Narrative Eye-Flow · No-eval Branching",
    title: t("4대 문화권 반전 대합 · 내러티브 시선 동선 · 무-eval 분기 웹툰", "4-culture involution flipper, narrative eye-flow & no-eval branching"),
    status: "experimental",
    tagline: t(
      "ko↔jp 반전 대합·도량형/통화 환산, 시선 교차·역행 진단, 무-eval 정적 인터랙티브 분기 번들을 로컬 완결합니다.",
      "Combines involution ko↔jp RTL flipping, narrative eye-flow checks and no-eval static branching webtoon bundles.",
    ),
    background: [
      t(
        "한국 세로 웹툰을 일본(RTL·세로쓰기)·북미(LTR·영문 1.38× 텍스트 팽창·야드파운드법·USD)·중화권(CNY·미터법)으로 수출할 때는 말풍선 꼬리 반전 오류, 대사 박스 넘침, 읽기 순서 역행이 반복됩니다. 선택지형 인터랙티브 웹툰 역시 서버 없이 정적 호스팅하려면 막다른 길·무한 루프·eval() 보안 취약점을 출판 전에 차단해야 합니다.",
        "Exporting Korean webtoons across Japan (RTL/vertical), North America (LTR, 1.38× text expansion, imperial units/USD) and Chinese markets breaks balloon tails, overflows boxes and scrambles reading order, while interactive branching episodes risk dead ends, unguarded loops and eval() XSS bugs.",
      ),
      t(
        "auditAndFlipGlobalLocalization(global-localization-flipper.ts)는 4대 문화권 프로파일을 0-토큰 로컬로 변환·검수합니다. ko → jp(RTL) 반전 시 말풍선·꼬리·SFX 좌표를 정확히 대칭 반전하며 역변환 시 f(f(x)) = x 대합(involution)을 만족합니다. ko → en 에서는 KRW→USD 통화와 cm/km/kg/°C→in/mi/lb/°F 도량형을 변환하고 1.38× 텍스트 팽창 오버플로를 탐지하며, en → zh 역환산에서는 영어 전치사 'in' 을 인치(inch)로 오탐하지 않도록 방어합니다.",
        "auditAndFlipGlobalLocalization converts and audits 4 cultural profiles at 0 tokens: ko→jp RTL mirrors balloons, tails and SFX with exact involution (f(f(x))=x), ko→en converts KRW→USD and metric→imperial while flagging 1.38× text overflow, and en→zh reverses units without misreading the preposition 'in' as inches.",
      ),
      t(
        "analyzeNarrativeReadingFlow(narrative-eye-flow-and-license-guardian.ts)는 한국어(LTR)·일본어(RTL 기본 예측) 로케일에 맞춰 말풍선 X자 교차, 상향 시선 역행, TTS 읽기 순서 불일치, 모바일(390×844) 텍스트 과밀을 진단하고 재배치 힌트를 생성합니다.",
        "analyzeNarrativeReadingFlow checks balloon X-crossings, upward reading regressions, TTS order drift and 390×844 mobile text density across LTR and Japanese RTL locales, emitting repositioning hints.",
      ),
      t(
        "InteractiveBranchingWebtoonExporter(interactive-branching-exporter.ts)는 다중 분기·시크릿 컷·다중 엔딩 그래프에서 막다른 길(dead-end), 도달 불가 엔딩·시크릿 컷, 무가드 무한 루프, 조건부 소프트락(CONDITIONAL_DEAD_END)을 정적 검사로 차단한 뒤, eval/new Function 을 전혀 쓰지 않는 AST 조건 평가기 기반 CSP/XSS 안전 정적 HTML/JSON 번들로 컴파일합니다. 현재 구현·실측 완료(Current): 3개 엔진 모두 단위 테스트 통과. 로드맵(Target): 글로벌 수출 검수 패널과 분기 미리보기 플레이어 UI 연결이 예정돼 있습니다.",
        "InteractiveBranchingWebtoonExporter statically rejects dead ends, unreachable endings/secret cuts, unguarded infinite loops and conditional soft-locks, compiling into a CSP/XSS-safe static HTML/JSON bundle powered by a no-eval AST evaluator. Current vs Roadmap: all three engines pass unit tests; export UI and preview player integration are staged.",
      ),
    ],
    keyPoints: [
      t("4대 문화권(ko·jp·en·zh) 반전 대합(f(f(x))=x) & 통화·도량형 환산", "4-culture (ko/jp/en/zh) involution flip & unit/currency audit"),
      t("영문 1.38× 팽창 오버플로 · 전치사 'in' 오탐 방지 · 위안화 식별", "1.38× EN overflow check, preposition 'in' guard & CNY detection"),
      t("내러티브 시선 동선: X자 교차·상향 역행·TTS·일본어 RTL 자동 진단", "Narrative eye-flow: X-crossing, reverse gaze, TTS & ja RTL"),
      t("무-eval 정적 분기 웹툰: 막다른 길·무한 루프·소프트락 사전 차단", "No-eval static branching bundle: blocks dead ends & soft-locks"),
    ],
    diagram: {
      id: "global-4culture-flipper-branching-webtoon-narrative-diagram",
      kind: "sequence",
      title: t("시선 동선 진단 · 4대 문화권 대합 반전 · 무-eval 분기 번들 흐름", "Eye-flow audit, 4-culture involution flip & no-eval branching flow"),
      caption: t(
        "읽기 동선 검수 → 4대 문화권 대칭 반전·단위 환산 → 분기 그래프 소프트락 차단 순으로 정적 번들을 완성합니다.",
        "Checks reading flow, applies involution cultural flips and unit audits, then validates branching graphs into static bundles.",
      ),
      alt: t(
        "작가 원고의 컷·말풍선 그래프가 먼저 내러티브 시선 동선 분석기를 거쳐 X자 교차·역행·TTS 오류를 점검합니다. 다음으로 4대 문화권 현지화 반전기가 ko·jp·en·zh 좌표 대합 반전과 통화·도량형·1.38배 오버플로 검수를 수행하고, 마지막으로 무-eval 분기 익스포터가 막다른 길·무한 루프·소프트락을 차단한 뒤 CSP/XSS 안전 정적 HTML/JSON 번들을 출력합니다.",
        "Cut and balloon graphs pass narrative eye-flow checks (X-crossings, regressions, TTS), undergo 4-culture involution flipping with unit/currency and 1.38× overflow audits, and compile through a no-eval branching validator (blocking dead ends, loops and soft-locks) into a static HTML/JSON bundle.",
      ),
      actors: [
        { id: "src", label: t("원고 그래프", "Episode graph"), sub: t("컷·말풍선·분기 선택", "Cuts, balloons, edges"), tone: "local" },
        { id: "eye", label: t("시선 동선 분석", "Eye-flow QA"), sub: t("교차·역행·ja RTL", "Cross, back, ja RTL"), tone: "good" },
        { id: "loc", label: t("4대 문화권 반전", "4-culture flip"), sub: t("대합·단위·1.38×", "Involution, units"), tone: "good" },
        { id: "br", label: t("무-eval 분기 번들", "No-eval bundle"), sub: t("소프트락 차단·HTML", "No soft-lock, HTML"), tone: "edge" },
      ],
      messages: [
        { from: "src", to: "eye", label: t("컷·말풍선 좌표 및 로케일 전달", "Submit cut/balloon geometry & locale") },
        { from: "eye", to: "loc", label: t("교차·역행·TTS 통과 및 힌트 반영", "Pass gaze/TTS checks with hints") },
        { from: "loc", to: "br", label: t("ko·jp·en·zh 대합 반전 & 단위 환산", "Apply involution flip & unit rules") },
        { from: "br", to: "src", label: t("CSP/XSS 안전 정적 HTML+JSON 출력", "Emit CSP-safe static HTML + JSON"), style: "dashed", note: t("eval 0 · ₩0 호스팅", "0 eval, ₩0 hosting") },
      ],
    },
    usage: [
      {
        feature: t("4대 문화권 현지화 QA & 읽기 방향 대합 반전기", "4-culture localization QA & involution reading-direction flipper"),
        role: t(
          "ko·jp·en·zh 좌표 대칭 반전(대합 보장), 통화·도량형 환산, 1.38× 영문 팽창 오버플로 및 패널 경계 이탈을 검수합니다.",
          "Mirrors panels/balloons/SFX with exact involution, converts currencies/units and flags 1.38× overflow and out-of-bounds tails.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/global-localization-flipper.ts",
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/localization-rules-and-units.ts",
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/wasm64-supergap-global-ip-branch.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("무-eval 정적 인터랙티브 분기 웹툰 익스포터 & 내러티브 시선 동선", "No-eval static branching webtoon exporter & narrative eye-flow"),
        role: t(
          "막다른 길·도달 불가 엔딩·무가드 루프·조건부 소프트락을 차단한 무-eval HTML/JS 번들과 다국어 시선 동선 진단을 제공합니다.",
          "Blocks dead ends, unguarded loops and conditional soft-locks in no-eval static HTML/JSON bundles alongside gaze-flow diagnostics.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/interactive-branching-exporter.ts",
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/branching-condition-and-runtime.ts",
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/narrative-eye-flow-and-license-guardian.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("패널 X좌표 반전 대합(f(f(x)) = x)과 무-eval 분기 조건 비교", "Panel mirror involution (f(f(x)) = x) & no-eval branch check"),
        language: "ts",
        ...sampleSource([
          ["export interface Rect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }"],
          [""],
          ["export function flipRectHorizontal(rect: Rect2D, panelWidth: number): Rect2D {"],
          ["  return { ...rect, x: panelWidth - (rect.x + rect.width) };", "두 번 적용하면 원좌표 복원(대합)", "applying twice restores exact rect"],
          ["}"],
          [""],
          ["export function evalSafeNumericGuard(flags: Readonly<Record<string, number>>, key: string, minValue: number): boolean {"],
          ["  return (flags[key] ?? 0) >= minValue;", "eval() 없이 AST 연산자로만 평가", "AST comparison without eval()"],
          ["}"],
        ]),
        explain: t(
          "실제 InteractiveBranchingWebtoonExporter 는 재귀 하강 조건 AST 파서(parseBranchCondition)로 비교·논리식을 평가해 CSP unsafe-eval 없이 정적 페이지로 바로 배포할 수 있습니다.",
          "InteractiveBranchingWebtoonExporter parses conditions into an AST (parseBranchCondition) so exported branching episodes run cleanly under strict CSP without unsafe-eval.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/branching-condition-and-runtime.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · Content Security Policy Level 3 (Blocking unsafe-eval)",
        url: "https://www.w3.org/TR/CSP3/#unsafe-eval-usage",
        kind: "spec",
        note: t("정적 분기 웹툰 번들이 eval() 을 배제하고 엄격한 CSP 를 지키는 표준 기준", "W3C CSP3 standard met by eliminating eval() in exported branching bundles"),
      },
      {
        title: "Unicode · UAX #9 Bidirectional Algorithm & East Asian Layout",
        url: "https://unicode.org/reports/tr9/",
        kind: "spec",
        note: t("다국어 읽기 방향 전환과 텍스트 배치 검증 참고 표준", "Unicode bidirectional reference for cross-culture reading flows"),
      },
    ],
    chapterIds: ["on-device-translation", "share-distribution-boundary", "quality"],
    talk: {
      pitch: t(
        "4대 문화권(한국·일본·북미·중화권) 읽기 방향 반전과 통화·도량형 환산을 오차 없는 대합(f(f(x))=x)으로 자동 검수하고, 내러티브 시선 동선 진단과 막다른 길·소프트락·eval() 을 모두 막는 정적 인터랙티브 분기 웹툰 번들을 ₩0 로컬로 완성했습니다.",
        "Four-culture localization with exact involution flipping and unit/currency conversion, narrative eye-flow diagnostics and a no-eval static branching webtoon exporter blocking soft-locks all run locally at ₩0.",
      ),
      analogy: t(
        "거울에 두 번 비추면 원래 글과 그림 자리로 정확히 돌아오는 번역 검수판(대합 반전)과, 독자가 절대 막다른 골목에 갇히지 않게 미로 출구를 미리 검증해 주는 게임북 편집기입니다.",
        "Like a translation mirror that folds back identically every time, paired with a gamebook maze checker that proves no reader can ever hit a dead end.",
      ),
      questions: [
        {
          question: t("4대 문화권 반전기가 대사 번역까지 자동으로 해 주나요?", "Does the 4-culture flipper automatically translate dialogue text?"),
          answer: t(
            "아닙니다. 기하 반전(말풍선·꼬리·SFX 대합), 통화·도량형 환산, 영문 1.38× 팽창 오버플로·경계 이탈 검수를 0-토큰으로 수행하며, 실제 문학 번역은 작가나 별도 번역 경로가 맡습니다.",
            "No—it handles geometric involution flipping, currency/unit conversions and 1.38× overflow QA at 0 tokens while leaving literary translation to authors or dedicated translators.",
          ),
        },
        {
          question: t("분기 웹툰에 반복 방문 가능한 루프(예: 상점 재방문)는 항상 막히나요?", "Are legitimate revisitable loops (like a shop cut) rejected?"),
          answer: t(
            "탈출 조건이 없는 무한 무가드 루프와 조건부 소프트락만 차단하고, 상태 가드가 있어 종료 경로로 빠져나갈 수 있는 유한 가드 루프는 허용하도록 테스트로 검증했습니다.",
            "Tests verify that only unguarded infinite loops and conditional soft-locks are blocked, while finite guarded loops with reachable exits pass.",
          ),
        },
      ],
      pitfall: t(
        "문화권 금기·관용 표현 규칙과 환율 테이블(DEFAULT_USD_EXCHANGE_RATES)은 고정 로컬 기준선이므로 실제 해외 런칭 시에는 최신 환율과 현지 네이티브 검수를 병행해야 합니다.",
        "Cultural keyword rules and static exchange rates serve as offline baselines; commercial foreign launches still need live rates and native editorial review.",
      ),
    },
    technologies: ["4-Culture Involution", "Eye-Flow QA", "No-eval AST", "Static HTML Bundle"],
    facts: [
      {
        value: "ko · jp · en · zh (f(f)=id)",
        label: t("4대 문화권 반전 대합 · 1.38× 팽창 탐지 · 통화/도량형 자동 환산", "4-culture involution flip, 1.38× overflow & unit/currency audit"),
        source: "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/global-localization-flipper.ts",
      },
      {
        value: "0 eval() · 0 Soft-Lock",
        label: t("막다른 길·무가드 루프·소프트락 사전 차단 및 CSP 안전 정적 번들", "Static dead-end/loop/soft-lock validator & CSP-safe HTML bundle"),
        source: "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/interactive-branching-exporter.ts",
      },
      {
        value: "LTR + ja RTL Eye-Flow",
        label: t("X자 말풍선 교차 · 상향 역행 · TTS 순서 · 390×844 모바일 밀도 진단", "Balloon X-crossing, upward gaze, TTS & 390×844 mobile density QA"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/narrative-eye-flow-and-license-guardian.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
