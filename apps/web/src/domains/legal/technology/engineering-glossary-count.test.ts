import { describe, expect, it } from "vitest";

import { ENGINEERING_GLOSSARY_TERM_COUNT } from "./engineering-glossary-count";
import { ENGINEERING_GLOSSARY, GLOSSARY_TERM_COUNT } from "./engineering-glossary-content";

describe("용어집 용어 수 상수", () => {
  it("발표 자료 화면이 쓰는 가벼운 상수가 실제 용어집 목록과 같다", () => {
    expect(ENGINEERING_GLOSSARY_TERM_COUNT).toBe(GLOSSARY_TERM_COUNT);
    expect(ENGINEERING_GLOSSARY_TERM_COUNT).toBe(ENGINEERING_GLOSSARY.length);
  });
});
