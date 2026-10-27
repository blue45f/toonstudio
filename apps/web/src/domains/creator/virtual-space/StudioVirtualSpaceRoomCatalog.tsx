import { DoorOpen, LockKeyhole, Network, Search } from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpaceZoneId } from "./studio-virtual-space-model";
import {
  STUDIO_SPACE_MODULES,
  type StudioSpaceModule,
  type StudioSpaceModuleCategory,
  type StudioSpaceModulePanel,
  type StudioThemeTemplateKind,
} from "./studio-virtual-space-room-catalog";

const CATEGORIES: readonly ["all" | StudioSpaceModuleCategory, string, string][] = [
  ["all", "전체", "All"],
  ["collaboration", "협업", "Collaboration"],
  ["production", "제작", "Production"],
  ["interview", "면접", "Interview"],
  ["rest", "휴식", "Rest"],
  ["fortune", "운세", "Fortune"],
  ["play", "놀이", "Play"],
  ["template", "템플릿", "Templates"],
];

const privacyCopy = {
  team: ["팀", "Team"],
  "invite-only": ["초대 전용", "Invite only"],
  private: ["개인", "Private"],
  public: ["공개", "Public"],
} as const;

const NANO_BANANA_SPACE_MODULE_PREVIEWS: Readonly<
  Record<
    string,
    {
      readonly roomPreviewUrl: string;
      readonly hostSpriteUrl: string;
    }
  >
