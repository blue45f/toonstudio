# ToonStudio MCP · CLI · 공식 스킬/플러그인 패키지 (v2.4 · 44종 툴 · ₩0 Fail-Closed)

`tools/toonstudio-mcp`는 외부 AI 에이전트(**Claude Code · Cursor · Gemini CLI · Codex · Antigravity**)와 로컬 터미널에서 툰스튜디오의 드로잉·포토샵 비파괴 보정·3D/VRM/Blender/SketchUp·분업 OS·무과금 14모드 AI·6대 플랫폼 프리플라이트·하이퍼 오토메이션·10분 긴급 대타·글로벌 6통화 외주·OSMU IP 확장·AI QA 심의·C2PA 저작권 증빙·BEP/7개국 세무·브러시 100점 점검·3D VRM 밀착 점검·플러그인 샌드박스 검증·통합 소재 검색을 제어하는 표준 **MCP(Model Context Protocol, JSON-RPC 2.0)** 서버, 통합 CLI, 공식 스킬(`SKILL.md`) 및 플러그인(`plugin.json`) 패키지다.

> **유료 과금 0원(₩0) Fail-Closed 정책**: 모든 조회·실행 툴과 CLI 출력은 API 키·토큰·개인키 값을 절대 출력하지 않으며, 유료 모델 자동 전환과 외부 무단 호출을 차단한다.

## 빠른 시작 (CLI)

```sh
# 1. 환경·빌드·로컬 스택·플러그인·44종 MCP 툴 종합 진단
node tools/toonstudio-mcp/cli.mjs doctor

# 2. 클라이언트별 복붙 즉시 연동 MCP JSON 생성
node tools/toonstudio-mcp/cli.mjs mcp-config --client claude
node tools/toonstudio-mcp/cli.mjs mcp-config --client cursor
node tools/toonstudio-mcp/cli.mjs mcp-config --client gemini
node tools/toonstudio-mcp/cli.mjs mcp-config --client codex
node tools/toonstudio-mcp/cli.mjs mcp-config --client antigravity

# 3. 공식 에이전트 스킬 설치 스캐폴딩 & 쉘 자동완성 등록
node tools/toonstudio-mcp/cli.mjs init-skill ./agent-skills
node tools/toonstudio-mcp/cli.mjs completion zsh
node tools/toonstudio-mcp/cli.mjs completion bash

# 4. 서드파티 플러그인/공식 스킬 매니페스트 샌드박스 보안 검증
node tools/toonstudio-mcp/cli.mjs verify-plugin tools/toonstudio-mcp/plugin.json

# 5. 전체 44종 툴 목록 · 무료 AI 할당량(₩0) · 14모드 확인
node tools/toonstudio-mcp/cli.mjs list
node tools/toonstudio-mcp/cli.mjs quota
node tools/toonstudio-mcp/cli.mjs ai-modes

# 6. 상태 유지 배치 체인 실행 & 드로잉 데모
node tools/toonstudio-mcp/cli.mjs batch --state-file /tmp/ts-session.json --json '[
  {"tool":"studio.canvas.create","arguments":{"title":"1화","width":800,"height":1280}},
  {"tool":"toonstudio_hyper_automate_episode","arguments":{"idea":"옥상 각성 헌터 1화","mode":"balanced"}},
  {"tool":"toonstudio_preflight_6platforms","arguments":{"platform":"all"}},
  {"tool":"toonstudio_c2pa_provenance_pack","arguments":{"workTitle":"옥상 각성 헌터"}}
]'
node tools/toonstudio-mcp/cli.mjs draw-demo
```

## 공식 플러그인 · 스킬 패키지 구성

| 파일 | 역할 |
| --- | --- |
| `tools/toonstudio-mcp/plugin.json` | MCP 서버·CLI 명령·공식 스킬·권한 스코프 정본 매니페스트 (`verify-plugin` 통과) |
| `tools/toonstudio-mcp/skills/toonstudio-creator/SKILL.md` | 외부 AI 에이전트용 ToonStudio 표준 5단계 웹툰 창작 스킬 가이드 |
| `tools/toonstudio-mcp/server.mjs` | JSON-RPC 2.0 STDIO MCP 서버 (`tools/*`, `resources/*`, `prompts/*`, `ping`) |
| `tools/toonstudio-mcp/tools-ecosystem-v2.mjs` | Waves 12~24 핵심 생태계 12종 MCP 툴 및 리소스·프롬프트 정본 |
| `tools/toonstudio-mcp/cli.mjs` | `doctor`, `mcp-config`, `init-skill`, `completion`, `verify-plugin`, `batch`, `call` 통합 CLI |

