#!/usr/bin/env node
/**
 * ToonStudio 통합 MCP (Model Context Protocol, JSON-RPC 2.0) 서버.
 *
 * - 외부 AI 에이전트(Gemini, Claude, Cursor, Codex 등) 및 로컬 CLI에서
 *   드로잉 캔버스, 레이어, 말풍선, 장면 연출 VFX, 웹툰 모델러, IP 확장,
 *   MMORPG 구인 광장, 작품·팀·스튜디오·프로젝트 카페, RBAC 보안, AI 고객센터 등
 *   툰스튜디오 전체 기능을 표준 MCP 툴로 제어한다.
 * - 선택적 `stateFile` 옵션을 주면 CLI/MCP 호출 간 작업 상태를 디스크에 영속화한다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

function createInitialState() {
  return {
    canvas: {
      id: "canvas-default",
      title: "1화 원고",
      width: 800,
      height: 1280,
      layers: [{ id: "layer-base", name: "선화 레이어", visible: true, opacity: 1 }],
      strokes: [],
      balloons: [],
      fxLayers: [],
    },
    cafes: {
      posts: [],
    },
    plaza: {
      parties: [
        {
          partyId: "party-gate-01",
          title: "[긴급] 헌터 액션 주간연재 3인 파티 모집",
          studioName: "스튜디오 크로니클",
          genre: "modern-fantasy",
          slots: [
            { slotId: "s-line", roleCode: "001.003", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 18000, urgent: true },
            { slotId: "s-vfx", roleCode: "001.011", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 15000, urgent: false },
          ],
        },
      ],
    },
    rbac: {
      assignments: {
        "u-owner": "studio_owner",
        "u-line": "line_assistant",
        "u-guest": "guest_reviewer",
      },
      auditLog: [],
    },
    plazaRoles: [
      { code: "001.003", labelKo: "선화 작가" },
      { code: "001.005", labelKo: "채색 작가" },
      { code: "001.008", labelKo: "3D 배경 담당" },
      { code: "001.011", labelKo: "효과(VFX) 담당" },
      { code: "001.017", labelKo: "후보정·원꾸 담당" },
      { code: "001.018", labelKo: "액션 콘티 전문" },
      { code: "001.019", labelKo: "로판 드레스·장신구 전문" },
      { code: "001.020", labelKo: "몬스터·크리처·메카 디자인" },
      { code: "001.021", labelKo: "3D 건축·인테리어 모델러" },
      { code: "001.022", labelKo: "VRM 포징·리깅 어시" },
      { code: "001.023", labelKo: "AI 보조 원고 리터칭·마감" },
      { code: "001.024", labelKo: "글로벌 다국어 현지화 식자" },
      { code: "001.025", labelKo: "웹툰 모션·PV 트레일러 편집" },
      { code: "001.026", labelKo: "IP 확장·2차 사업 매니저" },
      { code: "001.027", labelKo: "긴급 마감 대타 멀티 어시" },
      { code: "001.028", labelKo: "전용 브러시·소품 제작자" },
    ],
  };
}

export function createToonStudioMcpEngine(options = {}) {
  const stateFile = options.stateFile ? resolve(String(options.stateFile)) : null;
  const apiUrl = options.apiUrl ? String(options.apiUrl).trim().replace(/\/+$/, "") : null;
  let state = createInitialState();

  if (stateFile && existsSync(stateFile)) {
    try {
      const loaded = JSON.parse(readFileSync(stateFile, "utf8"));
      if (loaded && typeof loaded === "object" && loaded.canvas) {
        state = { ...state, ...loaded };
      }
    } catch {
      // 손상된 로컬 상태 파일은 초기 상태로 안전하게 복구한다.
    }
  }

  function persistState() {
    if (!stateFile) return;
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
  }

  function syncToRemoteApi(path, payload) {
    if (!apiUrl || typeof fetch !== "function") return;
    void fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // 원격 API 미기동/오프라인 시에도 로컬 MCP 상태와 응답은 유지한다.
    });
  }

  const ROLE_PERMISSIONS = {
    studio_owner: [
      "manuscript:read",
      "manuscript:write_all",
      "manuscript:export_raw",
      "rbac:manage_roles",
      "mcp:execute_draw",
      "ip:manage_expansion",
    ],
    executive_pd: [
      "manuscript:read",
      "manuscript:write_all",
      "manuscript:export_raw",
      "rbac:manage_roles",
      "mcp:execute_draw",
      "ip:manage_expansion",
    ],
    main_author: [
      "manuscript:read",
      "manuscript:write_all",
      "manuscript:export_raw",
      "mcp:execute_draw",
      "ip:manage_expansion",
    ],
    line_assistant: ["manuscript:read", "manuscript:write_assigned_layer", "mcp:execute_draw"],
    color_assistant: ["manuscript:read", "manuscript:write_assigned_layer"],
    bg3d_artist: ["manuscript:read", "manuscript:write_assigned_layer", "asset3d:download_source"],
    guest_reviewer: ["manuscript:read"],
  };

  const tools = [
    {
      name: "studio.canvas.create",
      description: "새 웹툰 캔버스 문서를 초기화합니다.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
        },
      },
      handler: (args = {}) => {
        state.canvas = {
          id: `canvas-${Date.now().toString(36)}`,
          title: String(args.title || "새 웹툰 원고"),
          width: Math.max(64, Number(args.width || 800)),
          height: Math.max(64, Number(args.height || 1280)),
          layers: [{ id: "layer-base", name: "선화 레이어", visible: true, opacity: 1 }],
          strokes: [],
          balloons: [],
          fxLayers: [],
        };
        persistState();
        return { ok: true, canvas: state.canvas };
      },
    },
    {
      name: "studio.canvas.add_layer",
      description: "캔버스에 새 드로잉/채색/효과 레이어를 추가합니다.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, opacity: { type: "number" } },
        required: ["name"],
      },
      handler: (args = {}) => {
        const layer = {
          id: `layer-${state.canvas.layers.length + 1}`,
          name: String(args.name || "새 레이어"),
          visible: true,
          opacity: Math.min(1, Math.max(0, Number(args.opacity ?? 1))),
        };
        state.canvas.layers.push(layer);
        persistState();
        return { ok: true, layer, totalLayers: state.canvas.layers.length };
      },
    },
    {
      name: "studio.canvas.draw_stroke",
      description: "지정된 브러시와 좌표 경로로 드로잉 스트로크를 추가합니다.",
      inputSchema: {
        type: "object",
        properties: {
          brush: { type: "string" },
          color: { type: "string" },
          width: { type: "number" },
          points: { type: "array" },
        },
        required: ["points"],
      },
      handler: (args = {}) => {
        const pts = Array.isArray(args.points) ? args.points : [];
        if (pts.length < 2) {
          return { ok: false, error: "스트로크에는 최소 2개 이상의 좌표가 필요합니다." };
        }
        const stroke = {
          id: `stroke-${state.canvas.strokes.length + 1}`,
          brush: String(args.brush || "g-pen"),
          color: String(args.color || "#111827"),
          width: Math.max(0.5, Number(args.width || 3)),
          points: pts,
        };
        state.canvas.strokes.push(stroke);
        persistState();
        return { ok: true, stroke, totalStrokes: state.canvas.strokes.length };
      },
    },
    {
      name: "studio.canvas.add_speech_balloon",
      description: "웹툰 컷에 말풍선과 대사를 배치합니다.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
        required: ["text"],
      },
      handler: (args = {}) => {
        const balloon = {
          id: `balloon-${state.canvas.balloons.length + 1}`,
          text: String(args.text || ""),
          x: Number(args.x ?? 400),
          y: Number(args.y ?? 200),
        };
        state.canvas.balloons.push(balloon);
        persistState();
        return { ok: true, balloon };
      },
    },
    {
      name: "studio.canvas.apply_scene_fx",
      description: "장면 연출 특수 효과(임팩트 프레임, 벚꽃, 마법진, 글리치 등) 레이어를 추가합니다.",
      inputSchema: {
        type: "object",
        properties: {
          presetId: { type: "string" },
          intensity: { type: "number" },
          blendMode: { type: "string" },
        },
        required: ["presetId"],
      },
      handler: (args = {}) => {
        const fx = {
          id: `fx-${state.canvas.fxLayers.length + 1}`,
          presetId: String(args.presetId || "impact-frame-burst"),
          intensity: Math.min(100, Math.max(0, Number(args.intensity ?? 80))),
          blendMode: String(args.blendMode || "screen"),
        };
        state.canvas.fxLayers.push(fx);
        persistState();
        return { ok: true, fx };
      },
    },
    {
      name: "studio.canvas.export_svg",
      description: "현재 캔버스 스트로크와 말풍선을 SVG 마크업으로 내보냅니다.",
      inputSchema: {
        type: "object",
        properties: { outFile: { type: "string" } },
      },
      handler: (args = {}) => {
        const paths = state.canvas.strokes
          .map((s) => {
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${Number(p.x ?? p[0] ?? 0)} ${Number(p.y ?? p[1] ?? 0)}`)
              .join(" ");
            return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" />`;
          })
          .join("");
        const balloons = state.canvas.balloons
          .map(
            (b) =>
              `<g><ellipse cx="${b.x}" cy="${b.y}" rx="120" ry="44" fill="#FFFFFF" stroke="#111827" stroke-width="2" />` +
              `<text x="${b.x}" y="${b.y + 5}" text-anchor="middle" font-size="14" fill="#111827">${b.text}</text></g>`,
          )
          .join("");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${state.canvas.width} ${state.canvas.height}" width="${state.canvas.width}" height="${state.canvas.height}"><rect width="100%" height="100%" fill="#FFFFFF" />${paths}${balloons}</svg>`;
        if (args.outFile) {
          const safePath = resolve(String(args.outFile));
          writeFileSync(safePath, svg, "utf8");
          return { ok: true, outFile: safePath, byteLength: Buffer.byteLength(svg, "utf8") };
        }
        return { ok: true, svg, strokeCount: state.canvas.strokes.length };
      },
    },
    {
      name: "studio.modeler.compile_cut",
      description: "웹툰 컷 모델러(화풍·카메라·조명·캐릭터) 설정을 AI 이미지 생성 프롬프트로 컴파일합니다.",
      inputSchema: {
        type: "object",
        properties: {
          artStyle: { type: "string" },
          cameraShot: { type: "string" },
          background: { type: "string" },
        },
      },
      handler: (args = {}) => {
        const style = String(args.artStyle || "hunter-action");
        const shot = String(args.cameraShot || "low-angle-hero");
        const bg = String(args.background || "Seoul rooftop sunset");
        return {
          ok: true,
          compiledPrompt: `Korean webtoon (${style}), ${shot}, background: ${bg}, crisp lineart, 3-step cel shading`,
          renderPasses: ["lineart", "flat-color", "cel-shade", "composite"],
        };
      },
    },
    {
      name: "studio.ip.evaluate_readiness",
      description: "작품의 2차 IP 확장(애니·드라마·게임·굿즈·글로벌) 준비도를 평가합니다.",
      inputSchema: {
        type: "object",
        properties: {
          workTitle: { type: "string" },
          publishedEpisodes: { type: "number" },
          hasCleanRightsBom: { type: "boolean" },
        },
      },
      handler: (args = {}) => {
        const eps = Number(args.publishedEpisodes ?? 30);
        const bomOk = Boolean(args.hasCleanRightsBom ?? true);
        const score = bomOk ? Math.min(100, 50 + Math.min(50, eps)) : 35;
        return {
          ok: true,
          workTitle: String(args.workTitle || state.canvas.title),
          readinessScore: score,
          status: bomOk ? (score >= 80 ? "ready" : "needs-prep") : "blocked",
        };
      },
    },
    {
      name: "studio.plaza.list_roles",
      description: "MMORPG 구인 광장의 세분화 어시스턴트 직군 목록을 조회합니다.",
      inputSchema: { type: "object", properties: {} },
      handler: () => ({ ok: true, roles: state.plazaRoles }),
    },
    {
      name: "studio.plaza.create_party",
      description: "MMORPG 구인 광장에 새 실시간 어시스턴트 모집 파티를 개설합니다.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          studioName: { type: "string" },
          genre: { type: "string" },
          roleCode: { type: "string" },
          budgetPerCutKrw: { type: "number" },
        },
        required: ["title", "roleCode"],
      },
      handler: (args = {}) => {
        const party = {
          partyId: `party-${state.plaza.parties.length + 1}-${Date.now().toString(36)}`,
          title: String(args.title),
          studioName: String(args.studioName || "독립 스튜디오"),
          genre: String(args.genre || "modern-fantasy"),
          slots: [
            {
              slotId: `slot-${Date.now().toString(36)}`,
              roleCode: String(args.roleCode),
              requiredCount: 1,
              filledAvatarIds: [],
              budgetPerCutKrw: Math.max(5000, Number(args.budgetPerCutKrw || 16000)),
              urgent: Boolean(args.urgent),
            },
          ],
        };
        state.plaza.parties.unshift(party);
        persistState();
        syncToRemoteApi("/api/studio-ecosystem/plaza/parties", {
          title: party.title,
          studioName: party.studioName,
          genre: party.genre,
          roleCode: party.slots[0].roleCode,
          budgetPerCutKrw: party.slots[0].budgetPerCutKrw,
          urgent: party.slots[0].urgent,
        });
        return { ok: true, party, apiSynced: Boolean(apiUrl) };
      },
    },
    {
      name: "studio.cafe.create_post",
      description: "작품/팀/스튜디오/프로젝트별 카페에 게시글과 이미지 첨부를 등록합니다.",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          imageCount: { type: "number" },
        },
        required: ["scope", "title"],
      },
      handler: (args = {}) => {
        const post = {
          id: `cafe-post-${state.cafes.posts.length + 1}`,
          scope: String(args.scope || "work"),
          title: String(args.title || ""),
          body: String(args.body || ""),
          imageCount: Math.max(0, Number(args.imageCount ?? 0)),
        };
        state.cafes.posts.push(post);
        persistState();
        syncToRemoteApi("/api/studio-ecosystem/cafes/cafe-mcp-bridge/posts", {
          scope: post.scope,
          channel: "free-talk",
          authorName: "MCP 에이전트",
          title: post.title,
          body: post.body || post.title,
          attachments: [],
        });
        return { ok: true, post, apiSynced: Boolean(apiUrl) };
      },
    },
    {
      name: "studio.rbac.check_permission",
      description: "사용자의 보안 역할(RBAC)에 따른 특정 작업 권한을 검증합니다.",
      inputSchema: {
        type: "object",
        properties: { userId: { type: "string" }, permission: { type: "string" } },
        required: ["userId", "permission"],
      },
      handler: (args = {}) => {
        const userId = String(args.userId || "u-guest");
        const permission = String(args.permission || "manuscript:read");
        const roleId = state.rbac.assignments[userId] || "guest_reviewer";
        const perms = ROLE_PERMISSIONS[roleId] || [];
        return { ok: true, userId, roleId, permission, allowed: perms.includes(permission) };
      },
    },
    {
      name: "studio.rbac.assign_role",
      description: "특정 사용자에게 보안 역할을 부여하고 감사 로그를 남깁니다.",
      inputSchema: {
        type: "object",
        properties: {
          actorUserId: { type: "string" },
          targetUserId: { type: "string" },
          roleId: { type: "string" },
        },
        required: ["actorUserId", "targetUserId", "roleId"],
      },
      handler: (args = {}) => {
        const actorRole = state.rbac.assignments[String(args.actorUserId)] || "guest_reviewer";
        if (!(ROLE_PERMISSIONS[actorRole] || []).includes("rbac:manage_roles")) {
          return { ok: false, error: "역할을 변경할 권한(rbac:manage_roles)이 없습니다." };
        }
        const targetUserId = String(args.targetUserId);
        const nextRole = String(args.roleId);
        const prevRole = state.rbac.assignments[targetUserId] || "none";
        state.rbac.assignments[targetUserId] = nextRole;
        const audit = {
          id: `audit-${state.rbac.auditLog.length + 1}`,
          actorUserId: String(args.actorUserId),
          targetUserId,
          change: `${prevRole}->${nextRole}`,
          createdAt: new Date().toISOString(),
        };
        state.rbac.auditLog.unshift(audit);
        persistState();
        syncToRemoteApi("/api/studio-ecosystem/rbac/assign", {
          actorUserId: String(args.actorUserId),
          targetUserId,
          displayName: targetUserId,
          roleId: nextRole,
          scopeType: "studio",
          scopeId: "studio-chronicle",
        });
        return { ok: true, targetUserId, roleId: nextRole, audit, apiSynced: Boolean(apiUrl) };
      },
    },
    {
      name: "studio.support.triage",
      description: "AI 고객센터 문의 의도를 자동 분류하고 즉시 해결 가이드를 반환합니다.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
      handler: (args = {}) => {
        const text = String(args.message || "").toLowerCase();
        const category = /저장|복구|opfs/u.test(text)
          ? "manuscript-recovery"
          : /권한|보안|rbac/u.test(text)
            ? "rbac-security"
            : /결제|환불/u.test(text)
              ? "billing-refund"
              : "general";
        return { ok: true, category, suggestHumanEscalation: category === "billing-refund" };
      },
    },
    {
      name: "studio.session.snapshot",
      description: "현재 툰스튜디오 MCP 세션의 전체 상태 스냅샷을 반환합니다.",
      inputSchema: { type: "object", properties: {} },
      handler: () => ({ ok: true, state }),
    },
  ];

  const toolMap = new Map(tools.map((t) => [t.name, t]));

  function handleJsonRpcRequest(request) {
    const id = request?.id ?? null;
    const method = request?.method;

    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "toonstudio-mcp", version: "1.1.0" },
          capabilities: { tools: {} },
        },
      };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        },
      };
    }

    if (method === "tools/call") {
      const name = request?.params?.name;
      const args = request?.params?.arguments ?? {};
      const tool = toolMap.get(name);
      if (!tool) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown tool: ${String(name)}` },
        };
      }
      const data = tool.handler(args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: data,
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${String(method)}` },
    };
  }

  return { tools, handleJsonRpcRequest, getState: () => state };
}

export function startStdioMcpServer(options = {}) {
  const engine = createToonStudioMcpEngine(options);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      const response = engine.handleJsonRpcRequest(parsed);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: error instanceof Error ? error.message : "Parse error" },
        })}\n`,
      );
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stateIdx = process.argv.indexOf("--state-file");
  const stateFile = stateIdx !== -1 ? process.argv[stateIdx + 1] : process.env.TOONSTUDIO_MCP_STATE_FILE;
  const apiIdx = process.argv.indexOf("--api-url");
  const apiUrl = apiIdx !== -1 ? process.argv[apiIdx + 1] : process.env.TOONSTUDIO_API_URL;
  startStdioMcpServer({ stateFile, apiUrl });
}
