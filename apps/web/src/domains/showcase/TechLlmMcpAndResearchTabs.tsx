import { BookOpen, Check, Compass, Copy, Plug, Server, Terminal } from "lucide-react";
import { useState } from "react";

import type { BilingualText } from "./competitor-benchmark-data";
import {
  RESEARCH_PAPERS_ARCHITECTURE,
  SHOWCASE_MCP_API_ENDPOINTS,
  SHOWCASE_MCP_RESOURCES,
  SITEWIDE_UX_MOTION_AXES,
  UNIVERSAL_LLM_CLIENTS,
  buildShowcaseClientMcpConfig,
  type ResearchPaperArchitectureCard,
  type UniversalLlmClientProfile,
} from "./llm-mcp-api-and-papers-data";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

function pick(text: BilingualText, locale: "ko" | "en"): string {
  return locale === "ko" ? text.ko : text.en;
}

const CLI_QUICK_RECIPES = {
  ko: `# 1. 지원 LLM 9종 목록 확인
node scripts/toonstudio-llm-mcp-cli.mjs --list-clients

# 2. 원하는 LLM 전용 MCP 설정 JSON 즉시 생성
node scripts/toonstudio-llm-mcp-cli.mjs --client claude-code

# 3. 10,000획 장시간 드로잉 메모리 평탄화 실측 벤치마크
node scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000`,
  en: `# 1. List all 9 supported LLM clients
node scripts/toonstudio-llm-mcp-cli.mjs --list-clients

# 2. Generate ready-to-paste MCP config JSON for any LLM
node scripts/toonstudio-llm-mcp-cli.mjs --client claude-code

# 3. Run the 10,000-stroke long-session memory-plateau benchmark
node scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000`,
} as const;

