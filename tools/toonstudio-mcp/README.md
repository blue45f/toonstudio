# ToonStudio MCP & CLI 연동 가이드 (v2.0 · 32종 풀스튜디오 툴 · ₩0 AI)

`tools/toonstudio-mcp`는 외부 AI 에이전트(Gemini CLI, Claude Desktop, Cursor, Codex 등)와 로컬 터미널에서 툰스튜디오의 드로잉·포토샵 비파괴 보정·3D/VRM/Blender/SketchUp·분업 OS·무과금 14모드 AI·다국어 현지화·출고 프리플라이트를 제어하는 표준 **MCP(Model Context Protocol, JSON-RPC 2.0)** 서버 및 통합 CLI다.

> **유료 과금 0원(₩0) Fail-Closed 정책**: 모든 AI 조회·실행 툴은 API 키 값을 절대 출력하지 않으며, 유료 전용 모델 호출과 유료 자동 전환을 차단한다.

## 빠른 실행 (CLI)

```sh
# 1. 전체 32종 MCP 툴 목록 확인
node tools/toonstudio-mcp/cli.mjs list

# 2. 무료 AI 공급자 안전 할당량(₩0 · 키 미노출) 및 14모드 목록 확인
node tools/toonstudio-mcp/cli.mjs quota
node tools/toonstudio-mcp/cli.mjs ai-modes

# 3. MCP/CLI/무과금 AI 환경 종합 진단
node tools/toonstudio-mcp/cli.mjs doctor

# 4. 상태를 파일에 유지하며 배치 체인 일괄 실행
node tools/toonstudio-mcp/cli.mjs batch --state-file /tmp/ts-session.json --json '[
  {"tool":"studio.canvas.create","arguments":{"title":"1화","width":800,"height":1280}},
  {"tool":"studio.bg3d.compose_scene","arguments":{"sceneName":"옥상 노을","lensMm":35}},
  {"tool":"studio.photoshop.apply_layer_fx","arguments":{"effect":"outer-glow","opacityPct":38}},
  {"tool":"studio.export.preflight_check","arguments":{"platform":"naver-webtoon"}}
]'

# 5. 원샷 드로잉 데모
node tools/toonstudio-mcp/cli.mjs draw-demo
```

## MCP 클라이언트 등록 예시 (`mcpServers`)

```json
{
  "mcpServers": {
    "toonstudio": {
      "command": "node",
      "args": [
        "tools/toonstudio-mcp/server.mjs",
        "--state-file",
        ".cache/toonstudio-mcp-state.json",
        "--api-url",
        "http://localhost:4001"
      ]
    }
  }
}
```

## 제공 툴 범위 (32종)

- **드로잉·캔버스 (6종)**: `studio.canvas.create`, `studio.canvas.add_layer`, `studio.canvas.draw_stroke`, `studio.canvas.add_speech_balloon`, `studio.canvas.apply_scene_fx`, `studio.canvas.export_svg`
- **포토샵 프로 비파괴 보정 (4종)**: `studio.photoshop.apply_layer_fx`, `studio.photoshop.apply_camera_raw`, `studio.photoshop.frequency_separate`, `studio.photoshop.run_action_batch`
- **3D / VRoid / Blender / SketchUp (4종)**: `studio.bg3d.compose_scene`, `studio.vrm.apply_pose_expression`, `studio.blender.compile_npr_recipe`, `studio.sketchup.toggle_dynamic_component`
- **분업 OS (4종)**: `studio.division.split_episode_cuts`, `studio.division.run_ad_qa`, `studio.division.lock_asset`, `studio.division.estimate_royalty`
- **무과금 AI & 현지화·출고 (5종)**: `studio.ai.list_modes`, `studio.ai.free_quota_status`, `studio.ai.run_creative_assist`, `studio.localization.translate_episode`, `studio.export.preflight_check`
- **웹툰 모델러·IP·광장·카페·RBAC·고객센터·세션 (9종)**: `studio.modeler.compile_cut`, `studio.ip.evaluate_readiness`, `studio.plaza.list_roles`, `studio.plaza.create_party`, `studio.cafe.create_post`, `studio.rbac.check_permission`, `studio.rbac.assign_role`, `studio.support.triage`, `studio.session.snapshot`
