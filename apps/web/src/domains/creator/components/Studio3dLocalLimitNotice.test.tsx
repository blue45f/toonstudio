// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { Studio3dLocalLimitNotice } from "./Studio3dLocalLimitNotice";

describe("Studio3dLocalLimitNotice", () => {
  const originalLang = useI18n.getState().lang;

  afterEach(() => {
    cleanup();
    useI18n.setState({ lang: originalLang });
  });

  it("renders Korean local OPFS limit and 12 MiB cloud sync distinction by default", () => {
    useI18n.setState({ lang: "ko" });
    render(<Studio3dLocalLimitNotice includeSkp />);

    const notice = screen.getByTestId("studio-3d-local-limit-notice");
    expect(notice.textContent).toContain("GLB·VRM 최대 1 GiB");
    expect(notice.textContent).toContain("SKP 최대 256 MiB");
    expect(notice.textContent).toContain("12 MiB");
    expect(notice.textContent).toContain("로컬 OPFS 우선");
  });

  it("renders constrained mobile tier limits when profile is mobile", () => {
    useI18n.setState({ lang: "ko" });
    render(<Studio3dLocalLimitNotice profile="mobile" includeSkp />);

    const notice = screen.getByTestId("studio-3d-local-limit-notice");
    expect(notice.textContent).toContain("모바일·저메모리 안전 티어");
    expect(notice.textContent).toContain("GLB·VRM 최대 128 MiB");
    expect(notice.textContent).toContain("SKP 최대 32 MiB");
  });

  it("renders English copy when locale is en", () => {
    useI18n.setState({ lang: "en" });
    render(<Studio3dLocalLimitNotice includeSkp={false} />);

    const notice = screen.getByTestId("studio-3d-local-limit-notice");
    expect(notice.textContent).toContain("GLB/VRM up to 1 GiB");
    expect(notice.textContent).toContain("12 MiB");
  });
});
