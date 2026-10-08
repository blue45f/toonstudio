import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRecord {
  readonly state?: unknown;
  readonly source?: unknown;
}

class FakePressureObserver {
  static instances: FakePressureObserver[] = [];
  readonly observe = vi.fn(async () => undefined);
  readonly disconnect = vi.fn();
  constructor(private readonly callback: (records: readonly FakeRecord[]) => void) {
    FakePressureObserver.instances.push(this);
  }
  emit(records: readonly FakeRecord[]): void {
    this.callback(records);
  }
}

async function loadModule() {
  vi.resetModules();
  return import("./compute-pressure");
}

beforeEach(() => {
  FakePressureObserver.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compute-pressure", () => {
  it("미지원 환경에서는 관찰이 조용히 아무 일도 하지 않는다", async () => {
    const mod = await loadModule();
    expect(mod.isComputePressureSupported()).toBe(false);
    const onChange = vi.fn();
    const stop = mod.observeComputePressure(onChange);
    expect(typeof stop).toBe("function");
    stop();
    expect(onChange).not.toHaveBeenCalled();
    expect(mod.getLatestComputePressure()).toBeNull();
  });

  it("판정이 오면 콜백과 최신 상태가 함께 갱신된다", async () => {
    vi.stubGlobal("PressureObserver", FakePressureObserver);
    const mod = await loadModule();
    expect(mod.isComputePressureSupported()).toBe(true);
    const onChange = vi.fn();
    const stop = mod.observeComputePressure(onChange);
    const observer = FakePressureObserver.instances[0];
    expect(observer.observe).toHaveBeenCalledWith("cpu", { sampleInterval: 1000 });

    observer.emit([{ state: "serious", source: "cpu" }]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const reading = onChange.mock.calls[0][0] as { state: string; source: string };
    expect(reading.state).toBe("serious");
    expect(reading.source).toBe("cpu");
    expect(mod.getLatestComputePressure()?.state).toBe("serious");

    stop();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it("알 수 없는 상태값은 무시한다", async () => {
    vi.stubGlobal("PressureObserver", FakePressureObserver);
    const mod = await loadModule();
    const onChange = vi.fn();
    mod.observeComputePressure(onChange);
    FakePressureObserver.instances[0].emit([{ state: "melting", source: "cpu" }]);
    FakePressureObserver.instances[0].emit([]);
    expect(onChange).not.toHaveBeenCalled();
    expect(mod.getLatestComputePressure()).toBeNull();
  });

  it("마지막 레코드가 최신 판정이다", async () => {
    vi.stubGlobal("PressureObserver", FakePressureObserver);
    const mod = await loadModule();
    const onChange = vi.fn();
    mod.observeComputePressure(onChange);
    FakePressureObserver.instances[0].emit([
      { state: "fair", source: "cpu" },
      { state: "critical", source: "cpu" },
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mod.getLatestComputePressure()?.state).toBe("critical");
  });
});

describe("compute-pressure 소비처 가드", () => {
  const webSrcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*)["'][^"']*compute-pressure["']/u;

  function collectSourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : collectSourceFiles(path);
      if (!entry.isFile() || !/\.tsx?$/u.test(entry.name)) return [];
      if (/\.(?:test|spec)\.tsx?$/u.test(entry.name)) return [];
      return [path];
    });
  }

  it("설정 화면 말고는 이 모듈을 읽는 코드가 없다 (소비처가 생기면 설정 문구와 기술 자료를 함께 고친다)", () => {
    const consumers = collectSourceFiles(webSrcDir)
      .filter((file) => IMPORT_PATTERN.test(readFileSync(file, "utf8")))
      .map((file) => relative(webSrcDir, file).split("\\").join("/"))
      .sort();

    // 지금은 현재 압력을 보여 주는 설정 화면만 읽는다. 품질을 조절하는 소비처는 없다.
    // 새 소비처를 붙이면 NextgenLabSettingsSection.tsx 의 "compute-pressure" 설명(관측용)과
    // domains/legal/technology 의 Compute Pressure 서술을 실제 동작에 맞게 바꾼 뒤 이 목록을 갱신한다.
    expect(consumers).toEqual(["domains/account/NextgenLabSettingsSection.tsx"]);
  });
});
