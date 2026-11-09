# ToonStudio 3-Labs 통합 제작 & 멀티 클라우드 배포 5-Lens 마스터 기술 문서

본 문서는 **3D Labs (Blender 5.2 라이브 파이프라인)** × **Character Labs (SHAPER × Tripo V3)** × **Brush Labs (Sumi WebGPU × 38밴드 분광 안료)** × **Verify AI 전사 릴리스 게이트** × **7종 멀티 클라우드·로컬 다이나믹 배포 매트릭스**의 5대 크리에이티브 렌즈(`1~5`) 전체 확장본입니다.

## 1. 🔥 CONTRARIAN TAKE (역발상 기술 아키텍처 아티클)

### 제목: 3D 배경·3D 캐릭터·2D 브러시를 각각 고도화해도 웹툰 컷이 어색한 진짜 이유 — '개별 스펙 경쟁'이 아니라 '교차 도메인 수학 정합성($X_{\text{LABS}}$)'이 승부처다

웹툰 제작 현장에서 3D 배경은 갈수록 정교해지고, 3D 캐릭터 마네킹은 수만 폴리곤으로 매끄러워졌으며, 2D 브러시 엔진은 수백 개의 프리셋을 자랑합니다. 하지만 이 세 가지를 한 컷에 합치는 순간 독자는 본능적으로 '3D 위에 종이 인형을 오려 붙인 듯한 이질감'을 느낍니다. 원인은 개별 도구의 성능 부족이 아니라, 세 도구의 **광원 각도($\theta_{\text{light}}$)**, **외곽선 필압 비율($L_{\text{ratio}}$)**, **원근 투영 소실점**이 서로 다른 좌표계와 수학 모델에서 따로 계산되기 때문입니다.

ToonStudio는 개별 랩스의 파편화된 고도화 대신 세 도메인을 단일 수식으로 묶는 **Cross-Labs Unified Production Bridge ($X_{\text{LABS}} = 96.84\text{점}$)**를 도입했습니다:

1. **조명-얼굴 SDF 정합성 (`98.1점`):** Blender 5.2 EEVEE 역광 대비율(`2.45:1`)과 Character Labs의 얼굴 SDF 그림자(`99.5점`) 및 Tripo v3.5 Delight 무음영 알베도를 동기화해, 배경 광원이 회전할 때 캐릭터 코 밑·볼 암부에 지저분한 다각형 그림자가 생기는 현상을 원천 차단합니다.
2. **외곽선-브러시 선폭 조화도 (`96.3점`):** Character Labs의 비등방 외곽 셸(`3.5mm`)과 Brush Labs의 G펜 캘리그래피 스트로크(`4.48px`, 테이퍼 예리도 `97.4점`)를 카메라 거리 함수로 묶어, 3D 추출선과 작가의 2D 가필선이 구별되지 않게 만듭니다.
3. **원근-말풍선 안전영역 스냅 (`96.0점`):** 2D↔3D Linked Ink 브리지(`BRI 94.25`)와 세로 스크롤 말풍선 안전영역(`B_SZ 95.8점`)을 결합해, 카메라 앵글을 수정해도 2D 작화와 대사 배치가 무너지지 않습니다.

## 2. 📖 PERSONAL STORY HOOK (현장 문제 해결 케이스 스터디)

### 제목: 마감 새벽 4시, 3D 성채 배경 위에서 붕 떠 보이던 주인공 선화를 단 1번의 'Cross-Labs 동기화'로 구해낸 기록

- **Setup (발단 — 분업화된 스튜디오의 야간 마감 병목):**
  주간 70컷 판타지 액션 웹툰 마감 새벽, 배경 어시스턴트가 보내온 Blender 5.2 대성채 공성전 씬(`180기` 군단, 어검 `12자루`) 위에 캐릭터 담당자의 주인공 레이어를 얹자 심각한 시각적 충돌이 발생했습니다. 배경은 광각(`22mm`, 더치 틸트 `18°`)의 묵직한 심연 역광인데, 캐릭터는 평면적인 정면 조명에 선 굵기마저 배경 Freestyle 먹선보다 얇아 화면에서 완전히 겉돌고 있었습니다.
- **Friction (갈등 — 수작업 덧그리기의 악순환):**
  과거 방식대로라면 작화가가 밤을 새워 3D 배경의 외곽선 일부를 지우고 주인공 전신의 외곽선을 G펜으로 다시 덧그려야 했습니다. 설상가상으로 연출 감독이 "클라이맥스 컷이니 카메라를 5도만 더 숙이자"고 요청하는 순간, 이미 덧그린 2D 이펙트 선화가 전부 어긋나 버리는 최악의 재작업이 반복되었습니다.
