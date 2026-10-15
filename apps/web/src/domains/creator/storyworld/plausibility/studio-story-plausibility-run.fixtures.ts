/** 점검 실행·화면 테스트가 함께 쓰는 원고 사본 픽스처: 세 글자 이상 이름의 표기 흔들림이 한 곳 있다. */
import { STUDIO_STORYWORLD_SCHEMA_VERSION, type StoryworldProject } from "../studio-storyworld-causality";

const FIRST = "아르카디아가 시장을 걸었다.";
const SECOND = "아르카디야가 문을 열었다.";

export const ARCADIA_FIXTURE: {
  readonly project: StoryworldProject;
  readonly copyId: string;
  readonly text: string;
} = (() => {
  const copyId = "copy-arcadia";
  const text = `${FIRST}\n${SECOND}`;
  return {
    copyId,
    text,
    project: {
      schemaVersion: STUDIO_STORYWORLD_SCHEMA_VERSION,
      id: "arcadia",
      title: "원고에서 가져온 이야기",
      characters: [{ id: "arcadia", name: "아르카디아" }],
      facts: [],
      scenes: [
        {
          id: "ms-1", title: "시장", order: 10, participantIds: ["arcadia"], locationId: "시장",
          source: { excerpt: FIRST, boundary: "scene-number", copy: copyId, start: 0, end: FIRST.length },
        },
        {
          id: "ms-2", title: "문", order: 20, participantIds: ["arcadia"], locationId: "시장",
          source: { excerpt: SECOND, boundary: "scene-number", copy: copyId, start: FIRST.length + 1, end: text.length },
        },
      ],
    },
  };
})();
