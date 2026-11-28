// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { StudioVrmViewportStatusOverlay } from "./StudioVrmViewportStatusOverlay";

const initialLang = useI18n.getState().lang;
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLang });
});

it.each([
  ["ko", "VRM을 불러오는 중입니다.", "불러오기에 실패했습니다.", "파일 형식 또는 경로를 확인해 주세요."],
  ["en", "Loading the VRM.", "Loading failed.", "Check the file format or path."],
])("%s 뷰포트가 로딩과 실패를 안내하고 로더의 오류 상세를 보존한다", (lang, loading, heading, fallback) => {
  useI18n.setState({ lang });
  const props = { presentation: "poser" as const, onOpenLibrary: vi.fn(), onSampleLoad: vi.fn() };
  const { rerender } = render(<StudioVrmViewportStatusOverlay {...props} status="loading" error="" />);
  expect(screen.getByRole("status").textContent).toBe(loading);

  rerender(<StudioVrmViewportStatusOverlay {...props} status="error" error="" />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe(heading + fallback);

  const detail = "HTTP 404 (model.vrm)";
  rerender(<StudioVrmViewportStatusOverlay {...props} status="error" error={detail} />);
  expect(screen.getByRole("alert").textContent).toBe(heading + detail);
});
