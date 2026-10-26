import type { Rea15PlatformId, Rea15PlatformUiThemeSpec } from "./claude-rea15-platform-ui-theme-catalog";

export type Rea39Wave23PlatformId = Exclude<
  Rea15PlatformId,
  | "glimnavi"
  | "snaptoon"
  | "kaistory"
  | "ggooming"
  | "plask-motion"
  | "manhwa-ai"
  | "komiko-ai"
  | "anifusion"
  | "katalist-ai"
  | "novelai"
  | "mootion"
  | "skyreels"
  | "frameo"
  | "naver-webtoon-shaper"
  | "posemaniacs"
>;

function defineWaveTheme(
  platformId: Rea39Wave23PlatformId,
  nameKo: string,
  originUrl: string,
  reaEvidenceId: string,
  scenarioSha256: string,
  palette: readonly [string, string, string, string, string, string, string],
  borderRadiusPx: number,
  fontStack: string,
  coreWorkflowKo: string,
  keyRoutes: readonly string[],
): Rea15PlatformUiThemeSpec {
  return {
    platformId,
    nameKo,
    originUrl,
    reaEvidenceId,
    scenarioSha256,
    surfaceHex: palette[0],
    panelHex: palette[1],
    borderHex: palette[2],
    textPrimaryHex: palette[3],
    textMutedHex: palette[4],
    accentPrimaryHex: palette[5],
    accentSecondaryHex: palette[6],
    borderRadiusPx,
    fontStack,
    coreWorkflowKo,
    keyRoutes,
  };
}

export const REA39_WAVE23_PLATFORM_UI_THEMES: Readonly<
  Record<Rea39Wave23PlatformId, Rea15PlatformUiThemeSpec>
