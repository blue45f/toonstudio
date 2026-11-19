/**
 * ToonStudio 9대 확장 기능(장면 연출 VFX, 웹툰 모델러, IP 확장, MMORPG 구인 광장,
 * 작품·팀·스튜디오·프로젝트 카페, 보안 RBAC, MCP/CLI, AI 고객센터)을
 * `@toonstudio/studio-command-registry`의 단일 CommandRegistry에 등록하는 어댑터.
 */

import type { CommandRegistry, StudioCommand } from "@toonstudio/studio-command-registry";

export interface StudioEcosystemCommandHandlers {
  readonly onOpenSceneFx?: () => void;
  readonly onOpenWebtoonModeler?: () => void;
  readonly onOpenIpExpansion?: () => void;
  readonly onOpenMmorpgPlaza?: () => void;
  readonly onOpenWorkspaceCafe?: () => void;
  readonly onOpenSecurityRbac?: () => void;
  readonly onOpenMcpBridge?: () => void;
  readonly onOpenSupportChat?: () => void;
}

export const STUDIO_ECOSYSTEM_COMMAND_IDS = Object.freeze([
  "ecosystem.fx.open",
  "ecosystem.modeler.open",
  "ecosystem.ip.open",
  "ecosystem.plaza.open",
  "ecosystem.cafe.open",
  "ecosystem.rbac.open",
  "ecosystem.mcp.open",
  "ecosystem.support.open",
] as const);

export type StudioEcosystemCommandId = (typeof STUDIO_ECOSYSTEM_COMMAND_IDS)[number];

export function buildStudioEcosystemCommands(
  handlers: StudioEcosystemCommandHandlers = {},
): readonly StudioCommand[] {
  const specs: readonly {
    readonly id: StudioEcosystemCommandId;
    readonly ko: string;
    readonly en: string;
    readonly keywords: readonly string[];
    readonly aliases: readonly string[];
    readonly run?: () => void;
  }[] = [
    {
      id: "ecosystem.fx.open",
      ko: "장면 연출 · 특수 효과 (VFX) 열기",
      en: "Open Scene Direction & Special FX",
      keywords: ["fx", "vfx", "임팩트", "벚꽃", "마법진", "글리치"],
      aliases: ["특수효과", "연출효과"],
      run: handlers.onOpenSceneFx,
    },
    {
      id: "ecosystem.modeler.open",
      ko: "웹툰 컷 모델러 · AI 이미지 생성 열기",
      en: "Open Webtoon Cut Modeler & AI Image Generator",
      keywords: ["modeler", "image", "웹툰", "모델러", "화풍"],
      aliases: ["웹툰모델러", "이미지생성"],
      run: handlers.onOpenWebtoonModeler,
    },
    {
      id: "ecosystem.ip.open",
      ko: "IP 확장 스튜디오 (OSMU) 열기",
      en: "Open IP Expansion Studio",
      keywords: ["ip", "osmu", "애니", "드라마", "굿즈", "스핀오프"],
      aliases: ["IP확장", "피치바이블"],
      run: handlers.onOpenIpExpansion,
    },
    {
      id: "ecosystem.plaza.open",
      ko: "MMORPG 구인 광장 · 실시간 어시 매칭 열기",
      en: "Open MMORPG Recruitment Plaza",
      keywords: ["plaza", "어시", "보조작가", "구인", "매칭", "파티"],
      aliases: ["구인광장", "어시매칭"],
      run: handlers.onOpenMmorpgPlaza,
    },
    {
      id: "ecosystem.cafe.open",
      ko: "작품·팀·스튜디오·프로젝트 카페 허브 열기",
      en: "Open Workspace Cafe Hub",
      keywords: ["cafe", "community", "카페", "커뮤니티", "이미지첨부"],
      aliases: ["작품카페", "스튜디오카페"],
      run: handlers.onOpenWorkspaceCafe,
    },
    {
      id: "ecosystem.rbac.open",
      ko: "보안 역할(RBAC) · 권한 관리 열기",
      en: "Open RBAC Security & Role Permissions",
      keywords: ["rbac", "security", "보안", "역할", "권한", "워터마크"],
      aliases: ["권한관리", "보안롤"],
      run: handlers.onOpenSecurityRbac,
    },
    {
      id: "ecosystem.mcp.open",
      ko: "MCP · CLI 통합 자동화 브릿지 열기",
      en: "Open MCP & CLI Automation Bridge",
      keywords: ["mcp", "cli", "드로잉", "자동화", "json-rpc"],
      aliases: ["MCP연동", "CLI드로잉"],
      run: handlers.onOpenMcpBridge,
    },
    {
      id: "ecosystem.support.open",
      ko: "AI 고객센터 · 1:1 실시간 채팅 문의 열기",
      en: "Open AI Support Center & 1:1 Live Chat",
      keywords: ["support", "chat", "고객센터", "문의", "실시간채팅"],
      aliases: ["AI고객센터", "1:1문의"],
      run: handlers.onOpenSupportChat,
    },
  ];

  return specs.map((spec) => ({
    id: spec.id,
    category: "ecosystem",
    labels: [
      { locale: "ko", label: spec.ko },
      { locale: "en", label: spec.en },
    ],
    aliases: spec.aliases.map((term) => ({
      vendor: "toonstudio" as const,
      locale: "ko" as const,
      term,
    })),
    keywords: [...spec.keywords],
    helpNodeId: `help/${spec.id.replaceAll(".", "/")}`,
    availability: () => ({ state: "enabled" as const }),
    execute: async () => {
      spec.run?.();
      return { status: "ok" as const };
    },
  }));
}

export function registerStudioEcosystemCommands(
  registry: CommandRegistry,
  handlers: StudioEcosystemCommandHandlers = {},
): () => void {
  const unregisters = buildStudioEcosystemCommands(handlers).map((cmd) =>
    registry.register(cmd),
  );
  return () => {
    for (const unregister of unregisters) unregister();
  };
}
