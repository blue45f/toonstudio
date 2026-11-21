---
name: toonstudio-creator
description: ToonStudio MCP 서버(44종 표준 툴)와 통합 CLI로 웹툰 기획·드로잉·3D/VRM·브러시 검수·분업·글로벌 외주·6대 플랫폼 프리플라이트·C2PA 저작권 증빙·OSMU IP 확장을 ₩0 무과금 안전 가드레일 안에서 자동화하는 공식 스킬입니다.
version: 2.4.0
metadata:
  author: ToonStudio
  pluginId: toonstudio.official-mcp-pack
  mcpServer: toonstudio
  protocolVersion: "2024-11-05"
  zeroBillGuard: true
---

# ToonStudio 공식 에이전트 스킬 (`toonstudio-creator`)

이 스킬은 **Claude Code · Cursor · Gemini CLI · Codex · Antigravity** 등 외부 AI 에이전트가 ToonStudio MCP 서버와 CLI를 일관된 표준 절차로 다루도록 설계된 공식 운영 가이드다.

## 1. 핵심 안전 원칙 (항상 준수)

1. **유료 과금 ₩0 Fail-Closed**: 모든 AI 조회·보조 도구는 무료 안전 할당량(90% 차단선)과 로컬 결정론 폴백 안에서만 동작한다. 유료 모델 자동 전환을 요구하지 않는다.
2. **시크릿 출력 금지**: API 키, 토큰, 계정 ID, 개인키를 명령 인자·로그·문서·매니페스트에 절대 출력하거나 저장하지 않는다.
3. **Rights BOM 우선 게이트**: 상업 연재 출고 전 `toonstudio_preflight_6platforms`와 `toonstudio_ai_qa_compliance_scan`으로 라이선스(`CC0` / 상업 허용)를 먼저 확인한다.
4. **3D/브러시 품질 기준**: 3D VRM 에셋은 `groundY = 0`, 비매니폴드 `0건`, 헤어 밀착 오차 `<= 2.5mm`를 확인하고 브러시는 100점 척도 `>= 90점`을 유지한다.

## 2. 초기 연결 및 환경 점검 (CLI)

작업 시작 전 환경 진단과 클라이언트 연동 JSON 생성은 다음 CLI 명령을 사용한다.

```sh
# 1) 환경·빌드 산출물·44종 MCP 툴·플러그인 무결성 진단
node tools/toonstudio-mcp/cli.mjs doctor

# 2) 클라이언트별 복붙 즉시 연동 JSON 생성
node tools/toonstudio-mcp/cli.mjs mcp-config --client claude
node tools/toonstudio-mcp/cli.mjs mcp-config --client cursor
node tools/toonstudio-mcp/cli.mjs mcp-config --client gemini
node tools/toonstudio-mcp/cli.mjs mcp-config --client codex
node tools/toonstudio-mcp/cli.mjs mcp-config --client antigravity

# 3) 공식 스킬 스캐폴딩 설치 및 쉘 자동완성 등록
node tools/toonstudio-mcp/cli.mjs init-skill ./my-agent-skills
node tools/toonstudio-mcp/cli.mjs completion zsh

# 4) 플러그인·스킬 매니페스트 보안 샌드박스 검증
node tools/toonstudio-mcp/cli.mjs verify-plugin tools/toonstudio-mcp/plugin.json
```

## 3. 5단계 웹툰 창작 표준 워크플로 (44종 MCP 툴 매핑)

### 단계 1 — 기획 · 하이퍼 오토메이션
- `toonstudio_hyper_automate_episode`: 한 줄 아이디어와 공정별 `0~99%` 자동화 비중(`stageAutonomy`)으로 3막 구조·컷 분할·레이어 구성을 산출한다. 인간 창작 제어권(`manualControlOpen: true`)은 항상 유지된다.
- `studio.ai.list_modes` / `studio.ai.free_quota_status` / `studio.ai.run_creative_assist`: 14종 무과금 웹툰 AI 보조 모드를 실행한다.

