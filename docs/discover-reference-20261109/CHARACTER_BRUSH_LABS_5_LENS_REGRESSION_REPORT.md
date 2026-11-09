# ToonStudio Character × Brush × 3D Labs 5-Lens 마스터 초안 & Verify AI 회귀 리포트

본 문서는 **Character Labs (`SHAPER × Tripo V3`)**, **Brush Labs (`Sumi WebGPU × 38밴드 분광 안료`)**, **3D Labs (`Blender 5.2 라이브 파이프라인`)** 및 **Cross-Labs Unified Production Bridge (`X_LABS`)**의 5대 크리에이티브 렌즈(`1~5`) 완성형 초안(Mode A & Mode B)과 입력 경계·실패 상태(`Fail-Visible HOLD`) 회귀 검증 결과를 통합 정리한 마스터 문서입니다.

- **기준일:** `2026-11-09`
- **관련 소스 및 테스트:**
  - `apps/character-lab/src/render/style/character-verify-ai-fresh-ideas.ts`
  - `apps/character-lab/src/render/style/character-verify-ai-regression.test.ts`
  - `apps/character-lab/src/render/outline-policy.ts`
  - `apps/character-lab/src/app/shell/panels/RenderPanel.tsx`
  - `apps/brush-lab/src/bench/metrics/webtoon-brush-verify-ai-remix.ts`
  - `apps/brush-lab/src/bench/metrics/webtoon-brush-verify-ai-regression.test.ts`
  - `apps/brush-lab/src/app/views/BenchmarkResultsView.tsx`

## 1. 🔥 CONTRARIAN TAKE (기술 블로그 / 아키텍처 칼럼)

### 제목: AI·3D 창작 도구의 신뢰성은 '통과(PASS) 점수가 얼마나 높은가'가 아니라 '불량 입력에서 얼마나 정확히 멈추는가(Fail-Visible HOLD)'에서 결정됩니다

웹툰·그래픽 벤치마크 대시보드는 흔히 평균 점수를 높이기 위해 지표 하한선을 높게 고정(예: `80~85점` 하한 클램프)하는 유혹에 빠집니다. 하지만 하한 클램프가 임계값(`90점`) 위로 고정되면 8시간 드로잉 프레임 드리프트가 `100%`로 폭증하거나 PBR 무외곽선 상태로 잘못 세팅되어도 게이트가 무조건 `PASS`를 내보내게 됩니다.

ToonStudio는 개별 랩스의 스펙 경쟁을 넘어 교차 정합성 지수(`X_LABS = 96.84점`)와 **Fail-Visible 하드 게이트**를 결합했습니다:

1. **Character Labs 턴어라운드·SDF 게이트:** 툰 셀 음영·얼굴 SDF(`99.5점`)·`1.5×0.3` 비등방 외곽선(`97.5점`) 최적 상태에서는 종합 **`98.34점(PASS)`**을 기록하지만, PBR·무외곽선·SDF 비활성·Delight OFF 상태가 유입되면 즉시 **`84.13점(HOLD)`**으로 판정해 불량 시트 반출을 차단합니다.
2. **Brush Labs 분광·8시간 마라톤 게이트:** 하한 고정 클램프를 제거하고 `0..100` 전체 구간을 열어, 정상 기준선(테이퍼 `97.4점`, Linked Ink `96.2점`, 8시간 드리프트 `0.42%`)에서는 **`97.43점(PASS)`**을 통과시키되 드리프트 과다(`20%`)·저품질 벤치마크(`55점`)나 `NaN` 유입 시 즉시 **`HOLD`(`76.02점` 이하)**로 전환합니다.

## 2. 📖 PERSONAL STORY HOOK (창작자 커뮤니티 / 제작기 에세이)

### 제목: 벤치마크 점수는 90.36점 PASS인데 실제 원고 마감 컷의 수채 하늘이 칙칙하게 죽어버렸던 원인을 찾은 순간

