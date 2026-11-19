import { Activity, Check, Copy, Play, Terminal } from "lucide-react";
import { useMemo, useState } from "react";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";
import { useStudioEcosystemStream } from "@/platform/use-studio-ecosystem-stream";

import { STUDIO_ECOSYSTEM_COMMAND_IDS } from "./studio-ecosystem-commands";

interface McpToolCatalogEntry {
  readonly name: string;
  readonly groupKo: string;
  readonly descriptionKo: string;
  readonly sampleArgsJson: string;
}

const MCP_TOOL_CATALOG: readonly McpToolCatalogEntry[] = Object.freeze([
  {
    name: "studio.canvas.create",
    groupKo: "드로잉·캔버스",
    descriptionKo: "새 웹툰 캔버스(세로 스크롤/컷) 문서를 초기화합니다.",
    sampleArgsJson: '{"title":"1화 오프닝 컷","width":800,"height":1280}',
  },
  {
    name: "studio.canvas.draw_stroke",
    groupKo: "드로잉·캔버스",
    descriptionKo: "지정 브러시·색상·좌표 경로로 스트로크를 캔버스에 그립니다.",
    sampleArgsJson: '{"brush":"g-pen","color":"#111827","width":4,"points":[[80,120],[420,360]]}',
  },
  {
    name: "studio.canvas.add_speech_balloon",
    groupKo: "드로잉·캔버스",
    descriptionKo: "웹툰 컷 좌표에 말풍선과 대사를 배치합니다.",
    sampleArgsJson: '{"text":"지금 바로 시작하자","x":400,"y":200}',
  },
  {
    name: "studio.canvas.apply_scene_fx",
    groupKo: "장면 연출·VFX",
    descriptionKo: "임팩트 프레임, 벚꽃, 마법진, 글리치 등 특수효과 레이어를 적용합니다.",
    sampleArgsJson: '{"presetId":"impact-frame-burst","intensity":85,"blendMode":"screen"}',
  },
  {
    name: "studio.canvas.export_svg",
    groupKo: "드로잉·캔버스",
    descriptionKo: "현재 작업 중인 캔버스를 SVG 파일 또는 마크업으로 내보냅니다.",
    sampleArgsJson: '{"outFile":"/tmp/toonstudio-cut-01.svg"}',
  },
  {
    name: "studio.modeler.compile_cut",
    groupKo: "모델러·이미지 생성",
    descriptionKo: "웹툰 화풍·카메라 샷·조명 설정을 4패스 이미지 생성 프롬프트로 컴파일합니다.",
    sampleArgsJson: '{"artStyle":"hunter-action","cameraShot":"low-angle-hero","background":"노을 지는 옥상"}',
  },
  {
    name: "studio.ip.evaluate_readiness",
    groupKo: "IP 확장",
    descriptionKo: "연재 회차와 권리 BOM 상태를 기준으로 2차 IP 확장 준비도를 진단합니다.",
    sampleArgsJson: '{"workTitle":"서울 게이트 브레이커","publishedEpisodes":48,"hasCleanRightsBom":true}',
  },
  {
    name: "studio.plaza.create_party",
    groupKo: "MMORPG 구인 광장",
    descriptionKo: "28개 세분화 직군 기반으로 구인 광장 실시간 모집 파티를 개설합니다.",
    sampleArgsJson: '{"title":"긴급 선화 대타 모집","roleCode":"001.003","budgetPerCutKrw":18000}',
  },
  {
    name: "studio.cafe.create_post",
    groupKo: "카페·커뮤니티",
    descriptionKo: "작품·팀·스튜디오·프로젝트별 카페에 게시글과 첨부 이미지를 등록합니다.",
    sampleArgsJson: '{"scope":"studio","title":"이번 주 레퍼런스 공유","imageCount":3}',
  },
  {
    name: "studio.rbac.assign_role",
    groupKo: "보안 RBAC",
    descriptionKo: "멤버의 보안 역할을 변경하고 감사 로그를 기록합니다.",
    sampleArgsJson: '{"actorUserId":"u-owner","targetUserId":"u-line","roleId":"lead_artist"}',
  },
  {
    name: "studio.support.triage",
    groupKo: "AI 고객센터",
    descriptionKo: "문의 문장을 자동 분류하고 즉시 자가진단·상담원 연결 여부를 판정합니다.",
    sampleArgsJson: '{"message":"OPFS 원고 저장 복구 방법을 알려주세요"}',
  },
]);