export function TechLlmMcpApiPanel({ locale }: { readonly locale: "ko" | "en" }) {
  const [selectedClientId, setSelectedClientId] =
    useState<UniversalLlmClientProfile["id"]>("gemini-cli");
  const [selectedToolName, setSelectedToolName] = useState<string>(
    SHOWCASE_MCP_API_ENDPOINTS[0]!.name,
  );
  const [copiedTarget, setCopiedTarget] = useState<"config" | "cli" | null>(null);

  const selectedClient =
    UNIVERSAL_LLM_CLIENTS.find((entry) => entry.id === selectedClientId) ?? UNIVERSAL_LLM_CLIENTS[0]!;
  const selectedTool =
    SHOWCASE_MCP_API_ENDPOINTS.find((entry) => entry.name === selectedToolName)
    ?? SHOWCASE_MCP_API_ENDPOINTS[0]!;
  const configJson = buildShowcaseClientMcpConfig(selectedClient.id);

  const copyText = async (target: "config" | "cli", value: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopiedTarget(target);
      }
    } catch {
      setCopiedTarget(null);
    }
  };

  return (
    <section
      role="tabpanel"
      data-testid="tech-panel-llm-mcp-api"
      aria-labelledby="tech-llm-mcp-heading"
      className="space-y-6"
    >
      {/* 1. 범용 9-LLM 클라이언트 MCP 설정 생성기 */}
      <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <Plug size={14} aria-hidden="true" />
              <span>UNIVERSAL 9-LLM CLI & MCP BRIDGE</span>
            </p>
            <h2 id="tech-llm-mcp-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
              {locale === "ko"
                ? "범용 9대 AI LLM · CLI · MCP 연결 매뉴얼"
                : "Universal 9-LLM CLI & MCP Integration Manual"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
              {locale === "ko"
                ? "Gemini·Claude·GPT/Codex·Meta Llama·Mistral/Muse·Cursor·Windsurf·OpenRouter·로컬 Ollama까지 단일 `toonstudio-llm-mcp-cli.mjs` 브리지로 연결합니다. 쓰기 동작은 기본 dry-run 안전 모드로 보호됩니다."
                : "Connect Gemini, Claude, GPT/Codex, Meta Llama, Mistral/Muse, Cursor, Windsurf, OpenRouter and offline Ollama through one `toonstudio-llm-mcp-cli.mjs` bridge with dry-run defaults."}
            </p>
          </div>
          <button
            type="button"
            data-testid="llm-copy-config-button"
            onClick={() => {
              void copyText("config", configJson);
            }}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
          >
            {copiedTarget === "config" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copiedTarget === "config"
              ? (locale === "ko" ? "설정 복사 완료" : "Config copied")
              : (locale === "ko" ? "MCP JSON 복사" : "Copy MCP JSON")}
          </button>
        </div>

        <div
          role="group"
          aria-label={locale === "ko" ? "지원 LLM 클라이언트 선택" : "Select LLM client"}
          className="mt-4 flex flex-wrap gap-2"
        >
          {UNIVERSAL_LLM_CLIENTS.map((client) => {
            const active = client.id === selectedClient.id;
            return (
              <button
                key={client.id}
                type="button"
                data-testid={`llm-client-${client.id}`}
                aria-pressed={active}
                onClick={() => {
                  setSelectedClientId(client.id);
                  setCopiedTarget(null);
                }}
                className={cn(
                  "min-h-11 rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {client.vendor}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="rounded-2xl border border-line bg-card p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">{selectedClient.vendor}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="ts-status-pill ts-status-good">
                  {pick(selectedClient.freeTierBadge, locale)}
                </span>
                <span
                  data-testid="llm-client-contract-badge"
                  className="ts-status-pill ts-status-warn"
                >
                  {selectedClient.protocol === "mcp-stdio-jsonrpc-2.0"
                    ? (locale === "ko" ? "로컬 CLI 스키마 · 계약 프리뷰" : "Local CLI Schema · Contract Preview")
                    : (locale === "ko" ? "계약 프리뷰 (Target Spec)" : "Contract Preview (Target Spec)")}
                </span>
              </div>
            </div>
            <p className="text-xs leading-5 text-fg-2">{pick(selectedClient.summary, locale)}</p>
            <p className="rounded-xl border border-line/60 bg-raised px-3 py-2 text-[11px] leading-5 text-fg-2">
              {locale === "ko"
                ? "현재 제공: 로컬 CLI 스키마 생성·매니페스트 조회(`--client`, `--mcp-manifest`) | 목표 계약(Target Spec): 상시 JSON-RPC stdio 데몬 및 원격 HTTP MCP 서버"
                : "Current: Local CLI config & manifest schema (`--client`, `--mcp-manifest`) | Target Spec: persistent JSON-RPC stdio daemon & remote HTTP MCP server"}
            </p>
            <dl className="space-y-1.5 border-t border-line/60 pt-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-3">{locale === "ko" ? "전송 프로토콜" : "Transport"}</dt>
                <dd className="font-mono text-cool">{selectedClient.protocol}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-fg-3">{locale === "ko" ? "설정 경로" : "Config path"}</dt>
                <dd className="font-mono text-fg">{selectedClient.configPath}</dd>
              </div>
            </dl>
          </div>

          <pre
            data-testid="llm-client-config-json"
            className="overflow-x-auto rounded-2xl border border-line bg-canvas p-4 font-mono text-xs leading-6 text-fg"
          >
            <code>{configJson}</code>
          </pre>
        </div>
      </div>

      {/* 2. 10종 MCP 도구 & REST API 인터랙티브 탐색기 */}
      <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          <Server size={14} aria-hidden="true" />
          <span>10 MCP TOOLS · REST API DRY-RUN EXPLORER</span>
        </div>
        <h3 className="mt-1 text-lg font-bold text-fg sm:text-xl">
          {locale === "ko"
            ? "MCP 도구 10종 & REST API 명세 (Dry-Run 미리보기)"
            : "10 MCP Tools & REST API Contract Explorer (Dry-Run Preview)"}
        </h3>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="flex flex-wrap gap-2 content-start">
            {SHOWCASE_MCP_API_ENDPOINTS.map((tool) => {
              const active = tool.name === selectedTool.name;
              return (
                <button
                  key={tool.name}
                  type="button"
                  data-testid={`mcp-tool-${tool.name}`}
                  aria-pressed={active}
                  onClick={() => setSelectedToolName(tool.name)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2 text-left font-mono text-xs font-semibold transition-colors",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  <span>{tool.name}</span>
                </button>
              );
            })}
          </div>

          <div
            data-testid="mcp-tool-detail"
            className="space-y-3 rounded-2xl border border-line bg-card p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono text-sm font-bold text-fg">{selectedTool.name}</code>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="mcp-tool-contract-badge"
                  className={cn(
                    "ts-status-pill",
                    selectedTool.contractStatus === "local-cli" ? "ts-status-good" : "ts-status-warn",
                  )}
                >
                  {selectedTool.contractStatus === "local-cli"
                    ? (locale === "ko" ? "로컬 CLI 실행 가능" : "Runnable Local CLI")
                    : (locale === "ko" ? "REST 계약 프리뷰 (Target Spec)" : "REST Target Spec (Preview)")}
                </span>
                <span
                  className={cn(
                    "ts-status-pill",
                    selectedTool.readOnly ? "ts-status-good" : "ts-status-warn",
                  )}
                >
                  {selectedTool.readOnly
                    ? (locale === "ko" ? "읽기 전용 (안전)" : "Read-only")
                    : (locale === "ko" ? "쓰기 · Dry-Run 기본" : "Write · Dry-Run default")}
                </span>
              </div>
            </div>
            <p className="text-xs leading-5 text-fg-2">{pick(selectedTool.summary, locale)}</p>
            <p className="rounded-xl bg-raised px-3 py-1.5 font-mono text-[11px] text-cool">
              <span className="mr-2 font-sans font-semibold text-fg-3">
                {selectedTool.contractStatus === "local-cli"
                  ? (locale === "ko" ? "[로컬 CLI]" : "[Local CLI]")
                  : (locale === "ko" ? "[Target Spec 계약 프리뷰]" : "[Target Spec Preview]")}
              </span>
              {selectedTool.restMirror}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] font-bold text-fg-3">
                  {locale === "ko" ? "요청 예시" : "Sample request"}
                </p>
                <pre className="overflow-x-auto rounded-xl border border-line bg-canvas p-2.5 font-mono text-[11px] leading-5 text-fg">
                  <code>{selectedTool.sampleRequestJson}</code>
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold text-fg-3">
                  {locale === "ko" ? "Dry-Run 응답" : "Dry-run response"}
                </p>
                <pre className="overflow-x-auto rounded-xl border border-line bg-canvas p-2.5 font-mono text-[11px] leading-5 text-fg">
                  <code>{selectedTool.sampleDryRunJson}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. toon:// 리소스 & CLI 빠른 실행 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-line bg-panel p-5">
          <h3 className="text-base font-bold text-fg">
            {locale === "ko" ? "5대 `toon://` 정본 MCP 리소스 URI" : "5 Canonical `toon://` MCP Resources"}
          </h3>
          <ul className="mt-3 space-y-2">
            {SHOWCASE_MCP_RESOURCES.map((res) => (
              <li key={res.uri} className="rounded-xl border border-line bg-card p-3">
                <code className="block font-mono text-xs font-semibold text-cool">{res.uri}</code>
                <p className="mt-1 text-xs text-fg-2">{pick(res.purpose, locale)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-line bg-panel p-5 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-base font-bold text-fg">
                <Terminal size={16} aria-hidden="true" />
                <span>{locale === "ko" ? "CLI 빠른 실행 & 10,000획 지구력 검증" : "CLI Quickstart & 10,000-Stroke Benchmark"}</span>
              </h3>
              <button
                type="button"
                data-testid="llm-copy-cli-button"
                onClick={() => {
                  void copyText("cli", CLI_QUICK_RECIPES[locale]);
                }}
                className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
              >
                {copiedTarget === "cli" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copiedTarget === "cli"
                  ? (locale === "ko" ? "복사 완료" : "Copied")
                  : (locale === "ko" ? "명령 복사" : "Copy CLI")}
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-canvas p-4 font-mono text-xs leading-6 text-fg">
              <code>{CLI_QUICK_RECIPES[locale]}</code>
            </pre>
          </div>
          <p className="text-xs leading-5 text-fg-3">
            {locale === "ko"
              ? "참고: 10,000획 지구력 벤치마크는 고정 Float32Array 링버퍼·128타일 LRU·OPFS 20단계 Undo 스필 동작을 16.6ms 프레임 예산 대비 실측 검증합니다."
              : "Note: The 10,000-stroke benchmark measures the fixed Float32Array ring buffer, 128-tile LRU cap and 20-step OPFS Undo spill against a 16.6ms frame budget."}
          </p>
        </div>
      </div>
    </section>
  );
}

export function TechResearchPapersAndUxPanel({ locale }: { readonly locale: "ko" | "en" }) {
  const [domainFilter, setDomainFilter] = useState<
    "all" | ResearchPaperArchitectureCard["domain"]
  >("all");

  const visiblePapers =
    domainFilter === "all"
      ? RESEARCH_PAPERS_ARCHITECTURE
      : RESEARCH_PAPERS_ARCHITECTURE.filter((paper) => paper.domain === domainFilter);

  const filterOptions: readonly {
    readonly id: "all" | ResearchPaperArchitectureCard["domain"];
    readonly label: BilingualText;
  }[] = [
    { id: "all", label: { ko: "전체 7편", en: "All 7 Papers" } },
    { id: "spectral", label: { ko: "분광 물리", en: "Spectral" } },
    { id: "local-first", label: { ko: "로컬-퍼스트", en: "Local-First" } },
    { id: "crdt", label: { ko: "CRDT 협업", en: "CRDT" } },
    { id: "input-math", label: { ko: "곡선 수학", en: "Input Math" } },
    { id: "gpu-perf", label: { ko: "GPU · WASM", en: "GPU & WASM" } },
  ];

  return (
    <section
      role="tabpanel"
      data-testid="tech-panel-papers-rd"
      aria-labelledby="tech-papers-heading"
      className="space-y-6"
    >
      {/* 1. 학술 논문 → 실제 코드 매핑 */}
      <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
          <BookOpen size={14} aria-hidden="true" />
          <span>PEER-REVIEWED PAPERS TO PRODUCTION CODE</span>
        </p>
        <h2 id="tech-papers-heading" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
          {locale === "ko"
            ? "컴퓨터과학 · 그래픽스 핵심 논문 7선 & 저장소 적용 지도"
            : "7 Foundational CS & Graphics Papers Mapped to Repository Code"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
          {locale === "ko"
            ? "마케팅 유행어가 아니라 검증된 학술 논문·W3C 명세를 실제 코드 모듈에 연결했습니다. 구현 완료와 R&D 확장 트랙을 투명하게 구분합니다."
            : "Grounded in peer-reviewed CS/graphics papers and W3C standards mapped straight to code, separating shipped modules from expanding R&D."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={locale === "ko" ? "논문 분야 필터" : "Paper domain filter"}>
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`paper-filter-${option.id}`}
              aria-pressed={domainFilter === option.id}
              onClick={() => setDomainFilter(option.id)}
              className={cn(
                "min-h-11 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors",
                domainFilter === option.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg",
              )}
            >
              {pick(option.label, locale)}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {visiblePapers.map((paper) => (
            <article
              key={paper.id}
              data-testid={`research-paper-${paper.id}`}
              className="rounded-2xl border border-line bg-card p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-[11px] text-fg-3">{paper.citation}</p>
                  <span
                    className={cn(
                      "ts-status-pill shrink-0",
                      paper.status === "current" ? "ts-status-good" : "ts-status-warn",
                    )}
                  >
                    {paper.status === "current"
                      ? (locale === "ko" ? "현재 구현" : "Shipped")
                      : (locale === "ko" ? "R&D 확장" : "R&D Track")}
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-bold text-fg sm:text-base">
                  {pick(paper.title, locale)}
                </h3>
                <p className="mt-1.5 text-xs leading-6 text-fg-2">
                  {pick(paper.takeaway, locale)}
                </p>
              </div>
              <p className="border-t border-line/60 pt-2 font-mono text-[11px] text-fg-3">
                {paper.repoModules.join(" · ")}
              </p>
            </article>
          ))}
        </div>
      </div>

      {/* 2. 전 페이지 UI/UX · 동선 · GNB/LNB/푸터 · 전환 연출 고도화 6대 축 */}
      <div className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          <Compass size={14} aria-hidden="true" />
          <span>SITEWIDE UI/UX · NAVIGATION · MOTION ARCHITECTURE</span>
        </p>
        <h3 className="mt-1 text-lg font-bold text-fg sm:text-xl">
          {locale === "ko"
            ? "전 페이지 구성 · 동선 · GNB/LNB/푸터 · 전환 연출 6대 통일 설계"
            : "6-Axis Sitewide Navigation, GNB/LNB/Footer & Route Motion Architecture"}
        </h3>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SITEWIDE_UX_MOTION_AXES.map((axis) => (
            <article
              key={axis.id}
              data-testid={`sitewide-ux-axis-${axis.id}`}
              className="rounded-2xl border border-line bg-card p-4 space-y-2"
            >
              <h4 className="text-sm font-bold text-fg">{pick(axis.area, locale)}</h4>
              <p className="text-xs leading-5 text-fg-3">{pick(axis.currentState, locale)}</p>
              <p className="text-xs leading-5 font-medium text-fg-2">
                {pick(axis.upgradeDirection, locale)}
              </p>
              <p className="font-mono text-[11px] text-cool">{axis.repoAnchor}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
