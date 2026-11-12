import { ArrowUpRight, BookOpen, CircleHelp, Grid2X2, Layers, MonitorCog, Search, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioDrawingClarityAction } from "./StudioDrawingClarityMore";

const featured = new Set(["pages", "assets", "export", "team"]);
const advanced = new Set(["windows", "layers"]);
const pictures: Readonly<Record<string, string>> = { pages: "projects", assets: "materials", export: "canvas", team: "team" };
const icons: Readonly<Record<string, LucideIcon>> = { pages: BookOpen, assets: Grid2X2, export: ArrowUpRight, team: Users, layers: Layers, all: Search, help: CircleHelp, device: MonitorCog, view: MonitorCog, status: ShieldCheck };

/** 기존 명령을 목적별로 보여 주며 원고·저장 결과나 예시 작품을 만들지 않는다. */
export function StudioDrawingClarityTaskActions({ actions, run }: {
  readonly actions: readonly StudioDrawingClarityAction[];
  readonly run: (action: StudioDrawingClarityAction) => void;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const renderAction = (action: StudioDrawingClarityAction, card = false) => {
    const Icon = icons[action.id] ?? Grid2X2;
    return <button key={action.id} type="button" data-studio-clarity-action={action.id}
      className={card ? "studio-drawing-task-card" : "studio-drawing-task-action"} onClick={() => run(action)}>
      {card && pictures[action.id] ? <img src={`/brand/toonstudio-premium-icons/${pictures[action.id]}.webp`} alt="" loading="lazy" /> : <Icon size={21} aria-hidden />}
      <span>{action.label}</span>{!card ? <ArrowUpRight size={16} aria-hidden /> : null}
    </button>;
  };
  const primary = actions.filter(action => featured.has(action.id));
  const additional = actions.filter(action => advanced.has(action.id));
  return <>
    {primary.length ? <div className="studio-drawing-task-grid">{primary.map(action => renderAction(action, true))}</div> : null}
    <div className="studio-drawing-task-list">{actions.filter(action => !featured.has(action.id) && !advanced.has(action.id)).map(action => renderAction(action))}</div>
    {additional.length ? <details className="studio-drawing-task-advanced"><summary>{bt("레이어와 기존 작업 배치", "Layers and saved workspace")}</summary>{additional.map(action => renderAction(action))}</details> : null}
  </>;
}
