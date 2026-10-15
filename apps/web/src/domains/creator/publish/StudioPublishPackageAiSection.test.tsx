// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPublishPackageAiSection } from "./StudioPublishPackageAiSection";
import {
  DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS,
  type StudioPublishPackageSettings,
} from "../studio-publish-package";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(cleanup);

const FIELD_CLASS = "test-field-class";

function Harness({
  initial,
  generatedProhibited,
  disclosureInvalid,
  onChange,
}: {
  readonly initial: StudioPublishPackageSettings;
  readonly generatedProhibited: boolean;
  readonly disclosureInvalid: boolean;
  readonly onChange: (patch: Partial<StudioPublishPackageSettings>) => void;
}) {
  // 패널과 같이 부모가 패치를 설정에 병합한다. 그래야 변경 확인 문구처럼 값 변화에 반응하는 UI가 보인다.
  const [settings, setSettings] = useState(initial);
  return (
    <StudioPublishPackageAiSection
      settings={settings}
      onChange={(patch) => {
        setSettings((current) => ({ ...current, ...patch }));
        onChange(patch);
      }}
      presetLabel="Tapas"
      generatedProhibited={generatedProhibited}
      disclosureInvalid={disclosureInvalid}
      fieldClassName={FIELD_CLASS}
    />
  );
}

function renderSection(
  overrides: Partial<StudioPublishPackageSettings> = {},
  props: {
    readonly generatedProhibited?: boolean;
    readonly disclosureInvalid?: boolean;
  } = {},
) {
  const onChange = vi.fn<(patch: Partial<StudioPublishPackageSettings>) => void>();
  render(
    <Harness
      initial={{ ...DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, ...overrides }}
      generatedProhibited={props.generatedProhibited ?? false}
      disclosureInvalid={props.disclosureInvalid ?? false}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("StudioPublishPackageAiSection", () => {
  it("AI 사용 공개와 AI 학습 허용 표기를 한 묶음으로 보여 준다(기본은 사용 안 함·미지정)", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "AI 사용 공개" })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "사용 안 함" }).checked).toBe(true);
    expect(screen.getByRole("group", { name: "AI 학습 허용 표기" })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "미지정 (기본)" }).checked).toBe(true);
    expect(screen.queryByLabelText(/공개 고지 문구/u)).toBeNull();
  });

  it("학습 허용 표기를 고르면 aiTraining 패치만 보내고 패키지 기록 위치를 알린다", () => {
    const onChange = renderSection();
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ aiTraining: "prohibited" });
    expect(screen.getAllByRole("status").some((node) =>
      node.textContent?.includes("manifest.json(rights.aiTraining)"),
    )).toBe(true);
  });

  it("AI 사용 범위를 바꾸면 aiUsage 패치를 보낸다(이동 전과 같은 동작)", () => {
    const onChange = renderSection();
    fireEvent.click(screen.getByRole("radio", { name: "AI 보조" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ aiUsage: "assisted" });
  });

  it("AI 를 쓴 경우에만 공개 고지 문구를 받고 검증 오류면 aria-invalid 를 켠다", () => {
    const onChange = renderSection(
      { aiUsage: "assisted", aiDisclosure: "" },
      { disclosureInvalid: true },
    );
    const textarea = screen.getByLabelText(/공개 고지 문구/u);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.className).toContain(FIELD_CLASS);
    fireEvent.change(textarea, { target: { value: "배경 아이디어에 AI 를 보조로 썼습니다." } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      aiDisclosure: "배경 아이디어에 AI 를 보조로 썼습니다.",
    });
  });

  it("목적지가 AI 생성물을 금지하는 정책일 때만 생성 포함 선택에 경고를 띄운다", () => {
    renderSection({ aiUsage: "generated" }, { generatedProhibited: true });
    expect(screen.getByText(/Tapas 정책에서는 AI 생성 콘텐츠 게시가 금지됩니다/u)).toBeTruthy();
    cleanup();

    renderSection({ aiUsage: "generated" }, { generatedProhibited: false });
    expect(screen.queryByText(/AI 생성 콘텐츠 게시가 금지됩니다/u)).toBeNull();
  });

  it("저장된 허용·불허 값을 라디오에 그대로 반영한다", () => {
    renderSection({ aiTraining: "allowed" });
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "미지정 (기본)" }).checked).toBe(false);
  });
});
