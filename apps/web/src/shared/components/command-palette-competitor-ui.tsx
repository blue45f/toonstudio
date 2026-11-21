import { Command } from "cmdk";
import { CornerDownLeft, Sparkles } from "lucide-react";

import { COMPETITOR_VENDOR_LABELS } from "./command-palette-competitor-aliases";

import type {
  PaletteCommand,
  PaletteCompetitorAlias,
  PaletteCompetitorVendor,
  PaletteStudioTool,
} from "./command-palette-types";

/**
 * 경쟁 앱 벤더별 OKLCH 의미 토큰 색채 코딩 (원시 HEX / rgb 금지).
 * 각 벤더가 한눈에 구별되면서도 Starlight/Ink 양축에서 >= 4.5:1 대비를 유지한다.
 */
const VENDOR_BADGE_CLASSES: Readonly<Record<PaletteCompetitorVendor, string>> = Object.freeze({
  csp: "border-accent/45 bg-accent-soft text-accent",
  photoshop: "border-cool/45 bg-cool/15 text-cool",
  sketchup: "border-warn/45 bg-warn/15 text-warn",
  procreate: "border-good/45 bg-good-soft text-good",
});

const BEGINNER_QUICK_ACTIONS = [
  { toolId: "tool-fill", label: "선화 틈새 채우기", hint: "컬러드롭", dot: "bg-good" },
  { toolId: "tool-bg3d", label: "3D 배경 바로 넣기", hint: "SketchUp", dot: "bg-warn" },
  { toolId: "tool-text", label: "말풍선·대사 넣기", hint: "CSP", dot: "bg-accent" },
  { toolId: "tool-streamline", label: "펜선 손떨림 줄이기", hint: "스트림라인", dot: "bg-cool" },
  { toolId: "tool-export-psd", label: "PSD로 내보내기", hint: "Photoshop", dot: "bg-accent-2" },
] as const;

export function CommandPaletteBeginnerQuickStart({
  onRunTool,
}: {
  onRunTool: (toolId: string) => void;
}) {
  return (
    <div data-slot="command-palette-beginner-quickstart" className="px-3 pb-2 pt-1">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-fg-3 break-keep">
        <Sparkles size={12} className="text-accent" aria-hidden="true" />
        <span>처음이라면 바로 시작 · CSP·포토샵·스케치업·프로크리에이트 용어도 그대로 검색</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BEGINNER_QUICK_ACTIONS.map((item, index) => (
          <button
            key={item.toolId}
            type="button"
            onClick={() => onRunTool(item.toolId)}
            style={{ animationDelay: `${index * 28}ms` }}
            className={`min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg break-keep transition-[transform,border-color,background-color] duration-150 hover:border-accent/60 hover:bg-raised active:scale-[0.97] motion-safe:animate-[command-alias-shimmer_0.22s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              index < 3 ? "inline-flex" : "hidden sm:inline-flex"
            }`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${item.dot}`} />
            <span>{item.label}</span>
            <span className="text-[10px] font-normal text-fg-3">({item.hint})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CommandPaletteSpectrumRibbon() {
  return (
    <div
      aria-hidden="true"
      data-slot="command-palette-spectrum-ribbon"
      className="h-[3px] w-full shrink-0 bg-[linear-gradient(90deg,var(--color-accent),var(--color-cool),var(--color-good),var(--color-warn),var(--color-accent-2))] bg-[length:200%_100%] motion-safe:animate-[command-spectrum-shift_7s_ease-in-out_infinite] motion-reduce:animate-none"
    />
  );
}

export function CompetitorAliasChip({
  alias,
  staggerIndex = 0,
}: {
  alias: PaletteCompetitorAlias;
  staggerIndex?: number;
}) {
  const vendorLabel = COMPETITOR_VENDOR_LABELS[alias.vendor];
  return (
    <span
      data-competitor-vendor={alias.vendor}
      data-competitor-term={alias.term}
      style={{ animationDelay: `${Math.min(staggerIndex, 6) * 28}ms` }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight break-keep motion-safe:animate-[command-alias-shimmer_0.22s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none ${VENDOR_BADGE_CLASSES[alias.vendor]}`}
    >
      <span>{vendorLabel}</span>
      <span aria-hidden="true" className="opacity-65">·</span>
      <span className="max-w-[9rem] truncate">{alias.term}</span>
    </span>
  );
}

export function CommandPaletteCommandsGroup({
  commands,
  onSelectCommand,
}: {
  commands: readonly PaletteCommand[];
  onSelectCommand: (cmdId: string) => void;
}) {
  if (commands.length === 0) return null;
  return (
    <Command.Group
      forceMount
      heading={
        <div className="px-2 py-1 text-[11px] font-medium text-fg-3 break-keep">
          시스템 및 명령어
        </div>
      }
    >
      {commands.map((cmd) => {
        const Icon = cmd.icon;
        const state = cmd.getState?.();
        return (
          <Command.Item
            forceMount
            key={cmd.id}
            value={cmd.id}
            onSelect={() => onSelectCommand(cmd.id)}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-accent">
              <Icon size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-fg break-keep">{cmd.title}</span>
                {state && (
                  <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] text-fg-3">
                    {state.label}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-fg-3">{cmd.subtitle}</p>
            </div>
            {cmd.shortcut && (
              <div className="hidden items-center gap-1 sm:flex">
                {cmd.shortcut.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-fg-3"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            )}
            <CornerDownLeft size={13} className="text-fg-3 opacity-0 data-[selected=true]:opacity-100" />
          </Command.Item>
        );
      })}
    </Command.Group>
  );
}

export function CommandPaletteStudioToolsGroup({
  tools,
  aliasMatchById,
  onSelectTool,
}: {
  tools: readonly PaletteStudioTool[];
  aliasMatchById: ReadonlyMap<string, PaletteCompetitorAlias>;
  onSelectTool: (toolId: string) => void;
}) {
  if (tools.length === 0) return null;
  return (
    <Command.Group
      forceMount
      heading={
        <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-fg-3 break-keep">
          <span>스튜디오 도구 · 기능</span>
          {aliasMatchById.size > 0 ? (
            <span className="text-[10px] text-accent">다른 앱 용어 매칭 · Enter 즉시 실행</span>
          ) : null}
        </div>
      }
    >
      {tools.map((tool, index) => {
        const Icon = tool.icon;
        const matchedAlias = aliasMatchById.get(tool.id);
        return (
          <Command.Item
            forceMount
            key={tool.id}
            value={tool.id}
            onSelect={() => onSelectTool(tool.id)}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised ${
              matchedAlias ? "command-palette-alias-hit" : ""
            }`}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-accent">
              <Icon size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-fg break-keep">{tool.name}</span>
                {matchedAlias ? (
                  <CompetitorAliasChip alias={matchedAlias} staggerIndex={index} />
                ) : null}
              </div>
              <p className="truncate text-xs text-fg-3">{tool.tip}</p>
            </div>
            {tool.shortcutKey ? (
              <kbd className="shrink-0 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                {tool.shortcutKey}
              </kbd>
            ) : (
              <CornerDownLeft size={13} className="shrink-0 text-fg-3 opacity-60" />
            )}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
}
