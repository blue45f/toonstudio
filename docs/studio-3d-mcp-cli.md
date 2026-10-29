# Studio 3D MCP·CLI 운영 가이드

## 연결 상태

| 공급자 | 공식 자동화 경로 | 로컬 연결 | 무료 생성 판단 | ToonStudio 반영 |
|---|---|---|---|---|
| Tripo | 공식 `tripo-cli` (`tripo` / `tripo mcp`), 공식 Blender MCP (`tripo-mcp`), 공식 Blender add-on, Python SDK/API | `tripo-cli` v0.7.3 + `tripo3d`/`tripo-cli` MCP (Codex·Claude·Gemini·Cursor) + Blender 5.2 add-on 연결 | 결제수단 없는 600-credit API wallet에서 가능 (2026-10-26 기준 잔액 0 확인) | v3 detailed/PBR 환경 에셋 10종 생성·검수·번들링 |
| Meshy | 공식 `meshy-cli`, 공식 MCP/API | CLI OAuth + 잔액 180 확인, MCP launcher·서버 등록(키 대기) | free plan API task 거부가 보고된 바 있음. 생성 전 balance/cost 확인 | MCP 키 등록 후 도구 목록으로 연결 확인 예정 |
| Hyper3D/Rodin | API + Blender 내장 연동 | CLI 생성·self-test 통과, MCP는 Blender 내장 경로(키 대기) | 공개 API는 유료 Business 경로라 zero-cost 보장 불가 | 키 등록 전까지 생성 없음. `--confirm` 없이 전송 불가 |
| Sloyd | API | 연결하지 않음 | 결제수단과 선불 크레딧이 필요하고 auto-recharge 경로가 있음 | 제외 |
| 3D AI Studio | API | 연결하지 않음 | API 사용 전 선불 구매가 필요함 | 제외 |
| Womp, Masterpiece X | 웹 생성 | 공식 MCP/CLI를 확인하지 못함 | 웹 무료 범위만 존재 | 자동화 연결 제외 |

유료 업그레이드, 카드 등록, 선불 구매, 자동 충전은 수행하지 않는다. 무료 한도가 서버 측에서 거부되면 생성 작업을 중단하고 웹 무료 이용과 API 자동화를 혼동하지 않는다.

## Tripo MCP·CLI

공식 소스는 사용자 로컬 도구 디렉터리에 설치하고, 저장소에는 공급자 코드를 복제하지 않는다.

- 공식 CLI (`tripo-cli` v0.7.3): `~/.local/bin/tripo` (`~/.local/bin/toonspectrum-tripo` 래퍼 → Node 24 전역 `tripo-cli`)
- 공식 CLI 내장 MCP (`tripo mcp`): `~/.local/bin/toonspectrum-tripo-cli-mcp` (`tripo_make`, `tripo_task_get`, `tripo_task_wait`, `tripo_balance`, `tripo_history` 5개 도구)
- 공식 Blender MCP (`tripo-mcp` v0.1.2): `~/.local/bin/tripo-mcp` (source: `~/.local/share/toonstudio-tools/tripo-mcp`)
- Blender add-on source: `~/.local/share/toonstudio-tools/tripo-blender-addon`
- Blender MCP credential-safe launcher: `~/.local/bin/toonspectrum-tripo-mcp` (구 문서명의 `toonstudio-tripo-mcp`는 오기)
- ignored credential: `~/WebstormProjects/toonstudio/.env.infrastructure.local` 및 `~/WebstormProjects/toonstudio/.env.local`의 `TRIPO_API_KEY`, `~/.tripo/config.json` (mode `0600`)
- Blender encrypted credential: Blender 5.2 add-on의 `api_key.enc`

Codex·Claude Desktop·Claude Code·Gemini·Cursor에 `tripo3d`(Blender MCP 16개 도구)와 `tripo-cli`(단독 V3 API MCP 5개 도구) stdio 서버가 등록되어 있다. 설정 파일에는 키를 직접 넣지 않고 launcher가 mode `0600`인 `.env.infrastructure.local`(또는 `.env.local`)을 읽는다. launcher 자체는 mode `0700`이다.

연결 확인은 모델을 생성하지 않는 `tripo doctor --json`, `tripo balance --json`, 저장소 내장 `pnpm run tripo3d:check` 및 MCP 도구 목록 조회(`tools/list`)로 수행한다. 2026-10-26 기준 `tripo3d` 16개 도구와 `tripo-cli` 5개 도구 응답 및 `openapi.tripo3d.ai` 연결을 확인했다. 실제 생성 전에는 공급자 balance를 읽고, 예상 credit cost가 남은 wallet을 넘으면 요청을 보내지 않는다.