## 제공 MCP 툴 (총 44종)

### Waves 12~24 생태계 v2 툴 (12종)
1. `toonstudio_preflight_6platforms` — 네이버·카카오·레진·리디·픽코마·WEBTOON Global 6대 플랫폼 규격 일괄 점검
2. `toonstudio_hyper_automate_episode` — 한 줄 아이디어 + 공정별 0~99% 커스텀 자동화 회차 계획 산출
3. `toonstudio_hiatus_sos_match` — 결원 시 10분 긴급 대타 후보 랭킹 및 작화 인계 키트 생성
4. `toonstudio_global_plaza_quote` — 동남아·글로벌 6통화 단가 환산, KST 시차 겹침, 3단계 에스크로 견적
5. `toonstudio_osmu_adapt_ip` — 웹소설 양방향 각색 · 웹드라마 OTT 피치 · 애니메이션 24fps X-Sheet 변환
6. `toonstudio_ai_qa_compliance_scan` — 국가별 심의·말투 일관성·180도 시선 법칙·상업 라이선스 게이트
7. `toonstudio_c2pa_provenance_pack` — C2PA 2.1 호환 SHA-256 해시 체인 + 타임랩스 저작권 증빙 매니페스트
8. `toonstudio_bep_crossborder_tax` — 회차별 손익분기(BEP) 및 7개국(`KR·US·JP·VN·TH·ID·PH`) 원천징수 정산
9. `toonstudio_brush_100_audit` — Krita/CSP 기준 전 브러시 100점 품질 점검
10. `toonstudio_vrm_3d_fit_audit` — 3D VRM 헤어 밀착·손 포즈·아이템 소켓·바닥 접지(`Y=0`)·매니폴드 점검
11. `toonstudio_plugin_sandbox_verify` — 서드파티 플러그인/스킬 매니페스트 권한·위험 조합·시크릿 샌드박스 검증
12. `toonstudio_search_materials` — 3D·브러시·텍스처·포즈·스크린톤·효과음 통합 소재 검색(CC0 필터 지원)

### 스튜디오 핵심·미디어·분업·AI 툴 (32종)
- **드로잉·캔버스 (6종)**: `studio.canvas.create`, `studio.canvas.add_layer`, `studio.canvas.draw_stroke`, `studio.canvas.add_speech_balloon`, `studio.canvas.apply_scene_fx`, `studio.canvas.export_svg`
- **포토샵 프로 비파괴 보정 (4종)**: `studio.photoshop.apply_layer_fx`, `studio.photoshop.apply_camera_raw`, `studio.photoshop.frequency_separate`, `studio.photoshop.run_action_batch`
- **3D / VRoid / Blender / SketchUp (4종)**: `studio.bg3d.compose_scene`, `studio.vrm.apply_pose_expression`, `studio.blender.compile_npr_recipe`, `studio.sketchup.toggle_dynamic_component`
- **분업 OS (4종)**: `studio.division.split_episode_cuts`, `studio.division.run_ad_qa`, `studio.division.lock_asset`, `studio.division.estimate_royalty`
- **무과금 AI & 현지화·출고 (5종)**: `studio.ai.list_modes`, `studio.ai.free_quota_status`, `studio.ai.run_creative_assist`, `studio.localization.translate_episode`, `studio.export.preflight_check`
- **웹툰 모델러·IP·광장·카페·RBAC·고객센터·세션 (9종)**: `studio.modeler.compile_cut`, `studio.ip.evaluate_readiness`, `studio.plaza.list_roles`, `studio.plaza.create_party`, `studio.cafe.create_post`, `studio.rbac.check_permission`, `studio.rbac.assign_role`, `studio.support.triage`, `studio.session.snapshot`

## MCP Resources & Prompts

- **Resources (`resources/list`, `resources/read`)**: `toonstudio://state/snapshot`, `toonstudio://catalog/platforms`, `toonstudio://policy/zero-bill-ai`, `toonstudio://catalog/materials`
- **Prompts (`prompts/list`, `prompts/get`)**: `episode-preflight-audit`, `hyper-auto-episode-kickoff`, `hiatus-sos-rescue-handoff`, `osmu-ip-expansion-pack`
