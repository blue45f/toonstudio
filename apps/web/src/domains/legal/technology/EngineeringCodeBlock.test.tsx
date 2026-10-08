// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringCodeBlock } from "./EngineeringCodeBlock";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE = "const root = await navigator.storage.getDirectory();\nconst file = await root.getFileHandle('a.bin', { create: true });\nconst writer = await file.createWritable();\nawait writer.write(bytes);\nawait writer.close();\nconsole.log('saved');";

describe("EngineeringCodeBlock", () => {
  it("키보드로 스크롤할 수 있는 영역과 언어·제목을 제공하고 줄 번호는 긴 코드에만 붙인다", () => {
    const { container } = render(<EngineeringCodeBlock code={SAMPLE} language="ts" title="OPFS 쓰기" />);
    const region = screen.getByRole("region", { name: /OPFS 쓰기 코드|OPFS 쓰기 code/u });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(container.querySelectorAll(".eng-code__line")).toHaveLength(6);
    expect(container.querySelectorAll(".eng-code__no")).toHaveLength(6);
    expect(container.querySelector(".tok-keyword")?.textContent).toBe("const");
  });

  it("짧은 코드는 줄 번호를 숨기고 원본 경로를 보여준다", () => {
    const { container } = render(
      <EngineeringCodeBlock code={"a = 1\nb = 2"} language="python" sourcePath="services/creator-inference/app.py" />,
    );
    expect(container.querySelectorAll(".eng-code__no")).toHaveLength(0);
    expect(screen.getByText("services/creator-inference/app.py")).toBeTruthy();
  });

  it("복사 버튼은 구문 강조 마크업이 아니라 원본 코드를 클립보드에 넣는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<EngineeringCodeBlock code={SAMPLE} language="ts" />);
    fireEvent.click(screen.getByRole("button", { name: /복사|Copy/u }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SAMPLE));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/복사했습니다|copied/iu));
  });

  it("클립보드를 쓸 수 없으면 실패를 알린다", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    render(<EngineeringCodeBlock code="x" language="text" />);
    fireEvent.click(screen.getByRole("button", { name: /복사|Copy/u }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/복사하지 못했습니다|Could not copy/u));
  });

  it("발표용 변형에는 복사 버튼이 없다", () => {
    render(<EngineeringCodeBlock code="x" language="text" variant="slide" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
