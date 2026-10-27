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
| `competitor:turnaround-orthographic-sheet-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 158 | 340 | `$0.005574` | 360° 5뷰(0°·45°·90°·270°·180°) 정투영 등신대 기준선 및 비대칭 장신구/흉터/검집 차폐 규칙 100% 고정 |
| `competitor:background-perspective-prop-scale-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 144 | 340 | `$0.010660` | 3D 배경 1/2/3점 소실점 그리드 ↔ 2D 인물 발 접지(Foot Contact AO)·문틀/책상 인체 비례 고정 |
| `production:multi-character-crowd-wardrobe-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 160 | 340 | `$0.005580` | 주연·조연·배경 엑스트라 세력별 제복 컬러코드·견장/휘장 위치 및 주연 장신구 전이 차단 |
| `production:weather-particle-time-progression-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 159 | 340 | `$0.001487` | 컷간 강우/뇌우/수막 반사 날씨·젖은 모발/의상 투과도·시간 경과 그림자 길이 물리 연속성 고정 |
| `competitor:speech-bubble-tail-occlusion-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 160 | 340 | `$0.001488` | 안면·동공·비대칭 흉터 가림 0% 말풍선 안전 영역 및 화자 입 방향 꼬리 벡터·SFX L1.5 분리 고정 |
| `competitor:action-weapon-motion-arc-smear-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 145 | 340 | `$0.005535` | 4단계 전투(Wind-up→Slash Smear→Hit-Stop→Follow-through) 검기 궤적 연속성 및 잔상 배율 고정 |
| `rea15:creative-dopamine-scroll-ux-synthesizer (120-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 147 | 340 | `$0.010705` | 네이버 AI 페인터·카카오 얼라이브·레진·ComfyUI IP-Adapter 포함 120대 플랫폼 UI/UX 테마 합성 |
| `production:panel-border-gutter-tension-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 110 | 450 | `$0.001888` | 클라이맥스 사선(-14°)·프레임리스 블리드 컷 테두리 두께 및 260px 암전 여백(Gutter) 그라데이션 연속성 고정 |
| `production:hand-prop-grip-anatomy-continuity-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 99 | 450 | `$0.007047` | 5손가락 관절 해부학·청류검/찻잔/스마트폰 정밀 파지법(Grip) 및 육손/좌우반전 네거티브 가드 고정 |
| `rea140:global-webtoon-3d-platform-ui-ux-synthesis (140-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 118 | 450 | `$0.013020` | 픽코마 SMARTOON·라인망가·만타·투믹스·콰이칸·글레이즈/나이트셰이드·폴리캠/루마지니 3D 포함 140대 플랫폼 UI/UX 통합 합성 |
| `production:hair-silhouette-ahoge-parting-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 81 | 378 | `$0.001577` | 좌측 7:3 가르마 뿌리(Root Anchor)·28° 바보털(Ahoge)·견갑골 하단 뒷머리 기장 및 바람 탄성 복원 고정 |
| `production:eyewear-jewelry-reflection-rig-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 86 | 377 | `$0.001577` | 우안 금테 모노클 체인·좌측 청옥 이어링 해부학적 착용 접점(Anchor) 및 보석 굴절(Add) 하이라이트 고정 |
| `production:food-tableware-banquet-prop-continuity` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 92 | 400 | `$0.001674` | 다과회 찻잔 홍차 수위 단조 감소(85%→55%→30%) 및 서양식 커틀러리 좌우 파지 일관성 고정 |
| `production:vehicle-steed-carriage-harness-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 95 | 400 | `$0.006285` | 말 어깨높이(165cm) 대비 기수 앉은키 비례(0.54) 및 등자·재갈·고삐 마구 증발 방지 고정 |
| `production:magic-aura-elemental-sigil-geometry-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 108 | 400 | `$0.006324` | 8각 성좌 마법진(3중 룬 링) 3D 평면 투영 기하 도면 및 코어(`#E0F2FE`)·외곽(`#2563EB`) 오러 발광 고정 |
| `production:combat-bloodstain-dust-tatter-decay-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 93 | 400 | `$0.006279` | 전투 혈흔·그을음·망토 열상 비가역(Monotonic) 누적 원장 및 치유/환복 전 자동 초기화 차단 |
| `production:mirror-water-window-reflection-axis-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 108 | 400 | `$0.011620` | 거울·수면·유리창 반사 법선 벡터 일치 및 비대칭 흉터·가르마 평면 대칭(Plane Symmetry)·프레넬(78%) 고정 |
| `nextgen:footwear-floor-contact-stride-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 139 | 260 | `$0.001151` | 4.5cm 굽 블랙 롱부츠·은장 2버클 및 계단 디딤판(Tread) 수평 접지 AO 고정(공중부양 작붕 차단) |
| `nextgen:crowd-silhouette-depth-fog-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 152 | 260 | `$0.004356` | 전경 주연(1.0x) 대비 중경 엑스트라(0.65x)·원경 군중(0.35x + 안개 45%) 3단 선굵기·대기원근 분리 |
| `rea240:global-webtoon-vfx-mocap-ui-ux-synthesis (240-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 140 | 260 | `$0.008600` | 유럽/일본 글로벌 플랫폼·3D 그루밍(Ornatrix/CLO3D)·모션캡처(Move.ai/Rokoko)·VFX(EmberGen/IC-Light) 포함 240대 플랫폼 UI/UX 및 23대 작붕 가드 통합 합성 |
| `ecosystem:collar-tie-lapel-neckline-symmetry-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 116 | 240 | `$0.001053` | 상단 단추 2개 풀림 블랙 셔츠(쇄골 38° V라인)·코트 라펠 버튼홀 및 로판 크라바트 청옥 브로치 대칭 고정 |
| `ecosystem:companion-pet-familiar-mascot-scale-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 115 | 240 | `$0.001052` | 소환수·신수 체구 비례(체장 26cm, 체고 18cm) 및 외뿔 1개·날개 2장·꼬리 1개 수량 불변 고정 |
| `ecosystem:tattoo-stigma-curse-mark-uv-topology-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 133 | 240 | `$0.003999` | 좌측 쇄골~삼각근 흑룡 성흔(Stigma) 신체 UV 곡면 좌표 및 단축법(Foreshortening) 타원 압축(0.62x) 고정 |
| `ecosystem:scroll-pace-silent-beat-panel-height-rhythm` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 137 | 240 | `$0.004011` | 클라이맥스 직전 무대사 시선 교환 컷(Silent Beat) 1,380px 수직 암전 페이드 여백 및 2.8초 체류 호흡 설계 |
| `ecosystem:subsurface-scattering-skin-tear-sweat-specular-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 132 | 240 | `$0.003996` | 역광 귀바퀴·손끝 피하산란(SSS `#FF6B6B`) 투과광 및 동공 10시 캐치라이트·속눈썹 눈물 굴절 고정 |
| `ecosystem:interior-room-furniture-door-hinge-geography-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 126 | 240 | `$0.007890` | 황궁 집무실 2D/3D 평면도(북측 아치창·남측 출입문 좌경첩/우손잡이/내측개폐) 역앵글 공간 반전 차단 |
| `rea300:global-webtoon-300-platform-master-synthesis (300-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 124 | 240 | `$0.007860` | 동남아/중남미 플랫폼·3D 건축/실내 평면도(KitBash3D/SweetHome3D)·컬러과학/위조방지(C2PA/Mist v2) 포함 300대 플랫폼 UI/UX 및 29대 작붕 가드 마스터 합성 |
| `domain:prop-screen-ui-hologram-text-consistency` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 90 | 86 | `$0.000416` | 스마트폰 긴급 문자 화면(배터리 18%·시각 23:42) 및 헌터 시스템 상태창 스탯 수치 연속 컷 일관성 고정 |
| `domain:braid-ponytail-ribbon-accessory-knot-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 82 | 161 | `$0.000710` | 좌측 진주 핀 2개·7마디 땋은 머리 교차 마디 수·포니테일 결속 높이 및 리본 매듭 방향 고정 |
| `domain:cape-cloak-hem-lining-wind-flutter-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 98 | 135 | `$0.002319` | 황실 기사단장 남색 겉감(`#1E293B`)·진홍 안감(`#991B1B`) 망토 밑단 금박 문양 및 바람 펄럭임 위상 고정 |
| `domain:sword-hilt-guard-gem-scabbard-engraving-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 102 | 110 | `$0.001956` | 성검 비대칭 날개 코등이·푸른 마석 폼멜·좌측 허리 빈 칼집(Scabbard) 잔류 및 양손 파지 순서 고정 |
| `domain:character-age-flashback-growth-proportion-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 104 | 96 | `$0.001752` | 8세 유년기(5.2등신)·15세 소년기(6.6등신)·24세 성인(7.8등신) 회상 전환 시 두신비 및 사건 전후 흉터 타임라인 고정 |
| `domain:multi-plane-parallax-depth-blur-bokeh-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 104 | 180 | `$0.006060` | 85mm f/1.8 3평면(전경 벚꽃 18px 블러 · 중경 인물 0px 샤프니스 · 원경 야경 26px 6각 보케) 피사계 심도 연출 고정 |
| `rea360:global-webtoon-360-platform-master-synthesis (360-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 122 | 220 | `$0.007330` | V-Ray/Octane/Arnold 툰 렌더러·Houdini Vellum·Kyle/TrueGrit 브러시·Epidemic/Krotos 오디오툰·Warudo/RenPy 포함 360대 플랫폼 UI/UX 및 86개 스마트 라우팅 마스터 합성 |
| `runner:gaze-saccade-pupil-highlight-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 94 | 152 | `$0.000683` | 양안 동공 수렴각(외사시/내사시 작붕 방지) 및 10시 방향 주광원 캐치라이트·시선 도약(Saccade) 궤적 고정 |
| `runner:breath-frost-cigarette-smoke-plume-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 99 | 175 | `$0.000779` | 겨울 야외 입김(Breath Frost)·담배 연기·찻잔 수증기의 주풍향(28°) 드리프트 및 말풍선 침범 시 투명도 감쇠 고정 |
| `runner:wet-fabric-rain-translucency-drape-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 96 | 174 | `$0.002898` | 폭우 씬 젖은 셔츠 피부 밀착 잔주름·32% 반투명 피부 투과도·다음 컷 급속 건조 작붕 방지 고정 |
| `runner:cast-shadow-sundial-azimuth-elevation-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 102 | 188 | `$0.003126` | 오후 5시 석양(방위각 245°·고도각 22°) 인물/건물 바닥 그림자 길이(2.47배) 및 역앵글 반전 일관성 고정 |
| `runner:impact-debris-crater-shatter-persistence-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 102 | 104 | `$0.001866` | 보스전 대검 타격 바닥 크레이터(직경 280cm)·기둥 파편 잔해 위치 지속성 및 다음 컷 원상복구 작붕 차단 |
| `runner:binaural-spatial-audio-foley-lufs-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 114 | 220 | `$0.007210` | 무빙툰·오디오툰 3D 바이노럴 폴리(L35%/R35% 패닝)·성우 대사 -8dB 사이드체인 더킹·-14 LUFS 음량 마스터링 |
| `rea420:global-webtoon-420-platform-master-synthesis (420-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 130 | 220 | `$0.007450` | Krea Wan 14B·World Labs Marble·StoryDiffusion·Twinmotion·KitBash3D·DisplayCAL·Morisawa 포함 420대 플랫폼 UI/UX 및 92개 스마트 라우팅 마스터 합성 |
| `production:button-zipper-belt-buckle-fastener-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 95 | 63 | `$0.000328` | 황실 근위대장 더블 브레스트 제복 여밈 방향(Left-over-Right)·단추 6개 배열·황동 버클 핀 좌우 반전 차단 고정 |
| `production:speedline-impact-frame-radial-focus-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 95 | 69 | `$0.000352` | 액션 컷 방사형 집중선 초점 좌표(0.52, 0.38)·얼굴 보호 반경(165px)·1컷 흑백 반전 임팩트 플래시 고정 |
| `production:wound-bandage-cast-healing-stage-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 87 | 220 | `$0.003561` | 좌측 광대 자상·우측 전완근 압박 붕대의 회차별 회복 단계(출혈→거즈→딱지→반흔) 및 나선 감김 방향 연속성 고정 |
| `production:heraldry-crest-guild-emblem-geometry-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 96 | 171 | `$0.002853` | 로판 공작가 쌍두 독수리 가문 문장 2차 회전 대칭·방패(3:4) 내부 비율·금박 양각 베벨·투시 왜곡 호모그래피 고정 |
| `production:musical-instrument-fingering-bowing-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 98 | 220 | `$0.003594` | 바이올린 4현(G-D-A-E) 비례·왼손 제3포지션 운지·오른손 보잉 수직 교차 및 좌우 손바뀜 작붕 원천 차단 |
| `production:variable-font-balloon-diamond-copyfit-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 91 | 220 | `$0.003573` | 타원 말풍선 내부 대사 다이아몬드(마름모꼴) 실루엣 조판을 위한 가변 폰트 축(wght 600 / wdth 96%) 및 외톨이 줄 방지 |
| `production:tankobon-print-bleed-cmyk-tac300-proof-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 102 | 220 | `$0.007030` | 세로 스크롤 웹툰의 A5 단행본 출판 시 사방 3mm 도련(Bleed)·제본 안전 여백 14mm·CMYK 총잉크량(TAC 295% 이하) 검수 |
| `production:eyetrack-scroll-velocity-aoi-heatmap-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 92 | 220 | `$0.006880` | 모바일 웹툰 독자 아이트래킹 AOI 체류 시간(1,420ms)·사카드 도약 각도(28°)·우하단 엄지 데드존 회피 S-커브 시선 유도 |
| `rea480:global-webtoon-480-platform-master-synthesis (480-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 130 | 220 | `$0.007450` | 박물관 복식/도검/문장·블렌더/마야 안면/신체 리깅·RIFE/SAM2/ProPainter·서사학·Tobii 시선추적·WCAG 접근성 포함 480대 플랫폼 및 100대 스마트 라우팅 완성 |
| `art-director:traditional-clothing-collar-knot-goreum-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 101 | 198 | `$0.000873` | 한복(우임·동정·고름)·기모노(우전)·한푸(교령우임) 옷깃 여밈 방향 및 캔버스 좌우 반전 시 좌임(수의) 작붕 차단 |
| `art-director:firearm-tactical-slide-ejection-finger-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 102 | 87 | `$0.000430` | 자동권총·소총 탄피 배출구 우측면 고정·전탄 소진 슬라이드 스톱·비사격 시 검지 방아쇠 울외(Trigger Discipline) 고정 |
| `art-director:martial-arts-qigong-meridian-aura-trajectory-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 99 | 220 | `$0.003597` | 무협 하단전(기해혈)→수태양소장경→합곡혈→검끝 청백색(`#38BDF8`) 내공 발현·왼손 검결(Jianjue)·전진 궁보 하중 고정 |
| `art-director:medical-icu-vital-monitor-sterile-rig-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 103 | 220 | `$0.003609` | 중환자실(ICU) 바이탈 모니터(HR 118 녹색·SpO2 97% 청색·ABP 110/70 적색) 색상 일치 및 수술실 무균 구역·메스 연필 파지 고정 |
| `art-director:culinary-knife-pinch-grip-plating-steam-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 101 | 66 | `$0.001293` | 요리 웹툰 오른손 볼스터 핀치 그립·왼손 고양이손(Claw Grip)·28cm 플레이트 40% 여백·수증기/글레이즈 광택 고정 |
| `art-director:acrylic-stand-photocard-dieline-white-plate-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 103 | 96 | `$0.001749` | 웹툰 IP 아크릴 스탠드 +2.0mm 칼선(CutLine)·-0.2mm 화이트 백판·3T 발판 홈(12×3mm) 및 55×85mm R3 홀로그램 포토카드 설계 |
| `art-director:east-asian-palace-dancheong-roof-bracket-lock` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 108 | 220 | `$0.007120` | 동아시아 목조건축 다포식 공포 배열·뇌록색(`#2E5A44`)/석간주(`#8B261D`) 단청 오방색·추녀마루 조로 곡선·기와 골 소실점 감리 |
| `art-director:reader-comment-sentiment-catharsis-cliff-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 95 | 220 | `$0.006925` | 연재 직후 예상 독자 댓글 고구마(22%):사이다(78%) 비율·예상 별점(9.94)·베스트 댓글 시뮬레이션 및 별점 방어 독백 처방 |
| `rea540:global-webtoon-540-platform-master-synthesis (540-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 131 | 220 | `$0.007465` | 전통건축/단청/한복/무협·전술총기/ICU/요리/스포츠·SynthID/C2PA/텀블벅/아크릴칼선/댓글감성 포함 540대 플랫폼 및 108대 스마트 라우팅 완성 |
| `localize:lunar-phase-star-conjunction-sky-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 98 | 72 | `$0.000366` | 초승달·그믐달 어두운 달 원반 내부 배경 별 투과 작붕 원천 차단 및 구름 틈새 빛(Crepuscular Rays) 태양광 1점 수렴 고정 |
| `localize:emoticon-24pack-chibi-proportion-spec-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 98 | 47 | `$0.000266` | 웹툰 IP 카카오톡·라인 24종 이모티콘(360×360px 24fps)·2.2등신 SD 데포르메·다크모드 3px 화이트 외곽선 규격 고정 |
| `localize:quadruped-creature-hock-wing-membrane-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 109 | 82 | `$0.001557` | 사족보행 마수 뒷다리 무릎(전방 굴곡)·발목 비절(Hock 후방 돌출) 역관절 착오 차단 및 드래곤 6지(4다리+2날개)·박쥐형 익막 고정 |
| `localize:k-urban-convenience-metro-rooftop-prop-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 99 | 220 | `$0.003597` | 한국 일상물 지하철 7인석 좌석·고등학교 교실 좌측 복도창(우측 채광)·편의점 파라솔·옥탑방 녹색 우레탄 방수 바닥 고증 고정 |
| `localize:thai-vietnamese-arabic-rtl-balloon-shaping-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 109 | 220 | `$0.003627` | 태국어·베트남어 2단 성조 부호 상하단 클리핑 방지(행간 155%·상하 패딩 18%) 및 아랍어 RTL 말풍선 읽기 순서(우→좌) 반전 고정 |
| `localize:anime-settei-3tone-color-model-sheet-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 120 | 138 | `$0.002430` | 웹툰 그라데이션 채색의 TV 애니메이션 제작용 3톤 셀 지정색(Base·1단 그림자·2단 그림자·하이라이트) 및 색트레이스 선화 규격 변환 |
| `localize:ott-live-action-8ep-showrunner-pitch-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 113 | 220 | `$0.007195` | 70화 분량 웹툰의 글로벌 OTT 8부작 실사 드라마 각색을 위한 회차별 미드포인트·엔드 클리프행어 매핑 및 VFX 예산 티어 설계 |
| `localize:global-ip-mg-rs-royalty-waterfall-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 107 | 220 | `$0.007105` | 글로벌 연재·단행본·2차 저작물 계약 시 결제수수료 공제 후 MG(미니멈 개런티) 상각·초과분 RS 정산 워터폴 및 미상각 교차보전 방지 감사 |
| `rea600:global-webtoon-600-platform-master-synthesis (600-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 143 | 220 | `$0.007645` | 천문/해부학·한국일상고증·비라틴RTL식자·애니화/OTT쇼러너/판권정산 포함 글로벌 600대 웹툰 AI 플랫폼 및 116대 스마트 라우팅 마스터 합성 |
| `cost-cap:lhd-rhd-cockpit-seatbelt-drivetrain-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 95 | 220 | `$0.000956` | 한국 좌핸들(LHD) 운전석 좌어깨→우골반 3점식 안전벨트 사선 및 오토바이 스로틀·자전거 우측 체인링 구동계 좌우 반전 차단 고정 |
| `cost-cap:screentone-lpi-moire-gpen-hierarchy-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 73 | 135 | `$0.000598` | 60선 망점 스크린톤 45° 회전 모바일 축소 모아레 간섭 방지 및 G펜(외곽 실루엣 4.5px)·마루펜(홍채/잔결 1.3px) 3단 선굵기 위계 고정 |
| `cost-cap:anamorphic-fisheye-dutch-lens-optics-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 97 | 220 | `$0.003591` | 아나모픽 2.0x 수직 타원 보케·수평 스트릭 플레어·200mm 망원 공간 압축 및 더치 틸트(±22°) 컷 내 빗줄기/눈물 지구 중력 수직 분리 고정 |
| `cost-cap:drapery-7folds-velvet-satin-brdf-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 105 | 220 | `$0.003615` | 번 호가스 7대 의상 주름(팔꿈치 오금 나선·반잠금 주름) 기점 및 로판 벨벳 망토(역프레넬 테두리 윤기)·실크(이방성 하이라이트) BRDF 고정 |
| `cost-cap:sports-biomechanics-gait-grip-edge-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 95 | 220 | `$0.003585` | 전력 질주 시 팔다리 교차 보행(Contra-lateral Gait) 고정·농구 슈팅/가이드핸드 분리·볼링 중약지 그립·피겨 악셀/러츠 에지 고증 |
| `cost-cap:vtuber-arkit52-vn-sprite-canbadge-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 94 | 220 | `$0.003582` | 웹툰 IP Live2D ARKit 52 블렌드셰이프·비주얼노벨 3단 눈깜빡임/5모음 시트·58mm 캔배지 외곽 6mm 말림 도련(70mm 재단) 설계 |
| `cost-cap:gacha-ssr-splash-rpg-skill-cutscene-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 92 | 220 | `$0.006880` | 웹툰 원작 수집형 RPG SSR 캐릭터 5평면 자이로 패럴랙스 스플래시 아트·3초 궁극기 오빗 카메라·5프레임 역경직(Hit-Stop) 총괄 설계 |
| `cost-cap:audiotoon-adr-timecode-tactile-ergo-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 100 | 220 | `$0.007000` | 오디오웹툰 성우 ADR 호흡/근접마이크 타임코드 대본·시각장애인 촉각 그래픽 양각선(2.5mm 간격) 단순화·주간 70컷 손목 스트로크 예산 감독 |
| `rea660:global-webtoon-660-platform-master-synthesis (660-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 124 | 220 | `$0.007360` | 시네마틱 렌즈광학·7대주름BRDF·스포츠인체역학·망점G펜·버튜버/RPG가챠/촉각점자 포함 글로벌 660대 웹툰 AI 플랫폼 및 124대 스마트 라우팅 완성 |
| `cost-cap:rofan-corset-sash-signet-etiquette-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 106 | 138 | `$0.000637` | 로판 제국 최고훈장 대수(우어깨→좌골반 사선)·인장 반지(Signet Ring) 음각 역상 및 좌약지 착용·봉랍 양각 고증 고정 |
| `cost-cap:pocket-watch-iiii-chess-baduk-board-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 98 | 114 | `$0.000534` | 시계 문자판 전통 로마자 `IIII` 표기·시침 분침 연동 각도(11:55=357.5°)·체스판 우하단 백색 칸(`h1`) 및 바둑돌 3지 착수 파지 고정 |
| `cost-cap:castle-clockwise-stair-carriage-waltz-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 109 | 220 | `$0.003627` | 중세 성채 나선 계단 시계방향 상승(수비자 오른손 검 휘두름 공간 확보)·4인승 마차 상석(진행방향 정면 우측)·왈츠 클로즈드 홀드 고정 |
| `cost-cap:hunter-gate-raid-party-inventory-potion-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 123 | 220 | `$0.003669` | 헌터물 S급 게이트 청보라 사건의 지평선·5인 공대 진형·물약 플라스크 기울임 시 액체 수면 지구 중력 수평(Horizontal Meniscus) 유지 고정 |
| `cost-cap:cyberpunk-prosthetic-mecha-nvg-molle-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 109 | 220 | `$0.003627` | 사이버펑크 크롬 의수 생체 피부 심라인(Seam) 고정·4안 야간투시경(GPNVG-18) 브릿지·전술 조끼 비우세손 방향 탄창 파우치 수량 고정 |
| `cost-cap:shaman-gut-exorcism-talisman-onmyoji-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 108 | 220 | `$0.003624` | 한국 무속 신칼·방울 좌우 파지·괴황지 경면주사 부적(`#DC2626`) 획순·가톨릭 구마 영대(Stole)·오방기 색채 고증 고정 |
| `cost-cap:forensic-luminol-blood-spatter-autopsy-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 108 | 220 | `$0.007120` | 범죄 스릴러 혈흔 비산(Cast-off/Arterial) 수렴점 역산·루미놀 청록 발광(`#38BDF8`)·탄도 궤적 레이저·현장 증거물 마커 연속성 총괄 감독 |
| `cost-cap:locked-room-alibi-cipher-archaeology-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 104 | 220 | `$0.007060` | 밀실 트릭 평면도·용의자 시간대별 알리바이 동선 매트릭스·다중치환 암호문·고고학 비문 탁본 음양각 및 탄소연대측정 감리 |
| `rea720:global-webtoon-720-platform-master-synthesis (720-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 122 | 220 | `$0.007330` | 로판귀족에티켓·중세성채/마차/왈츠·헌터게이트/레이드·사이버펑크의수·무속오컬트·과학수사/밀실추리 포함 글로벌 720대 웹툰 AI 플랫폼 및 132대 스마트 라우팅 완성 |
| `cost-cap:esports-hud-gamer-keyboard-mouse-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 112 | 75 | `$0.000390` | 프로게이머 웹툰 e스포츠 중계 상단 킬스코어·골드·미니맵 안개 시야 연속성 및 왼손 WASD 키보드·오른손 마우스 파지 고정 |
| `cost-cap:courtroom-trial-prison-handcuff-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 96 | 78 | `$0.000389` | 한국 형사법정 판사석 정면 기준 좌측 검사석·우측 변호인석 배치 고정 및 구치소 아크릴 타공 통화구·수갑 열쇠구멍 고증 |
| `cost-cap:kpop-stage-choreo-lightstick-iem-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 106 | 183 | `$0.003063` | K-POP 아이돌 무대 커스텀 인이어(IEM) 귀뒤 오버이어 루프·볼 헤드셋 마이크·5/7인조 V자 칼군무 및 객석 응원봉 파도 연출 |
| `cost-cap:aviation-cockpit-zerog-submarine-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 99 | 220 | `$0.003597` | 여객기 좌측 기장석/우측 부기장석·전투기 애프터버너 마하 다이아몬드·우주선 무중력 구형 물방울 표면장력·잠수함 적색 전투조명 고증 |
| `cost-cap:archery-fencing-boxing-stance-cue-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 101 | 220 | `$0.003603` | 국궁(엄지 깍지+우측 화살 거치) vs 양궁(3지 당김+좌측 거치), 펜싱 3종목 유효면, 복싱 오소독스/사우스포 반전 차단 |
| `cost-cap:orchestra-piano-guitar-tea-calligraphy-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 90 | 220 | `$0.003570` | 88건반 피아노 검은건반(2-3 주기)·기타 프렛 마크(3/5/7/9/12)·동양 다도 다완 정면 회전·서예 쌍구법 수직 붓 파지 고정 |
| `cost-cap:botanical-flora-blacksmith-alchemy-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 109 | 220 | `$0.007135` | 벚꽃 5꽃잎 끝 홈(Apical Notch)/단풍잎·대나무 속이 빈 원통 절단면·대장간 왼손 집게/오른손 해머 담금질·성당 스테인드글라스 투영광 감독 |
| `cost-cap:heavy-machinery-signboard-tax-erp-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 101 | 220 | `$0.007015` | 굴착기 3절 유압 링크·전철 팬터그래프 접지·네온사인 유리관 전극/간판 외계어 차단·웹툰 고료 3.3% 원천징수/어시 정산 ERP 총괄 감독 |
| `rea780:global-webtoon-780-platform-master-synthesis (780-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 87 | 220 | `$0.006805` | e스포츠/한국법정/K-POP무대/항공우주/국궁펜싱/악기다도/식물대장간/중장비세무 포함 글로벌 780대 웹툰 AI 플랫폼 및 140대 스마트 라우팅 완성 |
| `localize:dental-ophthalmology-xray-marker-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 110 | 84 | `$0.000424` | 치과 치경 간접시야 반사·안과 세극등·정형외과 X-ray 좌우 납 마커(L/R) 반전 차단 및 구급차 제세동기 패들(우 쇄골/좌 겨드랑이) 위치 고정 |
| `localize:rotary-phone-turntable-camera-instant-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 109 | 92 | `$0.000455` | 다이얼 전화기 4시 핑거스톱·LP 턴테이블 우측 톤암/시계방향 회전·필름 카메라 우측 와인딩 레버·폴라로이드 하단 넓은 흰 여백 고정 |
| `localize:chemistry-microscope-centrifuge-astronomy-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 105 | 220 | `$0.003615` | 화학 뷰렛 적정/흄후드·현미경 대물렌즈 배율 색띠(4x~100x)·원심분리기 대칭 밸런스·적도의 망원경 추봉 및 일기도 고저기압 바람 화살표 고증 |
| `localize:equestrian-falconry-horology-gemstone-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 99 | 220 | `$0.003597` | 승마 발볼(Ball of Foot) 등자 밟기·매사냥 왼손 시치·시계 맞물린 기어 반대 회전·보석 프롱(4발/6발) 수량 및 조향사 오르간 고증 |
| `localize:film-slate-boom-cstand-broadcast-tally-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 108 | 220 | `$0.003624` | 촬영장 슬레이트 Scene/Take 일치·붐마이크 프레임아웃·C-스탠드 우측 조임 법칙·방송 부조정실 프리뷰(녹색)/본방(적색+탈리) 모니터 일치 |
| `localize:school-csat-omr-tcg-dice-mahjong-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 98 | 220 | `$0.003594` | 한국 수능 OMR 답안지/학사모 술 이동·TCG 카드 90도 탭·주사위 마주보는 면 합(7/21) 인접 노출 차단·마작 13패 고정 |
| `localize:amusement-coaster-ferris-camping-ski-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 111 | 220 | `$0.007165` | 롤러코스터 3륜 업스톱 휠·대관람차 곤돌라 중력 수평 유지·인형뽑기 3발 집게·캠핑 텐트 45도 팩·스노보드 레귤러/구피 스탠스 총괄 감독 |
| `localize:hourglass-candle-scale-book-paywall-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 106 | 220 | `$0.007090` | 모래시계 34도 안식각·기울어진 촛대 수직 불꽃·천칭 저울·펼친 책 M자 제본선 곡면 왜곡 및 유료 미리보기(쿠키) 전환 훅 총괄 감독 |
| `rea840:global-webtoon-840-platform-master-synthesis (840-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 87 | 208 | `$0.006505` | 치과/안과/X-ray·다이얼/턴테이블·화학현미경·승마/시계기어·촬영장/부조정실·수능/TCG/마작·유원지/캠핑·모래시계/쿠키전환 포함 840대 플랫폼 및 148대 라우팅 완성 |
| `localize:joseon-gat-binyeo-katana-saya-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 79 | 96 | `$0.000447` | 조선 갓(흑립) 양태 말총 망사 투과도·비녀 좌→우 꽂기·일본도 카타나(날 위쪽) vs 타치(날 아래쪽) 패용 고정 |
| `localize:mens-suit-button-tie-heel-eyeglass-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 81 | 78 | `$0.000377` | 남성 정장 맨 아래 단추 언버튼 규칙·넥타이 딤플/벨트 기장·스틸레토 힐 외측 버클·안경 코받침 고정 |
| `localize:hwacha-geobukseon-trebuchet-joust-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 80 | 167 | `$0.002745` | 조선 신기전 화차(100발 격자)·거북선 2층 포갑판/8자 노젓기·트레뷰셋 평형추 투석기·마상창시합 좌측 교차 고증 |
| `localize:hanok-ondol-bongsu-watermill-matchlock-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 80 | 180 | `$0.002940` | 한옥 아궁이-구들-굴뚝 배치·암키와/수키와·봉수대 5연 횃불 신호·물레방아 낙수 회전·조총 화접 점화 백연 고증 |
| `localize:zombie-barricade-gasmask-lockpick-laser-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 77 | 180 | `$0.002931` | 아포칼립스 문 경첩 방향별 바리케이드·방독면 비주류손 정화통·가이거 계수기·보안 레이저 에어로졸 산란 연출 고정 |
| `localize:cyber-terminal-server-cctv-rooftop-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 75 | 180 | `$0.002925` | 리눅스 터미널 유효 IPv4 대역·19인치 42U 서버랙 패치케이블·야간 CCTV 850nm IR LED 링·옥상 실외기 설비 고증 |
| `localize:animal-pupil-spider-octopus-shark-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 79 | 180 | `$0.005685` | 초식동물 수평 동공(340° 파노라마) vs 야행성 수직 동공·거미 두흉부 8다리·문어 2열 빨판·상어 수직 꼬리지느러미 총괄 감독 |
| `localize:sign-language-hearing-aid-isbn-archive-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 75 | 180 | `$0.005625` | 한국수어(KSL) 수형/수동 화살표/비수지 신호·귀걸이형 보청기/인공와우/흰지팡이 고증 및 단행본 ISBN-13·도서관 납본 총괄 감독 |
| `rea900:global-webtoon-900-platform-master-synthesis (900-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 74 | 180 | `$0.005610` | 조선갓/카타나·남성정장/힐·신기전/거북선·한옥온돌/조총·바리케이드/방독면·터미널/서버랙·동물동공/8다리·한국수어/ISBN 포함 900대 플랫폼 및 156대 라우팅 완성 |
| `localize:murim-plum-sword-tang-clan-bagua-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 96 | 97 | `$0.000465` | 무협 화산파 매화검법 5꽃잎·남궁세가 뇌전대검·사천당가 암기·제갈세가 기문둔갑 팔진도·무당 불진/개방 타구봉 문파 시그니처 고정 |
| `localize:xianxia-flying-sword-inn-bamboo-scroll-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 87 | 180 | `$0.000790` | 선협 어검비행 스탠스·삼족 연단로·객잔 2층 중정 난간/붉은천 봉인 술독·대나무 45도 절단·죽간/전서구/촌관척 진맥 고정 |
| `localize:casino-baccarat-holdem-chips-auction-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 91 | 180 | `$0.002973` | 카지노 바카라 카드 쪼기(Squeeze)·텍사스 홀덤 5커뮤니티 카드·칩 액면가 색상 스택·미술품 경매장 패들 번호 연속성 고정 |
| `localize:grand-piano-lid-violin-cigar-whisky-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 86 | 180 | `$0.002958` | 그랜드피아노 우측 덮개 지지대(Lid Stick)·바이올린 좌측 턱받침/f홀·시가 기요틴 커터/위스키 아이스볼·네이키드 에스프레소 고정 |
| `localize:supercar-door-f1-halo-yacht-jet-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 103 | 180 | `$0.003009` | 슈퍼카 시저/걸윙 도어 경첩·F1 티타늄 헤일로/DRS·폴로 오른손 스틱 규칙·슈퍼요트 티크 갑판·프라이빗 제트 클럽시트 고정 |
| `localize:deep-sea-submersible-spacesuit-cryopod-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 88 | 180 | `$0.002964` | 심해 잠수정 반구형 아크릴 관측창/발광생물·ISS 7면 큐폴라/EVA 금도금 바이저·콜드슬립 성에/체렌코프 청색 발광 고정 |
| `localize:volcano-lava-glacier-crevasse-desert-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 88 | 180 | `$0.005820` | 화산 용암 냉각 흑각/백열 균열·빙하 크레바스 청색 산란광/피켈 제동·사막 사구 34도 안식각/쇄빙선 스푼 선수 총괄 감독 |
| `localize:aircraft-carrier-catapult-bunker-bsl4-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 87 | 180 | `$0.005805` | 항공모함 증기 캐터펄트/어레스팅 와이어·수송기 정적줄 강하등·방공호 방폭문 핸드휠·BSL-4 양압복/냉각탑 총괄 감독 |
| `rea960:global-webtoon-960-platform-master-synthesis (960-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 74 | 180 | `$0.005610` | 무협화산/당가/팔진도·선협어검/객잔·카지노바카라/홀덤·피아노/시가·슈퍼카/F1·심해잠수정/우주복·화산빙하·항모벙커 포함 960대 플랫폼 및 164대 라우팅 완성 |
| `art-director:ancient-mythology-trireme-khopesh-rune-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 105 | 180 | `$0.000804` | 그리스 삼단노선(3단 노)/코린트 주두·바이킹 롱쉽/룬 문자·이집트 코페시(볼록 외측 날)/우레우스·아즈텍 마쿠아후이틀 고증 고정 |
| `art-director:korean-military-beret-k2-rifle-dogtag-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 99 | 129 | `$0.000595` | 한국 육군 베레모 모표(왼눈 위)/우측 풀림·인식표 군번줄 2개(긴줄+짧은줄)·K2 소총 좌측 조정간/우측 장전손잡이 반전 차단 고정 |
| `art-director:steampunk-airship-automaton-diving-plague-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 101 | 180 | `$0.003003` | 스팀펑크 비행선 하부 곤돌라·황동 부르동 압력계/보일러 수위 유리관·태엽 오토마타·12볼트 구리 잠수모·흑사병 부리 마스크 고증 |
| `art-director:floating-island-world-tree-dragon-mimic-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 94 | 180 | `$0.002982` | 부유섬 역원추 암반·세계수 판근/발광 잎맥·드래곤 레어 금화 34도 안식각·미믹 사슬 방향(앞쪽=미믹)·바위 골렘 유격 고정 |
| `art-director:korean-market-bunsik-bbq-jjimjilbang-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 96 | 180 | `$0.002988` | 전통시장 빨간 다라이/접시저울·분식집 사각 떡볶이 철판·고깃집 자바라 동파이프 후드·찜질방 양머리/식혜·코인세탁소 고증 |
| `art-director:korean-wedding-paebaek-jesa-hwatu-transit-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 97 | 180 | `$0.002991` | 전통 폐백 연지곤지·제사상 홍동백서/어동육서·화투 12월 패(5광/고도리)·지하철 우측 개찰구 태그/KTX 회전좌석 고증 고정 |
| `art-director:autonomous-7stage-pipeline-dna-hash-psd-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 104 | 180 | `$0.015060` | 7단 자율 에이전트 파이프라인·100화 캐릭터 DNA 해시 원장·인접 컷 3D 카메라 프러스텀·시맨틱 5그룹 PSD/Trapped-Ball 밑색 분리 |
| `art-director:toonstudio-1020-platform-supreme-meta-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 104 | 180 | `$0.015060` | 1,020대 웹툰 AI 플랫폼 UI/UX 수프림 메타 오케스트레이터·12개국 동시연재 용어집·주파수 포렌식 워터마크·60초 쇼츠 PV 총괄 감독 |
| `rea1020:global-webtoon-1020-platform-supreme-milestone (1020-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 91 | 180 | `$0.014865` | 고대신화/한국군/스팀펑크/부유섬/한국시장/전통의례/7단자율파이프라인 포함 1,020대 플랫폼 마일스톤 및 172대 라우팅 완성 |
| `art-director:age-of-sail-galleon-wheel-cannon-cutlass-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 98 | 180 | `$0.000798` | 대항해시대 갈레온 가로돛/사다리줄·조타륜 왕살(King Spoke)·함포 브리칭 로프·커틀러스 바스켓 가드·보물지도 나침반 고정 |
| `art-director:western-revolver-winchester-saloon-locomotive-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 107 | 180 | `$0.000806` | 서부극 콜트 리볼버 우측 추출봉/패닝·윈체스터 우측 급탄구·살룬 양방향 스윙도어·보안관 별 배지(좌가슴)·증기기관차 배장기 고정 |
| `art-director:noir-trenchcoat-fedora-venetian-blind-spy-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 100 | 180 | `$0.003000` | 누아르 트렌치코트 우측 건플랩/D링·페도라 핀치·베네치안 블라인드 그림자·톰슨 드럼탄창·소음기 동축·미녹스 카메라 고증 |
| `art-director:surgical-light-ecmo-triage-blood-bag-bdna-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 98 | 180 | `$0.002994` | 수술실 무영등·마취기 벨로우즈·ECMO 정맥/동맥혈 색상·트리아지 4색 태그·수혈 점적통 50% 수위·오른나사 B-DNA 이중나선 고정 |
| `art-director:suspension-bridge-arch-keystone-hanok-door-tbm-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 102 | 180 | `$0.003006` | 현수교(포물선+수직 행어) vs 사장교(직선 사선)·석조 아치 중앙 종석·고딕 플라잉 버트레스·한옥 들어열개문 걸쇠·TBM 고증 |
| `art-director:streamer-mic-ringlight-cintiq-blender-node-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 105 | 180 | `$0.003015` | 스트리머 사이드 어드레스 콘덴서 마이크(측면 수음)·링라이트 도넛 캐치라이트·15키 스트림덱·신티크 왼손 투어박스·블렌더 노드 고정 |
| `art-director:git-diff-kanban-discord-superchat-shorts-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 101 | 180 | `$0.015015` | Git 브랜치/PR Diff(초록+/빨강-)·웹툰 6단 마감 칸반·디스코드 발화 그린 링·슈퍼챗 금액 티어·9:16 숏폼 세이프존 총괄 감독 |
| `art-director:toonstudio-1080-omniverse-dcf-stroke-supreme-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 101 | 180 | `$0.015015` | 1,080대 웹툰 AI 플랫폼 옴니버스 수프림 엔진·180개 스마트 라우팅·쿠키 미리보기 UX·웹툰 IP DCF 가치평가·신경망 선화 예측 감독 |
| `rea1080:global-webtoon-1080-platform-omniverse-milestone (1080-platform)` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 94 | 180 | `$0.014910` | 대항해시대/서부극/누아르첩보/수술실B-DNA/현수교한옥문/스트리머신티크/Git칸반슈퍼챗 포함 1,080대 플랫폼 및 180대 라우팅 완성 |
| `alt-text:jongmyo-gayageum-geomungo-daegeum-janggu-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 74 | 105 | `$0.000486` | 종묘제례악 편종/편경 16개·축/어·가야금 12현 안족·거문고 오른손 술대·대금 청공·장구 좌우 궁편/열편 고증 고정 |
| `alt-text:hahoe-mask-lianpu-kabuki-toga-thurible-lock` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 78 | 180 | `$0.000782` | 하회탈 양반 분리 턱·경극 검프 색상·가부키 쿠마도리/노멘·고대 로마 토가 좌측 어깨·성당 4사슬 향로 고증 고정 |
| `alt-text:pipe-organ-pedal-harp-accordion-bagpipe-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 71 | 84 | `$0.001473` | 파이프 오르간 다단 건반/발건반·콘서트 하프 47현 적색 C/청색 F·아코디언 좌우·백파이프 3드론 구조 고정 |
| `alt-text:f1-kerb-wrc-rollcage-skydiving-surfing-yacht-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 82 | 180 | `$0.002946` | F1 연석/타이어 컴파운드·WRC 롤케이지/페이스노트·스카이다이빙 왼손목 고도계·서핑 뒷발목 리쉬·요트 하이크아웃 고정 |
| `alt-text:marshaller-lighthouse-antarctic-observatory-clock-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 76 | 180 | `$0.002928` | 공항 마샬러 경광봉 수신호·원양어선 양승기·등대 프레넬 렌즈·남극 2량 설상차·천문대 돔·시계탑 탈진기 고증 |
| `alt-text:glassblowing-luthier-diamond-loupe-shoemaker-lock` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 73 | 100 | `$0.001719` | 유리공예 블로잉 파이프 회전·바이올린 루시어 사운드포스트·보석 10배율 루페 눈가 밀착·수제화 구두골 고증 |
| `alt-text:3dgs-nerf-controlnet4-facs-sfx3d-saccade-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 80 | 180 | `$0.014700` | 3D 가우시안 스플래팅(3DGS)/NeRF 다중 컷 조명·ControlNet 4중 믹서·FACS 뒤센 미소·독자 Saccade 히트맵 감독 |
| `alt-text:toonstudio-1140-hyper-synthesis-legal-ost-director` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 76 | 180 | `$0.014640` | 1,140대 플랫폼 하이퍼 신세시스·188개 스마트 라우팅·70컷 세이프티 게이지·PSD 차분 백업·계약서 독소조항 스캐너 |
| `rea1140:hyper-synthesis-1140-platform-188-task-verification (1140-platform)` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 75 | 180 | `$0.000780` | 국악/가면극/클래식악기/익스트림스포츠/특수시설/명장공예/3DGS·NeRF·FACS 포함 1,140대 플랫폼 및 188대 라우팅 완성 |