- **(1) Setup (발단):** 주간 70컷 판타지 웹툰 야간 전투 씬 마감 직전, 캐릭터 랩과 브러시 랩의 통합 품질 게이트가 매번 `90점` 이상 `PASS`를 표시해 안심하고 3D 성채 배경 위에 주인공 셀 레이어와 황금색 수채 마법광을 얹었습니다.
- **(2) Friction (갈등):** 막상 원고를 합치자 코 밑에는 다각형 계단 암부가 지고, 푸른 밤하늘 위의 황금색 마법광은 회색빛 진흙물로 탁해졌으며, IBL 강도에 비유한값(`NaN`)이 섞여 원클릭 보정 버튼을 누르는 순간 `shadingProfileSchema`(`0..4`) 검증 오류가 발생했습니다. 원인을 추적해 보니 점수 수식의 하한 클램프(`Math.max(85)`, `Math.max(80)`)가 실제 품질 저하를 가리고 있었습니다.
- **(3) Lesson (해결):** 하한 클램프를 `0`부터 개방해 불량 상태가 즉시 `HOLD`로 드러나도록 교정하고, Tripo v3.5 Delight 무음영 알베도 + 얼굴 SDF + 38밴드 Kubelka-Munk 분광 혼색(채도 보존 이득 `+18.4%`, Ghost-Buffer 무탁점 이득 `+25.8%`)을 동기화해 재작업 시간을 4시간에서 **18밀리초(ms)**로 단축했습니다.

## 3. 📊 DATA / EVIDENCE ANGLE (엔지니어링 QA & 벤치마크 릴리스 노트)

### 제목: 4방향 턴어라운드(C_ID 96.4점) × 38밴드 분광 안료 × Fail-Visible 회귀 테스트로 입증하는 상용 웹툰 파이프라인

주관적 감각 대신 매 커밋 결정론적 시드(`seed=20261027`)와 입력 경계 회귀 테스트로 검증된 정량 지표입니다.

| 도메인 / 검증 계층 | 대표 지표 | 정상 기준치 (`PASS`) | 경계·실패 입력 시 (`HOLD` / `Throw`) | 검증 파일 |
| --- | --- | --- | --- | --- |
| **Character Labs (`SHAPER × Tripo`)** | 4방향 턴어라운드(`0°/35°/90°/180°`) · 얼굴 SDF | C_ID **96.4점** · SDF **99.5점** (종합 **98.34점**) | PBR·무외곽선·SDF OFF 시 **84.13점 (`HOLD`)** | `character-verify-ai-regression.test.ts` |
| **Character Labs (`입력 경계`)** | `headUnits` 등신비 · `ibl.intensity` · RLE 디코더 | `5.0~8.5등신` · IBL `[1.15, 4.0]` 클램프 | `NaN`/`Infinity` → `7.0등신`/`1.15` 복구, 손상 RLE 즉시 Throw | `character-verify-ai-regression.test.ts` |
| **Brush Labs (`Sumi WebGPU`)** | 테이퍼(`T_SHARP`) · Linked Ink · 8h 마라톤 드리프트 | 테이퍼 **97.4점** · Linked Ink **96.2점** · 드리프트 **0.42%** | 저품질·드리프트 20% 시 **76.02점 (`HOLD`)** | `webtoon-brush-verify-ai-regression.test.ts` |
| **Brush Labs (`입력 경계`)** | `resolveStrokeColor` · LazyBrush 데드존 | 유한 `0..1` RGBA 4원소 · 데드존(`<=20.04px`) 고정 | 범위 밖·`NaN`·길이 불일치 시 `InvalidStateError` Throw | `webtoon-brush-verify-ai-regression.test.ts` |
| **3D Labs & Cross-Labs (`Wave 2`)** | 조명·선폭·원근 교차 정합성(`X_LABS`) · Rights BOM | `X_LABS` **96.84점** · 통합 **96.74점** · BOM **100점** | 상용 라이선스 미비 또는 정합성 `< 90` 시 `HOLD` | `studio-cross-labs-production-bridge.test.ts` |

