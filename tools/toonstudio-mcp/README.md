# ToonStudio MCP & CLI 연동 가이드

`tools/toonstudio-mcp`는 외부 AI 에이전트(Gemini CLI, Claude Desktop, Cursor, Codex 등)와 로컬 터미널에서 툰스튜디오의 드로잉 및 전 기능을 제어하기 위한 표준 **MCP(Model Context Protocol, JSON-RPC 2.0)** 서버 및 통합 CLI다.

## 빠른 실행 (CLI)

```sh
# 1. 전체 툴 목록 확인
pnpm run studio:cli -- list

# 2. 상태를 파일에 유지하며 연속 드로잉 및 SVG 내보내기
pnpm run studio:cli -- call studio.canvas.create --state-file /tmp/ts-session.json --json '{"title":"1화","width":800,"height":1280}'
pnpm run studio:cli -- call studio.canvas.draw_stroke --state-file /tmp/ts-session.json --json '{"brush":"g-pen","points":[[80,120],[400,320]]}'
pnpm run studio:cli -- call studio.canvas.apply_scene_fx --state-file /tmp/ts-session.json --json '{"presetId":"impact-frame-burst","intensity":85}'
pnpm run studio:cli -- call studio.canvas.export_svg --state-file /tmp/ts-session.json --json '{"outFile":"/tmp/cut-01.svg"}'

# 3. 원샷 드로잉 데모
pnpm run studio:cli -- draw-demo
```

## MCP 클라이언트 등록 예시 (`mcpServers`)

```json
{
  "mcpServers": {
    "toonstudio": {
      "command": "node",
      "args": ["tools/toonstudio-mcp/server.mjs", "--state-file", ".cache/toonstudio-mcp-state.json"]
    }
  }
}
```

## 제공 툴 범위 (15종)

- **드로잉·캔버스**: `studio.canvas.create`, `studio.canvas.add_layer`, `studio.canvas.draw_stroke`, `studio.canvas.add_speech_balloon`, `studio.canvas.apply_scene_fx`, `studio.canvas.export_svg`
- **웹툰 모델러·이미지 생성**: `studio.modeler.compile_cut`
- **IP 확장**: `studio.ip.evaluate_readiness`
- **MMORPG 구인 광장**: `studio.plaza.list_roles`, `studio.plaza.create_party`
- **작품·팀·스튜디오·프로젝트 카페**: `studio.cafe.create_post`
- **보안 RBAC**: `studio.rbac.check_permission`, `studio.rbac.assign_role`
- **AI 고객센터**: `studio.support.triage`
- **세션 스냅샷**: `studio.session.snapshot`