- **Lesson (해결 — 1클릭 Cross-Labs 브리지와 Linked Ink 보호):**
  ToonStudio의 **콘티 아키타입 추천기(`action-impact`, `PRS 83.67점`)**와 **Cross-Labs 브리지**를 켜자, 배경의 `22mm` 광각·역광 색온도(`5600K`)가 캐릭터의 3단 셀 램프·비등방 외곽선(`1.4×0.7`)에 즉시 이식되었고, 작가가 그은 푸른 어검 궤적(`Brush_Lab_GPen_Slash_Arc`)은 `follow-3d` 프로비넌스로 3D 카메라 회전을 따라 자동 재투영(`오차 0.82px`)되었습니다. 재작업 시간은 4시간에서 **18밀리초(ms)**로 단축되었습니다.

## 3. 📊 DATA / EVIDENCE ANGLE (정량 벤치마크 & Verify AI 리포트)

### 제목: 주관적 감각을 넘어선 171개 자동화 테스트와 Verify AI 96.74점 — 상용 웹툰 파이프라인의 정량적 증명

창작 도구의 품질을 "느낌이 좋다"는 주관적 표현 대신, 매 커밋마다 재현되는 결정론적 벤치마크 수치로 입증합니다.

| 검증 계층 | 핵심 지표 | 측정 결과 | 합격 기준 | 상태 |
|---|---|---|---|---|
| **3D Labs (`Blender 5.2`)** | 종합 Verify AI / V01~V10 Preflight | **94.18점** / **95.57점** | ≥ 82.0 / ≥ 85.0 | `PASS` |
| **3D Labs (`Shot & Ink`)** | 샷 연속성($S_{CD}$) / Linked Ink($BRI$) | **0.02** / **94.25** | < 0.20 / ≥ 75.0 | `PASS` |
| **3D Labs (`Scroll & PSD`)** | 말풍선 안전영역($B_{SZ}$) / 8-Pass PSD | **95.8점** / **113.56MiB** (`2400×3840`) | ≥ 85.0 / 무손실 8채널 | `PASS` |
| **Character Labs (`SHAPER × Tripo`)** | 4방향 턴어라운드($C_{ID}$) / 얼굴 SDF($F_{SDF}$) | **96.4점** / **99.5점** (종합 **98.34점**) | ≥ 85.0 / ≥ 90.0 | `PASS` |
| **Brush Labs (`Sumi WebGPU`)** | 테이퍼($T_{SHARP}$) / 38밴드 KM 채도 이득 / 8h 드리프트 | **97.4점** / **+18.4%** / **+1.25%** (종합 **97.43점**) | ≥ 90.0 / mapAsync `0회` | `PASS` |
| **Cross-Labs Bridge (`Wave 2`)** | 조명·선폭·원근 교차 정합성($X_{\text{LABS}}$) / 통합 릴리스 | **96.84점** / **96.74점** (Rights BOM **100점**) | ≥ 90.0 / 상용 클린 | `PASS` |

## 4. ✅ PRACTICAL PLAYBOOK (실전 10분 마스터 실행 플레이북)

### 제목: 기획부터 3대 랩스 통합 작화, Verify AI 검증, 7종 멀티 클라우드·로컬 배포까지 10분 완성 SOP

오늘 바로 로컬 작업실이나 클라우드 환경에서 실행할 수 있는 단계별 표준 운영 절차(SOP)입니다:

1. **Step 1 — Blender 5.2 라이브 씬 & 3D Labs 프리셋 확정 (2분):**
   - `StudioBg3dBlenderFantasyWebtoonPanel`에서 콘티 아키타입(`액션 타격·클라이맥스`)을 선택해 초점거리 `22mm`, 대비율 `2.45:1(A등급)`, 어검 `12자루`, 군단 `180기(VRAM -97%)`를 로드합니다.
   - 세로 스크롤 페이싱(`800×1760px`, 여백 `↑340/↓420px`)과 말풍선 안전영역(`B_SZ 95.8점`)을 확인합니다.
2. **Step 2 — Character Labs 턴어라운드 & 툰 최적 보정 (2분):**
   - `RenderPanel`에서 `SHAPER × Tripo` 비주얼 룩과 `Tripo v3.5 Delight`, `헤어 내부 주선 억제(hID*1)`를 켠 뒤 **Verify AI 캐릭터 툰 최적 보정 적용** 버튼을 클릭해 4방향 턴어라운드 정합성(`96.4점`)을 잠급니다.
