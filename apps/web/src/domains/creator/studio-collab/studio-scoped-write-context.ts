import { createContext } from "react";
import type { StudioScopedWriteAuthority } from "./studio-scoped-write-authority";

/** viewer 역할을 바꾸지 않고 문서 채널에만 제한 편집 publisher를 전달한다. */
export const StudioScopedWriteAuthorityContext = createContext<StudioScopedWriteAuthority | null>(null);
export function canParticipantEdit(role: string | null): boolean { return role === "owner" || role === "admin" || role === "editor"; }
