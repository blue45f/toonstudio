import { CommandRegistry, type CommandContext } from "@toonstudio/studio-command-registry";
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_ECOSYSTEM_COMMAND_IDS,
  registerStudioEcosystemCommands,
} from "./studio-ecosystem-commands";

const TEST_CONTEXT: CommandContext = {
  workspace: "comic",
  services: new Map(),
};

describe("studio-ecosystem-commands", () => {
  it("8개 확장 기능 커맨드를 CommandRegistry에 등록·검색·실행·해제한다", async () => {
    const registry = new CommandRegistry({ defaultLocale: "ko" });
    const onOpenPlaza = vi.fn();
    const unregister = registerStudioEcosystemCommands(registry, {
      onOpenMmorpgPlaza: onOpenPlaza,
    });

    expect(registry.size).toBe(STUDIO_ECOSYSTEM_COMMAND_IDS.length);
    const searchHits = registry.search(TEST_CONTEXT, "구인");
    expect(searchHits.some((cmd) => cmd.id === "ecosystem.plaza.open")).toBe(true);

    const execResult = await registry.execute("ecosystem.plaza.open", TEST_CONTEXT);
    expect(execResult.status).toBe("ok");
    expect(onOpenPlaza).toHaveBeenCalledTimes(1);

    unregister();
    expect(registry.size).toBe(0);
  });
});
