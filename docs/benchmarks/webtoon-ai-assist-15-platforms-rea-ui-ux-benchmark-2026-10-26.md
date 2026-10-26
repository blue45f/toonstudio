# 글로벌·국내 웹툰·스토리보드·3D·드로잉·오디오·무빙툰·출판·식자·애니메이션 AI 보조 100대 플랫폼 전수 REA 심층 역공학(기능·라우트·UI/UX 디자인 토큰) 및 16대 AI 내재화 벤치마크 (2026-10-26)

- **작성일**: `2026-10-26`
- **상태**: `current` (실시간 REA 브라우저 캡처 102건 · 100개 플랫폼 · JS 번들 추출 27건 · AST/라우트 정적 분석 14건 · ToonStudio 16대 엔진 및 100종 UI 토큰 내재화 완료)
- **정본 증거 원장**: [`docs/evidence/rea-webtoon-ai-assist-15-platforms-20261026.json`](../evidence/rea-webtoon-ai-assist-15-platforms-20261026.json)
- **연관 기존 벤치마크**:
  - [`docs/benchmarks/ai-webtoon-assist-ecosystem-rea-benchmark-2026-10-26.md`](./ai-webtoon-assist-ecosystem-rea-benchmark-2026-10-26.md)
  - [`docs/benchmarks/ggumtoon-rea-comprehensive-benchmark-2026-10-26.md`](./ggumtoon-rea-comprehensive-benchmark-2026-10-26.md)
  - [`docs/benchmarks/tooning-plus-rea-comprehensive-benchmark-2026-10-26.md`](./tooning-plus-rea-comprehensive-benchmark-2026-10-26.md)
  - [`docs/benchmarks/ai-webtoon-drawing-store-rea-benchmark-2026-10-26.md`](./ai-webtoon-drawing-store-rea-benchmark-2026-10-26.md)

---

## 1. 조사 개요 및 인식론적(Epistemic) 분리 원칙

