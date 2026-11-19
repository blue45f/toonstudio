import {
  ArrowRight,
  Check,
  Copy,
  Layers,
  LockKeyhole,
  Radio,
  Terminal,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { StudioMcpCliBridgePanel } from "./StudioMcpCliBridgePanel";
import { ToolchainPageHeader } from "./ToolchainParts";
import { projectIdFromSearch, withProject } from "./toolchain-links";

type ClientConfigTab = "claude" | "cursor" | "codex" | "cli";

interface ClientSnippet {
  readonly id: ClientConfigTab;
  readonly labelKo: string;
  readonly fileHintKo: string;
  readonly code: string;
}

const CLIENT_SNIPPETS: readonly ClientSnippet[] = [
  {
    id: "claude",
    labelKo: "Claude Desktop",
    fileHintKo: "claude_desktop_config.json",
    code: JSON.stringify(
      {
        mcpServers: {
          toonstudio: {
            command: "node",
            args: [
              "tools/toonstudio-mcp/server.mjs",
              "--state-file",
              ".cache/toonstudio-mcp-state.json",
              "--api-url",
              "http://localhost:3000",
            ],
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: "cursor",
    labelKo: "Cursor · Windsurf",
    fileHintKo: ".cursor/mcp.json",
    code: JSON.stringify(
      {
        mcpServers: {
          toonstudio: {
            command: "node",
            args: [
              "tools/toonstudio-mcp/server.mjs",
              "--state-file",
              ".cache/toonstudio-mcp-state.json",
            ],
            env: {
              TOONSTUDIO_API_URL: "http://localhost:3000",
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: "codex",
    labelKo: "Codex · Gemini CLI",
    fileHintKo: "터미널 STDIO 실행",
    code: [
      "# MCP STDIO 서버 직접 기동 (로컬 영속화 + 백엔드 동기화)",
      "TOONSTUDIO_API_URL=http://localhost:3000 \\",
      "  pnpm run studio:mcp -- --state-file .cache/toonstudio-mcp-state.json",
    ].join("\n"),
  },
  {
    id: "cli",
    labelKo: "터미널 CLI",
    fileHintKo: "원샷 드로잉 · 파이프라인 제어",
    code: [
      "# 1. 사용 가능한 MCP/CLI 전체 툴 목록 확인",
      "pnpm run studio:cli -- list",
      "",
      "# 2. 캔버스 생성 → 선화 스트로크 → 장면 VFX → SVG 내보내기",
      "pnpm run studio:cli -- call studio.canvas.create --state-file /tmp/ts.json --json '{\"title\":\"1화 오프닝\",\"width\":800,\"height\":1280}'",
      "pnpm run studio:cli -- call studio.canvas.draw_stroke --state-file /tmp/ts.json --json '{\"brush\":\"g-pen\",\"points\":[[80,120],[420,360]]}'",
      "pnpm run studio:cli -- call studio.canvas.apply_scene_fx --state-file /tmp/ts.json --json '{\"presetId\":\"impact-frame-burst\",\"intensity\":88}'",
      "pnpm run studio:cli -- call studio.canvas.export_svg --state-file /tmp/ts.json --json '{\"outFile\":\"/tmp/cut-01.svg\"}'",
      "",
      "# 3. 원샷 드로잉 데모 실행",
      "pnpm run studio:cli -- draw-demo",
    ].join("\n"),
  },
];

const TOOL_GROUPS: readonly {
  readonly domainKo: string;
  readonly count: number;
  readonly tools: readonly { readonly name: string; readonly summaryKo: string }[];
}[] = [
  {
    domainKo: "드로잉 · 캔버스 · 장면 연출 VFX",
    count: 6,
    tools: [
      { name: "studio.canvas.create", summaryKo: "세로 스크롤·컷 규격 캔버스 초기화" },
      { name: "studio.canvas.add_layer", summaryKo: "선화·채색·효과 레이어 추가 및 불투명도 제어" },
      { name: "studio.canvas.draw_stroke", summaryKo: "브러시·색상·좌표 경로 기반 스트로크 드로잉" },
      { name: "studio.canvas.add_speech_balloon", summaryKo: "컷 좌표 기반 말풍선·대사 자동 배치" },
      { name: "studio.canvas.apply_scene_fx", summaryKo: "임팩트 프레임·벚꽃·마법진·글리치 특수효과 적용" },
      { name: "studio.canvas.export_svg", summaryKo: "현재 작업 캔버스 SVG 파일 또는 마크업 내보내기" },
    ],
  },
  {
    domainKo: "웹툰 모델러 · IP 확장 · 세션",
    count: 3,
    tools: [
      { name: "studio.modeler.compile_cut", summaryKo: "화풍·카메라·조명 기반 4패스 이미지 생성 프롬프트 컴파일" },
      { name: "studio.ip.evaluate_readiness", summaryKo: "연재 회차·권리 BOM 기반 2차 IP 확장 준비도 진단" },
      { name: "studio.session.snapshot", summaryKo: "현재 MCP 세션 전체 상태 JSON 스냅샷 반환" },
    ],
  },
  {
    domainKo: "협업 광장 · 카페 · 보안 RBAC · 고객센터",
    count: 6,
    tools: [
      { name: "studio.plaza.list_roles", summaryKo: "MMORPG 구인 광장 세분화 어시스턴트 직군 조회" },
      { name: "studio.plaza.create_party", summaryKo: "실시간 어시·보조작가 모집 파티 개설 및 API 동기화" },
      { name: "studio.cafe.create_post", summaryKo: "작품·팀·스튜디오·프로젝트별 카페 게시글 등록" },
      { name: "studio.rbac.check_permission", summaryKo: "역할별 최소 권한 및 원고 반출 허용 여부 검증" },
      { name: "studio.rbac.assign_role", summaryKo: "보안 역할 변경 및 감사 로그 자동 기록" },
      { name: "studio.support.triage", summaryKo: "AI 고객센터 문의 자동 분류 및 상담원 연결 판정" },
    ],
  },
];

export function StudioMcpCliGuidePage() {
  const bt = useBilingual("StudioMcpCliGuidePage");
  const location = useLocation();
  const projectId = projectIdFromSearch(location.search);
  const [activeClient, setActiveClient] = useState<ClientConfigTab>("claude");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useDocumentTitle(bt("MCP · CLI 연동 안내 | ToonStudio", "MCP & CLI Integration Guide | ToonStudio"));

  const currentSnippet =
    CLIENT_SNIPPETS.find((item) => item.id === activeClient) ?? CLIENT_SNIPPETS[0];

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // 비보안/테스트 환경에서도 복사 완료 상태 피드백을 유지한다.
    }
    setCopiedId(id);
  };

  return (
    <Container
      size="wide"
      className="space-y-6 break-keep py-6 [overflow-wrap:break-word] sm:space-y-8 sm:py-10 lg:py-12"
    >
      <ToolchainPageHeader
        mode="mcp"
        projectId={projectId}
        eyebrow="MCP & CLI Automation"
        title={bt("MCP · CLI 연동 안내", "MCP & CLI Integration Guide")}
        lede={bt(
          "외부 AI 에이전트(Claude Desktop, Cursor, Codex, Gemini CLI)와 로컬 터미널에서 툰스튜디오의 드로잉·장면 VFX·웹툰 모델러·IP 확장·구인 광장·카페·RBAC 보안 기능을 표준 JSON-RPC 2.0 프로토콜로 제어할 수 있습니다.",
          "Control ToonStudio drawing, scene VFX, webtoon modeler, IP expansion, recruitment plaza, cafes, and RBAC security from external AI agents and local terminals over standard JSON-RPC 2.0 MCP.",
        )}
        actions={(
          <>
            <Link
              href={withProject("/studio/engines", projectId)}
              style={{ minHeight: "44px" }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg"
            >
              <Wrench size={16} strokeWidth={1.5} aria-hidden="true" />
              {bt("설치·라이선스 보기", "Installs & licenses")}
            </Link>
            <Link
              href={withProject("/studio/jobs", projectId)}
              style={{ minHeight: "44px" }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity duration-150 hover:opacity-90"
            >
              {bt("작업 큐 열기", "Open job queue")}
              <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </>
        )}
      />

      <section aria-labelledby="mcp-quickstart-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="mcp-quickstart-title"
              className="text-base font-medium leading-[1.35] tracking-[-0.015em] text-fg sm:text-lg"
            >
              {bt("3단계 빠른 연동", "Three-step quick start")}
            </h2>
            <p className="mt-1 text-xs leading-[1.55] text-fg-3">
              {bt(
                "로컬 상태 파일(--state-file)과 실시간 백엔드(--api-url)를 함께 지정하면 에이전트 작업이 웹 화면에도 즉시 반영됩니다.",
                "Combine --state-file with --api-url so agent actions persist locally and sync live to the web studio.",
              )}
            </p>
          </div>
        </div>

        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <li className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-medium tabular-nums text-accent">
                1
              </span>
              <Terminal className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h3 className="text-sm font-medium text-fg">
              {bt("MCP 클라이언트 등록", "Register MCP server")}
            </h3>
            <p className="text-xs leading-[1.6] text-fg-2">
              {bt(
                "사용 중인 AI 클라이언트의 설정 파일에 tools/toonstudio-mcp/server.mjs를 STDIO 서버로 추가합니다.",
                "Add tools/toonstudio-mcp/server.mjs as a STDIO server in your AI client configuration.",
              )}
            </p>
          </li>

          <li className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-medium tabular-nums text-accent">
                2
              </span>
              <Layers className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h3 className="text-sm font-medium text-fg">
              {bt("세션 영속화 · CLI 자동화", "Persist state & automate")}
            </h3>
            <p className="text-xs leading-[1.6] text-fg-2">
              {bt(
                "--state-file 옵션을 넘기면 캔버스 생성·선화 스트로크·말풍선·VFX·SVG 내보내기를 여러 단계에 걸쳐 이어서 실행할 수 있습니다.",
                "Pass --state-file to chain canvas creation, strokes, balloons, VFX, and SVG export across calls.",
              )}
            </p>
          </li>

          <li className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-medium tabular-nums text-accent">
                3
              </span>
              <Radio className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h3 className="text-sm font-medium text-fg">
              {bt("실시간 백엔드 · SSE 동기화", "Live API & SSE sync")}
            </h3>
            <p className="text-xs leading-[1.6] text-fg-2">
              {bt(
                "--api-url을 지정하면 구인 광장 파티, 카페 게시글, RBAC 권한 변경이 NestJS API와 SSE 스트림으로 실시간 전파됩니다.",
                "Set --api-url to propagate plaza parties, cafe posts, and RBAC changes over NestJS API and SSE.",
              )}
            </p>
          </li>
        </ol>
      </section>

      <section
        aria-labelledby="mcp-client-config-title"
        className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:p-5"
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="mcp-client-config-title"
              className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg"
            >
              {bt("클라이언트별 설정 스니펫", "Client configuration snippets")}
            </h2>
            <p className="mt-0.5 text-xs text-fg-3">{currentSnippet.fileHintKo}</p>
          </div>

          <div
            role="tablist"
            aria-label={bt("연동 클라이언트 선택", "Choose integration client")}
            className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0"
          >
            {CLIENT_SNIPPETS.map((item) => {
              const selected = item.id === activeClient;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveClient(item.id);
                    setCopiedId(null);
                  }}
                  className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 text-xs transition-colors duration-150 sm:min-h-8 ${
                    selected
                      ? "border-accent bg-accent-soft font-medium text-accent"
                      : "border-line bg-card text-fg-2 hover:text-fg"
                  }`}
                >
                  {item.labelKo}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-fg-3">{currentSnippet.fileHintKo}</span>
            <button
              type="button"
              onClick={() => {
                void handleCopy(currentSnippet.id, currentSnippet.code);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-8"
            >
              {copiedId === currentSnippet.id ? (
                <Check className="size-3.5 text-good" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              )}
              {copiedId === currentSnippet.id ? "복사됨" : "설정 복사"}
            </button>
          </div>
          <pre className="max-w-full overflow-x-auto rounded-lg border border-line bg-panel p-3 font-mono text-[11px] leading-[1.6] text-fg [word-break:normal]">
            <code>{currentSnippet.code}</code>
          </pre>
        </div>
      </section>

      <StudioMcpCliBridgePanel />

      <section aria-labelledby="mcp-tool-reference-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="mcp-tool-reference-title"
            className="text-base font-medium leading-[1.35] tracking-[-0.015em] text-fg sm:text-lg"
          >
            {bt("제공 MCP 툴 전체 레퍼런스 (15종)", "Complete MCP tool reference (15 tools)")}
          </h2>
          <span className="text-xs tabular-nums text-fg-3">
            JSON-RPC 2.0 · stdio · CLI 호환
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {TOOL_GROUPS.map((group) => (
            <article
              key={group.domainKo}
              className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-4"
            >
              <header className="flex items-center justify-between gap-2 border-b border-line pb-2">
                <h3 className="text-sm font-medium text-fg">{group.domainKo}</h3>
                <span className="rounded-md bg-card px-2 py-0.5 text-xs tabular-nums text-fg-3">
                  {group.count}개
                </span>
              </header>
              <ul className="space-y-2 text-xs">
                {group.tools.map((tool) => (
                  <li key={tool.name} className="rounded-lg border border-line bg-card p-2.5">
                    <p className="font-mono text-[11px] font-medium text-fg [word-break:normal]">
                      {tool.name}
                    </p>
                    <p className="mt-1 leading-[1.5] text-fg-2">{tool.summaryKo}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="mcp-security-title"
        className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 text-xs sm:p-5"
      >
        <div className="flex items-center gap-2">
          <LockKeyhole className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h2 id="mcp-security-title" className="text-sm font-medium text-fg">
            {bt("보안 및 RBAC 권한 가드", "Security & RBAC guardrails")}
          </h2>
        </div>
        <ul className="space-y-1.5 leading-[1.6] text-fg-2">
          <li>
            · <strong className="font-medium text-fg">최소 권한 원칙</strong>: 외부 에이전트 드로잉은{" "}
            <code className="font-mono text-[11px] text-fg">mcp:execute_draw</code> 권한이 부여된 역할에서만 허용되며, 역할 변경은{" "}
            <code className="font-mono text-[11px] text-fg">rbac:manage_roles</code> 권한 검증과 감사 로그 기록을 거칩니다.
          </li>
          <li>
            · <strong className="font-medium text-fg">원본 비파괴 격리</strong>: MCP/CLI 세션 상태는 지정된 로컬{" "}
            <code className="font-mono text-[11px] text-fg">--state-file</code>에 분리 저장되어 브라우저 OPFS 원고 원본을 덮어쓰지 않습니다.
          </li>
        </ul>
      </section>
    </Container>
  );
}