### 저장소 내재화 CLI · API 프로바이더 · 3D 워크벤치 (2026-10-26 ~ 2026-10-27 REA 역공학 반영)

- **저장소 전용 CLI**: `pnpm run tripo3d` (`scripts/tripo3d-cli.mts`, `scripts/lib/tripo3d-catalog.mts`, `scripts/lib/tripo3d-ecosystem-catalog.mts`, `scripts/lib/tripo3d-runtime.mts`)
  - `doctor --check`: 로컬 `.env.infrastructure.local` / `~/.tripo/config.json` / MCP 런처 점검(비밀값 비노출)
  - `catalog` / `ecosystem`: 8종 생성 엔드포인트(`/v3/generation/*`), 12종 후처리 체인(`/v3/postprocess/*`, `/v3/mesh/edit`, `/v3/scene/smartsegment`), `studio.tripo3d.ai` 12개 웹 워크스페이스(`H3.1` ~1.75M Tri HD, `Smart Mesh P2.0`, `Smart UV` 80k Tri / 40k Quad 상한, `Magic Brush` 국소 텍스처 인페인팅, `Text-to-Motion`), 오류 코드 카탈로그(`2000`~`2018`), 경쟁사 REA 벤치마크 출력
  - `plan` / `make`: `H3.1-20260901` / `v3.1-20260211` / `P1-20260311`(네이티브 삼각 로우폴리) / `P2-20260801`(쿼드 로우폴리 + 로컬 BBox 리두) 자동 라우팅, P1 비호환 파라미터 자동 제거, `segment -> complete` 및 `rig -> retarget` 체인 검증, 비-바이페드 골격(`quadruped`, `hexapod`, `octopod`, `serpentine`, `aquatic`) 모션 프리셋 자동 스왑, Blender 5비율 T/A-Pose 접미사 생성
  - `lint-glb` / `extrude-plan` / `validate-vrm` / `bang-plan`: GLBForge 17-Rule 성능 예산(`mobile-hero`, `desktop-hero`, `product-configurator`, `webtoon-scene-cluster`) 진단, 2D→3D EDT 부조/간판/굿즈 압출 플래너(`enamel`, `chrome`, `rubber`, `neon`, `acrylic`), VRM 0.x(17본)/1.0(15본) 검증기, Hyper3D Rodin Deemos BANG 파츠 분해 플래너
  - `balance` / `status` / `wait`: 지갑 잔액 조회 및 2초→5초→10초 적응형 폴링
- **Core API 프로바이더**: `apps/api/src/modules/studio-ai/studio-tripo3d-provider.ts` (`providerId: "tripo-3d"`, `H3.1-20260901`/`v3.1-20260211`/`P1-20260311`/`P2-20260801` 지원, `Studio3dGenerationService` 통합, STS 이미지 업로드 토큰 발급, 크레딧 소진 코드 `2010`/HTTP `402` 감지, GLB 바이너리 검증)
- **프론트엔드 3D 워크벤치 · 3D 데생인형 · 캐릭터 랩**:
  - `apps/web/src/domains/creator/scene-3d/StudioGen3dFeatureWorkbench.tsx` 및 `studio-tripo3d-competitor-engine.ts`: Tripo Studio 12-Workspace 허브(`H3.1`, `Smart Mesh P2.0`, `Smart UV`, `Magic Brush`, `Text-to-Motion`), GLBForge 17-Rule 린터 & 2D→3D 웹툰 간판/아크릴/네온 부조 압출기, Meshy 7(`meshy-t2` Smart Topology) & 7종 크리에이티브 랩 굿즈 빌더, Hyper3D Rodin 7-Tool MCP & Deemos BANG 파츠 분해기
  - `apps/web/src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx`: Tripo 5비율 T/A-Pose 보정, Text-to-Motion 액션 프리셋, VRM 4-View 카메라 프레이밍(`front`, `three_quarter`, `side`, `face`) + 웹툰 앵글, Blend-AI 실측 스케일 기준선(성인 1.75m / 눈높이 1.6m / 방문 2.1m / 책상 0.75m) 및 3점 조명 비율(`3:1:1.5`) 원클릭 동기화
  - `apps/character-lab`: VRM 0.x/1.0 & VRMA 패키지 진단, 4-View 카메라 프레이밍, 포즈/표정 빠른 검색·필터 및 턴어라운드 시트 익스포트 편의성 강화

## Meshy · GLBForge · VRM Toolkit · Blend-AI MCP·CLI

