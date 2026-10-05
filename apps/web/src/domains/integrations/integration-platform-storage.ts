import type {
  IntegrationRecipeDraft,
  IntegrationRecipeTemplate,
} from "./integration-platform-types";

export const RECIPE_STORAGE_KEY = "toonstudio.integration.recipes.v1";

const DEFAULT_PROVIDER_BY_ACTION: Readonly<Record<string, string>> = {
  "calendar.create": "google-workspace",
  "meeting.create": "google-meet",
  "file.upload": "google-drive",
  "task.upsert": "notion",
  "message.send": "slack",
  "translation.draft": "deepl",
  "signature.request": "documenso",
  "publication.package": "external-webtoon-platforms",
  "publication.publish": "youtube",
  "feed.generate": "rss-json-feed",
  "webhook.emit": "generic-webhook",
  "membership.sync": "patreon",
  "payment.reconcile": "stripe-connect",
  "merch.create": "printful",
};

function isRecipeDraft(value: unknown): value is IntegrationRecipeDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<IntegrationRecipeDraft>;
  return typeof draft.id === "string"
    && typeof draft.name === "string"
    && typeof draft.trigger === "string"
    && typeof draft.enabled === "boolean"
    && Array.isArray(draft.actions)
    && draft.actions.every((action) => Boolean(
      action
      && typeof action === "object"
      && typeof action.type === "string"
      && typeof action.providerId === "string",
    ));
}

export function recipeDraftFromTemplate(
  template: IntegrationRecipeTemplate,
): IntegrationRecipeDraft {
  return {
    id: template.id,
    name: template.name,
    trigger: template.trigger,
    enabled: false,
    actions: template.actions.map((type) => ({
      type,
      providerId: DEFAULT_PROVIDER_BY_ACTION[type] ?? "generic-webhook",
    })),
  };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 소유자별 저장 키. 자동화 레시피는 개인 구성이라 계정으로 나눠, 같은
 * 브라우저의 다른 계정에게 이전 계정의 레시피가 보이지 않게 한다
 * (학습 기록·수강 등록과 같은 방식).
 * ownerKey가 없으면 레거시 키(기존 호출·테스트 호환).
 */
export function recipeStorageKey(ownerKey?: string): string {
  return ownerKey ? `${RECIPE_STORAGE_KEY}:${ownerKey}` : RECIPE_STORAGE_KEY;
}

export function loadIntegrationRecipes(
  templates: readonly IntegrationRecipeTemplate[],
  storage: (Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem" | "removeItem">>) | null = browserStorage(),
  ownerKey?: string,
): readonly IntegrationRecipeDraft[] {
  if (storage) {
    try {
      const raw = storage.getItem(recipeStorageKey(ownerKey));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(isRecipeDraft)) return parsed;
      } else if (ownerKey && ownerKey !== "guest") {
        // 스코프 키가 없으면 레거시 기록을 첫 계정이 claim 한다 — 읽은 자리에서
        // 스코프 키로 옮기고 레거시를 지워, 다음 계정이 또 claim 하지 않게 한다.
        // 게스트는 claim 하지 않는다 — 게스트 파티션은 빈 채로 시작한다.
        const legacyRaw = storage.getItem(RECIPE_STORAGE_KEY);
        if (legacyRaw) {
          const legacyParsed: unknown = JSON.parse(legacyRaw);
          if (Array.isArray(legacyParsed) && legacyParsed.every(isRecipeDraft)) {
            if (storage.setItem && storage.removeItem) {
              try {
                storage.setItem(recipeStorageKey(ownerKey), legacyRaw);
                storage.removeItem(RECIPE_STORAGE_KEY);
              } catch {
                // 이관 쓰기가 실패해도 읽은 값은 그대로 돌려준다.
              }
            }
            return legacyParsed;
          }
        }
      }
    } catch {
      // Corrupt or unavailable browser storage falls back to canonical templates.
    }
  }
  return templates.map(recipeDraftFromTemplate);
}

export function saveIntegrationRecipes(
  recipes: readonly IntegrationRecipeDraft[],
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
  ownerKey?: string,
): void {
  if (!storage) return;
  storage.setItem(recipeStorageKey(ownerKey), JSON.stringify(recipes));
}

export function downloadIntegrationJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadIntegrationText(
  filename: string,
  value: string,
  type = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