> = Object.freeze({
  // Wave 2 (12개 플랫폼)
  llamagen: defineWaveTheme("llamagen", "LlamaGen AI", "https://llamagen.ai/", "ev_5d6e3e4aab21c7ff11fdddfa7d4d30d44627b638626558de15fb02c60e7b2c57", "4bbf2d622452a1b98ef744cf5f307b1bdf1d989a5eedf2b272b7166cff158c8f", ["#0D0C22", "#171713", "#4F5263", "#F7F7F8", "#7B7194", "#f3ad22", "#524B63"], 12, "Inter, Plus Jakarta Sans, sans-serif", "AI 코믹 스트립(/new/ai-comic-strips) + 에이전트 멀티패널 워크플로우(/agents, /workflows, /draw, /story)", ["/new/ai-comic-strips", "/agents", "/draw", "/workflows", "/story"]),
  dashtoon: defineWaveTheme("dashtoon", "Dashtoon Studio", "https://dashtoon.com/", "ev_c9f6c0db817e24eb5a604fd1da1112281d7e765b0846f1e9aa17caa2434eaf3c", "880e084418ad76b288336cb5134f64b275edaa5f06bbcd5f2e08218abdffd194", ["#111214", "#1a1b1e", "#2B2B2B", "#e5e7eb", "#9ca3af", "#3090FC", "#60A5FA"], 10, "Inter, sans-serif", "세로 스크롤 웹툰 제작(/create) + 포토 투 코믹 변환(/api/v2/ai-apps/photo-to-comic) + 글로벌 연재(/comics)", ["/comics", "/create", "/api/v2/ai-apps/photo-to-comic", "/api/v2/ai-apps/photo-to-comic/poll"]),
  "ltx-studio": defineWaveTheme("ltx-studio", "LTX Studio (Lightricks)", "https://ltx.studio/", "ev_47dd3a8e80ef7b298a798ce6610a116d5e64904937c128c8f4c53190c9425ad0", "eb2f2d23e2fa72dd4dc010a5b64bb2ef898addec6667fd1f2122458bdd76d9f6", ["#0f1115", "#181b22", "#2c323d", "#fafafa", "#aaadb0", "#3898ec", "#ea384c"], 10, "Inter, sans-serif", "시나리오 → 샷별 프리비즈 스토리보드 → 카메라 모션·캐릭터 일관성 애니매틱 디렉팅", ["/", "/pricing", "/lead-survey"]),
  boords: defineWaveTheme("boords", "Boords AI Storyboard", "https://boords.com/", "ev_45aab73c640e451a57e56d4f59d3a56365d00d8ce4845861d685cd5cc3779853", "6591c40a8c78780e637d868476b2936243ed17a3e7511d4992ffd4a215dc03ec", ["#120e0b", "#211c19", "#453d37", "#D5D5CC", "#9ca3af", "#FF2D8D", "#D97757"], 12, "Inter, sans-serif", "대본 기반 프레임별 스토리보드 & 보이스오버 타임라인 애니매틱 시퀀서", ["/", "/offer", "/docs"]),
  "magic-poser": defineWaveTheme("magic-poser", "Magic Poser", "https://magicposer.com/", "ev_0340777a4ef59f77df35658b8b4cea7c996b4cd19a9826d9d93985294c590161", "718afbeb1b9bc87923a8ab22458d97e1258812646c6f3a8386393211d40408d2", ["#12121C", "#24262D", "#383B47", "#F8F8F8", "#D8D8D8", "#00B7FD", "#F45253"], 10, "Inter, sans-serif", "웹툰·만화 특화 다중 인체 물리 관절 드래그 포징(--mp-dark-blue: #00B7FD) + 원근 투시 및 방향성 조명 스튜디오", ["/"]),
  "posemy-art": defineWaveTheme("posemy-art", "PoseMy.Art", "https://posemy.art/", "ev_abdd16e2770ee661c9bb1b1b803bf8c9b7940249f13e797ed82638533bcb71c5", "d82bc95e815514a87ab82c07db2c82e08825a640d34bf7470ab8eab37976c173", ["#463853", "#5A5563", "#726B7D", "#FBFBFD", "#eafeff", "#ff30b2", "#7de5da"], 10, "Inter, sans-serif", "브라우저 즉시 구동 3D 마네킹·블록 메쉬·애니메이션 포즈 씬 빌더", ["/", "/track"]),
  cascadeur: defineWaveTheme("cascadeur", "Cascadeur AI Physics Rigging", "https://cascadeur.com/", "ev_71b8739079fbf7ee061823ba33f787549a304e36c9394624d4899f8d781ef6f5", "f28f6adbfbdffb7e51c0d9cc0afd8fe8d30501eadcf6ed4fa6b7fcc09a645b7f", ["#030303", "#14181f", "#2F96B4", "#ffffff", "#9ca3af", "#009ee8", "#80fff2"], 8, "Inter, sans-serif", "AutoPosing AI 관절 자동 추론 + AutoPhysics 무게중심(Center of Mass)·각운동량·탄도 궤적 물리 보정", ["/", "/creative/list", "/preview"]),
  krea: defineWaveTheme("krea", "Krea AI Realtime Director", "https://www.krea.ai/", "ev_3fbbde1134e1842d9c5306aa04efaab4604118ad3f3a9452245fcccceda86af9", "bd928d2c4b5440618916390f1b17eca190c8445bb0982caf39b1d75c210b8440", ["#050505", "#0a0a0a", "#262626", "#f5f5f5", "#646464", "#c4956a", "#6b9e7a"], 12, "Inter, Geist, sans-serif", "실시간 도형·3D·브러시 캔버스 → AI 즉시 합성(/realtime, /realtime-director) + 업스케일·디테일 강화(/apps/enhance, /apps/image/flux-krea)", ["/realtime", "/realtime-director", "/apps/image/flux-krea", "/apps/enhance", "/image", "/video"]),
  "leonardo-ai": defineWaveTheme("leonardo-ai", "Leonardo.Ai Canvas & Flow", "https://leonardo.ai/", "ev_aba9a01e0b16e259d691e1c2b1a8a07555a0fb6123a613e7e4d2e52b5c65271b", "eafbf44f53c4c57edb70bd4fee34aa9afe3ac4905aa059e3c4fde5e618d24de3", ["#0d0f17", "#171a26", "#313131", "#f3f4f6", "#9ca3af", "#8b5cf6", "#ec4899"], 12, "Plus Jakarta Sans, Inter, sans-serif", "Realtime Canvas 인페인팅·아웃페인팅 + Character Reference/Style Reference 멀티 가중치 제어", ["/"]),
  gentoon: defineWaveTheme("gentoon", "GenToon (젠툰)", "https://www.gentoon.ai/", "ev_e62beed518f1e75ad009869facc63f7acfee12f6116364a44b714551e07027de", "622b3fbbab14dcc8705ea68c675d65b1f4615f06ad7367f1a23e121f9b51711f", ["#f4ebfc", "#e7d7f6", "#6f5486", "#40215f", "#6f5486", "#7646bd", "#ffe9a4"], 14, "Pretendard, sans-serif", "읽기 방향 제어(--reading-direction:1, --paper:#f4ebfc, --ink:#40215f) 웹툰 뷰어(/view) + 서포터즈·굿즈 주문·크리에이터 정산", ["/view", "/supporters", "/goods/orders", "/creator-hub/earnings", "/achievements"]),
  tootoon: defineWaveTheme("tootoon", "TooToon (투툰 · Onoma AI)", "https://tootoon.ai/", "ev_ed83b1f1e6e9d943e547c3e705e1bec9ed1149c34e008ac9526cc99e9d0986bf", "0fd9e464f594a4dba361c16012e16908c9d945f3c12e12502e05e9f2fca53d72", ["#121212", "#1F1F1F", "#333333", "#ffffff", "#B3B3B3", "#363cff", "#4285F4"], 12, "Pretendard, Inter, sans-serif", "5대 전문 스튜디오 모듈: Fabulator(/fabulator 스토리) → Character Studio → Visual Studio → Artifex → Emporium(/emporium 마켓)", ["/fabulator", "/character-studio", "/visual-studio", "/artifex", "/emporium", "/anima/feed/list"]),
  "tooning-plus": defineWaveTheme("tooning-plus", "Tooning Plus (투닝 플러스)", "https://tooning.io/", "ev_fb15db7d87f332c7a168570f1ae75041b2dffb840b74dd24ea17286716434865", "64e77ab9486e3fb6f873d2aff54cb139f970068916557440a4b4cae3352f7eeb", ["#f7f7f7", "#ffffff", "#eaeaea", "#424242", "#969696", "#3b82f6", "#c1c4cd"], 12, "Pretendard, sans-serif", "6부위 모듈형 캐릭터 빌더(/character-make-basic, -face, -body, -hand, -hair, -etc) + 커스텀 업로드 + /100x 고속 컷 제작", ["/100x", "/character-make-basic", "/character-make-face", "/character-make-body", "/character-make-hand", "/character-make-hair", "/character-make-etc"]),
  // Wave 3 (12개 플랫폼)
  enkava: defineWaveTheme("enkava", "Enkava (엔카바)", "https://enkava.com/", "ev_bd2f37c70899ba98a372d30c7fa86b64247954bc03156764a19d7b88de10d1b6", "6ab5faccdeda58e09d95097208c57124389672f69b465e805f8087340d0a119a", ["#101218", "#181c24", "#2a303c", "#f3f4f6", "#9ca3af", "#6366f1", "#22d3ee"], 10, "Pretendard, Inter, sans-serif", "국내 서브컬처·웹툰 창작자 에셋 & 커미션·협업 스테이지", ["/"]),
  jitter: defineWaveTheme("jitter", "Jitter Motion Design", "https://jitter.video/", "ev_2d1aa187b94021f527b0d3ac70f50d79b4b747935d04c55d4f5dd1b2fcd69a91", "90e125c7bb09b1c1e9bc3788c7a437cce97de4d1f4f2449d0c26e92e78cfc31d", ["#19171C", "#232028", "#36313d", "#FFFFFF", "#b3b3b3", "#7A40ED", "#a855f7"], 12, "Inter, sans-serif", "레이어드 아트보드 → 모션 프리셋 애니메이션 → 무손실 4K/Lottie/무빙툰 루프 익스포트", ["/"]),
  "lumiere-graphics": defineWaveTheme("lumiere-graphics", "Lumiere Graphics WebGPU Shaders", "https://lumiere.graphics/", "ev_1b6dac1de41311e357dbbcffe8ac3a0152ac8a38566670b69e64cce0c2819387", "a8299ab08f35cbf13becd96d6b8e267a570eacdec7010f1c015f5ce299e160b1", ["#0e0c13", "#181520", "#2d273b", "#f8fafc", "#a1a1aa", "#ff5a31", "#9a86fc"], 10, "Geist, Inter, sans-serif", "실시간 WebGPU 비파괴 포스트프로세싱: Kuwahara 회화 필터 · 필름 Halation · 아나모픽 Glare · CRT/디더링 셰이더 체인", ["/", "/changelog", "/roadmap"]),
  "graphite-editor": defineWaveTheme("graphite-editor", "Graphite Procedural Node Editor", "https://graphite.rs/", "ev_635a2c265c07c191273b2a7a893507c0495e7b3498aedfdc6f91471adfaa2f86", "db99212fb5132845e7743ddaefe217063847e305b61d23ea8c1464d53914e39b", ["#111111", "#222222", "#333333", "#dddddd", "#888888", "#e08838", "#4992d6"], 6, "Source Sans Pro, Inter, sans-serif", "Rust/WASM 기반 비파괴 벡터·래스터 하이브리드 노드 그래프 컴포지터", ["/", "/api/event"]),
  pixieditor: defineWaveTheme("pixieditor", "PixiEditor Universal 2D", "https://pixieditor.net/", "ev_beb60ae9754671115d8cea321a358724b7601c0967065663192d4d6435f9b919", "1e017e75b925ae2fd960d81fe79c01e787e3bc5da2350c8d241eaf727a572cae", ["#111214", "#15171a", "#23262b", "#DCDCDC", "#80848E", "#F3C31A", "#302c24"], 8, "Inter, sans-serif", "노드 그래프 + 레이어 스택 + 프레임 바이 프레임 애니메이션 + 커스텀 셰이더를 통합한 범용 2D 파이프라인", ["/docs", "/extensions", "/colorpicker", "/download"]),
  spline: defineWaveTheme("spline", "Spline 3D & Hana", "https://spline.design/", "ev_3171b5f912972cab97571d062102a47b20a00293a0d49b5c5b272001a948b32f", "773b0e108cf1f9f9a73bf9f4d3d2963f107cfda96c63d8538516f3b847940e2b", ["#000000", "#121316", "#363636", "#ffffff", "#e0e0e0", "#5865F2", "#38E2B3"], 12, "Spline Sans, Inter, sans-serif", "브라우저 실시간 3D 디자인(/3d-design) + AI 3D 생성(/ai-generate) + AI 스타일 트랜스퍼(/ai-style-transfer) + Hana(/hana) + MCP(/mcp)", ["/3d-design", "/hana", "/ai-generate", "/ai-style-transfer", "/mcp"]),
  rive: defineWaveTheme("rive", "Rive Interactive State Machine", "https://rive.app/", "ev_0694fab590921fecb24ca0a5ebddb7cadf52273043897a3ef0dfabf38c70b4b7", "2b2493ee53f3ffc4f86ffb3665abf059724e92366389224402a5fad471c3e721", ["#070708", "#0d0d0f", "#222328", "#FFFFFF", "#a5a5a5", "#0099FF", "#FF483C"], 10, "Inter, sans-serif", "2D 본·메쉬 디포메이션 리그 + 스크롤/터치 입력 반응형 인터랙티브 상태머신(State Machine)", ["/"]),
  "medibang-paint": defineWaveTheme("medibang-paint", "MediBang Paint", "https://medibangpaint.com/", "ev_2a409645bc383af67c30cc72cde5c63397b4dce431ece4ff762d8e022ec1f6a4", "718f21e20611bef71c3c1d6a04536e0c716759221cfce38899c30ac2bd3fb636", ["#313131", "#242424", "#444444", "#ffffff", "#cccccc", "#007cba", "#7a00df"], 8, "Noto Sans JP, Pretendard, sans-serif", "만화 컷 칼날 분할 + 클라우드 스크린톤/브러시 동기화 + 스냅 가이드 자(Ruler)", ["/"]),
  ibispaint: defineWaveTheme("ibispaint", "ibisPaint", "https://ibispaint.com/", "ev_75aa161f8a02eefbfba96631394b51d6a228d049f24e13988c400022dd674eab", "b69e291c96ef70a7ee63d76f2ea642246f5c888efe04ba4d28e883f8efae4b4a", ["#dbe2e7", "#FFFFFF", "#CCCCCC", "#525559", "#666666", "#006699", "#ff6699"], 10, "Inter, sans-serif", "타임랩스 작화 리플레이 기록 + 만화 배경 필터(Anime Background) + 손떨림 보정 스트로크 안정화", ["/"]),
  "clip-studio-paint": defineWaveTheme("clip-studio-paint", "Clip Studio Paint", "https://www.clipstudio.net/en/", "ev_6ef8739eb39c554d45fe2735be7bec6323b81dd6636cecd4de13ff339dff673d", "b8006fa8e94809251353b459d1490ccd467cbc285116d0d0eb3494ae1b68aa2d", ["#1B1E24", "#262930", "#3a3f4a", "#f4f4f4", "#b7b7b7", "#0B96E3", "#61B001"], 6, "Inter, Pretendard, sans-serif", "벡터 지우개 교차점 절단 + 참조 레이어 틈새 닫기 채우기 + 3D 데생 인형/음영 어시스트", ["/", "/releases/v"]),
  acon3d: defineWaveTheme("acon3d", "ACON3D (에이콘3D)", "https://www.acon3d.com/", "ev_c58fac87f1de010c366346d3f144baed81b0de4a7ae5e310fa4ace18c1ae617b", "9af0c6f2143b88c164e34c7f65f3abfd3fe5e153c6b847f325f511421094ec38", ["#18181b", "#27272a", "#313131", "#f4f4f5", "#a1a1aa", "#6366f1", "#ec4899"], 10, "Pretendard, sans-serif", "웹툰 전용 스케치업·블렌더·스냅툰 3D 배경 카탈로그 & 동적 컴포넌트(문/창문/조명) 제어", ["/"]),
  "webtoon-canvas": defineWaveTheme("webtoon-canvas", "WEBTOON CANVAS", "https://www.webtoons.com/en/canvas", "ev_054b1489efcd0052fd9893f98109861b735650a268d87a777e36a0de7fb781c3", "6250ba8e36382b5015267440225dcaaf359e101aae6e4e939656f3112cba9b0f", ["#121212", "#1e1e1e", "#2e2e2e", "#ffffff", "#999999", "#00dc64", "#00ff74"], 8, "Pretendard, Hind, sans-serif", "800×1280px 세로 슬라이스 20MB 규격 검수 + 에피소드 썸네일/시리즈 배너 패키징 + 글로벌 독자 퍼블리싱", ["/en/canvas", "/creative/list", "/preview"]),
  // Wave 4 (11개 플랫폼 — 총 50개 플랫폼 완성)
  comicai: defineWaveTheme("comicai", "ComicAI", "https://comicai.ai/", "ev_8fc708ebcd852976d561b083719e41f869c5fe354754bec21844793b124868fa", "930071156853048ff0e0f57ea252e7709087821bdcf076b3ffb03a35d23fd44d", ["#101c36", "#162447", "#1f4068", "#ffffff", "#a3b1cc", "#e43f5a", "#4e89ae"], 10, "Helvetica, Arial, Inter, sans-serif", "스토리 원고 입력 → 캐릭터 시드 고정 → 4단 패널 자동 생성 및 말풍선 배치", ["/", "/terms.html", "/privacy.html"]),
  "ai-comic-factory": defineWaveTheme("ai-comic-factory", "AI Comic Factory", "https://aicomicfactory.com/", "ev_f72ef904f9b5a152be22c6fc0ae54793786b3a3e864a99406232961d6189da49", "d96029f8ef11d9338add73112e313b4738e6872ebd3b861e7bafc32ea1c632a1", ["#2f2e41", "#3f3d56", "#616161", "#f2f2f2", "#b3b3b3", "#ff4b4b", "#d4834f"], 12, "Bangers, Action Man, Inter, sans-serif", "그리드 레이아웃 템플릿 선택 → LLM 패널별 시각 프롬프트/대사 캡션 자동 분해 → 코믹 페이지 렌더링", ["/"]),
  "wonderunit-storyboarder": defineWaveTheme("wonderunit-storyboarder", "Wonder Unit Storyboarder", "https://wonderunit.com/storyboarder/", "ev_3f9e4e3851960c2bdc3a5ed49d90e291503bdd5b496e362ab581c507f5f93516", "fab9d391c06610b00601107a9c029766a18c7249e030d329de173d5901dc089d", ["#104a72", "#172a3a", "#4fb8d9", "#fffae8", "#6fe3e7", "#5648c1", "#2bc792"], 8, "proximanova, Inter, sans-serif", "3D Shot Generator 자연어 씬 배치 + 6종 드로잉 브러시(Light Pencil/Pen/Tone/Note) + Premiere/FinalCut/PDF 타임라인 호환", ["/storyboarder", "/characterizer", "/storyboarder/faq/", "/explorers", "/software"]),
  storyboardthat: defineWaveTheme("storyboardthat", "StoryboardThat", "https://www.storyboardthat.com/", "ev_656fb33719de2bc19920a03c507045c45066c33407bab52a197446011bcd27c6", "8393bbca4d61579cbf9645e70cf8d8e75833ac527d36a4b92655d103b6bfefa7", ["#f2f2f2", "#ffffff", "#d6d6d6", "#141414", "#233b53", "#1032cf", "#ff8360"], 10, "Open Sans, Inter, sans-serif", "배경 씬·포저블 캐릭터·말풍선·소품 드래그 앤 드롭 그리드 스토리보드 저작(/storyboard-creator)", ["/storyboard-creator", "/photos", "/library", "/classroom/join", "/training-sessions"]),
  "cotrans-manga-translator": defineWaveTheme("cotrans-manga-translator", "Cotrans Manga Translator", "https://cotrans.touhou.ai/", "ev_54f95f57bd3a06ae86707333fb2f0e776d1d40960aa7ba68257edce6f8d64ae0", "084c205150a9f44a69e48dae5432f00fed9ed8d31f73c8b352f5cc4b17faeec3", ["#0f172a", "#1e293b", "#334155", "#e5e7eb", "#9ca3af", "#00dc82", "#38bdf8"], 10, "Inter, Noto Sans CJK, sans-serif", "만화·웹툰 말풍선 텍스트 영역 검출 → LAMA/AOT 인페인팅 식자 제거 → 다국어 세로/가로 자동 조판", ["/"]),
  "vroid-studio": defineWaveTheme("vroid-studio", "Pixiv VRoid Studio", "https://vroid.com/en/studio", "ev_c576d12146868421e9d6ba8cfa1bfc7f873919c600291f2debf045e15cb7a3a2", "08604aecc4a4fc5f9714062f6699bcd46c1e4ad108b96c06f21a7ed326bfa126", ["#27282a", "#323438", "#5c5c5c", "#ffffff", "#adadad", "#0096fa", "#ffec00"], 10, "Noto Sans JP, Inter, sans-serif", "브러시 스트로크 기반 3D 프로시저럴 헤어 메쉬 조형 + 홍채/피부/의상 레이어 텍스처 페인팅 + VRM 1.0/0.x 익스포트", ["/en/studio", "/en/news"]),
  "blockade-skybox-ai": defineWaveTheme("blockade-skybox-ai", "Blockade Labs Skybox AI", "https://skybox.blockadelabs.com/", "ev_c46551c56ec0a695511eda07f1956761de35e23dd59145ea99cf943be999614d", "760211f443ecca704078f2e45036c2236271be226ae9b54d923e13dcc619b8b7", ["#121214", "#202020", "#343438", "#f5f5f7", "#797979", "#01ee8a", "#ff9773"], 12, "Inter, Geist, sans-serif", "360° 구면(Equirectangular) 파노라마 웹툰 배경 생성 + 뎁스맵(Depth Map) 3D 메쉬 투영 + 카메라 화각/시간대 리믹스", ["/", "/api"]),
  krita: defineWaveTheme("krita", "Krita & Krita AI Diffusion", "https://krita.org/en/", "ev_dc41a093eb389b38b07f62a90b7ca2cb41727b48acd6ce2290e7a3a60e41bbec", "1a736d6bf0d1687c6154907e90ff75170e75d184ba797b333fac46b4f12a463e", ["#324148", "#403f58", "#505050", "#eafaff", "#7ba3af", "#347296", "#c8f1ff"], 8, "Inter, Noto Sans, sans-serif", "Wrap-around 심리스 텍스처 모드 + Colorize Mask 스마트 선화 채색 + Krita AI Diffusion 실시간 리전 ControlNet", ["/en/", "/en/features/"]),
  "procreate-dreams": defineWaveTheme("procreate-dreams", "Procreate Dreams", "https://procreate.com/dreams", "ev_639c3cee989930f743e6b2a8eb07c05d1904eacdd13debfb8970cead77c2d48b", "6ba98881b8877f0eaab202096416deb4eff89f5598f3be4a8e0e53bd1779a913", ["#121212", "#141414", "#262626", "#ffffff", "#8e8e93", "#f7235b", "#ff8a00"], 14, "SF Pro Display, Inter, sans-serif", "Performing 실시간 터치 모션 레코딩 + Flipbook 프레임 바이 프레임 작화 + 멀티터치 라이브 워프/블렌딩 타임라인", ["/dreams", "/ipad"]),
  "pixiv-sketch": defineWaveTheme("pixiv-sketch", "pixiv Sketch & Auto-Color", "https://sketch.pixiv.net/", "ev_6f5499644d8fd6ca3e53913452d3d3758a3c65c545f69d3fe0e26877cf290cf3", "4a4918b7d2925c66637802fb38d56d8b77f656f9a4bdb1234affb1dcd91258ad", ["#f9f5ef", "#f2f2f2", "#cfcac2", "#212129", "#6d7f8b", "#2e97d8", "#56bd8a"], 12, "Hiragino Sans, Noto Sans JP, sans-serif", "라이브 드로잉 스트림 + 선화 업로드 원클릭 자동 채색 & 컬러 힌트 포인트 보정", ["/"]),
  artbreeder: defineWaveTheme("artbreeder", "Artbreeder Splicer & Mixer", "https://www.artbreeder.com/", "ev_88ee616e627fe37325a9d68ce984f9168ea1a06939c072660cc28b6c6644480d", "1a9af8e6d89003b26d314f78fd737d57c83678d9364baa76b329c989a9ac067d", ["#f2f0fd", "#eae7fb", "#dad8ee", "#1e1b2e", "#6e6c80", "#5865f2", "#ea3376"], 12, "Inter, Plus Jakarta Sans, sans-serif", "캐릭터·배경 유전자 슬라이더 교배(Splicer/Mixer) + Collage 도형 합성 + Poser 얼굴 각도/표정 잠금", ["/", "/create/composer", "/create/splicer", "/create/collage"]),
});