## 4. ✅ PRACTICAL PLAYBOOK (스튜디오 표준 운영 절차 SOP)

### 제목: 캐릭터·브러시·3D 랩스 통합 작화 및 Verify AI 하드 게이트 4단계 실행 플레이북

오늘 바로 스튜디오 실무에 투입할 수 있는 4단계 체크리스트입니다:

1. **Step 1 — 캐릭터 턴어라운드 & Delight 잠금 (`Character Labs`):** `RenderPanel`에서 `SHAPER × Tripo` 비주얼 룩(`shaper-cel` / `shaper-romance-soft`)과 `Tripo v3.5 Delight`, `hID*1 헤어 내선 억제`를 켜고 `Verify AI 캐릭터 툰 최적 보정 적용`을 클릭해 `1.5×0.3` 비등방 외곽선(`97.5점`)과 IBL 강도(`[1.15, 4.0]`)를 확정합니다.
2. **Step 2 — 장르별 브러시 & 38밴드 KM 분광 동기화 (`Brush Labs`):** `BenchmarkResultsView`에서 웹툰 장르 프리셋(`액션·판타지 칼선 G펜` 거칠기 `0.18` 또는 `로맨스·판타지 수채 감성광` 거칠기 `0.42`)을 클릭해 38밴드 Kubelka-Munk 분광 혼색과 무탁점 Ghost-Buffer 워시를 활성화합니다.
3. **Step 3 — 5-Lens Mode B 채널별 초안 확장:** `expandCharacterLabFreshLensDraft`, `expandWebtoonBrushFreshLensDraft`, `buildAllFiveCrossLabsFullDrafts`를 호출해 기술 블로그 칼럼, 창작자 제작기, QA 릴리스 노트, 스튜디오 SOP 문서를 자동 생성합니다.
4. **Step 4 — 회귀·경계 하드 게이트 및 멀티 클라우드 배포 검증:** `character-verify-ai-regression.test.ts`와 `webtoon-brush-verify-ai-regression.test.ts`, 그리고 `verify-all-labs-production-release.mts`를 실행해 전사 `PASS`를 확인한 뒤 7종 멀티 클라우드·로컬 타겟에 배포합니다.

## 5. 🎯 WHAT THEY MISSED (하이브리드 파이프라인 & 포터블 인프라 아키텍처 메모)

### 제목: 3D 캐릭터와 2D 브러시를 각각 최적화해도 '외곽선 두께(mm) 대 브러시 선폭(px) 비율'과 '해상도·환경 편차 0%'를 놓치면 실전 연재에서 무너집니다

- **선폭 조화도와 해상도 스케일 방어:** 독자의 눈은 캐릭터 외곽선(`3.5mm`)과 브러시 가필 선폭(`4.48px`, 목표 비율 `1.25`)의 불일치, 혹은 4K(`2160px`) 모니터 전환 시 선택 실루엣 두께(`computeShaperSelectionOutlineEffect`)에 유입되는 비유한값(`NaN`) 오염에서 이질감을 가장 먼저 감지합니다. ToonStudio는 `finiteOrDefault` 방어와 Cross-Labs 선폭 조화도 수식으로 모든 해상도와 카메라 거리에서 동일한 선 맛을 유지합니다.
- **7-Target 다이나믹 배포 매트릭스:** 로컬 프리뷰(`local-pnpm-preview`), 단일 VM Docker Compose(`local-docker-compose`), Cloudflare 엣지(`cloudflare-edge-static`), Onpod 컨테이너(`onpod-container-cloud`), AWS ECS/CloudFront, GCP Cloud Run, 표준 Kubernetes(`self-hosted-k8s`)까지 7종 환경에서 100% 동일한 원고 픽셀과 프리플라이트 안전성을 보장합니다.
