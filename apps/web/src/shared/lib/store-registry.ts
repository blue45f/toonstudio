import type { AppStore } from "./store-types";

let registeredAppStore: AppStore | null = null;

export function registerAppStore(store: AppStore): void {
  registeredAppStore = store;
}

export function getAppStore(): AppStore {
  if (!registeredAppStore) {
    throw new Error("App store has not been initialized yet.");
  }
  return registeredAppStore;
}
