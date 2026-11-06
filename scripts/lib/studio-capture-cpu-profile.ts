/** 선택한 Chromium 진단에서만 CPU 표본을 수집하며 실제 작업의 결과·오류를 보존한다. */
export interface StudioCaptureCpuProfile {
  readonly nodes: readonly {
    readonly id: number;
    readonly callFrame: { readonly functionName: string; readonly scriptId: string; readonly url: string; readonly lineNumber: number; readonly columnNumber: number };
    readonly hitCount?: number;
    readonly children?: readonly number[];
  }[];
  readonly startTime: number;
  readonly endTime: number;
  readonly samples?: readonly number[];
  readonly timeDeltas?: readonly number[];
}
export interface StudioCaptureCpuSession {
  enable(): Promise<unknown>;
  start(): Promise<unknown>;
  stop(): Promise<StudioCaptureCpuProfile>;
  disable(): Promise<unknown>;
  detach(): Promise<unknown>;
}
export interface StudioCaptureCpuCollector {
  createSession(): Promise<StudioCaptureCpuSession>;
  attach(name: string, body: string): Promise<unknown>;
}

const MAX_PROFILE_BYTES = 8 * 1024 * 1024;
const DEADLINE_MS = 2_000;

function scriptLocation(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:")
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      const pathname = decodeURIComponent(url.pathname);
      // Vite의 파일시스템 모듈 URL에는 저장소 밖 개인 절대 경로가 들어갈 수 있다.
      if (pathname.startsWith("/@fs/")) return url.origin + "/@fs/" + (pathname.split("/").at(-1) ?? "");
      return url.origin + url.pathname;
    }
    if (url.protocol === "blob:") return "blob:local";
    if (url.protocol === "file:") return "file:///" + (url.pathname.split("/").at(-1) ?? "");
  } catch {
    return "redacted-script";
  }
  return "external-script";
}

/** 로컬 모듈 경로만 남기고 query·fragment·외부 host·개인 경로와 불필요한 필드를 담지 않는다. */
export function serializeStudioCaptureCpuProfile(profile: StudioCaptureCpuProfile): string {
  if (profile.nodes.length > 50_000 || (profile.samples?.length ?? 0) > 200_000
    || (profile.timeDeltas?.length ?? 0) > 200_000) throw new Error("CPU 표본 수가 진단 한도를 넘었습니다.");
  const safe = {
    nodes: profile.nodes.map((node) => ({
      id: node.id,
      callFrame: {
        functionName: node.callFrame.functionName, scriptId: node.callFrame.scriptId,
        url: scriptLocation(node.callFrame.url), lineNumber: node.callFrame.lineNumber, columnNumber: node.callFrame.columnNumber,
      },
      ...(node.hitCount === undefined ? {} : { hitCount: node.hitCount }),
      ...(node.children === undefined ? {} : { children: [...node.children] }),
    })),
    startTime: profile.startTime, endTime: profile.endTime,
    ...(profile.samples === undefined ? {} : { samples: [...profile.samples] }),
    ...(profile.timeDeltas === undefined ? {} : { timeDeltas: [...profile.timeDeltas] }),
  };
  const body = JSON.stringify(safe);
  if (Buffer.byteLength(body) > MAX_PROFILE_BYTES) throw new Error("CPU 진단 자료가 8MiB를 넘었습니다.");
  return body;
}

async function within<T>(value: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([value, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("CPU 관측 응답 시간이 초과됐습니다.")), DEADLINE_MS);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
async function attach(collector: StudioCaptureCpuCollector, name: string, body: string): Promise<boolean> {
  try { await within(collector.attach(name, body)); return true; } catch { return false; }
}

/** observer 실패·지연은 원래 PNG 작업을 재시도하거나 결과·오류를 바꾸지 않는다. */
export async function withStudioCaptureCpuProfile<T>(
  enabled: boolean,
  collector: StudioCaptureCpuCollector,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!enabled) return operation();
  const label = name.replace(/[^a-zA-Z0-9_.-]/gu, "-").slice(0, 100) || "capture";
  const status = { started: false, profileSaved: false, unavailable: false, cleanupFailed: false };
  let session: StudioCaptureCpuSession | undefined;
  const cleanup = async (value: StudioCaptureCpuSession) => {
    try { await within(value.disable()); } catch { status.cleanupFailed = true; }
    try { await within(value.detach()); } catch { status.cleanupFailed = true; }
  };
  try {
    const pending = collector.createSession();
    try {
      session = await within(pending);
    } catch (error) {
      // 시간 제한 뒤 늦게 도착한 CDP 연결도 회수한다. PNG 작업은 기다리거나 재실행하지 않는다.
      void pending.then(cleanup, () => undefined);
      throw error;
    }
    await within(session.enable());
    await within(session.start());
    status.started = true;
  } catch {
    status.unavailable = true;
  }
  try {
    return await operation();
  } finally {
    if (session) {
      if (status.started) {
        try {
          const profile = await within(session.stop());
          status.profileSaved = await attach(collector, label + ".cpuprofile.json", serializeStudioCaptureCpuProfile(profile));
          if (!status.profileSaved) status.unavailable = true;
        } catch {
          status.unavailable = true;
        }
      }
      await cleanup(session);
    }
    await attach(collector, label + ".cpu-observation.json", JSON.stringify(status));
  }
}

