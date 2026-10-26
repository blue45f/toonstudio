# 글로벌·국내 웹툰 AI 보조 15대 플랫폼 REA 심층 역공학(기능·라우트·UI/UX 디자인 토큰) 및 내재화 벤치마크 (2026-10-26)

- **작성일**: `2026-10-26`
- **상태**: `current` (실시간 REA 브라우저 캡처 17건 · JS 번들 추출 14건 · AST/라우트 정적 분석 14건 · ToonStudio 내재화 완료)
- **정본 증거 원장**: [`docs/evidence/rea-webtoon-ai-assist-15-platforms-20261026.json`](../evidence/rea-webtoon-ai-assist-15-platforms-20261026.json)
- **연관 기존 벤치마크**:
  - [`docs/benchmarks/ai-webtoon-assist-ecosystem-rea-benchmark-2026-10-26.md`](./ai-webtoon-assist-ecosystem-rea-benchmark-2026-10-26.md)
  - [`docs/benchmarks/ggumtoon-rea-comprehensive-benchmark-2026-10-26.md`](./ggumtoon-rea-comprehensive-benchmark-2026-10-26.md)
  - [`docs/benchmarks/tooning-plus-rea-comprehensive-benchmark-2026-10-26.md`](./tooning-plus-rea-comprehensive-benchmark-2026-10-26.md)
  - [`docs/benchmarks/ai-webtoon-drawing-store-rea-benchmark-2026-10-26.md`](./ai-webtoon-drawing-store-rea-benchmark-2026-10-26.md)

---

## 1. 조사 개요 및 인식론적(Epistemic) 분리 원칙

기존에 완료된 **꿈툰(GgumToon)**, **투닝 플러스(Tooning Plus)**, **오노마AI(TooToon)**, **젠툰(GenToon)**, **다야툰(DayaToon)**, **라마즈(Lamaz)**, **클립 스튜디오(CSP)**, **에이콘3D(ACON3D)**, **픽셀즈(Pexels)** 분석에 더해, 국내외 웹툰·만화·스토리보드·3D·모션 AI 보조 생태계 **15개 핵심 플랫폼**의 실제 배포 웹/스튜디오 번들을 REA(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`)로 전수 캡처·역공학했다.

- **관측 사실(Observed Facts)**: REA Playwright 네트워크 응답 본문(`sha256`), CSS 변수 테이블, DOM 컨트롤 ID, AST 라우트/심볼에서 직접 추출한 사실만 기록한다.
- **추론(Inferences)**: 클라이언트 번들 구조와 엔드포인트 명명 규칙으로부터 도출한 아키텍처 해석을 분리해 기록한다.
- **미확인 영역(Unknowns)**: 인증 세션 내부의 서버 가중치나 과금 차감 단가 등 정적/비인증 캡처만으로 단정할 수 없는 영역을 명시한다.

---

## 2. 15대 웹툰 AI 보조 플랫폼 REA 증거 및 아키텍처 요약표

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
| **창의적 신규 AI 기능 (Claude Live 연동)** | 15대 플랫폼 융합 | **AI 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터** + **15대 플랫폼 UI/UX 테마 토큰 합성기** + **비파괴 멀티스테이지 레이어 디렉터(`claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-opus-5-5` 실시간 구조화 출력 및 폴백)** |

---

## 5. 실시간 Claude API (`claude-haiku-5-5` · `claude-sonnet-5-5` · `claude-opus-5-5`) 구조화 출력 검증 결과 (2026-10-26)

| 엔진 ID | 라우팅 프로필 | 실행 모델 | 실행 소스 | 입력 토큰 | 출력 토큰 | 추정 비용 (USD) | 실시간 생성 결과 요약 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rea15:glimnavi-relight-lineart-v23` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 312 | 902 | `$0.000686` | `v2.3-balanced` 선화 + 유물 봉인 후방 차가운 림라이트 & 얼굴 표정 보존 그림자 설계 |
| `rea15:kaistory-single-envelope-kaion-quiz` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 314 | 1,999 | `$0.024276` | `conti`→`design`→`editor`→`story` 단일 엔벨로프 + KAION 학습카드(`봉인과 각성의 규칙`) 퀴즈 생성 |
| `rea15:snaptoon-frameo-shaper-3d-lighting` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 333 | 960 | `$0.013864` | Snaptoon→Snapboard 3D 변환 + Frameo 스포트라이트 콘(`--cursor-angle`, `--cone-spread`) + SHAPER 3D 직접 드로잉 |
| `rea15:manhwa-komiko-anifusion-flow` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 309 | 1,332 | `$0.017383` | ManhwaAI 6화풍/5효과톤 + Komiko 비파괴 레이어 분리/인비트윈 + Anifusion 5노드 플로우 그래프 |
| `rea15:creative-dopamine-scroll-ux-synthesizer` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 344 | 1,881 | `$0.047526` | 컷별 독자 도파민 피크(86점)·체류 시간 예측 및 합성 UI 테마(`봉인각성 다크골드`) 도출 |
| `ecosystem:glimnavi-color-hint-stroke` | `fast-inline` | `claude-haiku-5-5` | `claude-live` | 290 | 1,089 | `$0.000807` | Close-Gap 허용치 및 브러시 색상 힌트 스트로크 좌표 생성 |
| `ecosystem:novelai-multi-char-vibe` | `creative-production` | `claude-sonnet-5-5` | `claude-live` | 319 | 1,681 | `$0.020964` | 2인 주연 X/Y 바운딩박스 분리 및 Vibe Transfer 가중치 설계 |
| `ecosystem:novel-adaptation-ip-expansion` | `deep-architecture` | `claude-opus-5-5` | `claude-live` | 303 | 2,580 | `$0.064112` | 웹소설 산문 압축 각색 및 드라마·애니·게임·오디오웹툰 OSMU 스코어카드 도출 |