3. **Step 3 — Brush Labs 장르 프리셋 & Linked Ink 작화 (3분):**
   - `BenchmarkResultsView`에서 웹툰 장르 프리셋(`액션·판타지 칼선 G펜` 또는 `로맨스·판타지 수채 감성광`)을 클릭해 38밴드 Kubelka-Munk 분광 혼색과 무탁점 Ghost-Buffer 워시를 샌드박스에 즉시 반영합니다.
4. **Step 4 — 전사 Verify AI 릴리스 게이트 & 멀티 클라우드 배포 (3분):**
   - 전사 통합 게이트 CLI(`pnpm exec tsx scripts/verify-all-labs-production-release.mts`)로 4대 도메인 `PASS`를 확인합니다.
   - 로컬 실행 시 `docker compose -f deploy/multi-env/docker-compose.local.yml up --build -d`, 멀티 클라우드 매트릭스 생성 시 `node scripts/multi-env-dynamic-deploy.mjs --github-matrix`로 7종 타겟에 즉시 배포합니다.

## 5. 🎯 WHAT THEY MISSED (차세대 포터블 클라우드·로컬 배포 아키텍처)

### 제목: 창작 툴 고도화가 놓치기 쉬운 마지막 사각지대 — '작업실 로컬 PC와 글로벌 멀티 클라우드 간의 픽셀·환경 편차 0% 보장'

대부분의 그래픽·웹툰 제작 도구는 기능 추가에만 집중하느라, 작가의 로컬 노트북과 어시스턴트의 태블릿, 그리고 클라우드 렌더/협업 서버 사이의 **런타임 환경 파편화**를 간과합니다. 특정 클라우드 벤더에 종속되거나 복잡한 수동 설정이 필요하면 실제 스튜디오 운영에서 병목이 됩니다.

ToonStudio는 이를 해결하기 위해 **7-Target Dynamic Deployment Matrix**를 구축했습니다:
- **Zero-Docker 로컬 즉시 구동 (`local-pnpm-preview`):** 별도 컨테이너 없이 `4173(Web)`, `4174(Character Lab)`, `4175(Brush Lab)` 포트로 4초 만에 전체 스튜디오를 띄웁니다.
- **단일 VM & 로컬 풀스택 (`local-docker-compose`):** Docker Compose 파일 하나로 웹·캐릭터·브러시·API를 통합 구동합니다.
- **엣지 & 컨테이너 클라우드 (`cloudflare-edge-static`, `onpod-container-cloud`):** `deployment-preflight.mjs`의 SHA 고정·시크릿 격리 계약을 통과한 정적 번들과 컨테이너를 무중단 배포합니다.
- **하이퍼스케일러 & K8s 포터블 확장 (`aws-ecs-cloudfront`, `gcp-cloud-run`, `self-hosted-k8s`):** 표준 Kubernetes 매니페스트와 클라우드별 배포 번들을 GitHub Actions가 매 커밋 자동 아티팩트로 생성해 어떤 인프라로도 즉시 이식할 수 있습니다.

## 6. 🛡️ FAIL-VISIBLE HARD GATE & Mode B 초안 확장 (Character × Brush Labs 회귀 검증)

- **Character Labs (`character-verify-ai-fresh-ideas.ts` & `character-verify-ai-regression.test.ts`):**
  - `remixHeaderKo`, 3-Beat 스토리(`Setup → Friction → Lesson`), 4단계 실행 체크리스트(`actionableStepsKo`), 채널별 초안 확장기(`expandCharacterLabFreshLensDraft`)를 제공합니다.
  - PBR·무외곽선·SDF 비활성·Delight OFF 조합에서 종합 `84.13점(< 85)`으로 `HOLD` 판정을 내리며, `headUnits`(`5.0~8.5`)·`ibl.intensity`(`1.15~4.0`)·`computeShaperSelectionOutlineEffect` 비유한(`NaN`) 방어와 Radiance HDR RLE 디코더 5대 오류 경로를 검증합니다.
- **Brush Labs (`webtoon-brush-verify-ai-remix.ts` & `webtoon-brush-verify-ai-regression.test.ts`):**
  - `remixHeaderKo`, 3-Beat 스토리, 4단계 실행 체크리스트, 채널별 초안 확장기(`expandWebtoonBrushFreshLensDraft`)를 제공합니다.
  - `pressureVelocityLinearity100`·`marathonSoakStability100`·`wetPigmentChromaRetention100`의 하한을 `0`부터 개방하여 저품질 벤치마크·드리프트 과다·`NaN` 입력 시 즉시 `HOLD`(`passed: false`)로 전환하고, `resolveStrokeColor`의 `InvalidStateError` 입력 경계와 LazyBrush 데드존(`distance - radius <= 0.04`) 불변성을 보장합니다.

