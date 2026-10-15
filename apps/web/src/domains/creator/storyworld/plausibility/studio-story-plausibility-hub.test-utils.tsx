/**
 * 개연성 허브 화면 테스트가 함께 쓰는 하네스.
 *
 * 실제 랩 화면처럼 문서와 처리 기록을 상태로 들고, 허브가 부르는 콜백을 그대로 반영한다. 시계·저장소·
 * 원고 사본 보관소는 주입해서 네트워크나 브라우저 저장소 없이 돈다. 컴포넌트가 아닌 도우미는
 * `studio-story-plausibility-hub.test-support.ts`에 둔다(fast-refresh 규칙).
 */
import { useMemo, useState } from "react";

import { analyzeStoryworldProject, type StoryworldProject } from "../studio-storyworld-causality";
import { analyzeStoryworldContinuity } from "../studio-storyworld-continuity";
import {
  clearStoryworldIssueDisposition,
  upsertStoryworldIssueDisposition,
  type StoryworldIssueDispositionDocument,
  type StoryworldIssueDispositionStatus,
} from "../studio-storyworld-issue-dispositions";
import { StudioStoryPlausibilityHub } from "./StudioStoryPlausibilityHub";
import { HUB_NOW } from "./studio-story-plausibility-hub.test-support";
import type { PlausibilityRunDeps } from "./studio-story-plausibility-run";

export interface HubHarnessProps {
  readonly initialProject: StoryworldProject;
  readonly deps: PlausibilityRunDeps;
  readonly workId?: string | null;
  readonly isExampleSeed?: boolean;
  readonly initialDispositions?: StoryworldIssueDispositionDocument["dispositions"];
  readonly spies?: {
    readonly onProjectChange?: (project: StoryworldProject, message: string) => void;
    readonly onSetDisposition?: (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => void;
    readonly onClearDisposition?: (issueKey: string) => void;
    readonly onOpenSettings?: (target: "scene" | "fact" | "character", id: string) => void;
    readonly onExportProject?: () => void;
  };
}

export function HubHarness({ initialProject, deps, workId = "work-1", isExampleSeed = false, initialDispositions = [], spies = {} }: HubHarnessProps) {
  const [project, setProject] = useState(initialProject);
  const [dispositions, setDispositions] = useState<StoryworldIssueDispositionDocument>({ version: 1, scopeKey: "scope", dispositions: initialDispositions });
  const analysis = useMemo(() => analyzeStoryworldProject(project), [project]);
  const continuityIssues = useMemo(() => analyzeStoryworldContinuity(project), [project]);
  return (
    <StudioStoryPlausibilityHub
      analysis={analysis}
      continuityIssues={continuityIssues}
      deps={deps}
      dispositions={dispositions}
      isExampleSeed={isExampleSeed}
      onClearDisposition={(issueKey) => {
        spies.onClearDisposition?.(issueKey);
        setDispositions((current) => clearStoryworldIssueDisposition(current, issueKey));
      }}
      onExportProject={() => spies.onExportProject?.()}
      onOpenSettings={(target, id) => spies.onOpenSettings?.(target, id)}
      onProjectChange={(next, message) => {
        spies.onProjectChange?.(next, message);
        setProject(next);
      }}
      onSetDisposition={(issueKey, status, note) => {
        spies.onSetDisposition?.(issueKey, status, note);
        setDispositions((current) => upsertStoryworldIssueDisposition(current, {
          issueKey, status, ...(note ? { note } : {}), updatedAtIso: HUB_NOW.toISOString(),
        }));
      }}
      project={project}
      scopeKey="scope"
      workId={workId}
    />
  );
}
