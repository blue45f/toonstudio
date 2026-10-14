import type { CreatorRoleProfile } from "./creator-role-contract";
import type { CreatorRoleWorkspacePreference } from "./creator-role-workspace-contract";

const STORAGE_PREFIX = "toonspectrum:creator-adaptive-onboarding:v1:";
const acknowledgedUsers = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Unscoped workspace landings that are safe automatic onboarding entries.
 * - "/studio" is the project library.
 * - "/home" is the personal workspace home and "/team" is its team surface;
 *   both render StudioWorkspacePage behind WorkspaceHomeRoute with no scoped
 *   project/document identity (first-run F2.1: a new creator who lands on a
 *   workspace home first must meet the gate there, not only at /studio).
 * The gate itself is mounted globally in AppShell, so this allowlist is the
 * single trigger decision — expanding it is what makes /home fire.
 */
const CREATOR_ONBOARDING_ENTRY_PATHS: ReadonlySet<string> = new Set([
  "/studio",
  "/home",
  "/team",
]);

/** Only the unscoped workspace landings above are safe automatic entries.
 * Query-bearing URLs on any of them can be a deep link, restore an editor or
 * a companion window, or carry a tour/share intent, so any search opts out.
 * Scoped/editor routes (/studio/...), the public home ("/"), the discovery
 * surface ("/hub") and account/settings routes never interrupt. New routes
 * default to non-interrupting rather than needing an exclusion list.
 */
export function isCreatorOnboardingEntry(pathname: string, search = ""): boolean {
  if (search) return false;
  return CREATOR_ONBOARDING_ENTRY_PATHS.has(pathname.replace(/\/+$/u, ""));
}

export function needsCreatorAdaptiveOnboarding(
  profile: CreatorRoleProfile,
  workspace: CreatorRoleWorkspacePreference,
): boolean {
  return !workspace.onboardingComplete
    && profile.onboarding.status !== "completed"
    && profile.onboarding.status !== "skipped";
}

/** This UI preference grants no access and contains no profile or artwork data. */
export function hasAcknowledgedCreatorOnboarding(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (acknowledgedUsers.has(userId)) return true;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`) === "acknowledged";
  } catch {
    return false;
  }
}

export function acknowledgeCreatorOnboarding(userId: string): void {
  acknowledgedUsers.add(userId);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`, "acknowledged");
  } catch {
    // Retain the choice in this tab when storage is blocked or full.
  }
  for (const listener of listeners) listener();
}

export function subscribeCreatorOnboardingAcknowledgement(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
