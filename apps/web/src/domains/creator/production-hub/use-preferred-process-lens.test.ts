import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import {
  PROCESS_LENS_PROCESS_KEYS,
  parseProcessLens,
  processLensStorageKey,
  summarizeProcessLensTasks,
} from "./use-preferred-process-lens";

describe("parseProcessLens", () => {
  it("공정 단위 값만 통과시키고 역할 렌즈 값은 거부한다", () => {
    expect(parseProcessLens("all")).toBe("all");
    expect(parseProcessLens("storyboard")).toBe("storyboard");
    expect(parseProcessLens("line-art")).toBe("line-art");
    expect(parseProcessLens("color")).toBe("color");
    expect(parseProcessLens("background")).toBe("background");
    expect(parseProcessLens("lettering")).toBe("lettering");
    expect(parseProcessLens("story")).toBeNull();
    expect(parseProcessLens("producer")).toBeNull();
    expect(parseProcessLens("")).toBeNull();
    expect(parseProcessLens(null)).toBeNull();
    expect(parseProcessLens(undefined)).toBeNull();
  });
});

describe("processLensStorageKey", () => {
  it("프로젝트 단위 저장 키를 만든다", () => {
    expect(processLensStorageKey("project-1")).toBe("toonstudio.production.process-lens.project-1");
  });
});

describe("summarizeProcessLensTasks", () => {
  const tasks = createProductionDemoProject().tasks;

  it("콘티는 thumbnail 작업을 검수 대기로 센다", () => {
    expect(summarizeProcessLensTasks(tasks, "storyboard")).toEqual({ total: 1, active: 0, review: 1, blocked: 0 });
  });

  it("배경의 막힌 작업은 진행 중과 분리해 센다", () => {
    expect(summarizeProcessLensTasks(tasks, "background")).toEqual({ total: 1, active: 0, review: 0, blocked: 1 });
  });

  it("선화·채색·식자는 자기 processKey 작업만 센다", () => {
    expect(summarizeProcessLensTasks(tasks, "line-art")).toEqual({ total: 1, active: 1, review: 0, blocked: 0 });
    expect(summarizeProcessLensTasks(tasks, "color")).toEqual({ total: 1, active: 1, review: 0, blocked: 0 });
    expect(summarizeProcessLensTasks(tasks, "lettering")).toEqual({ total: 1, active: 1, review: 0, blocked: 0 });
  });

  it("전체 공정은 프로젝트의 모든 작업을 센다", () => {
    const summary = summarizeProcessLensTasks(tasks, "all");
    expect(summary.total).toBe(tasks.length);
    expect(summary.total).toBeGreaterThan(5);
  });

  it("공정 별칭은 ManagementPhases가 쓰는 processKey와 어긋나지 않는다", () => {
    expect(PROCESS_LENS_PROCESS_KEYS.storyboard).toContain("thumbnail");
    expect(PROCESS_LENS_PROCESS_KEYS.storyboard).toContain("storyboard");
    expect(PROCESS_LENS_PROCESS_KEYS["line-art"]).toEqual(["line-art"]);
    expect(PROCESS_LENS_PROCESS_KEYS.lettering).toContain("lettering");
  });
});
