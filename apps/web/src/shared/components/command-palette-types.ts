import type { Title } from "@/shared/lib/types";
import type { LucideIcon } from "lucide-react";

export type PaletteMode = "all" | "titles" | "commands" | "studio" | "pages" | "shortcuts";

export interface CommandContext {
  router: { push: (href: string) => void };
  closePalette: () => void;
  showToast: (msg: string, opts?: { tone?: "default" | "success" | "info" }) => void;
  playSfx: (name: "tick" | "pop" | "success" | "error" | "open" | "close") => void;
  currentPath: string;
}

export interface PaletteCommand {
  id: string;
  title: string;
  subtitle: string;
  category: "audio" | "system" | "navigation" | "studio" | "history";
  icon: LucideIcon;
  shortcut?: string[];
  keywords: string[];
  description?: string;
  badge?: string;
  action: (ctx: CommandContext) => void | Promise<void>;
  getState?: () => { active: boolean; label: string };
}

export interface PaletteStudioTool {
  id: string;
  name: string;
  shortcutKey: string;
  category: "draw" | "edit" | "canvas" | "panel";
  icon: LucideIcon;
  tip: string;
  keywords: string[];
  actionPath?: string;
}

export interface PalettePage {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  category: "main" | "discover" | "creator" | "community";
  shortcut?: string[];
  keywords: string[];
  /**
   * 전체 메뉴 지도(SITE_NAVIGATION_GROUPS)에서 이 페이지가 속한 구간의 표시 이름.
   * 예: "작품 찾기". 팔레트 목록·미리보기에 브레드크럼처럼 병기해, 이동 전에
   * "어디로 가는지"를 배우게 한다(Figma Quick Actions식 학습형 팔레트).
   * 지도에 없는 페이지는 undefined이며 표시하지 않는다.
   */
  trail?: string;
}

export type PaletteSelectedItem =
  | { type: "title"; title: Title }
  | { type: "command"; command: PaletteCommand }
  | { type: "studio-tool"; tool: PaletteStudioTool }
  | { type: "page"; page: PalettePage }
  | { type: "recent-query"; query: string }
  | null;
