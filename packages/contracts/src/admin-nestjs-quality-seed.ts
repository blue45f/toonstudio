import { nestQualityApiScenarios } from "./admin-nestjs-quality-api-scenarios";
import { nestQualityRealtimeScenarios } from "./admin-nestjs-quality-realtime-scenarios";
import { nestQualitySnapshot } from "./admin-nestjs-quality-snapshot";
import { nestQualityTasks } from "./admin-nestjs-quality-tasks";

import type { NestBoardDocument } from "./admin-nestjs-quality";

/** 서버에 저장본이 없을 때만 사용하는 수동 관측 기준. 읽기 요청은 DB를 변경하지 않는다. */
export function createNestBoardDocument(): NestBoardDocument {
  return structuredClone({
    schemaVersion: 1, repository: "blue45f/toonstudio", snapshot: nestQualitySnapshot,
    tasks: [...nestQualityTasks, ...nestQualityApiScenarios, ...nestQualityRealtimeScenarios].sort((a, b) => a.id.localeCompare(b.id, "en")),
    sourceHistory: [],
  });
}