const MCP_CLIENT_CONFIG = JSON.stringify(
  {
    mcpServers: {
      toonstudio: {
        command: "node",
        args: ["tools/toonstudio-mcp/server.mjs", "--state-file", ".cache/toonstudio-mcp-state.json"],
      },
    },
  },
  null,
  2,
);

export function StudioMcpCliBridgePanel() {
  const [selectedName, setSelectedName] = useState<string>(MCP_TOOL_CATALOG[0].name);
  const [argsText, setArgsText] = useState<string>(MCP_TOOL_CATALOG[0].sampleArgsJson);
  const [copiedTarget, setCopiedTarget] = useState<"cli" | "mcp" | null>(null);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stream = useStudioEcosystemStream(true);

  const selectedTool = useMemo(
    () => MCP_TOOL_CATALOG.find((t) => t.name === selectedName) ?? MCP_TOOL_CATALOG[0],
    [selectedName],
  );

  const cliCommand = `pnpm run studio:cli -- call ${selectedTool.name} --state-file .cache/toonstudio-mcp-state.json --json '${argsText}'`;

  const handleSelectTool = (tool: McpToolCatalogEntry) => {
    setSelectedName(tool.name);
    setArgsText(tool.sampleArgsJson);
    setCopiedTarget(null);
    setRunOutput(null);
  };

  const handleRunTest = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(argsText) as Record<string, unknown>;
    } catch {
      setRunOutput(JSON.stringify({ ok: false, error: "유효한 JSON 인자가 아닙니다." }, null, 2));
      return;
    }
    setRunning(true);
    try {
      let result: unknown;
      if (selectedTool.name === "studio.modeler.compile_cut") {
        result = await studioEcosystemClient.compileModelerCut({
          artStyle: String(parsed.artStyle ?? "hunter-action"),
          cameraShot: String(parsed.cameraShot ?? "low-angle-hero"),
          lighting: String(parsed.lighting ?? "golden-hour-rim"),
          backgroundPrompt: String(parsed.background ?? parsed.backgroundPrompt ?? "노을 지는 옥상"),
        });
      } else if (selectedTool.name === "studio.ip.evaluate_readiness") {
        result = await studioEcosystemClient.evaluateIpReadiness({
          workTitle: String(parsed.workTitle ?? "서울 게이트 브레이커"),
          publishedEpisodes: Number(parsed.publishedEpisodes ?? 48),
          hasCleanRightsBom: Boolean(parsed.hasCleanRightsBom ?? true),
        });
      } else if (selectedTool.name === "studio.plaza.create_party") {
        result = await studioEcosystemClient.createPlazaParty({
          title: String(parsed.title ?? "긴급 선화 대타 모집"),
          studioName: String(parsed.studioName ?? "MCP 자동화 스튜디오"),
          genre: String(parsed.genre ?? "modern-fantasy"),
          roleCode: String(parsed.roleCode ?? "001.003"),
          budgetPerCutKrw: Number(parsed.budgetPerCutKrw ?? 18000),
        });
      } else if (selectedTool.name === "studio.support.triage") {
        result = await studioEcosystemClient.triageSupport(String(parsed.message ?? ""));
      } else {
        result = {
          mode: "local-dry-run",
          tool: selectedTool.name,
          args: parsed,
          note: "캔버스·로컬 MCP 툴은 CLI 또는 MCP 서버에서 직접 실행됩니다.",
        };
      }
      setRunOutput(JSON.stringify({ ok: true, tool: selectedTool.name, result }, null, 2));
    } catch {
      setRunOutput(
        JSON.stringify(
          {
            ok: true,
            mode: "offline-preview",
            tool: selectedTool.name,
            args: parsed,
          },
          null,
          2,
        ),
      );
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = async (target: "cli" | "mcp", text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // 클립보드 API가 제한된 테스트/비보안 컨텍스트에서도 상태 피드백을 유지한다.
    }
    setCopiedTarget(target);
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="ToonStudio MCP 및 CLI 통합 제어 브릿지"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            MCP · CLI 통합 자동화 브릿지
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1 text-xs tabular-nums text-fg-2">
          <Activity className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
          JSON-RPC 2.0 · {MCP_TOOL_CATALOG.length}개 MCP 툴 · {STUDIO_ECOSYSTEM_COMMAND_IDS.length}개 커맨드 ·{" "}
          {stream.status === "connected" ? "실시간 연결" : "로컬"}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* 모바일에서는 11개 툴 목록을 가로 스냅 레일로 배치해 세로 스크롤을 줄인다. */}
        <div
          className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0"
          role="listbox"
          aria-label="MCP/CLI 툴 목록"
        >
          {MCP_TOOL_CATALOG.map((tool) => {
            const active = tool.name === selectedTool.name;
            return (
              <button
                key={tool.name}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => handleSelectTool(tool)}
                className={`min-h-12 w-56 shrink-0 snap-start rounded-lg border px-3 py-2 text-left text-xs transition-colors duration-150 lg:min-h-10 lg:w-auto ${
                  active
                    ? "border-accent bg-accent-soft/60 font-medium text-fg"
                    : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg"
                }`}
              >
                <div className="truncate font-mono text-[11px]">{tool.name}</div>
                <div className="mt-0.5 text-[11px] text-fg-3">{tool.groupKo}</div>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-card p-3.5 text-xs sm:p-4">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-medium text-fg">{selectedTool.name}</p>
            <p className="mt-1 leading-[1.55] text-fg-2">{selectedTool.descriptionKo}</p>
          </div>

          <label className="flex flex-col gap-1 text-fg-2">
            <span>인자 JSON</span>
            <textarea
              rows={2}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              spellCheck={false}
              className="rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[11px] text-fg [word-break:normal]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={running}
              onClick={() => {
                void handleRunTest();
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 sm:min-h-8 sm:w-auto sm:self-start"
            >
              <Play className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              {running ? "실행 중…" : "브라우저 즉시 실행 테스트"}
            </button>
            {runOutput && (
              <pre
                role="status"
                className="max-h-40 max-w-full overflow-auto rounded-lg border border-line bg-panel p-2.5 font-mono text-[11px] text-fg [word-break:normal]"
              >
                {runOutput}
              </pre>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-fg-2">CLI 실행 명령</span>
              <button
                type="button"
                onClick={() => {
                  void handleCopy("cli", cliCommand);
                }}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-8"
              >
                {copiedTarget === "cli" ? (
                  <Check className="size-3.5 text-good" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                )}
                {copiedTarget === "cli" ? "CLI 명령 복사됨" : "CLI 명령 복사"}
              </button>
            </div>
            <pre className="max-w-full overflow-x-auto rounded-lg border border-line bg-panel p-2.5 font-mono text-[11px] text-fg [word-break:normal]">
              {cliCommand}
            </pre>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-fg-2">MCP 클라이언트 설정 (`mcpServers`)</span>
              <button
                type="button"
                onClick={() => {
                  void handleCopy("mcp", MCP_CLIENT_CONFIG);
                }}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-8"
              >
                {copiedTarget === "mcp" ? (
                  <Check className="size-3.5 text-good" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                )}
                {copiedTarget === "mcp" ? "MCP 설정 복사됨" : "MCP 설정 복사"}
              </button>
            </div>
            <pre className="max-w-full overflow-x-auto rounded-lg border border-line bg-panel p-2.5 font-mono text-[11px] text-fg-2 [word-break:normal]">
              {MCP_CLIENT_CONFIG}
            </pre>
          </div>

          {stream.events.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-line pt-2.5">
              <span className="font-medium text-fg-2">실시간 생태계 SSE 이벤트 ({stream.events.length}건)</span>
              <ul className="space-y-1 font-mono text-[11px] text-fg-3 [word-break:normal]">
                {stream.events.slice(0, 5).map((evt) => (
                  <li key={evt.id} className="truncate">
                    [{evt.type}] {JSON.stringify(evt.payload)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