- **Meshy CLI & MCP**: `meshy`/`meshy-cli` (`meshy auth status`, `meshy api GET /balance`). 2026-10-27 기준 잔액 160(`monthly_credits: 100`, `permanent_credits: 60`)을 확인했으나 무료 플랜 API 태스크 생성이 서버 측에서 `402 NoMorePendingTasks`로 차단되어 있어 정책에 따라 즉시 중단했다. 공식 MCP(`@meshy-ai/meshy-mcp-server@0.5.2`)는 `meshy-7`, `meshy-t1`/`meshy-t2`(Smart Topology), 7종 크리에이티브 랩 상품, 8종 멀티컬러 슬라이서를 제공한다.
- **GLBForge MCP (`@glbforge/mcp@0.4.1` / `@glbforge/core@0.4.0`)**: 11개 도구(`list_profiles`, `analyze_glb`, `audit_directory`, `optimize_glb`, `extrude_image`, `export_stl` 등). 3종 성능 프로파일, 17개 린트 규칙, 8단계 Meshopt+WebP 최적화, 2D→3D EDT 부조 압출을 지원한다.
- **VRM Toolkit MCP (`vrm-toolkit-mcp@0.1.1`)**: `vrm_inspect`, `vrm_validate`, `vrm_compare`, `vrm_render_preview` 4개 도구. VRM 0.x(17 필수 본) / VRM 1.0(15 필수 본) 및 VRMA 애니메이션 트랙·표정·메타데이터·예산 검증을 수행한다.
- **Blend-AI MCP (`blend-ai`)**: 175개 Blender 제어 도구(`analyze_mesh_quality`, `create_light_rig`, `smart_uv_project` 등). 실측 미터 스케일 및 3점 조명(`Key:Fill:Rim = 3:1:1.5`) 기준을 제공한다.
- **Hyper3D Rodin CLI·MCP (`@hyper3d/cli`)**: 공식 원격 MCP 엔드포인트(`https://api.hyper3d.com/api/mcp`, 7개 도구: `rodin_create_uploads`, `rodin_import_images`, `rodin_generate`, `rodin_generate_bang`, `rodin_get_status`, `rodin_wait`, `rodin_get_result`) 및 로컬 `~/.local/bin/toonspectrum-hyper3d` 래퍼를 지원한다.

## 생성 프로필

MCP Free Environment Pack v1은 다음 프로필을 사용했다.

- provider model: `v3.0-20250812`
- geometry quality: `detailed`
- texture quality: `detailed`
- PBR: enabled
- face ceiling: 40,000
- auto size: enabled
- cost: 50 promotional credits per model
- batch: 12 models, 600 promotional credits total
- payment method: none

생성 결과는 원격 만료 URL에 의존하지 않도록 즉시 로컬 GLB로 내려받는다. 배포 전에 Blender 5.2에서 실제 미터 스케일, 원점, 바닥, 텍스처 크기, 카메라 프리뷰를 정규화하고 glTF-Transform으로 Meshopt와 WebP를 적용한다.

## 배포 자산

경로: `apps/web/public/assets/3d/environments/mcp-free-v1/`

- 동네 버스 정류장
- 한국 학교 정문
- 학교 옥상 계단실
- 골목 포장마차 카트
- 원룸 가구 클러스터
- 아파트 공동현관
- 한옥 안마당 대문
- 편의점 집기 클러스터
- 동네 지구대 외관
- 한강 공원 쉼터

각 GLB는 자체 포함 파일이며 외부 runtime URI가 없다. 최종 파일은 약 0.4–0.6 MiB, 3개의 1024px PBR WebP 텍스처, 40,000개 이하 삼각형, 단일 draw call을 목표로 한다. 960×720 대표 썸네일과 로컬 전·후면 검수 렌더를 사용한다.

## 권리 경계

이 팩은 CC0가 아니다. 생성 시점의 Tripo Terms of Service에 따른 free-user output이며 상업 이용 가능, 비독점, 공급자 권리 보유 조건을 manifest와 GLB root extras에 보존한다. 기존 ToonStudio 원본 CC0 팩의 권리를 생성형 공급자 출력에 확장하지 않는다.

- Terms: https://www.tripo3d.ai/terms
- Official MCP: https://github.com/VAST-AI-Research/tripo-mcp
- Official Blender add-on: https://github.com/VAST-AI-Research/tripo-3d-for-blender

## 재현·검증

- Blender normalization and QA: `scripts/blender/process_tripo_mcp_environment_pack_v1.py`
- Manifest builder: `scripts/build_tripo_mcp_environment_manifest_v1.py`
- Runtime and rights regression: `studio-bg3d-environment-mcp-free-v1.test.ts`

검증 항목은 실제 SHA-256, 파일 크기, glTF 2.0 구조, Meshopt/WebP extension topology, embedded image dimensions, mobile budget, 외부 URI 부재, root provenance, billing receipt, rights projection, thumbnail hash를 포함한다.