### 단계 2 — 드로잉 · 브러시 100점 점검 · 3D/VRM · 통합 소재 검색
- `studio.canvas.create`, `studio.canvas.add_layer`, `studio.canvas.draw_stroke`, `studio.canvas.add_speech_balloon`, `studio.canvas.apply_scene_fx`, `studio.canvas.export_svg`
- `studio.photoshop.*` 4종 (레이어 FX · ACR 보정 · 주파수 분리 · 액션 배치)
- `studio.bg3d.compose_scene`, `studio.vrm.apply_pose_expression`, `studio.blender.compile_npr_recipe`, `studio.sketchup.toggle_dynamic_component`
- `toonstudio_brush_100_audit`: Krita/CSP 기준 100점 브러시 품질(필압·기울기·스페이싱·AA·지연·질감)을 점검한다.
- `toonstudio_vrm_3d_fit_audit`: VRM 캐릭터 헤어 두피 밀착, 손 포즈 관절, 아이템 그립 소켓, 바닥 접지(`Y=0`), 매니폴드 무결성을 점검한다.
- `toonstudio_search_materials`: 3D 배경·브러시·텍스처·VRM 포즈·스크린톤·효과음을 `category`와 `licenseFilter: "cc0"` 조건으로 검색한다.

### 단계 3 — 분업 OS · 긴급 대타 · 글로벌 외주 광장
- `studio.division.split_episode_cuts`, `studio.division.lock_asset`, `studio.division.run_ad_qa`, `studio.division.estimate_royalty`
- `toonstudio_hiatus_sos_match`: 결원 발생 시 10분 SLA 긴급 대타 후보 랭킹과 화풍 락 작화 인계 키트를 생성한다.
- `toonstudio_global_plaza_quote`: 동남아(VN·TH·ID·PH)·JP·US 대상 6통화(`KRW·USD·VND·THB·IDR·JPY`) 단가·KST 시차 겹침·3단계 에스크로 견적을 산출한다.

### 단계 4 — 출고 프리플라이트 · AI QA 심의 · C2PA 저작권 증빙
- `toonstudio_preflight_6platforms`: 네이버·카카오·레진·리디·픽코마·WEBTOON Global 6대 플랫폼 규격(폭·슬라이스·용량·sRGB·금칙어·Rights BOM)을 한 번에 점검한다.
- `toonstudio_ai_qa_compliance_scan`: 국가별 심의 등급, 캐릭터 말투 일관성, 180도 시선 축 법칙, 상업 라이선스 게이트를 일괄 검수한다.
- `toonstudio_c2pa_provenance_pack`: C2PA 2.1 호환 SHA-256 해시 체인과 제작 타임랩스 체크포인트로 인간 창작 비중을 증빙한다.

### 단계 5 — OSMU 2차 IP 확장 · BEP/7개국 세무 · 플러그인 보안 검증
- `toonstudio_osmu_adapt_ip`: 웹툰 원고를 웹소설 양방향 각색, 웹드라마 OTT 피칭 덱, 애니메이션 24fps X-Sheet로 변환한다.
- `toonstudio_bep_crossborder_tax`: 회차별 손익분기(BEP)와 7개국(`KR·US·JP·VN·TH·ID·PH`) 조세조약/법정 원천징수 정산표를 계산한다.
- `toonstudio_plugin_sandbox_verify`: 서드파티 플러그인 매니페스트의 권한 스코프, 위험 유출 조합, 평문 시크릿 포함 여부를 검증한다.

## 4. MCP Resources & Prompts 활용

- **Resources (`resources/list`, `resources/read`)**:
  - `toonstudio://state/snapshot`: 현재 세션 상태 스냅샷
  - `toonstudio://catalog/platforms`: 6대 플랫폼 출고 규격 정본
  - `toonstudio://policy/zero-bill-ai`: ₩0 Fail-Closed 할당량 상태
  - `toonstudio://catalog/materials`: 통합 소재 카탈로그
- **Prompts (`prompts/list`, `prompts/get`)**:
  - `episode-preflight-audit`
  - `hyper-auto-episode-kickoff`
  - `hiatus-sos-rescue-handoff`
  - `osmu-ip-expansion-pack`
