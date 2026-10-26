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

### 저장소 내재화 CLI · API 프로바이더 · 3D 워크벤치 (2026-10-26 REA 역공학 반영)

- **저장소 전용 CLI**: `pnpm run tripo3d` (`scripts/tripo3d-cli.mts`, `scripts/lib/tripo3d-catalog.mts`, `scripts/lib/tripo3d-runtime.mts`)
  - `doctor --check`: 로컬 `.env.infrastructure.local` / `~/.tripo/config.json` / MCP 런처 점검(비밀값 비노출)
  - `catalog`: 8종 생성 엔드포인트(`/v3/generation/*`), 12종 후처리 체인(`/v3/postprocess/*`, `/v3/mesh/edit`, `/v3/scene/smartsegment`), 오류 코드 카탈로그(`2000`~`2018`), 경쟁사 REA 벤치마크 출력
  - `plan` / `make`: `v3.1-20260211` / `P1-20260311`(네이티브 삼각 로우폴리) / `P2-20260801`(쿼드 로우폴리 + 로컬 BBox 리두) 3원 자동 라우팅, P1 비호환 파라미터 자동 제거, `segment -> complete` 및 `rig -> retarget` 체인 검증, 비-바이페드 골격(`quadruped`, `hexapod`, `octopod`, `serpentine`, `aquatic`) 모션 프리셋 자동 스왑, Blender 5비율 T/A-Pose 접미사 생성
  - `balance` / `status` / `wait`: 지갑 잔액 조회 및 2초→5초→10초 적응형 폴링
- **Core API 프로바이더**: `apps/api/src/modules/studio-ai/studio-tripo3d-provider.ts` (`providerId: "tripo-3d"`, `Studio3dGenerationService` 통합, STS 이미지 업로드 토큰 발급, 크레딧 소진 코드 `2010`/HTTP `402` 감지, GLB 바이너리 검증)
- **프론트엔드 3D 워크벤치**: `apps/web/src/domains/creator/scene-3d/StudioTripo3dCompetitorWorkbench.tsx` 및 `studio-tripo3d-competitor-engine.ts`
  - Tripo V3 3원 모델 라우터, 12단계 체인 빌더, Blender 5비율 포즈→Shaper 마네킹 슬라이더 연동, Pre-Run 크레딧/USD 카드
  - Hyper3D Rodin Gen-2.5 Dual-Card(`Generation` ↔ `3D Editing` Deemos Bang `Parts`/`Refine`/`Modify`), 4종 공간 ControlNet(`default`/`bbox`/`voxel`/`pointcloud`), 5단계 Thinking Effort(`4s`~`80s`)
  - Meshy AI 4단계 웹툰 LOD 래더(`LOD0`~`LOD3`) & Albedo 디라이팅, Sloyd 파라메트릭 건축 × CSM 6-Plane 웹툰 3D 배경 클러스터 빌더

## Meshy MCP·CLI

- CLI: `meshy`/`meshy-cli` (node). `meshy auth status`로 OAuth 연결 확인, `meshy api GET /balance`로 잔액 조회. 2026-09-29 기준 balance 180을 확인했다.
- 공식 MCP: `npx -y @meshy-ai/meshy-mcp-server@0.5.2`, env `MESHY_API_KEY` (`msy_`로 시작, https://www.meshy.ai/settings/api 에서 발급).
- credential-safe launcher: `~/.local/bin/toonspectrum-meshy-mcp` (mode `0700`). `.env.local`의 `MESHY_API_KEY`를 읽어 MCP 서버에 주입한다.
- Muse에 `meshy` stdio 서버가 등록되어 있다. 2026-09-29 기준 `.env.local`에 키가 없어 서버는 대기 상태이며, 키 등록 후 세션 재시작으로 활성화된다.
- MCP 서버는 시작 시 키를 검증하므로 더미 키로는 tools/list 확인이 불가하다. 연결 확인은 키 등록 후 도구 목록 조회로 수행한다.

## Hyper3D Rodin CLI·MCP

- 공식 standalone MCP/CLI는 없다. MCP 경로는 Blender MCP 내장 Hyper3D Rodin 연동(`blendermcp_use_hyper3d`, `MAIN_SITE`/`FAL_AI` 모드)을 사용하고, headless 자동화는 아래 CLI를 사용한다.
- CLI: `~/.local/bin/toonspectrum-hyper3d` (mode `0700`, Python stdlib only). `.env.local`의 `HYPER3D_API_KEY`를 읽는다. 키 발급: https://hyper3d.ai/workspace/api-dashboard.
- 근거 문서: https://docs.hyper3d.ai (base `https://api.hyper3d.com/api/v2`, `Authorization: Bearer`, submit → status → download 비동기 흐름).
- 유료 API이므로 `submit-text`/`submit-image`는 기본 dry-run이며 `--confirm`을 붙여야 실제 전송한다. `status`/`wait`/`download`는 조회·수신 전용이다.
- 2026-09-29 기준 `.env.local`에 키가 없어 대기 상태이다. 공개 API는 Business 구독 경로라 zero-cost 생성을 보장하지 않으며, 무료 한도 거부 시 생성을 중단한다.

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
