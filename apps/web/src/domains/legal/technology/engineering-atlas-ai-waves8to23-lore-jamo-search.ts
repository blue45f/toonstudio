import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · ai · Waves 8·19·20·23 온디바이스 음성→VRM 표정·한국어 조사 로어 린터·가이드 매트·초성/자모 BM25F 검색 2종 카드.
 */
export const ENGINEERING_ATLAS_AI_WAVES8TO23_LORE_JAMO_SEARCH: readonly EngineeringAtlasEntry[] = [
  {
    id: "wave8-to-19-voice-vrm-lore-josa-linter",
    category: "ai",
    name: "Waves 8·19·20 Voice→52 VRM · Korean Lore Josa Linter · Guided Matte",
    title: t(
      "Waves 8·19·20 음성→52 VRM 표정 · 한국어 조사 호응 세계관 린터 & O(N) 소프트 매트",
      "Waves 8·19·20 Voice→52 VRM face, Korean Josa lore linter & O(N) guided soft matte",
    ),
    status: "experimental",
    tagline: t(
      "음성 포먼트→52종 VRM 표정, Aho-Corasick+한국어 받침 조사 자동 교정 로어 린터, O(N) 가이드 필터 매트를 로컬 실행합니다.",
      "Runs local voice-to-52 VRM blendshapes, Aho-Corasick + Korean Josa lore linting and O(N) guided-filter soft matting.",
    ),
    background: [
      t(
        "오디오툰·모션툰 더빙에 맞춰 캐릭터 입모양(Viseme)과 눈썹 표정을 일일이 키프레임으로 찍는 작업은 품이 많이 들고, 수십 회차 연재 중 캐릭터 호칭·지명 오타를 자동 치환할 때 받침 유무를 무시하면 '은/는·이/가·을/를' 조사가 깨지며, 깊이 맵 경계도 머리카락에서 계단 현상이 생깁니다.",
        "Keyframing lip-sync and brow emotion manually for audio-webtoons is tedious, naive find-and-replace on Korean character names breaks postpositional particles (Josa), and raw depth masks stair-step around hair strands.",
      ),
      t(
        "Wave 8 noisegate-octree-voiceface-royalty.ts 의 VoiceToVrmExpressionAnimator 는 오프라인 포먼트 대역 에너지에서 모음 입모양(aa·ih·ou·ee·oh)과 ARKit 52종 블렌드셰이프 가중치를 추출하고, Wave 19 series-lore-consistency-linter.ts 는 Aho-Corasick 다중 패턴 매칭과 편집 거리(<= 1)로 고유명사 오기·시대착오 어휘를 찾은 뒤 종성 받침(ㄹ 예외 포함)에 맞춰 한국어 조사를 자동 교정합니다.",
        "Wave 8 maps voice formant bands to VRM visemes and 52 ARKit blendshapes offline, while Wave 19 scans episodes via Aho-Corasick + Levenshtein<=1 for lore typos/anachronisms and harmonizes trailing Korean Josa by final-consonant (Batchim) rules.",
      ),
      t(
        "Wave 20 depth-mask-stylized-shading.ts 는 적분 영상(Integral Image) 기반 O(N) 가이드 필터와 결합 양방향 정제로 전경·중경·배경 소프트 알파 매트 및 과슈·셀 크로스해칭 셰이딩을 생성합니다(Current: 단위 검증 완료·토큰 비용 ₩0, Target: 대사 검수기·더빙 리그·깊이 분리 필터 연동).",
        "Wave 20 extracts edge-hugging foreground/midground/background soft mattes via O(N) box-integral guided filtering plus stylized cel/crosshatch shading at ₩0 token cost (Current: unit-verified; Target: script linter, voice rig & depth matte panel).",
      ),
    ],
    keyPoints: [
      t("오프라인 음성 포먼트 → 한국어 모음 입모양 & ARKit 52 블렌드셰이프", "Offline voice formant to VRM visemes & 52 ARKit blendshapes"),
      t("Aho-Corasick + Levenshtein≤1 세계관 고유명사·시대착오 어휘 린터", "Aho-Corasick + Levenshtein<=1 series lore & anachronism linter"),
      t("한글 종성 받침(ㄹ 로/으로 예외 포함) 인지 조사(은/는·이/가) 자동 호응", "Batchim-aware Korean Josa harmonization (including Rieul 'ro/euro')"),
      t("적분 영상 O(N) 가이드 필터 기반 전·중·배경 머리카락 소프트 매트", "O(N) integral-image guided filter soft alpha matte extraction"),
    ],
    diagram: {
      id: "wave8-to-19-voice-vrm-lore-josa-linter-diagram",
      kind: "graph",
      title: t("무토큰 온디바이스 음성 표정 · 세계관 조사 검수 · 가이드 매트 흐름", "Zero-token local voice animation, Korean lore linter & guided matte"),
      caption: t(
        "외부 LLM 호출 없이 더빙 음성, 원고 대사, 컷 깊이 버퍼 세 갈래를 브라우저 안에서 즉시 정제합니다.",
        "Refines voice tracks, Korean episode scripts and cut depth maps locally with zero external LLM calls.",
      ),
      alt: t(
        "왼쪽의 음성·대사·깊이 입력 노드가 각각 Voice→52 VRM 표정 애니메이터, Aho-Corasick 한국어 조사 로어 린터, O(N) 가이드 소프트 매트 노드로 나뉘어 처리된 뒤 우측 검수 완료 컷으로 합쳐집니다.",
        "Voice audio, script text and depth buffers branch through the 52-VRM expression animator, the Aho-Corasick Korean Josa lore linter and the O(N) guided soft-matte kernel into a verified cut.",
      ),
      nodes: [
        { id: "src", label: t("음성 · 대사 · 깊이", "Voice, text & Z"), sub: t("로컬 원고 3종 입력", "Local studio inputs"), tone: "local", shape: "pill", at: [0, 1] },
        { id: "vrm", label: t("52 VRM 입모양", "52-VRM visemes"), sub: t("포먼트 모음 · 눈 깜빡임", "Formants & blink"), tone: "ai", at: [1, 0] },
        { id: "lor", label: t("로어 · 조사 린터", "Lore & Josa QA"), sub: t("Aho-Corasick · 받침 호응", "Batchim auto-fix"), tone: "good", at: [1, 1] },
        { id: "mat", label: t("O(N) 가이드 매트", "O(N) guided matte"), sub: t("전·중·배경 소프트 분리", "3-plane soft alpha"), tone: "ai", at: [1, 2] },
        { id: "out", label: t("검수 완료 컷", "Verified cut"), sub: t("토큰 ₩0 · 유출 0B", "₩0 tokens, 0 B leak"), tone: "good", shape: "pill", at: [2, 1] },
      ],
      edges: [
        { from: "src", to: "vrm", label: t("오디오", "Audio") },
        { from: "src", to: "lor", label: t("대사·설정", "Script") },
        { from: "src", to: "mat", label: t("컬러+깊이", "RGB+Z") },
        { from: "vrm", to: "out" },
        { from: "lor", to: "out" },
        { from: "mat", to: "out" },
      ],
    },
    usage: [
      {
        feature: t("온디바이스 음성→52 VRM 표정 애니메이터 & O(N) 깊이 가이드 소프트 매트", "On-device Voice→52 VRM animator & O(N) depth-guided soft matte"),
        role: t(
          "음성 파형에서 52종 ARKit/VRM 표정 가중치를 뽑고 적분 영상 가이드 필터로 3평면 소프트 알파 매트를 분리합니다.",
          "Extracts 52 ARKit/VRM weights from speech frames and refines 3-plane soft mattes via O(N) guided filtering.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave8-singularity/noisegate-octree-voiceface-royalty.ts",
          "apps/web/src/domains/creator/wasm64-wave20-grand-finale/depth-mask-stylized-shading.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("다회차 세계관 고유명사·시대착오 린터 & 한국어 조사 자동 교정기", "Multi-episode lore/anachronism linter & Korean Josa harmonizer"),
        role: t(
          "설정집 정본 표기 대조, 사극·판타지 시대착오 금칙어 검출, 명사 치환 시 받침 유무별 조사 교정을 수행합니다.",
          "Audits canonical lore terms and era anachronisms while harmonizing Korean Josa particles upon noun replacement.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/series-lore-consistency-linter.ts",
          "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/tetrahedral-lut-lore-linter.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("한글 마지막 음절 종성 받침(ㄹ 예외 포함) 판별 기반 조사 자동 선택", "Korean final-consonant (Batchim + Rieul) Josa particle selector"),
        language: "ts",
        ...sampleSource([
          ["export function selectKoreanRoParticle(noun: string): \"로\" | \"으로\" {"],
          ["  const code = noun.trim().charCodeAt(noun.trim().length - 1);"],
          ["  if (code < 0xac00 || code > 0xd7a3) return \"로\";"],
          ["  const jongseong = (code - 0xac00) % 28;"],
          ["  return jongseong === 0 || jongseong === 8 ? \"로\" : \"으로\";", "받침 없음(0) 또는 ㄹ 받침(8)은 '로', 나머지 받침은 '으로'", "no batchim (0) or Rieul (8) takes 'ro'; others take 'euro'"],
          ["}"],
        ]),
        explain: t(
          "series-lore-consistency-linter.ts 의 harmonizeKoreanJosa 는 은/는, 이/가, 을/를, 과/와, 아/야, 으로/로 6쌍을 모두 지원해 고유명사 오타를 고칠 때 문장이 부자연스러워지지 않게 합니다.",
          "harmonizeKoreanJosa handles all six major Korean particle pairs so fixing a character or place typo never leaves broken grammar.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave19-atelier-perfection/series-lore-consistency-linter.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Kaiming He et al. · Guided Image Filtering (O(N) Edge-Preserving Smoothing)",
        url: "https://ieeexplore.ieee.org/document/6319316",
        kind: "article",
        note: t("적분 영상 상자 합으로 커널 반경에 무관하게 O(N)에 도는 가이드 필터 논문", "IEEE TPAMI paper on radius-independent O(N) guided alpha matting"),
      },
      {
        title: "VRM Consortium · VRM 1.0 Expression & Viseme Preset Specification",
        url: "https://vrm.dev/en/vrm1/expression/",
        kind: "spec",
        note: t("VRM 1.0 표준 감정·모음 입모양(aa/ih/ou/ee/oh) 프리셋 규약", "VRM 1.0 standard expression and vowel viseme specification"),
      },
    ],
    chapterIds: ["on-device-inference", "sound-generation"],
    talk: {
      pitch: t(
        "외부 클라우드에 미공개 회차 대사나 성우 가더빙 파일을 한 바이트도 올리지 않고, 입모양 키프레임과 세계관 고유명사·조사 오타까지 내 기기에서 바로 잡아 줍니다.",
        "Generates VRM lip-sync and fixes multi-episode lore/particle typos right on the creator's device without uploading unreleased scripts.",
      ),
      analogy: t(
        "대본 보안 서약을 지키는 전속 교열 기자와 더빙 인형 조종사, 머리카락 오리기 장인이 작가 노트북 안에서 인터넷 없이 일하는 셈입니다.",
        "Like having an offline script copy-editor, a lip-sync puppeteer and a hair-masking specialist inside your laptop.",
      ),
      questions: [
        {
          question: t("사극에서 '스마트폰'이나 '엘리베이터' 같은 시대착오 단어도 잡아내나요?", "Does the lore linter catch modern anachronisms in historical dramas?"),
          answer: t(
            "세계관 시대 설정(joseon-historical, murim, medieval-fantasy 등)을 고르면 내장된 시대착오 어휘 사전과 작가 커스텀 금칙어를 Aho-Corasick 트라이로 한 번에 스캔해 위치와 대체어를 알려 줍니다.",
            "Selecting an era preset scans built-in and author-defined anachronism dictionaries in linear time via Aho-Corasick, suggesting period-appropriate replacements.",
          ),
        },
      ],
    },
    technologies: ["Aho-Corasick", "Korean NLP", "ARKit 52 / VRM", "Guided Filter O(N)"],
    facts: [
      { value: "52 blendshapes", label: t("음성 포먼트 연동 ARKit/VRM 표정 채널 수", "Voice-driven ARKit/VRM blendshape channels"), source: "apps/web/src/domains/creator/wasm64-wave8-singularity/noisegate-octree-voiceface-royalty.ts" },
      { value: "O(N)", label: t("적분 영상 가이드 필터 소프트 매트 시간 복잡도", "Integral-image guided matte complexity"), source: "apps/web/src/domains/creator/wasm64-wave20-grand-finale/depth-mask-stylized-shading.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "wave23-korean-choseong-jamo-bm25f-search",
    category: "ai",
    name: "Wave 23 Serverless Korean Choseong · Jamo BM25F Manuscript Search",
    title: t(
      "Wave 23 무서버 한글 초성·자모 분해 · 조사 제거 · 1자모 오타 허용 BM25F 원고 검색",
      "Wave 23 serverless Korean Choseong/Jamo BM25F manuscript search (<1 ms / 300 cuts)",
    ),
    status: "experimental",
    tagline: t(
      "검색 서버 비용 ₩0으로 초성 검색('ㅊㅁㅎ'), 조사 제거, 1자모 오타 교정을 지원해 300컷 원고를 1ms 미만에 찾습니다.",
      "Searches 300 manuscript cuts in <1 ms at ₩0 server cost with Choseong initials, Josa stripping and 1-Jamo typo tolerance.",
    ),
    background: [
      t(
        "장편 연재 작가가 과거 수백 컷 중 특정 대사나 복선 메모를 찾을 때 일반 영문 중심 토큰 검색기는 '천마검으로'와 '천마검이'를 다른 단어로 취급하고, 급하게 친 초성 검색('ㅊㅁㅎ')이나 자모 한 글자 오타('쳔마검')를 전혀 찾지 못합니다.",
        "Generic search tokenizers treat Korean nouns with different trailing particles as unrelated words, and fail completely on rapid Choseong-only queries or single-Jamo keyboard typos.",
      ),
      t(
        "korean-jamo-bm25f-manuscript-search.ts 는 유니코드 한글 음절(U+AC00..U+D7A3)을 초성·중성·종성 자모열로 분해하고, 어근 음운 결합 조건을 따져 격조사·보조사를 떼어 낸 뒤 대사(가중치 3.0)·인물(2.6)·연출 노트(1.8)·효과음(1.4) 4개 필드에 Okapi BM25F 역색인을 구축합니다.",
        "korean-jamo-bm25f-manuscript-search.ts decomposes Hangul syllables (U+AC00..U+D7A3) into Choseong/Jamo strings, strips grammatical particles safely, and indexes 4 weighted fields (dialogue 3.0, character 2.6, note 1.8, sfx 1.4) with BM25F.",
      ),
      t(
        "초성 전용 질의는 초성 부분열 색인으로, 오타 질의는 SymSpell 방식 1-자모 삭제 사전(편집 거리 <= 1)으로 확장해 300컷 규모 원고에서도 외부 Elasticsearch/Algolia 없이 1ms 미만에 결과를 반환합니다(Current: 300컷 <1ms 단위 검증 완료·0B 번들, Target: 스튜디오 전역 ⌘K 대사·복선 검색창 직결).",
        "Choseong queries match against initial-consonant projections while SymSpell 1-Jamo delete dictionaries resolve single-keystroke typos in <1 ms across 300 cuts with zero external search servers (Current: unit-verified <1 ms; Target: Studio Cmd+K manuscript search).",
      ),
    ],
    keyPoints: [
      t("한글 음절(U+AC00..U+D7A3) 초성·중성·종성 분해 및 초성 질의('ㅊㅁㅎ') 매칭", "Hangul syllable Choseong/Jamo decomposition & initial-consonant search"),
      t("어근 길이·종성 결합 검증 기반 한국어 격조사·보조사 정밀 분리", "Phonologically guarded Korean postpositional particle (Josa) stripping"),
      t("SymSpell 방식 1-자모 삭제 색인 기반 단일 자모 오타 허용(거리 ≤ 1)", "SymSpell-inspired 1-Jamo typo tolerance (bounded edit distance <= 1)"),
      t("대사·인물·노트·효과음 가중 BM25F 랭킹 — 300컷 질의 <1ms · 서버비 ₩0", "4-field weighted BM25F ranking in <1 ms over 300 cuts at ₩0 server cost"),
    ],
    diagram: {
      id: "wave23-korean-choseong-jamo-bm25f-search-diagram",
      kind: "sequence",
      title: t("한글 초성·조사·1자모 오타 정규화 및 다중 필드 BM25F 랭킹 흐름", "Korean Choseong, Josa stripping, 1-Jamo typo & BM25F ranking flow"),
      caption: t(
        "초성이나 조사, 가벼운 오타가 섞인 검색어도 자모 역색인을 거쳐 대사·인물·노트·효과음 가중치 순으로 즉시 정렬됩니다.",
        "Normalizes Choseong, particles and 1-Jamo typos against local inverted indexes to rank cuts across 4 weighted fields.",
      ),
      alt: t(
        "작가가 검색어를 입력하면 한글 자모·조사 분석기가 초성 판별과 조사 분리를 수행하고, SymSpell 자모 역색인이 정확·초성·1자모 오타 후보 컷을 찾은 뒤, BM25F 스코어러가 4개 필드 가중 합산 점수로 상위 컷을 1ms 안에 돌려줍니다.",
        "Author query enters the Hangul Jamo/Josa analyzer, probes exact/Choseong/1-Jamo SymSpell inverted indexes, and scores 4 weighted manuscript fields via BM25F in under 1 ms.",
      ),
      actors: [
        { id: "qry", label: t("작가 검색창", "Author query"), sub: t("초성·조사·오타", "Choseong or typo"), tone: "local" },
        { id: "jmo", label: t("자모 · 조사 분석", "Jamo & Josa"), sub: t("U+AC00 분해·어근", "Syllable & stem"), tone: "good" },
        { id: "idx", label: t("1자모 오타 색인", "1-Jamo index"), sub: t("SymSpell 삭제 키", "Delete-1 lookup"), tone: "ai" },
        { id: "bm", label: t("BM25F 랭커", "BM25F ranker"), sub: t("4필드 가중 점수", "4-field scoring"), tone: "good" },
      ],
      messages: [
        { from: "qry", to: "jmo", label: t("질의 전달 (예: 'ㅊㅁㅎ' 또는 '쳔마검으로')", "Submit query (Choseong or inflected)") },
        { from: "jmo", to: "idx", label: t("조사 제거 어근 · 초성열 · 자모열 조회", "Probe stem, Choseong & Jamo delete keys") },
        { from: "idx", to: "bm", label: t("매칭 종류별(정확>조사>초성>오타) 후보 전달", "Pass candidates weighted by match kind") },
        { from: "bm", to: "qry", label: t("상위 컷·매칭 필드 하이라이트 반환 (<1ms)", "Return top cuts & field hits (<1 ms)"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("무서버 한글 초성·자모 분해 및 다중 필드 BM25F 원고 검색 엔진", "Serverless Korean Choseong/Jamo multi-field BM25F search engine"),
        role: t(
          "외부 검색 클러스터 없이 대사·인물·연출 노트·효과음 4개 필드에 대해 초성, 조사 변화형, 1자모 오타 검색을 수행합니다.",
          "Indexes dialogue, character, note and SFX fields locally with Choseong, Josa-stem and 1-Jamo fuzzy matching.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/korean-jamo-bm25f-manuscript-search.ts",
          "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/wasm64-wave23-autonomous-cadence.test.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("유니코드 완성형 한글 음절(U+AC00..U+D7A3) 초·중·종성 산술 분해", "Unicode Hangul syllable (U+AC00..U+D7A3) Choseong/Jungseong/Jongseong split"),
        language: "ts",
        ...sampleSource([
          ["const CHOSEONG = [\"ㄱ\",\"ㄲ\",\"ㄴ\",\"ㄷ\",\"ㄸ\",\"ㄹ\",\"ㅁ\",\"ㅂ\",\"ㅃ\",\"ㅅ\",\"ㅆ\",\"ㅇ\",\"ㅈ\",\"ㅉ\",\"ㅊ\",\"ㅋ\",\"ㅌ\",\"ㅍ\",\"ㅎ\"] as const;"],
          ["export function extractChoseongString(text: string): string {"],
          ["  let out = \"\";"],
          ["  for (let i = 0; i < text.length; i += 1) {"],
          ["    const code = text.charCodeAt(i);"],
          ["    out += code >= 0xac00 && code <= 0xd7a3 ? (CHOSEONG[Math.floor((code - 0xac00) / 588)] ?? \"\") : text[i]!;"],
          ["  }", "음절당 588개(21중성×28종성) 주기로 초성 인덱스 O(1) 추출", "O(1) initial consonant lookup via 21*28=588 stride"],
          ["  return out;"],
          ["}"],
        ]),
        explain: t(
          "korean-jamo-bm25f-manuscript-search.ts 는 초성열 추출과 함께 초·중·종성 전체 자모열에 대해 길이 차 1 이하의 유한 편집 거리 검사를 결합해 오탐 없이 빠른 퍼지 검색을 제공합니다.",
          "korean-jamo-bm25f-manuscript-search.ts pairs O(1) Choseong projection with bounded Jamo edit-distance<=1 verification.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/korean-jamo-bm25f-manuscript-search.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Unicode Standard · Chapter 3.12 Conjoining Jamo Behavior",
        url: "https://www.unicode.org/versions/latest/core-spec/chapter-3/#G24646",
        kind: "spec",
        note: t("유니코드 표준 한글 음절 산술 합성·분해 공식 명세", "Canonical Unicode algorithmic Hangul syllable decomposition formula"),
      },
      {
        title: "Stephen Robertson & Hugo Zaragoza · The Probabilistic Relevance Framework: BM25 and Beyond",
        url: "https://dl.acm.org/doi/10.1561/1500000019",
        kind: "article",
        note: t("필드별 길이 정규화와 가중치를 결합하는 BM25 / BM25F 정보검색 표준 논문", "Foundational monograph on BM25 and multi-field BM25F ranking"),
      },
    ],
    chapterIds: ["on-device-inference", "storage"],
    talk: {
      pitch: t(
        "유료 검색 SaaS 구독료 0원으로 300컷 원고 속 인물·대사·효과음을 'ㅊㅁㅎ' 초성 세 글자나 자모 오타 하나가 섞인 채로도 1밀리초 안에 찾아 줍니다.",
        "Finds dialogue, characters and SFX across 300 cuts in under 1 ms from 3 Choseong letters or a typo, with ₩0 SaaS search bills.",
      ),
      analogy: t(
        "한국어 조사 변화와 초성 줄임말까지 찰떡같이 알아듣는 원고실 전용 색인 사서가 책상 서랍 안에서 즉시 쪽수를 펼쳐 주는 경험입니다.",
        "Like a Korean-fluent manuscript archivist inside your browser who understands shorthand initials and inflected nouns instantly.",
      ),
      questions: [
        {
          question: t("'다리'에서 '리'나 '가방'에서 '가'처럼 원래 단어 끝 글자를 조사로 오인해 잘라 버리지 않나요?", "Doesn't stripping particles accidentally chop the last syllable off short Korean nouns?"),
          answer: t(
            "조사 제거 전 어근 최소 길이(2음절 이상)와 종성 음운 결합 규칙(예: 받침 뒤에만 '으로/을/이' 허용)을 함께 확인하며, 원본 어절 토큰도 역색인에 함께 보존해 정밀도와 재현율을 모두 지킵니다.",
            "Stem length guards (>=2 syllables) and Batchim phonological compatibility checks prevent over-stripping, while surface tokens remain indexed alongside stems.",
          ),
        },
      ],
    },
    technologies: ["Hangul Jamo", "BM25F", "SymSpell Fuzzy", "Zero-Server Search"],
    facts: [
      { value: "< 1 ms", label: t("300컷 다중 필드 한글 자모 BM25F 질의 응답 시간", "300-cut multi-field Jamo BM25F query latency"), source: "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/wasm64-wave23-autonomous-cadence.test.ts" },
      { value: "4 fields", label: t("dialogue(3.0) · character(2.6) · note(1.8) · sfx(1.4) 가중 색인", "Weighted manuscript BM25F search fields"), source: "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/korean-jamo-bm25f-manuscript-search.ts" },
    ],
    reviewedAt: "2026-11-26",
  },
];