> = {
  "p2p-huddle": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v11/themes/seoul-editorial-hq.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/chief-pd-work.webp",
  },
  "p2p-whiteboard": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v13/props/dual-cintiq-critique-pod.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/line-artist-work.webp",
  },
  "work-session-room": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/global-ip-pitch-boardroom.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/cgi-director-work.webp",
  },
  "interview-waiting": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/recruit-interview-conservatory.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v12/cast/story-writer-idle.webp",
  },
  "interview-room": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v12/themes/romance-palace-conservatory.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/chief-pd-idle.webp",
  },
  "quiet-lounge": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v11/themes/lofi-cat-storyhouse.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-idle.webp",
  },
  "tarot-table": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/tarot-story-oracle-pavilion.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v12/cast/story-writer-work.webp",
  },
  "saju-room": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v11/themes/hanok-botanical-atelier.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/colorist-idle.webp",
  },
  arcade: {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v14/rooms/retro-arcade-gacha-lounge.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v12/cast/action-mocap-actor-work.webp",
  },
  "theme-storyboard-room": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v12/themes/brooklyn-indie-comics-loft.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/line-artist-idle.webp",
  },
  "theme-recording-booth": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v13/themes/dolby-sound-dubbing-studio.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v12/cast/sound-letterer-work.webp",
  },
  "theme-gallery": {
    roomPreviewUrl:
      "/assets/virtual-studio/nano-banana-v13/themes/rooftop-sunset-screening-stage.webp",
    hostSpriteUrl:
      "/assets/virtual-studio/nano-banana-v11/cast/colorist-work.webp",
  },
};
export function StudioVirtualSpaceRoomCatalog({
  projectAvailable,
  onPanel,
  onZone,
  onTemplate,
}: {
  readonly projectAvailable: boolean;
  readonly onPanel: (panel: StudioSpaceModulePanel) => void;
  readonly onZone: (zoneId: StudioVirtualSpaceZoneId) => void;
  readonly onTemplate: (template: StudioThemeTemplateKind) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceRoomCatalog");
  const [category, setCategory] = useState<"all" | StudioSpaceModuleCategory>("all");
  const [query, setQuery] = useState("");
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
  const modules = useMemo(() => STUDIO_SPACE_MODULES.filter((module) => {
    if (module.requiresProject && !projectAvailable) return false;
    if (category !== "all" && module.category !== category) return false;
    if (!normalized) return true;
    return `${module.labelKo} ${module.labelEn} ${module.descriptionKo} ${module.descriptionEn}`
      .normalize("NFKC").toLocaleLowerCase().includes(normalized);
  }), [category, normalized, projectAvailable]);

  return <section className="studio-space-module-catalog" aria-labelledby="studio-space-module-title">
    <header>
      <div>
        <h2 id="studio-space-module-title">{bt("공간 모듈", "Space modules")}</h2>
        <p>{bt(
          "협업·면접·휴식·놀이 공간을 같은 확장 계약으로 열어요.",
          "Open collaboration, interview, rest and play spaces through one extensible contract.",
        )}</p>
      </div>
      <DoorOpen size={20} aria-hidden />
    </header>
    <label className="studio-space-module-search">
      <Search size={15} aria-hidden />
      <span className="sr-only">{bt("공간 검색", "Search spaces")}</span>
      <input
        type="search"
        maxLength={80}
        value={query}
        placeholder={bt("회의실·타로·오락실 검색", "Search meetings, tarot or arcade")}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
    <div className="studio-space-module-filters" role="group"
      aria-label={bt("공간 종류", "Space category")}>
      {CATEGORIES.map(([value, ko, en]) => <button
        key={value}
        type="button"
        aria-pressed={category === value}
        onClick={() => setCategory(value)}
      >{bt(ko, en)}</button>)}
    </div>
    <div className="studio-space-module-grid">
      {modules.map((module) => <ModuleCard
        key={module.id}
        module={module}
        disabled={false}
        onPanel={onPanel}
        onZone={onZone}
        onTemplate={onTemplate}
      />)}
    </div>
    {!modules.length ? <p role="status" className="studio-space-module-empty">
      {bt("일치하는 공간이 없어요.", "No matching space found.")}
    </p> : null}
  </section>;
}
function ModuleCard({
  module,
  disabled,
  onPanel,
  onZone,
  onTemplate,
}: {
  readonly module: StudioSpaceModule;
  readonly disabled: boolean;
  readonly onPanel: (panel: StudioSpaceModulePanel) => void;
  readonly onZone: (zoneId: StudioVirtualSpaceZoneId) => void;
  readonly onTemplate: (template: StudioThemeTemplateKind) => void;
}) {
  const bt = useBilingual(`StudioSpaceModule.${module.id}`);
  const [privacyKo, privacyEn] = privacyCopy[module.privacy];
  const visual = NANO_BANANA_SPACE_MODULE_PREVIEWS[module.id];
  const content = <>
    {visual ? (
      <div className="relative mb-2 h-20 w-full overflow-hidden rounded-lg border border-line bg-panel" aria-hidden="true">
        <img
          src={visual.roomPreviewUrl}
          alt=""
          loading="lazy"
          decoding="async"
          data-testid={`space-module-room-preview-${module.id}`}
          className="h-full w-full object-cover"
        />
        <img
          src={visual.hostSpriteUrl}
          alt=""
          loading="lazy"
          decoding="async"
          data-testid={`space-module-host-sprite-${module.id}`}
          className="absolute right-1.5 bottom-1 h-8 w-8 rounded-md border border-line bg-card/85 object-contain p-0.5"
        />
      </div>
    ) : null}
    <div className="studio-space-module-meta">
      <span><LockKeyhole size={12} aria-hidden />{bt(privacyKo, privacyEn)}</span>
      {module.transport === "p2p-direct" ? <span>
        <Network size={12} aria-hidden />P2P
      </span> : null}
      {module.capacity ? <span>{bt(`${module.capacity}명`, `${module.capacity} people`)}</span> : null}
    </div>
    <strong>{bt(module.labelKo, module.labelEn)}</strong>
    <p>{bt(module.descriptionKo, module.descriptionEn)}</p>
    {disabled ? <small>{bt("프로젝트 공간에서 사용할 수 있어요.", "Available inside a project space.")}</small> : null}
  </>;

  if (module.entry.type === "route") {
    return <Link href={module.entry.href} className="studio-space-module-card">
      {content}
    </Link>;
  }
  if (module.entry.type === "template") {
    const template = module.entry.template;
    return <button
      type="button"
      className="studio-space-module-card"
      disabled={disabled}
      onClick={() => onTemplate(template)}
    >{content}</button>;
  }
  const entry = module.entry;
  const activate = entry.type === "panel"
    ? () => onPanel(entry.panel)
    : () => onZone(entry.zoneId);
  return <button
    type="button"
    className="studio-space-module-card"
    disabled={disabled}
    onClick={activate}
  >{content}</button>;
}
