// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { assertSafeAdminDiagnosticOutput } from "../../../platform/http/admin-response-whitelist";

import {
  OPS_CUTOVER_BASELINE_SUMMARY,
  exportOpsCutoverSummaryJson,
  parseOpsCutoverDashboardJson,
  summarizeOpsCutoverReadiness,
} from "./ops-cutover-model";
import { OpsCutoverOverviewCard } from "./OpsCutoverOverviewCard";

afterEach(cleanup);

const SYNTH_DSN = ["postgres", "://", "ops", ":", "SynthPass9876", "@toonstudio-db.db.onpod.local:5432/toonstudio"].join("");
const SYNTH_TOKEN = ["opk", "SynthOnpodToken123456"].join("_");

describe("OpsCutoverOverviewCard 및 모델 (#111 · #115)", () => {
  it("정본 기준 스냅샷(DB 133/133 · 배포 원장)을 표시하고 민감 정보를 노출하지 않는다", () => {
    render(<OpsCutoverOverviewCard actorLabel="admin-1 (admin)" />);

    expect(screen.getByRole("heading", { name: "운영·배포 원장 · DB 133/133 통합 조회" })).toBeTruthy();
    expect(screen.getByText("133/133 일치")).toBeTruthy();
    expect(screen.getByText("0133_production_division_os")).toBeTruthy();
    expect(screen.getByText("https://www.toonstudio.cloud")).toBeTruthy();
    expect(screen.getByText("https://toonstudio-api.onpod.ai")).toBeTruthy();
    expect(screen.getByText(/onpod app deploy --attach-db/u)).toBeTruthy();

    const readiness = summarizeOpsCutoverReadiness(OPS_CUTOVER_BASELINE_SUMMARY);
    expect(readiness.migrationAligned).toBe(true);
    expect(readiness.hasActionableAlert).toBe(false);

    const exported = exportOpsCutoverSummaryJson(OPS_CUTOVER_BASELINE_SUMMARY);
    expect(assertSafeAdminDiagnosticOutput(exported)).toEqual({ ok: true, violations: [] });
  });

  it("ops-dashboard --json 가져오기가 CodeQL·모바일 3D 지표를 반영하면서 .env/내부 호스트/자격증명을 완전 차단한다", () => {
    render(<OpsCutoverOverviewCard />);

    const rawOpsDashboardPayload = JSON.stringify({
      schemaVersion: "1.0.0",
      generatedAt: "2026-11-23T05:10:00.000Z",
      mode: "online",
      overallStatus: "degraded",
      degradedReasons: [
        `CodeQL 열림 경보 2건 감지 (${SYNTH_DSN})`,
        "모바일 3D 감사 actionable 실패 요청 1건 감지 · localhost:4174",
      ],
      DATABASE_URL: SYNTH_DSN,
      ONPOD_DEPLOY_TOKEN: SYNTH_TOKEN,
      AUTH_SESSION_SECRET: "should-never-render",
      git: {
        branch: "main",
        headShortSha: "1234567890",
        originMainShortSha: "1234567890",
        headMatchesOriginMain: true,
        clean: true,
      },
      infrastructure: {
        active: {
          web: { provider: "Cloudflare Static", url: "https://www.toonstudio.cloud", resource: "toonspectrum-web" },
          api: { provider: "Seoul onpod", url: "https://toonstudio-api.onpod.ai", resource: "toonstudio-api" },
          database: { resource: "toonstudio-db", engine: "PostgreSQL 17", internalHost: "toonstudio-db.db.onpod.local:5432" },
        },
        retired: [{ id: "vercel" }, { id: "render" }, { id: "supabase" }, { id: "neon" }],
        forbiddenCommands: [{ command: "onpod app deploy --attach-db" }, { command: "onpod app rollback" }],
      },
      standingApproval: {
        ok: true,
        mode: "standing-approval",
        activeScopes: ["cloudflare-static-production", "core-api-container-release"],
        onpodRequiresExplicitApproval: true,
      },
      migrations: {
        ok: true,
        totalCount: 133,
        diskCount: 133,
        latestNumber: "0133",
        latestName: "0133_production_division_os",
        missingFilesCount: 0,
        unregisteredFilesCount: 0,
      },
      liveHealth: {
        status: "healthy",
        summary: { passed: 4, total: 4 },
        headers: { webStudio: { isolated: true } },
      },
      codeScanning: {
        status: "alert",
        openAlertsCount: 2,
        truncated: false,
        tools: ["CodeQL"],
      },
      mobile3dAudit: {
        status: "alert",
        actionableFailedRequests: 1,
        abortedRequests: 13,
        httpErrorCount: 1,
        generatedAt: "2026-11-23T04:00:00.000Z",
      },
    });

    fireEvent.change(screen.getByLabelText("ops-dashboard JSON 입력"), {
      target: { value: rawOpsDashboardPayload },
    });
    fireEvent.click(screen.getByRole("button", { name: "화이트리스트 검증 후 반영" }));

    expect(screen.getByText("열림 경보 2건")).toBeTruthy();
    expect(screen.getByText("actionable 1건")).toBeTruthy();
    expect(screen.getByText(/화이트리스트 차단 요약/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "화이트리스트 JSON 생성" }));
    const preview = screen.getByLabelText("화이트리스트 검증 완료 JSON").textContent ?? "";
    expect(assertSafeAdminDiagnosticOutput(preview)).toEqual({ ok: true, violations: [] });

    const renderedText = document.body.textContent ?? "";
    for (const forbidden of [
      "DATABASE_URL",
      "ONPOD_DEPLOY_TOKEN",
      "AUTH_SESSION_SECRET",
      "onpod.local",
      "localhost",
      "postgres://",
      "SynthPass9876",
      "SynthOnpodToken123456",
    ]) {
      expect(renderedText.includes(forbidden), `DOM 유출 감지: ${forbidden}`).toBe(false);
    }

    fireEvent.click(screen.getByRole("button", { name: "기준 스냅샷으로 되돌리기" }));
    expect(screen.getByText("정본 기준 스냅샷(2026-11-23)")).toBeTruthy();
  });

  it("손상되었거나 스키마가 없는 JSON 입력을 fail-closed로 거부한다", () => {
    expect(parseOpsCutoverDashboardJson("").ok).toBe(false);
    expect(parseOpsCutoverDashboardJson("{invalid").ok).toBe(false);
    expect(parseOpsCutoverDashboardJson('{"hello":"world"}').ok).toBe(false);

    render(<OpsCutoverOverviewCard />);
    fireEvent.change(screen.getByLabelText("ops-dashboard JSON 입력"), {
      target: { value: '{"unrelated":true}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "화이트리스트 검증 후 반영" }));
    expect(screen.getByRole("alert").textContent).toContain("ops-dashboard 또는 배포 원장 요약 JSON 형식이 아닙니다");
  });
});