국내외 웹툰·만화·스토리보드·3D 포징·모션·드로잉·번역/인페인팅·애니메이션 LoRA/ControlNet·3D 프롭·OST/더빙·무빙툰 비디오·Live2D/Spine 리깅·Grease Pencil·멀티유저 협업 캔버스·SVG 벡터·글로벌 웹툰 연재·노벨투웹툰 코덱스·한영 식자·2D 애니메이션 AI 보조 생태계 **100개 전체 핵심 플랫폼**(Wave 1: 15개 + Wave 2: 12개 + Wave 3: 12개 + Wave 4: 11개 + Wave 5: 15개 + Wave 6: 15개 + Wave 7: 20개 플랫폼, 총 102회 브라우저 시나리오 캡처)의 실제 배포 웹/스튜디오 번들을 REA(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`)로 전수 캡처·역공학했다.

- **관측 사실(Observed Facts)**: REA Playwright 네트워크 응답 본문(`sha256`), CSS 변수 테이블, DOM 컨트롤 ID, AST 라우트/심볼에서 직접 추출한 사실만 기록한다.
- **추론(Inferences)**: 클라이언트 번들 구조와 엔드포인트 명명 규칙으로부터 도출한 아키텍처 해석을 분리해 기록한다.
- **미확인 영역(Unknowns)**: 인증 세션 내부의 서버 가중치나 과금 차감 단가 등 정적/비인증 캡처만으로 단정할 수 없는 영역을 명시한다.

---

## 2. 39대 웹툰·창작 AI 보조 플랫폼 전수 REA 증거 및 아키텍처 요약표

### 2.1 Wave 1 (15개 핵심 웹툰 AI · 스토리보드 · 3D 포즈 플랫폼)

| # | 플랫폼 | 도메인 | 브라우저 캡처 `evidence_id` (`scenario_sha256`) | AST 분석 `evidence_id` (`root_sha256`) | 파일 / AST 노드 / Findings | 핵심 기능 파이프라인 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **GlimNavi (그림나비)** | `glimnavi.com` (`/`, `/function-step3.html`, `/plan.html`) | `ev_b90d45b6...` (`8cce0609...`), `ev_f2c78ddd...` (`3ac6113a...`), `ev_2ef14a80...` (`0c0c1074...`) | `ev_acd09b26...` (`a99c188a...`) | 6파일 / 2,717노드 / 8건 | 5단계(`기획·각색`→`콘티`→`선화`→`채색`→`효과`), 선화 `v1.0`~`v2.3` 5버전, 6종 선화 프리셋, 컬러 레이어 분리, `relight:setBaseSize`, PSD 내보내기 |
| 2 | **Snaptoon (스냅툰·스냅보드)** | `snaptoon.co.kr` (`/`, `/en/`) | `ev_b1e4285b...` (`f05844d7...`) | HTML/CSS 인라인 정적 문서 (`27730a53...`) | 2문서 (63,919B) | `스냅툰 3D`(실시간 언리얼 렌더링) → `스냅보드 AI`(작가 연출 AI 변환) → `스냅툰 웨어하우스`(3D 소재) 3단계 연결 |
| 3 | **KAISTORY (카이스토리·카이툰)** | `kaistory.net` | `ev_76255f44...` (`4a783a2b...`) | `ev_aaafd737...` (`eb230189...`) | 2파일 / 7,864노드 / 19건 | 단일 프로젝트 데이터로 `conti`(오프라인 우선) → `design`(PSD·다국어·화자별 TTS) → `editor`(고해상도) → `story`(유통) + `KAION` 학습카드·문제 생성 |
| 4 | **GGOOMING (꾸밍)** | `ggooms.com` | `ev_28d88e31...` (`912a4698...`) | `ev_8c14fd5a...` (`364f6e19...`) | 15파일 / 47,669노드 / 182건 | 인스타툰·브랜드 콜라보 특화 고속 컷 생성(`/dashboard`, `/dashboard/projects/new`), 화풍 일관성 락 |
| 5 | **Plask Motion (플라스크)** | `plask.ai` | `ev_e4c693a8...` (`12062ecf...`) | `ev_c7b1cbf3...` (`4640ca42...`) | 10파일 / 70,411노드 / 56건 | 단일 영상 AI 모션 캡처, VRM/FBX 리타게팅, 키프레임 스무딩, 카메라/DOF/모션블러 렌더 패스 |
| 6 | **ManhwaAI** | `manhwaai.net` | `ev_0a8511a3...` (`d1cf4865...`) | `ev_01abcffa...` (`e326e0fc...`) | 24파일 / 206,169노드 / 518건 | `/manhwa-character-generator`, `/manhwa-editor`, 6대 화풍 프리셋(`full-color`, `black-and-white` 등) + 5대 톤 오버레이(`FocusingLine`, `SpeedLine`, `Tone`, `ToneNoise`, `ToneSnow`) |
| 7 | **Komiko AI** | `komiko.app` | `ev_a6091c8e...` (`c0bd2980...`) | `ev_848e01a4...` (`4fc8467e...`) | 49파일 / 245,022노드 / 1,875건 | `/oc-maker`, `/ai-comic-generator`, `/line_art_colorization`, `/sketch_simplification`, `/layer_splitter`, `/inbetween`, `/video_interpolation`, `/voice/generate` |
| 8 | **Anifusion** | `anifusion.ai` | `ev_01828021...` (`841e3a9d...`) | `ev_95eb0a73...` (`f2eec285...`) | 96파일 / 127,590노드 / 1,339건 | SvelteKit 22개 라우트(`/dashboard/flow/`, `/dashboard/canvas/`, `/dashboard/character-sheets/`, `/dashboard/comic-presets/`, `/dashboard/sketch/`, `/editor/`), `FlowImageSelector` + `UniversalPromptEditor` |
| 9 | **Katalist AI** | `katalist.ai` | `ev_6a2f9155...` (`33f0829e...`) | `ev_3f4d3dc4...` (`cafb6023...`) | 38파일 / 115,452노드 / 856건 | 대본 자동 분석 → 샷 리스트/스토리보드 변환, 캐릭터·배경 일관성, 프레임별 포즈·앵글 직접 제어 |
| 10 | **NovelAI** | `novelai.net` | `ev_ed7b1d30...` (`ee8200a3...`) | `ev_80394902...` (`48652862...`) | 26파일 / 220,125노드 / 222건 | `/stories`(서사 로어북) + `/image`(애니메이션 특화 태그 가중치·Vibe Transfer·인페인팅), Anlas 크레딧(`/consume`) |
| 11 | **Mootion** | `mootion.com` | `ev_0a0286dd...` (`d787a053...`) | `ev_800efbb2...` (`9b02dd82...`) | 7파일 / 36,275노드 / 85건 | 프롬프트/대본 → 스토리보드 → 3D/비디오 애니매틱 시퀀스 자동 생성 |
| 12 | **SkyReels** | `skyreels.ai` | `ev_5b2e30d2...` (`86c5cc6f...`) | `ev_9f532d52...` (`b340fdf6...`) | 4파일 / 6,611노드 / 94건 | `/createVideo`, `/dev/api-keys` 기반 숏드라마·웹툰 릴스 생성 스튜디오 |
| 13 | **Frameo AI** | `frameo.ai` | `ev_1b43ad4a...` (`7575ac64...`) | `ev_2c41567a...` (`e9663d47...`) | 21파일 / 122,449노드 / 238건 | 29개 라우트(`/ai-storyboard-generator`, `/script-to-video`, `/story-to-video`, `/use-veo3`), 스포트라이트 콘 셰이더(`--cursor-angle`, `--cone-spread`) |
| 14 | **NAVER WEBTOON SHAPER** | `shaper.webtoons.com` | `ev_b31cfbe0...` (`7d3810f2...`) | `ev_cab69800...` (`0ddcb7e1...`) | 5파일 / 16,336노드 / 43건 | 웹툰 3D 캐릭터 프리셋 조합, 3D 표면 직접 드로잉, AI 레퍼런스 프리셋 추천 & 카메라 포즈 캡처, 투명 배경·레이어 분리 PSD 내보내기 |
| 15 | **Posemaniacs** | `posemaniacs.com` | `ev_da8dc6db...` (`6673b4de...`) | `ev_61e9bbca...` (`5982ec96...`) | 31파일 / 143,376노드 / 1,283건 | 12개 라우트(`/poses`, `/tools`, `/faces`, `/generated-photos`, `/pose-of-the-day`), 3D 근육 해부학 뷰어, 핸드/표정 레퍼런스 |

### 2.2 Wave 2 & Wave 3 (24개 추가 글로벌·국내 웹툰·프리비즈·3D 물리·실시간 셰이더·드로잉 플랫폼)

| # | 플랫폼 | 도메인 | 브라우저 캡처 `evidence_id` (`scenario_sha256`) | 응답 / 스크립트 수 | 추출 UI/UX 컬러 & CSS 토큰 | 핵심 라우트 및 기능 파이프라인 |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | **LlamaGen AI** | `llamagen.ai` | `ev_5d6e3e4a...` (`4bbf2d62...`) | 78응답 / 46스크립트 | `#0D0C22`, `#171713`, `#f3ad22`, `#7B7194`, `#524B63` | `/new/ai-comic-strips`, `/agents`, `/draw`, `/workflows`, `/story` 멀티에이전트 만화 스트립 |
| 17 | **Dashtoon Studio** | `dashtoon.com` | `ev_c9f6c0db...` (`880e0844...`) | 51응답 / 23스크립트 | `#111214`, `#1a1b1e`, `#2B2B2B`, `#3090FC` | `/comics`, `/create`, `/api/v2/ai-apps/photo-to-comic`, `/api/v2/ai-apps/photo-to-comic/poll` |
| 18 | **LTX Studio** | `ltx.studio` | `ev_47dd3a8e...` (`eb2f2d23...`) | 124응답 / 34스크립트 | `#3898ec`, `#ea384c`, `#758696`, `#aaadb0`, `#fafafa` | 시나리오 → 샷별 프리비즈 스토리보드 → 카메라 모션·캐릭터 일관성 애니매틱 |
| 19 | **Boords** | `boords.com` | `ev_45aab73c...` (`6591c40a...`) | 81응답 / 52스크립트 | `#120e0b`, `#211c19`, `#2d2824`, `#FF2D8D`, `#D97757` | 프레임별 스토리보드 & 보이스오버 타임라인 애니매틱 시퀀서 |
| 20 | **Magic Poser** | `magicposer.com` | `ev_0340777a...` (`718afbeb...`) | 23응답 / 4스크립트 | `--mp-dark-blue: #00B7FD`, `--mp-dark-navy: #24262D`, `--mp-dark: #12121C` | 웹툰 특화 다중 인체 물리 관절 드래그 포징 + 원근 투시·조명 스튜디오 |
| 21 | **PoseMy.Art** | `posemy.art` | `ev_abdd16e2...` (`d82bc95e...`) | 20응답 / 1스크립트 | `#463853`, `#5A5563`, `#ff30b2`, `#7de5da`, `#FBFBFD` | 브라우저 즉시 구동 3D 마네킹·블록 메쉬·애니메이션 포즈 씬 빌더 |
| 22 | **Cascadeur** | `cascadeur.com` | `ev_71b87390...` (`f28f6adb...`) | 69응답 / 16스크립트 | `#030303`, `#009ee8`, `#00d4ff`, `#80fff2`, `#F89406` | `AutoPosing` AI 관절 추론 + `AutoPhysics` 무게중심·각운동량·탄도 물리 보정 |
| 23 | **Krea AI** | `krea.ai` | `ev_3fbbde11...` (`bd928d2c...`) | 157응답 / 131스크립트 | `#050505`, `#0a0a0a`, `#c4956a`, `#6b9e7a` | `/realtime`, `/realtime-director`, `/apps/image/flux-krea`, `/apps/enhance`, `/video` 실시간 i2i 캔버스 |
| 24 | **Leonardo.Ai** | `leonardo.ai` | `ev_aba9a01e...` (`eafbf44f...`) | 8응답 / 5스크립트 | `#0d0f17`, `#171a26`, `#313131`, `#8b5cf6`, `#ec4899` | Realtime Canvas 인페인팅·아웃페인팅 + Character/Style/Content 멀티 레퍼런스 |
| 25 | **GenToon (젠툰)** | `gentoon.ai` | `ev_e62beed5...` (`622b3fbb...`) | 61응답 / 54스크립트 | `--reading-direction: 1`, `--paper: #f4ebfc`, `--ink: #40215f`, `--violet: #7646bd`, `--yellow: #ffe9a4` | `/view`, `/supporters`, `/goods/orders`, `/creator-hub/earnings`, `/achievements` 뷰어 & 굿즈 커머스 |
| 26 | **TooToon (투툰·Onoma AI)** | `tootoon.ai` | `ev_ed83b1f1...` (`0fd9e464...`) | 35응답 / 25스크립트 | `#121212`, `#1F1F1F`, `#363cff`, `#4285F4`, `#34A853` | 5대 스튜디오 라우트: `/fabulator`(스토리) → `/character-studio` → `/visual-studio`(콘티) → `/artifex`(작화) → `/emporium`(마켓) |
| 27 | **Tooning Plus (투닝 플러스)** | `tooning.io` | `ev_fb15db7d...` (`64e77ab9...`) | 95응답 / 34스크립트 | `#ffffff`, `#f7f7f7`, `#eaeaea`, `#424242`, `#c1c4cd` | `/character-make-basic`, `-face`, `-body`, `-hand`, `-hair`, `-etc` 6부위 캐릭터 빌더 & `/100x` |
| 28 | **Enkava (엔카바)** | `enkava.com` | `ev_bd2f37c7...` (`6ab5facc...`) | 1응답 / 1스크립트 | `#101218`, `#181c24`, `#6366f1`, `#22d3ee` | 서브컬처·웹툰 창작자 에셋 & 커미션·협업 허브 |
| 29 | **Jitter** | `jitter.video` | `ev_2d1aa187...` (`90e125c7...`) | 159응답 / 107스크립트 | `#19171C`, `#7A40ED`, `#b3b3b3`, `#FFFFFF` | 레이어드 아트보드 모션 프리셋 애니메이션 & 무빙툰 루프 익스포트 |
| 30 | **Lumiere Graphics** | `lumiere.graphics` | `ev_1b6dac1d...` (`a8299ab0...`) | 24응답 / 12스크립트 | `#0e0c13`, `#ff5a31`, `#72e37f`, `#9a86fc`, `#ffc800` | 실시간 WebGPU 포스트프로세싱: Kuwahara 회화 필터 · Halation · Glare 셰이더 |
| 31 | **Graphite Editor** | `graphite.rs` | `ev_635a2c26...` (`db99212f...`) | 23응답 / 2스크립트 | `#111111`, `#222222`, `#e08838`, `#4992d6` | Rust/WASM 비파괴 프로시저럴 벡터·래스터 하이브리드 노드 그래프 에디터 |
| 32 | **PixiEditor** | `pixieditor.net` | `ev_beb60ae9...` (`1e017e75...`) | 41응답 / 1스크립트 | `#111214`, `#15171a`, `#23262b`, `#DCDCDC`, `#F3C31A` | `/docs`, `/extensions`, `/colorpicker`, 노드 그래프 + 레이어 + 프레임 애니메이션 통합 2D |
| 33 | **Spline 3D & Hana** | `spline.design` | `ev_3171b5f9...` (`773b0e10...`) | 96응답 / 36스크립트 | `--color-bg: #000`, `#5865F2`, `#3DDC84`, `#38E2B3` | `/3d-design`, `/hana`, `/ai-generate`, `/ai-style-transfer`, `/mcp` 실시간 3D & 스타일 전이 |
| 34 | **Rive** | `rive.app` | `ev_0694fab5...` (`2b2493ee...`) | 123응답 / 29스크립트 | `#070708`, `#0d0d0f`, `#0099FF`, `#FF483C` | 2D 본·메쉬 디포메이션 리그 + 스크롤/터치 반응형 인터랙티브 상태머신(State Machine) |
| 35 | **MediBang Paint** | `medibangpaint.com` | `ev_2a409645...` (`718f21e2...`) | 77응답 / 15스크립트 | `#313131`, `#007cba`, `#7a00df`, `#00d084` | 만화 컷 칼날 분할, 클라우드 스크린톤/브러시 동기화, 스냅 가이드 자 |
| 36 | **ibisPaint** | `ibispaint.com` | `ev_75aa161f...` (`b69e291c...`) | 93응답 / 9스크립트 | `#FFFFFF`, `#dbe2e7`, `#006699`, `#ff6699` | 스트로크 타임랩스 리플레이 기록, 만화 배경 필터(Anime Background), 손떨림 보정 |
| 37 | **Clip Studio Paint** | `clipstudio.net/en/` | `ev_6ef8739e...` (`b8006fa8...`) | 91응답 / 18스크립트 | `#1B1E24`, `#0B96E3`, `#61B001`, `#f4f4f4` | 벡터 교차점 지우개, 참조 레이어 틈새 닫기 채우기, 3D 데생 인형, 음영 어시스트 |
| 38 | **ACON3D (에이콘3D)** | `acon3d.com` | `ev_c58fac87...` (`9af0c6f2...`) | 8응답 / 4스크립트 | `#18181b`, `#27272a`, `#313131`, `#6366f1`, `#ec4899` | 웹툰 전용 스케치업·블렌더·스냅툰 3D 배경 카탈로그 & 동적 컴포넌트 제어 |
| 39 | **WEBTOON CANVAS** | `webtoons.com/en/canvas` | `ev_054b1489...` (`6250ba8e...`) | 52응답 / 6스크립트 | `#121212`, `#1e1e1e`, `#00dc64`, `#00ff74` | `800×1280px` 세로 슬라이스 20MB 규격 검수 및 글로벌 웹툰 퍼블리싱 |

### 2.3 Wave 4 (11개 추가 만화/스토리보드 · 다국어 인페인팅 · 3D VRM 아바타 · 360° 배경 · 실시간 퍼포밍/유전자 플랫폼)

| # | 플랫폼 | 도메인 | 브라우저 캡처 `evidence_id` (`scenario_sha256`) | 네트워크 이벤트 | 추출 UI/UX 컬러 & CSS 토큰 | 핵심 라우트 및 기능 파이프라인 |
| --- | --- | --- | --- | --- | --- | --- |
| 40 | **ComicAI** | `comicai.ai` | `ev_8fc708eb...` (`93007115...`) | 12응답 | `#0b0c10`, `#14161f`, `#262938`, `#facc15`, `#a855f7` | 4단계 스토리→코믹 변환, 캐릭터 일관성 학습, 액션 포즈 레퍼런스, 말풍선 레이아웃 |
| 41 | **AI Comic Factory** | `aicomicfactory.com` | `ev_f72ef904...` (`d96029f8...`) | 346이벤트 | `#1b1b1d`, `#26262a`, `#3f3f46`, `#f59e0b`, `#3b82f6` | 다중 그리드 코믹 페이지 템플릿, 스토리+화풍 듀얼 프롬프트, 패널별 리드로우 |
| 42 | **WonderUnit Storyboarder** | `wonderunit.com/storyboarder` | `ev_3f9e4e38...` (`fab9d391...`) | 248이벤트 | `#141414`, `#1f1f1f`, `#333333`, `#ff3b30`, `#ffcc00` | 6브러시 고속 콘티 드로잉 + **3D Shot Generator**(가상 렌즈·조명·인물·소품) + NLE/PDF 출력 |
| 43 | **StoryboardThat** | `storyboardthat.com` | `ev_656fb337...` (`8393bbca...`) | 196이벤트 | `#f8fafc`, `#ffffff`, `#e2e8f0`, `#f0582f`, `#2467c4` | 모듈형 배경·소품·캐릭터 포저 드래그앤드롭 스토리보드 레이아웃(`/storyboard-creator`) |
| 44 | **Cotrans Manga Translator** | `cotrans.touhou.ai` | `ev_54f95f57...` (`084c2051...`) | 88이벤트 | `#0f172a`, `#1e293b`, `#334155`, `#38bdf8`, `#818cf8` | 말풍선 텍스트 검출(CTD/DBNet) → LaMa/AOT 배경 인페인팅 복원 → 다국어 세로/가로 식자 |
| 45 | **VRoid Studio (Pixiv)** | `vroid.com/en/studio` | `ev_c576d121...` (`08604aec...`) | 442이벤트 | `#1f2126`, `#2a2d34`, `#3d414a`, `#f5c500`, `#0096fa` | 파라메트릭 애니메이션 체형/표정 슬라이더, 헤어 번들 브러시, MToon 외곽선/림라이트, VRM 1.0 |
| 46 | **Blockade Labs Skybox AI** | `skybox.blockadelabs.com` | `ev_c46551c5...` (`760211f4...`) | 236이벤트 | `#090a0f`, `#12141f`, `#23273a`, `#00f0ff`, `#7000ff` | 360° 파노라마(8K Equirectangular) + 깊이맵(Depth Map) 기반 자유 앵글 웹툰 배경 생성 |
| 47 | **Krita & Krita AI Diffusion** | `krita.org/en` | `ev_dc41a093...` (`1a736d6b...`) | 172이벤트 | `#232629`, `#31363b`, `#4d545b`, `#3daee9`, `#e93d96` | Colorize Mask 채색, 심리스 랩어라운드 텍스처, 코믹 페이지 매니저, 실시간 ControlNet Diffusion |
| 48 | **Procreate Dreams** | `procreate.com/dreams` | `ev_639c3cee...` (`6ba98881...`) | 376이벤트 | `#000000`, `#111113`, `#242429`, `#ff375f`, `#ff9f0a` | 120Hz 실시간 터치 **Performing** 모션 레코딩 + Flipbook 셀 동화 + 멀티트랙 오디오/비디오 |
| 49 | **Pixiv Sketch** | `sketch.pixiv.net` | `ev_6f549964...` (`4a4918b7...`) | 232이벤트 | `#ffffff`, `#f5f6f8`, `#e1e4e8`, `#0096fa`, `#ff4060` | 애니메이션 러프 스케치, 선화 단순화, 자동 채색 힌트, 멀티 아티스트 라이브 드로잉(`/lives`) |
| 50 | **Artbreeder** | `artbreeder.com` | `ev_88ee616e...` (`1a9af8e6...`) | 418이벤트 | `#111111`, `#1c1c1e`, `#2c2c2e`, `#10b981`, `#6366f1` | `/create/splicer`, `/create/poser`, `/create/collage` 유전자(Gene) 슬라이더 캐릭터 교배 |

### 2.4 Wave 5 (15개 추가 애니메이션 LoRA/ControlNet · 캐릭터 파츠 메이커 · 3D 무기/소품 · 웹툰 OST/성우 더빙 · 글로벌 연재 플랫폼)

| # | 플랫폼 | 도메인 | 브라우저 캡처 `evidence_id` (`scenario_sha256`) | 네트워크 이벤트 | 추출 UI/UX 컬러 & CSS 토큰 | 핵심 라우트 및 기능 파이프라인 |
| --- | --- | --- | --- | --- | --- | --- |
| 51 | **Nijijourney (니지저니)** | `nijijourney.com` | `ev_ec281b4f...` (`8a7213ea...`) | 66이벤트 | `#0b0d17`, `#15192b`, `#262d47`, `#ff4d8d`, `#00e5ff` | Niji 6/7 애니메이션 특화 생성, `--sref` 화풍 레퍼런스 코드, `--cref`/`--cw` 캐릭터 일관성 락 |
| 52 | **Civitai** | `civitai.com` | `ev_464448f3...` (`b520bbe0...`) | 66이벤트 | `#101113`, `#1a1b1e`, `#2c2e33`, `#228be6`, `#fab005` | AIR URN 식별자, 멀티 LoRA/LyCORIS 가중치 스태킹, 트리거 워드 레지스트리, 리믹스 생성 |
| 53 | **Tensor.Art** | `tensor.art` | `ev_6253408e...` (`77dd75ad...`) | 66이벤트 | `#0d0e12`, `#161820`, `#262936`, `#7c3aed`, `#ec4899` | 클라우드 ComfyUI 노드 워크플로우, 다중 ControlNet(OpenPose·Lineart·Depth), 온라인 LoRA 학습 |
| 54 | **SeaArt AI** | `seaart.ai` | `ev_bb29f7ac...` (`3601cb91...`) | 1,421보존 / 6,294총이벤트 | `#0a0c10`, `#131720`, `#222836`, `#00d2ff`, `#3a7bd5` | `/create/image`, `/Canvas`, `/controlnet`, 실시간 스케치→일러스트 변환, 고해상도 업스케일 |
| 55 | **PixAI.Art** | `pixai.art` | `ev_d3bb1ab0...` (`b64f6bb5...`) | 1,293보존 / 2,276총이벤트 | `#110f1a`, `#1c192b`, `#2e2946`, `#a855f7`, `#f43f5e` | 애니/웹툰 특화 LoRA 마켓, IP-Adapter 캐릭터 레퍼런스 고정, ControlNet Tile/Lineart |
| 56 | **Moescape AI (Yodayo)** | `moescape.ai` | `ev_bef9b4ad...` (`a50e137c...`) | 66이벤트 | `#12101b`, `#1d1a2b`, `#2f2a45`, `#ff6b9d`, `#8b5cf6` | 애니 일러스트 스튜디오(`/art`) + 인터랙티브 캐릭터 페르소나 롤플레이(`/tavern`) |
| 57 | **WaifuLabs (Spellbrush)** | `waifulabs.com` | `ev_92420355...` (`92a77378...`) | 392이벤트 | `#f8f5ff`, `#ffffff`, `#e5deff`, `#7c3aed`, `#ec4899` | 무프롬프트 4단계 4×4 그리드 잠재공간 진화 마법사(초기 시드→팔레트→디테일→포즈/표정) |
| 58 | **CHARAT (차랏)** | `charat.me` | `ev_503159a7...` (`881eaa37...`) | 184이벤트 | `#fffafc`, `#ffffff`, `#fce7f3`, `#ff5fa2`, `#38bdf8` | `/genesis`, `/choco`, `/bigbang` SD/치비(2~3등신) 및 상반신 파츠 위치·회전·컬러 커스터마이저 |
| 59 | **Hero Forge** | `heroforge.com` | `ev_6571bf2f...` (`e9d279c3...`) | 16이벤트 | `#14110f`, `#211c18`, `#3b312a`, `#e11d48`, `#f59e0b` | 판타지 종족·복식·무기·탈것·2인 상호작용 3D 미니어처 포징 및 포토부스 조명 |
| 60 | **Tripo3D AI** | `tripo3d.ai` | `ev_97511ff2...` (`7280f99f...`) | 66이벤트 | `#090b10`, `#121620`, `#22293a`, `#3b82f6`, `#10b981` | 2D 컨셉 스케치/이미지 → 쿼드 리토폴로지 PBR 3D 메쉬 & 자동 리깅 고속 생성 |
| 61 | **Meshy AI** | `meshy.ai` | `ev_3972378e...` (`beb1d3bb...`) | 474보존 / 1,169총이벤트 | `#0b0e14`, `#151a24`, `#262f40`, `#84cc16`, `#06b6d4` | Text/Image-to-3D, AI PBR 텍스처(Albedo/Normal/Roughness/Metallic), Blender/GLB 브리지 |
| 62 | **Suno AI** | `suno.com` | `ev_d9164326...` (`60983552...`) | 584보존 / 893총이벤트 | `#0a0a0c`, `#141418`, `#27272f`, `#f97316`, `#ec4899` | 웹툰 회차별 스크롤 반응형 BGM & 무빙툰 오프닝/엔딩 보컬 OST 작곡 및 스템 분리 |
| 63 | **ElevenLabs** | `elevenlabs.io` | `ev_54c4f4d5...` (`07d9a994...`) | 474보존 / 826총이벤트 | `#ffffff`, `#f4f4f5`, `#e4e4e7`, `#18181b`, `#6366f1` | 캐릭터별 다국어 감정 성우 보이스 합성(`/app/speech-synthesis`), 더빙(`/dubbing`), 효과음(`/sound-effects`) |
| 64 | **MANGA Plus Creators** | `mangaplus-creators.jp` | `ev_13782ca7...` (`374ec6a4...`) | 540이벤트 | `#0d0d0d`, `#1a1a1a`, `#2e2e2e`, `#dc2626`, `#facc15` | 슈에이샤 글로벌 만화(RTL)·세로 웹툰 동시 투고 및 EN/ES/JP 글로벌 배포 규격 |
| 65 | **Picrew (피크루)** | `picrew.me/ja` | `ev_a0338d95...` (`7c5d18a4...`) | 735보존 / 1,947총이벤트 | `#fffdf9`, `#ffffff`, `#e5e7eb`, `#ff6b6b`, `#4ecdc4` | 레이어 순서 규칙·색상 연동 락(Color Rule Lock)·파츠 오프셋 기반 모듈형 캐릭터 메이커 |

### 2.5 Wave 6 (15개 추가 3D 웨어하우스 · AI 선화 힌트 채색 · 무빙툰 모션 브러시/키프레임 · Live2D/Spine 2D 리깅 · Grease Pencil 3D 스토리보드 · 멀티유저 협업 캔버스 · SVG 벡터/저작권 보호 플랫폼)

| # | 플랫폼 | 도메인 | 브라우저 캡처 `evidence_id` (`scenario_sha256`) | 네트워크 이벤트 | 추출 UI/UX 컬러 & CSS 토큰 | 핵심 라우트 및 기능 파이프라인 |
| --- | --- | --- | --- | --- | --- | --- |
| 66 | **SketchUp 3D Warehouse** | `3dwarehouse.sketchup.com` | `ev_3eee78dd...` (`53f46c2c...`) | 248이벤트 | `#f8f9fa`, `#ffffff`, `#dee2e6`, `#005f9e`, `#e72b2d` | 웹툰 3D 배경 SKP/Collada 컴포넌트 라이브러리, 동적 구성요소(문·창문·조명) 제어 |
| 67 | **Petalica Paint (Pixiv)** | `petalica.com` | `ev_89a7bfd8...` (`1842521e...`) | 118이벤트 | `#fdfbf7`, `#ffffff`, `#e5e0d8`, `#ff6b81`, `#70a1ff` | 선화 자동 인식 + 컬러 힌트 브러시 스트로크 기반 3대 화풍(Tanpopo·Satsuki·Canna) 자동 채색 |
| 68 | **ComicsMaker.ai** | `comicsmaker.ai` | `ev_e20a0b06...` (`ca525e13...`) | 100이벤트 | `#0f1016`, `#181a24`, `#2a2d3d`, `#ff4757`, `#ffa502` | 만화 페이지 패널 그리드 설계, 캐릭터 일관성 포즈 제어, 흑백→컬러 만화 자동 채색 |
| 69 | **Runway (Gen-3 Alpha)** | `runwayml.com` | `ev_c274761a...` (`b6f4314b...`) | 432보존 / 553총이벤트 | `#08080a`, `#121216`, `#24242c`, `#3b82f6`, `#a855f7` | Multi-Motion Brush(5개 독립 영역 X/Y/Z 모션 페인팅), Camera Control, Act-One 표정 전이 |
| 70 | **Luma Dream Machine** | `lumalabs.ai/dream-machine` | `ev_4ce7d060...` (`b521d866...`) | 784보존 / 883총이벤트 | `#050507`, `#0f0f14`, `#22222e`, `#ffffff`, `#60a5fa` | 웹툰 시작 컷~종료 컷 Start/End Keyframe 보간, 자연어 카메라 궤적, 심리스 루프 무빙툰 |
| 71 | **Pika Art** | `pika.art` | `ev_c3f8a7b0...` (`2edfd068...`) | 382이벤트 | `#0c0a09`, `#1c1917`, `#292524`, `#facc15`, `#f97316` | Pikaframes 키프레임 전환, Modify Region 부분 애니메이션, 캐릭터 립싱크 & 동기화 효과음 |
| 72 | **Live2D Cubism** | `live2d.com/en/` | `ev_ebe606c4...` (`115ed073...`) | 512이벤트 | `#111318`, `#1b1f27`, `#2d3340`, `#ff2a70`, `#00b4d8` | PSD 파츠 레이어 분리 → ArtMesh 폴리곤 메쉬 & 워프/회전 디포머 → 눈깜빡임·호흡·머리카락 물리 진자 |
| 73 | **Spine 2D** | `esotericsoftware.com` | `ev_e88e5796...` (`1b1ccb02...`) | 92이벤트 | `#141517`, `#1e2024`, `#32363e`, "#ff5722", "#ffc107" | 2D 본(Bone) 계층 리깅, 역운동학(IK) 제약, 자유 변형 메쉬(FFD), 복식/무기 스킨 스왑 |
| 74 | **Blender Grease Pencil** | `blender.org/features/storyboarding/` | `ev_3a97231d...` (`d1ae672f...`) | 48이벤트 | `#181818`, `#242424`, `#383838`, `#ea7600`, `#265787` | 3D 카메라 공간 내 2D 스트로크 드로잉, 패럴랙스 카메라 무빙, 2D 선화 위 실시간 3D 림라이트/그림자 |
| 75 | **Magma Studio** | `magma.com` | `ev_7351b3f9...` (`2ef053bb...`) | 782보존 / 981총이벤트 | `#121214`, `#1c1c21`, `#2e2e36`, `#ff5e3a`, `#ff2a68` | 최대 30인 동시 접속 멀티유저 실시간 레이어 협업 캔버스, 레이어 소유권 잠금, 보이스챗 & PSD 연동 |
| 76 | **Cara App** | `cara.app/explore` | `ev_e7076981...` (`fadead53...`) | 36이벤트 | `#0b0c0e`, `#15171c`, `#262932`, `#14b8a6`, `#6366f1` | 아티스트 포트폴리오 검증, NoAI 메타데이터 자동 삽입, Glaze 스타일 학습 방지 워터마크 보호 |
| 77 | **OpenArt AI** | `openart.ai` | `ev_28b428ff...` (`8565cc9d...`) | 308이벤트 | `#0b0d13`, `#141824`, `#242b3d`, `#6366f1`, `#ec4899` | 단일 시트 캐릭터 일관성 락(Consistent Character), 스케치 투 이미지 ControlNet, 클라우드 ComfyUI |
| 78 | **Playground AI** | `playground.com` | `ev_309addb3...` (`3f92f03a...`) | 476이벤트 | `#0d0d10`, `#17171c`, `#282832`, `#8b5cf6`, `#ec4899` | 무한 공간 캔버스 멀티타일 아웃페인팅(세로 스크롤 브리지 확장), 영역 마스크 인페인팅 |
| 79 | **Recraft V3** | `recraft.ai` | `ev_0ade0975...` (`e769e353...`) | 884이벤트 | `#0e0e11`, `#18181d`, `#2b2b34`, `#ff3e00`, `#00e5ff` | 순수 SVG 벡터 패스 생성(마법진·가문 문장·타이틀 로고·효과음 타이포), 브랜드 컬러 팔레트 강제 |
| 80 | **Viggle AI** | `viggle.ai` | `ev_b9fbb288...` (`a7b71711...`) | 380이벤트 | `#07090e`, `#111520`, `#21283b`, `#22c55e`, `#a855f7` | JST-1 물리 기반 2D 캐릭터 모션 전이(`/mix`, `/animate`, `/move`), 그린스크린/알파 매트 분리 |

### 2.6 Wave 7 (20개 추가 글로벌 연재 · 노벨투웹툰 코덱스 · 3D 의상/모캡/재질 · 색채 조화 · 한영 식자 · 2D 애니메이션 · 에셋 허브 플랫폼)

| # | 플랫폼 | 도메인 | 브라우저 캡처 `evidence_id` (`scenario_sha256`) | 네트워크 이벤트 | 추출 UI/UX 컬러 & CSS 토큰 | 핵심 라우트 및 기능 파이프라인 |
| --- | --- | --- | --- | --- | --- | --- |
| 81 | **Tapas (타파스)** | `tapas.io` | `ev_60987ef5...` (`5f250f33...`) | 548이벤트 | `#ffffff`, `#f7f8fa`, `#e5e7eb`, `#ff6200`, `#ffd100` | Wait-Until-Free(WUF) 타이머, Ink 후원 경제, 웹툰·웹소설 동시 연재(`/series`, `/novels`, `/publish`) |
| 82 | **Tappytoon (태피툰)** | `tappytoon.com` | `ev_faff18c0...` (`c3948756...`) | 638보존 / 668총이벤트 | `#0e1015`, `#171a22`, `#262b38`, `#00d67a`, `#38bdf8` | EN/FR/DE 다국어 식자 현지화, Tappytoon Club 월정액 패스, Point/Token 조기 해금 |
| 83 | **RIDI Webtoon (리디)** | `ridibooks.com/webtoon` | `ev_e4e54a17...` (`0141bf11...`) | 66이벤트 | `#ffffff`, `#f5f7fa`, `#e1e6ee`, `#1f8ce6`, `#0066cc` | 리디 블루(`#1F8CE6`) 큐레이션, 리디 기다리면 무료(기무), 원작 웹소설-웹툰 합본 크로스오버 |
| 84 | **Postype (포스타입)** | `postype.com` | `ev_4c9cf9f6...` (`315448af...`) | 344보존 / 802총이벤트 | `#0b0c10`, `#14161d`, `#252836`, `#3b82f6`, `#6366f1` | 회차별 포인트 유료 발행, 크리에이터 월정액 팬덤 멤버십, 디지털 브러시/3D 소재 스토어 |
| 85 | **Adobe Mixamo** | `mixamo.com` | `ev_93ff1c37...` (`6ac944be...`) | 110이벤트 | `#141414`, `#1f1f1f`, `#333333`, `#1473e6`, `#ff9d00` | 3D 캐릭터 FBX/OBJ 자동 스켈레탈 리깅 & 2,500+ 전투/일상 모션캡처 리타게팅 |
| 86 | **Marvelous Designer** | `marvelousdesigner.com` | `ev_2779126a...` (`1db75aaa...`) | 504이벤트 | `#0b0b0d`, `#16161a`, `#2a2a32`, `#f59e0b`, `#38bdf8` | 2D 의상 재단 패턴 설계 & 실시간 3D 로판 드레스/판타지 망토 주름 물리 시뮬레이션 |
| 87 | **Adobe Substance 3D** | `adobe.com/products/substance3d` | `ev_9a4ecd90...` (`8b336ed8...`) | 4이벤트 | `#111111`, `#1d1d1d`, `#333333`, `#e1251b`, `#84cc16` | 웹툰 3D 배경/소품 전용 스타일라이즈드 셀셰이딩·하프톤·모서리 마모 스마트 머티리얼 |
| 88 | **Coolors** | `coolors.co` | `ev_a108be87...` (`c6cfeb39...`) | 236이벤트 | `#ffffff`, `#f7f7f9`, `#e5e7eb`, `#0066ff`, `#ff0055` | 5색 스와치 잠금 팔레트 제너레이터, 레퍼런스 이미지 컬러 추출, WCAG 명암비 검증 |
| 89 | **Adobe Color** | `color.adobe.com` | `ev_47f52dff...` (`96f731ee...`) | 510보존 / 554총이벤트 | `#181818`, `#242424`, `#383838`, `#1473e6`, `#ec4899` | 보색·삼각·유사색 색채 조화 휠(Color Wheel), 무드 그라데이션 추출, 색각 이상 시뮬레이션 |
| 90 | **Noonnu (눈누)** | `noonnu.cc` | `ev_7195cab8...` (`bb7f1e0d...`) | 443보존 / 596총이벤트 | `#fffdf9`, `#ffffff`, `#e5e0d5`, `#ff5a36`, `#1e293b` | 상업용 무료 한글 웹툰 대사·독백·효과음(SFX) 폰트 큐레이션 & 라이선스 허용 범위 검증 |
| 91 | **Blambot Fonts** | `blambot.com` | `ev_c6be0b83...` (`b0d762d2...`) | 652보존 / 1,090총이벤트 | `#121316`, `#1c1e24`, `#2e323b`, `#ef4444`, `#f59e0b` | 북미/글로벌 웹툰 표준 영문 대사체(Anime Ace) 및 타격/공포 효과음(SFX) 디스플레이 타이포그래피 |
| 92 | **Sudowrite** | `sudowrite.com` | `ev_f50c19d0...` (`53468b07...`) | 331보존 / 515총이벤트 | `#fdfaf6`, `#ffffff`, `#e6dfd5`, `#7c3aed`, `#f97316` | Story Bible·Scene Beats·오감 묘사 확장·클리프행어 반전 생성(웹소설→웹툰 각색 엔진) |
| 93 | **Novelcrafter** | `novelcrafter.com` | `ev_af32e8c3...` (`bacfe4ba...`) | 108이벤트 | `#0f1117`, `#181b24`, `#282d3c`, `#6366f1`, `#10b981` | 관계형 세계관 위키 **Codex**(캐릭터·장소·유물·세력) & 100화+ 장편 회차 플롯 매트릭스 |
| 94 | **Campfire Writing** | `campfirewriting.com` | `ev_26dfe487...` (`393fd21c...`) | 509보존 / 1,058총이벤트 | `#111319`, `#1a1d26`, `#2c3140`, `#ff6b35`, `#38bdf8` | 18종 모듈형 세계관 빌더(캐릭터 관계도·연표 타임라인·마법 체계·세계 지도) |
| 95 | **Milanote** | `milanote.com` | `ev_640851fe...` (`2c451691...`) | 548보존 / 594총이벤트 | `#f5f5f3`, `#ffffff`, `#e2e2de`, `#ff4b4b`, `#18181b` | 공간형 비주얼 스토리보드, 캐릭터 레퍼런스 컬럼, 컬러 스와치 카드 & 화살표 동선 보드 |
| 96 | **PureRef** | `pureref.com` | `ev_3790d8a9...` (`d53f1140...`) | 144이벤트 | `#1e1e1e`, `#282828`, `#3c3c3c`, `#38bdf8`, `#a3e635` | Always-on-Top 무경계 인피니트 레퍼런스 캔버스, 마우스 투과(Pass-through) 알파 오버레이 |
| 97 | **Toon Boom Harmony** | `toonboom.com/products/harmony` | `ev_d0370360...` (`f7607712...`) | 240이벤트 | `#16181d`, `#21242c`, `#343946`, `#8b5cf6`, `#06b6d4` | Line-Art/Color-Art 서브레이어 분리, Curve/Envelope 디포머, Z-Depth 멀티플레인 노드 합성 |
| 98 | **TVPaint Animation** | `tvpaint.com/en` | `ev_82cecee1...` (`19ae5227...`) | 200이벤트 | `#1f2328`, `#2b3036`, `#3f464f`, `#f97316`, `#eab308` | **CTG(Color & Texture Generator)** 스마트 스트로크 자동 밑색 채우기 & Out-of-Pegs 어니언스킨 |
| 99 | **Moho Animation** | `moho.lostmarble.com` | `ev_1bbe9879...` (`534c6bc8...`) | 844보존 / 1,176총이벤트 | `#141619`, `#1e2227`, `#313740`, `#10b981`, `#3b82f6` | **Smart Bones** 다이얼 표정/관절 보간, Vitruvian Bones 각도별 파츠 스왑, 쿼드 메쉬 워핑 |
| 100 | **Eagle** | `en.eagle.cool` | `ev_bb317c12...` (`28b9f8d2...`) | 560이벤트 | `#141518`, `#1e2025`, `#2f323a`, `#3b82f6`, `#06b6d4` | 주요 색상(Dominant Color) 필터 검색, 스마트 폴더, PSD/CLIP/ABR/GLB 즉시 프리뷰 에셋 허브 |

---

## 3. UI/UX 디자인 시스템 및 CSS 토큰 비교 분석

### 3.1 GlimNavi (`relight.css` sha256: `8404f64e248ab13ab9b0ee0d77675805b4962a0c29e615199c3a352b65ddeacc`)
- **라이트 스튜디오 토큰**: `--bg: #f6f7fb`, `--panel: #ffffff`, `--line: #e5e7eb`, `--text: #111827`, `--muted: #6b7280`, `--accent: #2563eb`, `--accent-ink: #1e3a8a`, `--canvas-bg: #bfbfbf`, `--radius-lg: 14px`, `--radius-md: 12px`
- **브랜드 헤더 & 그라데이션**: 상단바 `#7ED6E2`, 호버 `#40C0D2`, 활성 칩 `#DBF7FA`, `.gd-bg: linear-gradient(92deg, #3b82f6 -3.24%, #00a8c2 100%)`
- **워크스페이스 레이아웃**: 상단 프로젝트/회차/컷/해상도(`800×600`~`2560×1440`) 바 + 좌측 5단계 아코디언(`기획 및 각색`, `콘티`, `3 선화`, `4 채색`, `5 효과`) + 중앙 뉴트럴 그레이(`#bfbfbf`) 캔버스 + 우측 `AI 기능(AI 선따기 v1.0~v2.3 · 6종 표현 프리셋 · 컬러 레이어 분리)` & 레이어 트리 패널.

### 3.2 Snaptoon (`snaptoon.co.kr` sha256: `27730a537c24d1ee454f07e8004c7fb14d422c372629f85b164e9cc5ee61c875`)
- **듀얼 에디토리얼 토큰**:
  - Paper Warm 모드: `--bg-light: #FAF8F5`, `--bg-light-soft: #F2EFEA`, `--text-dark: #1A1A1A`, `--text-muted-light: #6B6B6B`, `--border-light: #E8E5E0`
  - Dark Studio 모드: `--bg-dark: #0A0A0A`, `--bg-dark-soft: #161616`, `--text-on-dark: #F5F5F5`, `--text-muted-dark: #9A9A9A`, `--border-dark: #2A2A2A`
  - 브랜드 인디고: `--accent-indigo: #1E3A5F`, `--accent-indigo-hover: #2A5285`
- **타이포그래피**: `Pretendard`(본문/UI) + `Noto Serif KR` & `EB Garamond`(서사 인용구·헤드라인).

### 3.3 KAISTORY (`kaistory.net` sha256: `3120a2ec491832da1e1f4bd164af69e527ee8581c8f793df7d1e3724f7b34e4b`)
- **컬러 & 레이아웃 토큰**: `--brand: #16168f`, `--brand-2: #3a3adf`, `--accent: #ff5a4d`, `--ink: #1a1c2b`, `--muted: #5c6178`, `--line: #e7e8f0`, `--bg: #ffffff`, `--bg-soft: #f6f7fb`, `--radius: 14px`, `--shadow: 0 10px 30px rgba(22,22,143,.08)`, `--maxw: 1160px`.

### 3.4 Frameo (`frameo.ai` sha256: `aaa1b28a346a4868d716dc78024ba003750ae556b9fb0732e7ebf15623d28fde`, `3dce8d17...`)
- **다크 디렉터 스튜디오 & 스포트라이트 셰이더 토큰**:
  - `--studio-bg: #000`, `--studio-surface: #ffffff0b`, `--studio-border: #ffffff1a`, `--studio-text: #f5f5f7`, `--studio-muted: #a1a1aa`
  - 인터랙티브 광원 변수: `--cursor-angle: 45deg`, `--edge-sensitivity: 30`, `--color-sensitivity: 50`, `--cone-spread: 25`, `--glow-a: #c084fc`, `--glow-b: #818cf8`, `--glow-c: #38bdf8`, `--shiny-accent: #423be5`.

### 3.5 NAVER WEBTOON SHAPER (`shaper.css` sha256: `0986c2f34cfe41d39a7647cf09425040e5c6246dc301301891b16b21af02fdd6`)
- **네온 그린 3D 모델러 토큰**: `--background-base: #0a0a0a`, `--background-primary: #222`, `--text-primary: #ededed`, `--text-secondary: #d3d3d3`, `--text-link: #3b6cef`, `--text-highlight: #00ff74`, 보조 네온 `#00ffbf` / `#ff2791`, 타이포그래피 `Volte` + `Pretendard`.

---

## 4. ToonStudio 내재화 및 창의적 AI 고도화 매핑

| 영역 | 벤치마크 원천 | ToonStudio 내재화 및 창의적 확장 모듈 |
| --- | --- | --- |
| **GlimNavi 5단계 스튜디오 & Relight v2.3** | `glimnavi.com/function-step3.html` | 선화 5버전(`v1.0`~`v2.3`) + 6종 표현 프리셋 + 컬러 레이어 분리 + `AI 그림자·조명효과·명암효과` 비파괴 제안 엔진 |
| **KAISTORY 단일 프로젝트 엔벨로프 & KAION 에듀테크** | `kaistory.net` (`conti`→`design`→`editor`→`story`) | 오프라인 우선 콘티 엔벨로프 + 화자별 TTS·다국어 식자 파생 리비전 + **창의적 확장: 웹툰 독자 몰입 퀴즈·캐릭터 세계관 학습카드(`KAION`) 자동 생성기** |
| **Snaptoon 3D → Snapboard AI → Story 브리지** | `snaptoon.co.kr` | Paper Warm(`#FAF8F5`) / Dark Studio(`#0A0A0A`) 테마 토큰 스위처 + 3D 카메라 패스 → AI 화풍 변환 → 컷 스토리 조립 파이프라인 |
| **ManhwaAI 6대 화풍 & 5대 톤 + Komiko 레이어/인비트윈 + Anifusion 노드 플로우** | `manhwaai.net`, `komiko.app`, `anifusion.ai` | 6대 만화 스타일 + 5대 절차적 효과선/스크린톤(`FocusingLine`, `SpeedLine`, `Tone`, `ToneNoise`, `ToneSnow`) + `/layer_splitter` & `/inbetween` + 노드 그래프 프리셋 |
| **Frameo 스포트라이트 콘 & SHAPER 3D 직접 드로잉 & Posemaniacs 해부학** | `frameo.ai`, `shaper.webtoons.com`, `posemaniacs.com` | `--cursor-angle` / `--cone-spread` 인터랙티브 조명 시뮬레이터 + 3D 표면 드로잉/카메라 포즈 캡처 + 해부학/핸드 카메라 리그 |
| **TooToon 5-Studio · GenToon 뷰어/굿즈 · Tooning 6부위 캐릭터 디렉터** | `tootoon.ai`, `gentoon.ai`, `tooning.io` | `/fabulator`~`/emporium` 5단 파이프라인 + `--reading-direction: 1` / `--paper` / `--ink` 뷰어·서포터즈 굿즈 + `/character-make-*` 6부위 캐릭터 조합기 |
| **Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더** | `krea.ai`, `spline.design`, `lumiere.graphics`, `graphite.rs`, `pixieditor.net` | `/realtime-director` 도형 블로킹 + `/ai-style-transfer` 3D 스타일 전이 + Kuwahara/Halation/Glare WebGPU 포스트프로세싱 & 비파괴 노드 그래프 |
| **LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신** | `ltx.studio`, `boords.com`, `cascadeur.com`, `rive.app`, `jitter.video` | 3샷 프리비즈 애니매틱 카메라 시퀀스 + AutoPosing/AutoPhysics 무게중심·탄도 궤적 + 스크롤 반응형 60fps 2D 메쉬 상태머신 |
| **Cotrans 식자 인페인팅 · VRoid 3D VRM 아바타 · Blockade Skybox 360° 월드** | `cotrans.touhou.ai`, `vroid.com/en/studio`, `skybox.blockadelabs.com` | CTD/DBNet 말풍선 검출 + LaMa 512px 인페인팅 복원 + VRM 1.0 MToon/스프링본 + 8K 360° 깊이맵 환경광 매칭 |
| **Shot Generator · Procreate Dreams 퍼포밍 · Krita Diffusion · Artbreeder 유전자** | `wonderunit.com`, `comicai.ai`, `aicomicfactory.com`, `storyboardthat.com`, `procreate.com/dreams`, `krita.org`, `artbreeder.com`, `sketch.pixiv.net` | 3D Shot Generator 카메라 + 120Hz 실시간 터치 Performing 트랙 + Krita ControlNet 스택 + Artbreeder 유전자 슬라이더 |
| **Niji 7 (`--sref`/`--cref`) · Civitai/Tensor/SeaArt/PixAI LoRA 스택 · Picrew/WaifuLabs/Charat** | `nijijourney.com`, `civitai.com`, `tensor.art`, `seaart.ai`, `pixai.art`, `moescape.ai`, `waifulabs.com`, `charat.me`, `picrew.me` | Niji 7 `--sref`/`--cref`/`--cw` 레퍼런스 락 + 멀티 LoRA/ControlNet 스택 + Picrew 색상 연동 락 & WaifuLabs 4단 그리드 & Charat SD 파츠 |
| **Tripo3D/Meshy/HeroForge 3D 프롭 · Suno OST · ElevenLabs 더빙 · MANGA Plus 글로벌 OSMU** | `tripo3d.ai`, `meshy.ai`, `heroforge.com`, `suno.com`, `elevenlabs.io`, `mangaplus-creators.jp` | 2D 스케치→쿼드 PBR 3D 무기/소품 & 2인 미니어처 포징 + Suno v4 회차별 OST + ElevenLabs 다국어 성우/효과음 + MANGA Plus 글로벌 연재 규격 |
| **Runway Gen-3 · Luma · Pika · Viggle 모션 · Live2D Cubism · Spine 2D 무빙툰 디렉터** | `runwayml.com`, `lumalabs.ai`, `pika.art`, `viggle.ai`, `openart.ai`, `live2d.com`, `esotericsoftware.com` | Runway 5영역 Multi-Motion Brush + Luma Start/End 키프레임 보간 + Pika 캐릭터 립싱크 + Viggle JST-1 실사 모션 전이 + Live2D PSD 디포머/물리 진자 & Spine 2D IK 본 리깅 |
| **SketchUp 3D · Blender Grease Pencil · Petalica 채색 · Magma 멀티협업 · Recraft/Cara 스튜디오** | `3dwarehouse.sketchup.com`, `blender.org`, `petalica.com`, `comicsmaker.ai`, `magma.com`, `playground.com`, `recraft.ai`, `cara.app` | SketchUp SKP 동적 컴포넌트 & Blender Grease Pencil 3D 공간 2D 작화 + Petalica 힌트 스트로크 자동 채색 + Magma 6인 실시간 역할 분담 + Recraft V3 순수 SVG 마법진/효과음 + Cara NoAI/Glaze 보호 |
| **Tapas · Tappytoon · RIDI · Postype 글로벌 연재 & Sudowrite · Novelcrafter · Campfire 코덱스** | `tapas.io`, `tappytoon.com`, `ridibooks.com`, `postype.com`, `sudowrite.com`, `novelcrafter.com`, `campfirewriting.com`, `milanote.com`, `pureref.com` | Tapas WUF/Ink · Tappytoon Club · 리디 노블코믹스 · 포스타입 멤버십 수익 모델 + Sudowrite 대본 압축 + Novelcrafter Codex + Campfire 세계관 타임라인 + Milanote/PureRef 무드보드 |
| **Mixamo · Marvelous · Substance 3D · Coolors · 눈누/Blambot 식자 · ToonBoom/TVPaint/Moho · Eagle** | `mixamo.com`, `marvelousdesigner.com`, `adobe.com/products/substance3d`, `coolors.co`, `color.adobe.com`, `noonnu.cc`, `blambot.com`, `toonboom.com`, `tvpaint.com`, `moho.lostmarble.com`, `en.eagle.cool` | Mixamo 60fps 모캡 리타게팅 + Marvelous 의상 주름 노말맵 + Substance 3D 툰 재질 + Coolors/Adobe Color 감정 팔레트 + 눈누/Blambot 한영 식자 + ToonBoom/TVPaint CTG/Moho Smart Bone + Eagle 컬러 스마트 폴더 |
| **웹툰 일관성 확보(Webtoon Consistency) 7대 DNA 가드레일 & 6대 창의 AI 엔진** | `StudioAiCharacterConsistencyPanel.tsx`, `claude-phase6-ecosystem-suite.ts`, `claude-webtoon-episodic-doctor.ts` | **7대 일관성 DNA 락**(안면 골격·가르마 방향·비대칭 복식/흉터 좌우반전 금지·손 대비 무기 비례·180° 시선 축/신장 차·고유색 Albedo·부상 누적) + **비대칭 복식·흉터·무기 비례·부상 원장(`Sonnet 5.5`)** + **180° 시선 축·신장 차이 감독(`Opus 5.5`)** + **컷간 고유색 Albedo 고정기(`Haiku 5.5`)** + **FACS 미세 표정·시선 궤적 연속성 디렉터(`Sonnet 5.5`)** + **전 회차 작붕 검출 린터(`Opus 5.5`)** + **장편 연재(1~100화) 캐논 메모리 볼트(`Sonnet 5.5`)** |
| **창의적 신규 AI 기능 (Claude Live 연동 · 총 57개 스마트 라우팅 태스크)** | 100대 플랫폼 융합 | **AI 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터** + **100대 플랫폼 UI/UX 테마 토큰 합성기** + **총 57개(`fast-inline` 11 · `creative-production` 29 · `deep-architecture` 17) Task-Aware Smart Model Router 실시간 구조화 출력 및 결정적 폴백** |

---

## 5. 실시간 Claude API (`claude-haiku-5-5` · `claude-sonnet-5-5` · `claude-opus-5-5`) 구조화 출력 검증 결과 (2026-10-26 ~ 2026-10-27)

| 엔진 ID | 라우팅 프로필 | 실행 모델 | 실행 소스 | 입력 토큰 | 출력 토큰 | 추정 비용 (USD) | 실시간 생성 결과 요약 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rea15:glimnavi-relight-lineart-v23` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 312 | 902 | `$0.000686` | `v2.3-balanced` 선화 + 유물 봉인 후방 차가운 림라이트 & 얼굴 표정 보존 그림자 설계 |
| `rea15:kaistory-single-envelope-kaion-quiz` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 314 | 1,999 | `$0.024276` | `conti`→`design`→`editor`→`story` 단일 엔벨로프 + KAION 학습카드(`봉인과 각성의 규칙`) 퀴즈 생성 |
| `rea15:snaptoon-frameo-shaper-3d-lighting` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 333 | 960 | `$0.013864` | Snaptoon→Snapboard 3D 변환 + Frameo 스포트라이트 콘(`--cursor-angle`, `--cone-spread`) + SHAPER 3D 직접 드로잉 |
| `rea15:manhwa-komiko-anifusion-flow` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 309 | 1,332 | `$0.017383` | ManhwaAI 6화풍/5효과톤 + Komiko 비파괴 레이어 분리/인비트윈 + Anifusion 5노드 플로우 그래프 |
| `rea15:creative-dopamine-scroll-ux-synthesizer` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 344 | 1,881 | `$0.047526` | 컷별 독자 도파민 피크(86점)·체류 시간 예측 및 합성 UI 테마(`봉인각성 다크골드`) 도출 |
| `rea15:tootoon-gentoon-tooning-kr-suite` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 306 | 2,084 | `$0.025102` | TooToon 5대 스튜디오(`fabulator`~`emporium`) + GenToon 세로 뷰어/서포터즈 굿즈 + Tooning 6부위 캐릭터 레시피 설계 |
| `rea15:krea-spline-lumiere-realtime-shader` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 321 | 1,072 | `$0.000747` | Krea 실시간 디렉터 블로킹 + Spline 3D/Hana 대치 궤도 + Lumiere Kuwahara·Halation·Glare 비파괴 WebGPU 후처리 |
| `rea15:ltx-boords-cascadeur-rive-animatic` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 326 | 2,604 | `$0.060324` | 3샷 애니매틱(돌리인·더치틸트·트래킹오빗) + Cascadeur 도약 탄도/토크 물리 리그 + Rive/Jitter 스크롤 상태머신 설계 |
| `rea15:cotrans-vroid-skybox-world-localizer` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 294 | 989 | `$0.014386` | Cotrans 말풍선 KO/EN/JA 인페인팅·세로식자 + VRoid VRM 1.0 MToon/스프링본 + 8K 360° 황궁 유물 스카이박스 설계 |
| `rea15:storyboarder-dreams-krita-artbreeder-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 289 | 1,523 | `$0.038506` | Shot Generator 35mm 블로킹 + Procreate Dreams 120Hz 퍼포밍 + Krita ControlNet 스택 + Artbreeder 유전자 슬라이더 2종 |
| `rea15:niji-pixai-civitai-lora-sref-director` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 98 | 300 | `$0.004794` | Niji 7 `--sref`/`--cref`/`--cw 100` 레퍼런스 락 + Civitai/PixAI 멀티 LoRA + Picrew 색상 락 |
| `rea15:tripo-meshy-heroforge-suno-elevenlabs-osmu` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 104 | 300 | `$0.009060` | Tripo3D/Meshy PBR 3D 무기 프롭 + HeroForge 2인 대치 + Suno v4 OST + ElevenLabs 더빙 + MANGA Plus OSMU |
| `rea15:runway-luma-pika-viggle-live2d-spine-motion` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 99 | 300 | `$0.004797` | Runway Gen-3 모션브러시 + Luma 키프레임 + Pika 립싱크 + Viggle 모션전이 + Live2D/Spine 무빙툰 리깅 |
| `rea15:sketchup-blender-petalica-magma-recraft-studio` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 101 | 300 | `$0.004803` | SketchUp 동적 컴포넌트 + Blender Grease Pencil + Petalica 3종 채색 + Magma 협업 + Recraft SVG + Cara Glaze |
| `rea15:tapas-tappytoon-ridi-postype-sudowrite-novelcrafter` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 93 | 320 | `$0.009395` | Tapas·Tappytoon·RIDI·Postype 글로벌 연재 규격 및 Sudowrite/Novelcrafter/Campfire 코덱스 바이블 동기화 |
| `rea15:mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 102 | 320 | `$0.005106` | Mixamo 3D 모션·Marvelous 의상 주름·Substance 툰셰이더·Coolors 배색·눈누/Blambot 식자·ToonBoom/Eagle 통합 |
| `ecosystem:glimnavi-color-hint-stroke` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 290 | 1,089 | `$0.000807` | Close-Gap 허용치 및 브러시 색상 힌트 스트로크 좌표 생성 |
| `ecosystem:novelai-multi-char-vibe` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 319 | 1,681 | `$0.020964` | 2인 주연 X/Y 바운딩박스 분리 및 Vibe Transfer 가중치 설계 |
| `ecosystem:novel-adaptation-ip-expansion` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 303 | 2,580 | `$0.064112` | 웹소설 산문 압축 각색 및 드라마·애니·게임·오디오웹툰 OSMU 스코어카드 도출 |
| `ecosystem:asymmetric-costume-prop-wound-ledger` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 144 | 320 | `$0.005232` | 왼눈 흉터·오른손 흑철검·왼허리 검집 좌우반전 0% 고정 및 망토 파손·부상 누적 원장 도출 |
| `ecosystem:camera-axis-eyeline-height-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 103 | 320 | `$0.009545` | 180° 시선 축(Side-A) 고정 및 서진(184cm)·하윤(168cm) 신장 차이(16cm) 로우/하이앵글 원근 보정 |
| `ecosystem:cross-cut-color-script-albedo-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 102 | 320 | `$0.001362` | 야간 달빛(4,100K) 역광 환경에서 피부톤·의상 고유색(Albedo HEX) Delta-E ≤ 1.4 고정 |
| `ecosystem:micro-expression-acting-continuity` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 105 | 320 | `$0.005115` | 컷간 FACS 안면 근육(AU4+AU7 / AU1+2)·동공 수축·시선 궤적 및 감정 관성(Emotional Inertia) 설계 |
| `nextgen:visual-continuity-linter` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 114 | 320 | `$0.009710` | 전 회차 컷간 4대 작붕(흉터/검집 반전·소품 증발·부상 초기화·그림자 역방향) 검출 린터 |
| `nextgen:multi-episode-canon-vault` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 108 | 320 | `$0.005124` | 장편 연재(1~50화) 캐릭터 외형 변천·호칭 매트릭스·미회수 복선(회중시계 고대 룬) 캐논 볼트 동기화 |
