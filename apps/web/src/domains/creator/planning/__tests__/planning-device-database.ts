import { beforeEach, vi } from "vitest";

export const records = new Map<string, string>();
export const deviceKey = (namespace: string, key: string) => namespace + "/" + key;
export const writeDevice = vi.fn(async (key: string, value: string) => { records.set(key, value); });

vi.mock("../../studio-local-database-runtime", () => ({
  resetFailedStudioLocalDatabaseOwnership: async () => false,
  acquireStudioLocalDatabase: async () => ({
    asAsyncKeyValueStore: (namespace: string) => ({
      get: async (key: string) => records.get(deviceKey(namespace, key)) ?? null,
      set: (key: string, value: string) => writeDevice(deviceKey(namespace, key), value),
    }),
  }),
}));

beforeEach(() => { records.clear(); writeDevice.mockClear(); });
