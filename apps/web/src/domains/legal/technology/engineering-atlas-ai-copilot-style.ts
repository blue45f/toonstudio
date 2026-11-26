import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai · 0-토큰 온디바이스 작가 메모리 코파일럿 RAG · 화풍 프로파일러 · 1줄 시맨틱 씬 합성 &
 * OKLCH 연속성 Diff · 모바일 이탈 히트맵 · 양방향 대사 시트 · 120화 모순 그래프 DB 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_AI_COPILOT_STYLE: readonly EngineeringAtlasEntry[] = [
  {
    id: "ondevice-creative-copilot-rag-style-profiler",
    category: "ai",
    name: "0-Token Copilot RAG · Style Profiler · 1-Line Scene",
    title: t("로컬 코파일럿 RAG · 0-토큰 화풍 프로파일러 · 1줄 씬 합성", "Local copilot RAG, zero-token style profiler & 1-line scene"),
    status: "experimental",
    tagline: t(
      "30화 150컷 로컬 RAG 1.222ms, 0-토큰 화풍 프로파일러, 1줄 3D 씬 합성 0.09ms 를 모두 로컬로 구현했습니다.",
      "Runs 30-ep/150-cut local RAG in 1.222 ms, zero-token style profiling and 1-line 3D scene composition in 0.09 ms.",
    ),
    background: [
      t(
        "장기 연재 작가가 이전 회차 설정을 찾거나 컷 구도를 잡을 때마다 클라우드 LLM 에 전체 원고를 올리면 토큰 비용과 미공개 원고 유출 위험이 커집니다. ToonStudio 는 반복 기억·화풍·구도 조립을 브라우저 안 결정론적 검색·통계·규칙 커널로 내려 클라우드 토큰 0개로 끝냅니다.",
        "Uploading entire back-catalogs to cloud LLMs for lore recall, style matching or layout drafts burns tokens and exposes unpublished scripts. ToonStudio pushes memory recall, style profiling and 1-line staging into deterministic browser kernels at zero cloud tokens.",
      ),
      t(
        "OnDeviceCreativeCopilot(ondevice-creative-copilot-rag.ts)은 회차·캐릭터·채색 규칙을 증분 색인해 BM25 와 256차원 해시 임베딩 코사인 유사도를 결합합니다. 30화 150컷 실측에서 1.222ms 만에 6개 제작 단계별 출처 인용 한국어 제안을 반환했고, 브라우저가 지원하면 Chrome Built-in AI / WebLLM 로컬 어댑터를 선택적으로 연결합니다.",
        "OnDeviceCreativeCopilot incrementally indexes episodes, characters and coloring rules, combining BM25 with 256D cosine similarity. On a 30-episode, 150-cut benchmark it returns cited suggestions across 6 workflow stages in 1.222 ms at 0 tokens, with optional Chrome Built-in AI / WebLLM hooks.",
      ),
      t(
        "ArtistStyleProfiler(artist-style-profiler.ts)는 작가 캔버스 픽셀과 획에서 선 굵기 분포, OKLCH 대표 팔레트, 명암 대비 곡선, 스크린톤 밀도를 추출해 0-토큰 컷 프리셋을 만듭니다. composeSemanticSceneOffline(mesh-topology-healer-and-semantic-scene.ts)은 한국어·영어 한 줄 지시문을 0.09ms 만에 구조화된 3D 스테이지·조명·카메라·에셋 목록으로 변환합니다.",
        "ArtistStyleProfiler extracts stroke widths, OKLCH palettes, contrast curves and screentone density directly from drawings without tokens. composeSemanticSceneOffline parses Korean or English 1-line prompts into structured 3D stages, lights, cameras and assets in 0.09 ms.",
      ),
      t(
        "현재 구현·실측 완료(Current)와 확장 로드맵(Target): 3개 커널 모두 단위 테스트와 지연 로드 진입점(0B 초기 번들 영향) 검증을 마쳤습니다. 스튜디오 우측 보조 패널과 3D 씬 생성 바에 기본 UI 로 연결하는 작업은 사용자 피드백 루프를 거쳐 단계적으로 통합합니다.",
        "Current vs Roadmap: all three zero-token kernels pass unit tests and lazy-only bundle checks (0 B eager impact). Surfacing them inside the main studio inspector and 3D prompt bar proceeds in staged UI releases.",
      ),
    ],
    keyPoints: [
      t("30화 150컷 로컬 코파일럿 RAG: 1.222ms · 6단계 출처 인용 · 0토큰", "30-ep 150-cut local RAG: 1.222 ms, 6 stages, 0 tokens"),
      t("0-토큰 화풍 프로파일러: 선 굵기·OKLCH 팔레트·명암·스크린톤", "0-token style profiler: line weight, OKLCH, contrast, tone"),
      t("1줄 한/영 시맨틱 3D 씬 오프라인 합성: 0.09ms · AI 토큰 0", "1-line KO/EN semantic 3D scene composer: 0.09 ms, 0 tokens"),
      t("선택적 Chrome Built-in AI / WebLLM 로컬 어댑터 및 안전한 폴백", "Optional Chrome Built-in AI / WebLLM hook with safe fallback"),
    ],
    diagram: {
      id: "ondevice-creative-copilot-rag-style-profiler-diagram",
      kind: "sequence",
      title: t("0-토큰 로컬 코파일럿 RAG · 화풍 · 1줄 씬 합성 흐름", "Zero-token local copilot RAG, style & 1-line scene flow"),
      caption: t(
        "작가 메모리·화풍·한 줄 지시를 외부 API 없이 브라우저 안에서 1~2ms 안에 구조화된 제안으로 돌려줍니다.",
        "Memory recall, style profiling and 1-line staging resolve inside the browser in ~1 ms with zero remote API calls.",
      ),
      alt: t(
        "작가가 질의나 한 줄 씬 프롬프트, 또는 원고 샘플을 넘기면 로컬 코파일럿 RAG 가 30화 150컷 색인을 BM25+256차원 코사인으로 1.222ms 만에 검색하고, 화풍 프로파일러가 OKLCH 팔레트와 선 굵기를 뽑으며, 시맨틱 씬 컴포저가 0.09ms 만에 3D 스테이지·카메라·조명 설계를 돌려줍니다.",
        "When the artist supplies a query, 1-line scene prompt or canvas sample, the local RAG searches 30 episodes / 150 cuts via BM25+256D cosine in 1.222 ms, the style profiler extracts OKLCH palettes and line stats, and the semantic composer emits a 3D stage, camera and light plan in 0.09 ms.",
      ),
      actors: [
        { id: "artist", label: t("작가 입력", "Artist input"), sub: t("질의·원고·1줄 프롬프트", "Query, art, 1-line"), tone: "local" },
        { id: "rag", label: t("로컬 RAG 색인", "Local RAG"), sub: t("BM25+256D · 1.222ms", "BM25+256D, 1.222 ms"), tone: "good" },
        { id: "style", label: t("화풍 프로파일러", "Style profiler"), sub: t("선·OKLCH·톤 추출", "Line, OKLCH, tone"), tone: "good" },
        { id: "scene", label: t("1줄 씬 컴포저", "1-line scene"), sub: t("3D 스테이지 · 0.09ms", "3D stage, 0.09 ms"), tone: "ai" },
      ],
      messages: [
        { from: "artist", to: "rag", label: t("30화 150컷 설정·채색 질의", "Query 30-ep / 150-cut memory") },
        { from: "rag", to: "artist", label: t("6단계 출처 인용 제안 반환", "Return 6-stage cited advice"), style: "dashed", note: t("토큰 0 · 1.222ms", "0 tokens, 1.222 ms") },
        { from: "artist", to: "style", label: t("기존 컷 픽셀·획 화풍 분석", "Profile cut strokes & colors") },
        { from: "style", to: "artist", label: t("브러시·OKLCH·조명 프리셋", "Emit brush/OKLCH/light preset"), style: "dashed" },
        { from: "artist", to: "scene", label: t("한/영 1줄 씬 지시문 전달", "Send KO/EN 1-line scene prompt") },
        { from: "scene", to: "artist", label: t("3D 스테이지·조명·카메라 출력", "Return 3D stage/light/camera"), style: "dashed", note: t("오프라인 0.09ms", "offline 0.09 ms") },
      ],
    },
    usage: [
      {
        feature: t("온디바이스 0-토큰 크리에이티브 코파일럿 RAG", "On-device zero-token creative copilot RAG"),
        role: t(
          "BM25 + 256차원 코사인 하이브리드 검색으로 이전 회차·인물·채색 규칙을 인용해 6단계 창작 제안을 생성합니다.",
          "Fuses BM25 and 256D cosine search over past episodes, characters and color rules for 6-stage cited advice.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/ondevice-creative-copilot-rag.ts",
          "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/wasm64-multipass-copilot-ledger.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("제로-토큰 화풍 프로파일러 & 1줄 시맨틱 3D 씬 컴포저", "Zero-token artist style profiler & 1-line semantic 3D composer"),
        role: t(
          "선 굵기·OKLCH 팔레트·명암·스크린톤 화풍 추출과 한/영 1줄 프롬프트의 오프라인 3D 씬 조립을 수행합니다.",
          "Extracts line/OKLCH/contrast/screentone profiles and parses KO/EN 1-line prompts into offline 3D scene specs.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/artist-style-profiler.ts",
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer-and-semantic-scene.ts",
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/wasm64-creator-defense-healer.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("BM25 + 256차원 코사인 하이브리드 점수 융합", "BM25 + 256D cosine hybrid rank fusion"),
        language: "ts",
        ...sampleSource([
          ["export interface HybridDocScore { readonly docId: string; readonly bm25: number; readonly cosine: number; }"],
          [""],
          ["export function rankHybridRecall(docs: readonly HybridDocScore[], bm25Weight = 0.55): readonly HybridDocScore[] {"],
          ["  const maxBm25 = Math.max(1e-6, ...docs.map((item) => item.bm25));"],
          ["  const score = (item: HybridDocScore): number =>"],
          ["    bm25Weight * (item.bm25 / maxBm25) + (1 - bm25Weight) * Math.max(0, item.cosine);", "정규화 BM25 + 코사인 결합", "blend normalized BM25 & cosine"],
          ["  return [...docs].sort((a, b) => score(b) - score(a));"],
          ["}"],
        ]),
        explain: t(
          "실제 OnDeviceCreativeCopilot 은 한국어·영어 토큰화와 256차원 부호 해시 임베딩을 결합해 30화 150컷 메모리에서 1.222ms 만에 출처가 붙은 제안을 뽑습니다.",
          "OnDeviceCreativeCopilot combines bilingual tokenization and 256D signed-hash embeddings to return cited suggestions from 30 episodes / 150 cuts in 1.222 ms.",
        ),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/ondevice-creative-copilot-rag.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Chrome for Developers · Built-in AI APIs (Prompt API)",
        url: "https://developer.chrome.com/docs/ai/built-in",
        kind: "docs",
        note: t("선택적 온디바이스 언어 모델 연동을 위한 Chrome Built-in AI 훅 기준", "Reference for optional local Chrome Built-in AI adapter integration"),
      },
      {
        title: "CSS Color Module Level 4 · OKLCH Perceptual Color Space",
        url: "https://www.w3.org/TR/css-color-4/#ok-lab",
        kind: "spec",
        note: t("화풍 프로파일러가 대표 팔레트·조화를 분류하는 지각 균등 색공간", "Perceptually uniform color space used by the artist style profiler"),
      },
    ],
    chapterIds: ["on-device-inference", "free-ai-routing", "ai-routing"],
    talk: {
      pitch: t(
        "30화 150컷을 1.222ms 만에 0-토큰 검색하는 로컬 코파일럿 RAG, 선 굵기·OKLCH·스크린톤 화풍 프로파일러, 한 줄 문장을 0.09ms 만에 3D 스테이지로 바꾸는 오프라인 시맨틱 씬 컴포저로 클라우드 AI 의존을 크게 덜었습니다.",
        "A 1.222 ms local copilot RAG over 30 episodes / 150 cuts, a zero-token style profiler and a 0.09 ms offline 1-line 3D scene composer offload routine creative memory and staging from cloud LLMs.",
      ),
      analogy: t(
        "매번 외부 자문에게 묻지 않고, 내 작품 설정집 색인 카드(RAG)·물감 팔레트 노트(화풍 프로파일러)·무대 배치 사전(1줄 씬 컴포저)을 책상 서랍에서 1ms 만에 꺼내 쓰는 방식입니다.",
        "Like pulling your own indexed lore cards, palette swatch book and stage dictionary from a desk drawer in 1 ms instead of phoning an outside consultant.",
      ),
      questions: [
        {
          question: t("로컬 코파일럿 RAG 는 대형 LLM 을 대체하나요?", "Does the local copilot RAG replace a large LLM?"),
          answer: t(
            "아닙니다. 이전 회차 사실·캐릭터·채색 규칙을 0-토큰으로 정확히 인용하는 기억 계층이며, 자유로운 문장 생성이 필요할 때만 Chrome Built-in AI 나 승인된 무료 LLM 풀로 넘깁니다.",
            "No—it is a zero-token factual recall layer for prior episodes and color rules; open-ended drafting still routes optionally to Chrome Built-in AI or approved pools.",
          ),
        },
        {
          question: t("1줄 시맨틱 씬 컴포저는 어휘 밖 표현이 들어오면 어떻게 처리하나요?", "How does the 1-line scene composer handle unseen phrasing?"),
          answer: t(
            "사전에 정의된 스테이지·시간대·날씨·샷 스케일·카메라 앵글 규칙을 결정론적으로 매핑하고, 미지정 항목은 기본 안전 구도로 채워 0.09ms 안에 수정 가능한 씬 골격을 내놓습니다.",
            "It deterministically maps known stage, time, weather, shot-scale and camera cues while filling unspecified slots with safe editable defaults in 0.09 ms.",
          ),
        },
      ],
      pitfall: t(
        "해시 기반 256차원 임베딩과 사전 규칙은 빠르고 투명하지만, 미묘한 문맥 은유나 긴 자유 서사 생성에는 한계가 있으므로 제안 결과는 작가가 검토 후 선택해야 합니다.",
        "Hashed 256D embeddings and rule lexicons are fast and deterministic, not substitutes for deep literary reasoning; artists always review proposals before applying.",
      ),
    },
    technologies: ["BM25", "256D Cosine", "OKLCH", "Chrome Built-in AI"],
    facts: [
      {
        value: "1.222 ms (0 tokens)",
        label: t("30화 150컷 로컬 코파일럿 RAG 6단계 검색 실측", "30-ep / 150-cut local copilot RAG 6-stage recall"),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/ondevice-creative-copilot-rag.ts",
      },
      {
        value: "0.09 ms (0 tokens)",
        label: t("한/영 1줄 프롬프트 오프라인 3D 시맨틱 씬 합성 실측", "Offline KO/EN 1-line semantic 3D scene composition"),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/mesh-topology-healer-and-semantic-scene.ts",
      },
      {
        value: "OKLCH + Stroke Stats",
        label: t("0-토큰 작가 화풍 프로파일러(선·팔레트·명암·스크린톤)", "Zero-token artist style profiler (line, OKLCH, contrast, tone)"),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/artist-style-profiler.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "zero-token-continuity-diff-retention-plot-graph",
    category: "ai",
    name: "OKLCH Continuity · Retention Heatmap · 120-Ep Plot Graph",
    title: t("OKLCH 연속성 Diff · 이탈 히트맵 · 대사 시트 · 120화 모순 감사", "OKLCH continuity diff, retention heatmap, dialogue sheet & 120-ep graph"),
    status: "experimental",
    tagline: t(
      "OKLCH 작붕·클립보드 C2PA 가드, 40컷 이탈 히트맵 2ms, 64컷 대사 시트 7ms, 120화 모순 감사 2ms 를 구현했습니다.",
      "Zero-token OKLCH diff & C2PA clipboard guard, 2 ms retention heatmap, 7 ms dialogue binder and 2 ms 120-ep plot audit.",
    ),
    background: [
      t(
        "주간 마감 직전 웹툰에서 가장 뼈아픈 사고는 캐릭터 머리색·소품 비율이 컷마다 달라지는 작붕, 저작권 제한 참고 이미지가 원고에 섞이는 클립보드 사고, 초반 10초 모바일 가독성 하락, 100화 넘게 쌓인 복선·인물 생사 모순입니다.",
        "Right before weekly deadlines, costly mistakes include character color/proportion drift across cuts, unlicensed reference pastes, weak first-10-second mobile pacing, and plot contradictions across 100+ episodes.",
      ),
      t(
        "wasm64-publish-continuity-resilience 의 continuity-diff-and-clipboard-guard.ts 는 OKLCH 왕복 색차(ΔE)와 영역 비율 비교로 0-토큰 캐릭터 연속성 이탈 핀과 원클릭 보정 델타를 만들고, PNG·JPEG·WebP 바이너리 헤더에서 XMP·EXIF·C2PA·DoNotTrain·상업 제한 메타데이터를 파싱해 붙여넣기 직전에 차단합니다.",
        "continuity-diff-and-clipboard-guard.ts computes OKLCH ΔE and region-ratio drift pins with one-click correction deltas at 0 tokens, and inspects PNG, JPEG and WebP headers for XMP, EXIF, C2PA, DoNotTrain and commercial flags before paste.",
      ),
      t(
        "wasm64-supergap-motion-audio 의 Pillar C(#10·#11·#13)는 연재 편집·리텐션 QA 를 밀리초 단위로 앞당깁니다. ① mobile-retention-heatmap.ts 는 390×844·360×800 모바일 뷰포트에서 40컷 대사 과부하·빈 여백 지루함·시선 역행·10초 훅을 2ms 만에 분석합니다(극적 정적 여백은 예외 처리). ② dialogue-spreadsheet-binder.ts 는 64컷 128말풍선의 다국어 리플로우·보이스 큐·결정론적 Undo/Redo·TSV 를 7ms 안에 양방향 동기화합니다.",
        "Pillar C (#10, #11, #13) accelerates editorial QA to milliseconds: mobile-retention-heatmap.ts analyzes 40 cuts on 390×844 and 360×800 mobile viewports in 2 ms (respecting dramatic pauses), and dialogue-spreadsheet-binder.ts bidirectionally syncs 64 cuts / 128 balloons with CJK/EN reflow, voice cues, undo/redo and TSV in 7 ms.",
      ),
      t(
        "③ EpisodeContinuityGraphDb(retention-heatmap-spreadsheet-plotgraph.ts)는 120화 장기 연재의 인물 생사·소품 소유권·관계 그래프 BFS·체호프의 총 복선 회수 누락을 2ms 만에 감사한다. 현재 구현·실측 완료(Current): 4개 엔진 모두 0-토큰 단위 테스트 검증을 마쳤습니다. 로드맵(Target): 편집기 컷 검수 탭과 대사 테이블 패널 통합은 단계적으로 진행합니다.",
        "EpisodeContinuityGraphDb audits 120-episode character statuses, prop ownership, BFS relationship graphs and unclosed Chekhov's guns in 2 ms. Current vs Roadmap: all four engines pass zero-token tests; wiring them into the editor's review and script panels is phased.",
      ),
    ],
    keyPoints: [
      t("OKLCH 연속성 Diff · 원클릭 보정 & PNG/JPEG/WebP C2PA 가드", "OKLCH continuity diff, 1-click fix & C2PA clipboard guard"),
      t("40컷 모바일(390×844·360×800) 이탈 히트맵 분석: 2ms · 0토큰", "40-cut mobile retention heatmap: 2 ms, 0 tokens"),
      t("64컷 128말풍선 양방향 대사 스프레드시트 & 리플로우: 7ms", "64-cut 128-balloon bidirectional dialogue binder: 7 ms"),
      t("120화 인물·관계·소품·복선 모순 그래프 감사 DB: 2ms", "120-ep character, prop & foreshadowing audit graph: 2 ms"),
    ],
    diagram: {
      id: "zero-token-continuity-diff-retention-plot-graph-diagram",
      kind: "layers",
      title: t("출판 전 0-토큰 연속성 · 리텐션 · 대사 · 장기 연재 감사 4층", "Four zero-token pre-publish continuity, retention & plot layers"),
      caption: t(
        "붙여넣기 출처 검사부터 컷 작붕, 10초 모바일 리텐션, 64컷 대사표, 120화 복선 그래프까지 토큰 0으로 점검합니다.",
        "Guards paste provenance, cut color drift, 10-second mobile retention, 64-cut dialogue sync and 120-episode plot graphs at 0 tokens.",
      ),
      alt: t(
        "1층은 OKLCH 캐릭터 연속성 Diff 와 PNG·JPEG·WebP 클립보드 C2PA/DoNotTrain 가드, 2층은 40컷 모바일 이탈 히트맵(2ms), 3층은 64컷 128말풍선 양방향 대사 스프레드시트(7ms), 4층은 120화 인물·소품·복선 모순 감사 그래프 DB(2ms)로 구성된 4단계 사전 검수 계층입니다.",
        "Four pre-publish QA layers: (1) OKLCH character continuity diff and PNG/JPEG/WebP C2PA clipboard guard, (2) 40-cut mobile retention heatmap in 2 ms, (3) 64-cut 128-balloon bidirectional dialogue sheet in 7 ms, and (4) 120-episode character/prop/foreshadowing audit graph in 2 ms.",
      ),
      layers: [
        {
          id: "oklch",
          label: t("1. OKLCH 연속성 & 클립보드 가드", "1. OKLCH diff & clipboard guard"),
          sub: t("색차 ΔE·비율 이탈 핀 + PNG/JPEG/WebP C2PA·DoNotTrain 차단", "ΔE/ratio drift pins + PNG/JPEG/WebP C2PA/DoNotTrain block"),
          tone: "warn",
          chips: ["OKLCH ΔE", "XMP/EXIF", "C2PA"],
        },
        {
          id: "heatmap",
          label: t("2. 40컷 모바일 이탈 히트맵", "2. 40-cut retention heatmap"),
          sub: t("390×844·360×800 대사 과밀·여백·역행·10초 훅(2ms)", "390×844 / 360×800 text load, pacing & 10s hook (2 ms)"),
          tone: "local",
          chips: ["2 ms", "390×844", "Dramatic Pause"],
        },
        {
          id: "sheet",
          label: t("3. 64컷 양방향 대사 시트", "3. 64-cut dialogue binder"),
          sub: t("128말풍선 배치 편집·CJK/EN 리플로우·보이스 큐·TSV(7ms)", "128 balloons, CJK/EN reflow, voice cues & TSV (7 ms)"),
          tone: "good",
          chips: ["7 ms", "Undo/Redo", "TSV Sync"],
        },
        {
          id: "plot",
          label: t("4. 120화 인물·복선 그래프 DB", "4. 120-ep continuity graph DB"),
          sub: t("인물 생사·소품 소유권·관계 BFS·복선 회수 누락 감사(2ms)", "Status, prop ownership, BFS graph & foreshadow audit (2 ms)"),
          tone: "ai",
          chips: ["2 ms", "120 Episodes", "BFS Graph"],
        },
      ],
      brackets: [
        { label: t("전 구간 AI 토큰 0 · ₩0 로컬 QA", "0 AI tokens · ₩0 local QA"), layerIds: ["oklch", "heatmap", "sheet", "plot"] },
      ],
    },
    usage: [
      {
        feature: t("OKLCH 캐릭터 연속성 Diff & 클립보드 출처·C2PA 가드", "OKLCH continuity diff & clipboard provenance/C2PA guard"),
        role: t(
          "캐릭터 시트 기준 OKLCH 색차·비율 이탈을 감지하고, 붙여넣기 바이너리의 XMP·EXIF·C2PA·DoNotTrain 제한을 사전 차단합니다.",
          "Flags OKLCH color and proportion drift against reference sheets and blocks restricted XMP/EXIF/C2PA clipboard pastes.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/continuity-diff-and-clipboard-guard.ts",
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/clipboard-provenance-parser.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("40컷 이탈 히트맵 · 64컷 대사 시트 · 120화 모순 감사 그래프", "40-cut retention heatmap, 64-cut dialogue sheet & 120-ep graph"),
        role: t(
          "모바일 엄지 스크롤 리듬·10초 훅 분석, 캔버스↔대사표 양방향 동기화, 120화 인물·복선·소품 모순 감사를 수행합니다.",
          "Analyzes mobile thumb-scroll rhythm, syncs canvas balloons with dialogue tables, and audits 120-episode lore graphs.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/mobile-retention-heatmap.ts",
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/dialogue-spreadsheet-binder.ts",
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/retention-heatmap-spreadsheet-plotgraph.ts",
          "apps/web/src/domains/creator/wasm64-supergap-motion-audio/wasm64-supergap-motion-audio.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("OKLCH 유클리드 색차(ΔE)와 연속성 경보 판정", "OKLCH ΔE drift distance & continuity alert severity"),
        language: "ts",
        ...sampleSource([
          ["export interface Oklch { readonly l: number; readonly c: number; readonly hDeg: number; }"],
          [""],
          ["export function oklchDriftSeverity(ref: Oklch, cut: Oklch): \"ok\" | \"warn\" | \"drift\" {"],
          ["  const rRad = (ref.hDeg * Math.PI) / 180;"],
          ["  const cRad = (cut.hDeg * Math.PI) / 180;"],
          ["  const dl = cut.l - ref.l;"],
          ["  const da = cut.c * Math.cos(cRad) - ref.c * Math.cos(rRad);", "OKLab 직교 좌표 변환", "convert to OKLab a/b"],
          ["  const db = cut.c * Math.sin(cRad) - ref.c * Math.sin(rRad);"],
          ["  const deltaE = Math.hypot(dl, da, db);"],
          ["  if (deltaE >= 0.08) return \"drift\";"],
          ["  return deltaE >= 0.035 ? \"warn\" : \"ok\";"],
          ["}"],
        ]),
        explain: t(
          "실제 analyzeCharacterContinuityDrift 는 조명 톤을 고려한 영역별 OKLCH 시그니처를 비교해 캔버스 경고 핀과 원클릭 색 보정 델타를 함께 돌려줍니다.",
          "The full analyzeCharacterContinuityDrift compares per-region OKLCH signatures and emits canvas warning pins alongside one-click correction deltas.",
        ),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/continuity-diff-and-clipboard-guard.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "C2PA · Content Credentials Technical Specification",
        url: "https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html",
        kind: "spec",
        note: t("클립보드 출처·AI 학습 거부(DoNotTrain)·편집 이력 메타데이터 표준", "Content Credentials specification for provenance and DoNotTrain checks"),
      },
      {
        title: "W3C · CSS Writing Modes Level 4 (CJK Vertical Text)",
        url: "https://www.w3.org/TR/css-writing-modes-4/",
        kind: "spec",
        note: t("양방향 대사 시트의 CJK 세로쓰기·영문 줄바꿈 리플로우 계산 기준", "Standard vertical writing modes used by dialogue balloon reflow"),
      },
    ],
    chapterIds: ["on-device-inference", "quality", "licenses"],
    talk: {
      pitch: t(
        "OKLCH 연속성 Diff·클립보드 C2PA 가드, 40컷 모바일 이탈 히트맵(2ms), 64컷 양방향 대사 시트(7ms), 120화 인물·복선 모순 감사(2ms)를 모두 0-토큰 로컬로 검증해 마감 직전 검수 시간을 대폭 줄입니다.",
        "Zero-token OKLCH continuity diffs, C2PA clipboard guards, a 2 ms 40-cut mobile retention heatmap, a 7 ms 64-cut dialogue binder and a 2 ms 120-episode plot graph automate pre-publish QA locally.",
      ),
      analogy: t(
        "담당 편집자가 색상표(OKLCH), 저작권 점검표(C2PA), 독자 스크롤 스톱워치(이탈 히트맵), 120화 설정 관계도(모순 그래프)를 들고 10ms 안에 전수 검수를 마치는 모습입니다.",
        "Like an editor checking color swatches, copyright stamps, a reader scroll stopwatch and a 120-episode lore chart in under 10 ms.",
      ),
      questions: [
        {
          question: t("모바일 이탈 히트맵이 의도된 침묵 연출도 지루함으로 오판하지 않나요?", "Does the mobile retention heatmap penalize intentional dramatic pauses?"),
          answer: t(
            "컷 메타데이터에 isDramaticPause 가 표시된 여백은 일반 빈 여백보다 이탈 패널티를 완화하도록 설계해 극적 정적 연출을 보호합니다.",
            "Cuts flagged with isDramaticPause soften the blank-gutter penalty so deliberate dramatic pacing is preserved.",
          ),
        },
        {
          question: t("클립보드 C2PA 가드는 메타데이터가 벗겨진 이미지도 막아 주나요?", "Can the clipboard C2PA guard catch images with stripped metadata?"),
          answer: t(
            "바이너리 헤더(XMP·EXIF·C2PA·다이제스트)가 남아 있는 출처·학습거부·상업 제한은 즉시 차단하지만, 외부에서 메타데이터가 완전히 삭제된 파일은 자동 판별이 불가능하므로 작가의 출처 확인이 여전히 필요합니다.",
            "It catches embedded XMP, EXIF, C2PA and DoNotTrain markers immediately, but stripped files cannot be proven automatically and still require artist verification.",
          ),
        },
      ],
      pitfall: t(
        "이탈 히트맵은 모바일 뷰포트 기하·대사 밀도·시선 동선 기반 정적 지표이며 실제 독자 체류 로그가 아닙니다. 실서비스 지표와는 별도 보조 도구로 해석해야 합니다.",
        "The retention heatmap is a static geometric and text-density heuristic, not live reader analytics; treat it as a pre-publish aid.",
      ),
    },
    technologies: ["OKLCH", "C2PA / XMP", "Graph BFS", "TypeScript"],
    facts: [
      {
        value: "2 ms (40 cuts)",
        label: t("390×844 · 360×800 모바일 이탈 히트맵 0-토큰 분석 실측", "40-cut mobile retention heatmap zero-token analysis"),
        source: "apps/web/src/domains/creator/wasm64-supergap-motion-audio/mobile-retention-heatmap.ts",
      },
      {
        value: "7 ms (64 cuts / 128)",
        label: t("64컷 128말풍선 양방향 대사 스프레드시트·리플로우·TSV 동기화", "64-cut / 128-balloon bidirectional dialogue sheet & reflow"),
        source: "apps/web/src/domains/creator/wasm64-supergap-motion-audio/dialogue-spreadsheet-binder.ts",
      },
      {
        value: "2 ms (120 episodes)",
        label: t("120화 인물 생사·소품·복선 모순 그래프 감사 실측", "120-episode character, prop & foreshadowing audit graph"),
        source: "apps/web/src/domains/creator/wasm64-supergap-motion-audio/retention-heatmap-spreadsheet-plotgraph.ts",
      },
      {
        value: "PNG · JPEG · WebP",
        label: t("OKLCH 연속성 Diff 및 클립보드 XMP/EXIF/C2PA/DoNotTrain 가드", "OKLCH continuity diff & PNG/JPEG/WebP C2PA clipboard guard"),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/continuity-diff-and-clipboard-guard.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
