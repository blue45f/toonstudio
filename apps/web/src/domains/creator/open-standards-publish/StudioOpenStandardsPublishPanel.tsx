/**
 * 글로벌 오픈 표준(C2PA Content Credentials · OpenRaster .ora · OpenColorIO · TMS XLIFF/CSV)
 * 및 7대 웹툰·출판 플랫폼 원클릭 출고 통합 패널 (Wave 18B Track 1).
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 원시 색상 0건 · 명시적 transition 속성만 사용 · 모든 props 선택형 · KO/EN.
 */

import {
  AlertTriangle, CheckCircle2, Cloud, Download, FileCode2, Globe, Layers, PackageCheck, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildC2paProvenanceManifest, convertColorBetweenSpaces, createDemoC2paInput,
  createDemoCloudMirrorFixture, createDemoOpenRasterDocument, generateOcioConfigYaml,
  parseOpenRasterStackXml, planCloudStorageMirrorSync, serializeOpenRasterStackXml,
  verifyC2paManifestIntegrity,
  type C2paIntegrityVerificationResult, type C2paProvenanceInput, type CloudMirrorProvider,
  type ColorSpaceProfileId, type OpenRasterDocument,
} from "./c2pa-provenance-and-standards";
import {
  PLATFORM_SPEC_CATALOG, PLATFORM_SPEC_LIST, buildPlatformSubmissionPackage,
  createDemoPlatformCuts, createDemoScriptUnits, createDemoTranslationsForLocale,
  exportScriptToTmsPackage, importTmsTranslationsWithFitCheck,
  type PiccomaOrientation, type PlatformMasterCutInput, type PlatformSubmissionPackage,
  type PublishPlatformId, type ScriptBalloonUnit, type TmsExportFormat,
  type TmsExportPackage, type TmsLocaleCode,
} from "./global-tms-and-platform-packager";

export type OpenStandardsPublishTab = "platforms" | "tms" | "standards";

export interface StudioOpenStandardsPublishPanelProps {
  readonly initialTab?: OpenStandardsPublishTab;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialPlatform?: PublishPlatformId;
  readonly initialTmsFormat?: TmsExportFormat;
  readonly initialTmsLocale?: TmsLocaleCode;
  readonly initialTargetColorSpace?: ColorSpaceProfileId;
  readonly initialCloudProvider?: CloudMirrorProvider;
  readonly c2paInput?: C2paProvenanceInput;
  readonly scriptUnits?: readonly ScriptBalloonUnit[];
  readonly customCuts?: readonly PlatformMasterCutInput[];
  readonly oraDocument?: OpenRasterDocument;
  readonly onPackageBuilt?: (pkg: PlatformSubmissionPackage) => void;
  readonly onTmsExport?: (pkg: TmsExportPackage) => void;
  readonly onC2paVerified?: (result: C2paIntegrityVerificationResult) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const TABS: readonly { readonly id: OpenStandardsPublishTab; readonly ko: string; readonly en: string }[] = [
  { id: "platforms", ko: "글로벌 7대 플랫폼 출고", en: "Global 7 Platforms" },
  { id: "tms", ko: "TMS 다국어 대사 브리지", en: "TMS Script Bridge" },
  { id: "standards", ko: "C2PA 저작권 증명 · OpenRaster/스토리지", en: "C2PA · OpenRaster / Cloud" },
];

const TMS_FORMATS: readonly { readonly id: TmsExportFormat; readonly label: string }[] = [
  { id: "google-sheets-csv", label: "Google Sheets CSV" },
  { id: "crowdin-xliff-2.0", label: "Crowdin XLIFF 2.0" },
  { id: "lokalise-xliff-2.0", label: "Lokalise XLIFF 2.0" },
];

const TMS_LOCALES: readonly { readonly id: TmsLocaleCode; readonly ko: string; readonly en: string }[] = [
  { id: "ko", ko: "KO 한국어", en: "KO Korean" },
  { id: "en", ko: "EN 영어", en: "EN English" },
  { id: "ja", ko: "JA 일본어(세로)", en: "JA Japanese (Vert)" },
  { id: "th", ko: "TH 태국어", en: "TH Thai" },
  { id: "id", ko: "ID 인니어", en: "ID Indonesian" },
];

const COLOR_SPACES: readonly ColorSpaceProfileId[] = ["sRGB", "Display-P3", "CMYK-FOGRA39"];

const CLOUD_PROVIDERS: readonly { readonly id: CloudMirrorProvider; readonly label: string; readonly root: string }[] = [
  { id: "google-drive", label: "Google Drive", root: "gdrive://ToonStudioBackup" },
  { id: "dropbox", label: "Dropbox", root: "dropbox:///ToonStudio" },
  { id: "onedrive", label: "OneDrive", root: "onedrive:///ToonStudio" },
  { id: "webdav-nas", label: "WebDAV / NAS", root: "https://nas.local/webdav/toonstudio" },
  { id: "s3-r2", label: "S3 / R2", root: "s3://toonstudio-archive" },
];

const MIB = 1024 * 1024;

export function StudioOpenStandardsPublishPanel({
  initialTab = "platforms", locale, className, initialPlatform = "naver-webtoon",
  initialTmsFormat = "crowdin-xliff-2.0", initialTmsLocale = "ja",
  initialTargetColorSpace = "CMYK-FOGRA39", initialCloudProvider = "s3-r2",
  c2paInput, scriptUnits, customCuts, oraDocument, onPackageBuilt, onTmsExport, onC2paVerified,
}: StudioOpenStandardsPublishPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<OpenStandardsPublishTab>(initialTab);
  const [platform, setPlatform] = useState<PublishPlatformId>(initialPlatform);
  const [autoSlice, setAutoSlice] = useState<boolean>(true);
  const [piccomaOrientation, setPiccomaOrientation] = useState<PiccomaOrientation>("vertical-smartoon");
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const [tmsFormat, setTmsFormat] = useState<TmsExportFormat>(initialTmsFormat);
  const [tmsLocale, setTmsLocale] = useState<TmsLocaleCode>(initialTmsLocale);
  const [allowAutoShrink, setAllowAutoShrink] = useState<boolean>(true);
  const [simulateOverflow, setSimulateOverflow] = useState<boolean>(false);
  const [tmsNotice, setTmsNotice] = useState<string | null>(null);

  const [simulateTamper, setSimulateTamper] = useState<boolean>(false);
  const [targetColorSpace, setTargetColorSpace] = useState<ColorSpaceProfileId>(initialTargetColorSpace);
  const [cloudProvider, setCloudProvider] = useState<CloudMirrorProvider>(initialCloudProvider);
  const [standardsNotice, setStandardsNotice] = useState<string | null>(null);

  const resolvedC2paInput = useMemo(() => c2paInput ?? createDemoC2paInput(), [c2paInput]);
  const rawManifest = useMemo(() => buildC2paProvenanceManifest(resolvedC2paInput), [resolvedC2paInput]);
  const activeManifest = useMemo(
    () => (simulateTamper ? { ...rawManifest, title: `${rawManifest.title} [TAMPERED]` } : rawManifest),
    [rawManifest, simulateTamper],
  );
  const c2paCheck = useMemo(() => verifyC2paManifestIntegrity(activeManifest), [activeManifest]);

  const activeCuts = useMemo(
    () => customCuts ?? createDemoPlatformCuts(platform, piccomaOrientation),
    [customCuts, piccomaOrientation, platform],
  );
  const platformPkg = useMemo(
    () => buildPlatformSubmissionPackage({
      platform, episodeCode: resolvedC2paInput.workId, cuts: activeCuts,
      c2paManifest: activeManifest, autoSlice, piccomaOrientation,
    }),
    [activeCuts, activeManifest, autoSlice, piccomaOrientation, platform, resolvedC2paInput.workId],
  );

  const units = useMemo(() => scriptUnits ?? createDemoScriptUnits(), [scriptUnits]);
  const demoTranslations = useMemo(
    () => createDemoTranslationsForLocale(tmsLocale, simulateOverflow),
    [simulateOverflow, tmsLocale],
  );
  const tmsExportPkg = useMemo(
    () => exportScriptToTmsPackage({
      workId: resolvedC2paInput.workId, sourceLocale: "ko", targetLocale: tmsLocale,
      format: tmsFormat, units, existingTranslations: demoTranslations,
    }),
    [demoTranslations, resolvedC2paInput.workId, tmsFormat, tmsLocale, units],
  );
  const tmsImportReport = useMemo(
    () => importTmsTranslationsWithFitCheck(units, tmsExportPkg.payload, tmsFormat, tmsLocale, { allowAutoShrink }),
    [allowAutoShrink, tmsExportPkg.payload, tmsFormat, tmsLocale, units],
  );

  const baseOraDoc = useMemo(() => oraDocument ?? createDemoOpenRasterDocument(), [oraDocument]);
  const oraXml = useMemo(() => serializeOpenRasterStackXml(baseOraDoc), [baseOraDoc]);
  const oraParsed = useMemo(() => parseOpenRasterStackXml(oraXml), [oraXml]);
  const ocioConfig = useMemo(() => generateOcioConfigYaml(baseOraDoc.colorSpace, targetColorSpace, "krita"), [baseOraDoc.colorSpace, targetColorSpace]);
  const sampleColorCheck = useMemo(() => convertColorBetweenSpaces([0.86, 0.24, 0.18], baseOraDoc.colorSpace, targetColorSpace), [baseOraDoc.colorSpace, targetColorSpace]);

  const cloudFixture = useMemo(() => createDemoCloudMirrorFixture(), []);
  const activeCloudMeta = CLOUD_PROVIDERS.find((p) => p.id === cloudProvider) ?? CLOUD_PROVIDERS[0];
  const cloudSyncPlan = useMemo(
    () => planCloudStorageMirrorSync(cloudFixture.localFiles, cloudFixture.remoteFiles, { provider: cloudProvider, remoteRoot: activeCloudMeta?.root ?? "s3://toonstudio" }),
    [activeCloudMeta?.root, cloudFixture.localFiles, cloudFixture.remoteFiles, cloudProvider],
  );

  const activeSpec = PLATFORM_SPEC_CATALOG[platform];

  const handleBuildPackage = (): void => {
    onPackageBuilt?.(platformPkg);
    setPublishNotice(
      platformPkg.readyForSubmission
        ? pick(`${activeSpec.labelKo} 출고 패키지 검증 완료 · 위반 0건 · 슬라이스 ${platformPkg.slices.length}장 · C2PA/Rights BOM 동봉`, `${activeSpec.labelEn} package ready · 0 violations · ${platformPkg.slices.length} slices · C2PA & Rights BOM attached.`)
        : pick(`${activeSpec.labelKo} 출고 차단 · 규격/권리 위반 ${platformPkg.violationCount}건을 먼저 해결하세요.`, `${activeSpec.labelEn} submission blocked · fix ${platformPkg.violationCount} issue(s).`),
    );
  };

  const handleExportTms = (): void => {
    onTmsExport?.(tmsExportPkg);
    setTmsNotice(pick(`${tmsExportPkg.filename} 추출 완료 · ${tmsExportPkg.unitCount}개 대사/SFX · SHA-256 ${tmsExportPkg.payloadSha256.slice(0, 12)}`, `Exported ${tmsExportPkg.filename} · ${tmsExportPkg.unitCount} units · SHA-256 ${tmsExportPkg.payloadSha256.slice(0, 12)}`));
  };

  const handleVerifyC2pa = (): void => {
    onC2paVerified?.(c2paCheck);
    setStandardsNotice(
      c2paCheck.valid
        ? pick(`C2PA v2.1 무결성 검증 통과 · 해시 체인 ${c2paCheck.checkedLinkCount}링크 · Anti-AI(notAllowed) 확인`, `C2PA v2.1 verified · ${c2paCheck.checkedLinkCount} hash links · Anti-AI notAllowed confirmed.`)
        : pick(`C2PA 위변조 탐지 · 오류 ${c2paCheck.failures.length}건 (${c2paCheck.failures.map((f) => f.code).join(", ")})`, `C2PA tamper detected · ${c2paCheck.failures.length} failure(s) (${c2paCheck.failures.map((f) => f.code).join(", ")}).`),
    );
  };

  return (
    <section
      aria-label={pick("글로벌 오픈 표준 · 플랫폼 출고 허브 패널", "Global Open Standards & Platform Publish Hub Panel")}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="space-y-1 border-b border-line pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <Globe className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("국제 오픈 표준 · C2PA 2.1 · OpenRaster · OCIO · XLIFF 2.0", "Open Standards · C2PA 2.1 · OpenRaster · OCIO · XLIFF 2.0")}</span>
        </div>
        <h2 className="text-base font-bold text-fg">{pick("글로벌 오픈 표준 · 7대 플랫폼 원클릭 출고", "Global Open Standards & 7-Platform One-Click Publisher")}</h2>
        <p className="text-xs text-fg-2">
          {pick("네이버·카카오·레진·WEBTOON·Piccoma·Tapas·PDF/X-4 출고 검증, 다국어 TMS 대사 왕복, C2PA 저작권/Anti-AI 증명과 OpenRaster·클라우드 차분 미러링을 한 곳에서 실행합니다.", "Run 7-platform preflight packaging, multilingual TMS round-trips, C2PA Anti-AI provenance, OpenRaster/OCIO interchange, and SHA-256 cloud mirror planning.")}
        </p>
      </header>

      <div role="tablist" aria-label={pick("오픈 표준 및 출고 탭", "Open standards and publishing tabs")} className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-line bg-canvas p-1.5 sm:grid-cols-3">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`${TAB_BTN} ${selected ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
              <span>{pick(tab.ko, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "platforms" && (
        <div id={`${uid}-panel-platforms`} role="tabpanel" aria-labelledby={`${uid}-tab-platforms`} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {PLATFORM_SPEC_LIST.map((spec) => (
              <button key={spec.id} type="button" aria-pressed={platform === spec.id} onClick={() => setPlatform(spec.id)} className={`${BTN_CHOICE} px-2 ${platform === spec.id ? BTN_ACTIVE : BTN_IDLE}`}>
                <span>{pick(spec.labelKo, spec.labelEn)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3 text-xs">
            <div className="space-y-0.5">
              <div className="font-bold text-fg">{pick(activeSpec.labelKo, activeSpec.labelEn)}</div>
              <div className="text-fg-2">{pick(activeSpec.specSummaryKo, activeSpec.specSummaryEn)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {platform === "piccoma-jp" && (
                <button type="button" onClick={() => setPiccomaOrientation((prev) => (prev === "vertical-smartoon" ? "horizontal-spread" : "vertical-smartoon"))} className={`${BTN_CHOICE} ${BTN_IDLE}`}>
                  <span>{piccomaOrientation === "vertical-smartoon" ? pick("세로 스마트툰", "Vertical Smartoon") : pick("가로 펼침(RTL)", "Horizontal RTL")}</span>
                </button>
              )}
              {platform !== "print-pdf-x4" && (
                <label htmlFor={`${uid}-autoslice`} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 text-xs font-medium text-fg-2">
                  <input id={`${uid}-autoslice`} type="checkbox" checked={autoSlice} onChange={(e) => setAutoSlice(e.target.checked)} className="accent-accent" />
                  <span>{pick("안전 타일 자동 슬라이스", "Auto Safe Slice")}</span>
                </label>
              )}
              <button type="button" onClick={handleBuildPackage} className={BTN_PRIMARY}>
                <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("원클릭 출고 패키지 검사·생성", "Build & Preflight Package")}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div data-testid="platform-verdict-card" className={`rounded-xl border p-3 ${platformPkg.readyForSubmission ? "border-good/40 bg-good-soft" : "border-bad/40 bg-bad-soft"}`}>
              <div className="text-[11px] text-fg-2">{pick("출고 사전 판정", "Preflight Verdict")}</div>
              <div className={`mt-1 flex items-center gap-1 text-sm font-bold tabular-nums ${platformPkg.readyForSubmission ? "text-good" : "text-bad"}`}>
                {platformPkg.readyForSubmission ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                <span>{platformPkg.readyForSubmission ? pick("위반 0건 · 출고 가능", "0 Violations · Ready") : pick(`차단 · 위반 ${platformPkg.violationCount}건`, `Blocked · ${platformPkg.violationCount} Issue(s)`)}</span>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("생성 슬라이스 / 용량", "Slices / Total Size")}</div>
              <div data-testid="platform-slice-summary" className="mt-1 text-sm font-bold tabular-nums text-fg">
                {platformPkg.slices.length}{pick("장", " files")} · {(platformPkg.totalBytes / MIB).toFixed(2)} MiB
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("동봉 C2PA 증명서", "Attached C2PA")}</div>
              <div data-testid="platform-c2pa-badge" className="mt-1 text-xs font-bold tabular-nums text-fg">
                {platformPkg.attachedCredentials.antiAiDeclared ? "Anti-AI notAllowed" : pick("미선언", "Missing")} · {platformPkg.attachedCredentials.c2paManifestSha256.slice(0, 10)}
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("동봉 Rights BOM", "Attached Rights BOM")}</div>
              <div className={`mt-1 text-xs font-bold tabular-nums ${platformPkg.attachedCredentials.rightsClearedForPlatform ? "text-good" : "text-bad"}`}>
                {platformPkg.attachedCredentials.rightsAssetCount}{pick("건", " assets")} · {platformPkg.attachedCredentials.rightsClearedForPlatform ? pick("권리 승인", "Cleared") : pick("권리 차단", "Blocked")}
              </div>
            </div>
          </div>

          {platformPkg.violations.length > 0 && (
            <ul data-testid="platform-violation-list" className="space-y-1.5 rounded-xl border border-bad/40 bg-bad-soft/60 p-3 text-xs text-bad">
              {platformPkg.violations.map((v, idx) => (
                <li key={`${v.code}-${idx}`} className="font-medium">[{v.code}] {pick(v.messageKo, v.messageEn)}</li>
              ))}
            </ul>
          )}

          {publishNotice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">{publishNotice}</p>}
        </div>
      )}

      {activeTab === "tms" && (
        <div id={`${uid}-panel-tms`} role="tabpanel" aria-labelledby={`${uid}-tab-tms`} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {TMS_FORMATS.map((fmt) => (
                <button key={fmt.id} type="button" aria-pressed={tmsFormat === fmt.id} onClick={() => setTmsFormat(fmt.id)} className={`${BTN_CHOICE} ${tmsFormat === fmt.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  <span>{fmt.label}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={handleExportTms} className={BTN_PRIMARY}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("TMS 번역 패키지 추출", "Export TMS Package")}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap gap-1.5">
              {TMS_LOCALES.map((loc) => (
                <button key={loc.id} type="button" aria-pressed={tmsLocale === loc.id} onClick={() => setTmsLocale(loc.id)} className={`${BTN_CHOICE} px-2.5 ${tmsLocale === loc.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  <span>{pick(loc.ko, loc.en)}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label htmlFor={`${uid}-shrink`} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 text-fg-2">
                <input id={`${uid}-shrink`} type="checkbox" checked={allowAutoShrink} onChange={(e) => setAllowAutoShrink(e.target.checked)} className="accent-accent" />
                <span>{pick("자동 폰트 축소", "Auto-Shrink")}</span>
              </label>
              <button type="button" aria-pressed={simulateOverflow} onClick={() => setSimulateOverflow((prev) => !prev)} className={`${BTN_CHOICE} ${simulateOverflow ? "border-warn/40 bg-warn/15 text-warn" : BTN_IDLE}`}>
                <span>{simulateOverflow ? pick("오버플로 테스트 해제", "Reset Normal Text") : pick("오버플로 검사 시뮬레이션", "Simulate Overflow")}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-fg"><FileCode2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{tmsExportPkg.filename}</span>
                <span className="tabular-nums text-[11px] text-fg-3">SHA-256 {tmsExportPkg.payloadSha256.slice(0, 12)}</span>
              </div>
              <pre data-testid="tms-payload-preview" className="mt-2 max-h-40 overflow-auto rounded-lg border border-line bg-canvas p-2.5 text-[11px] leading-relaxed text-fg-2">
                {tmsExportPkg.payload.split("\n").slice(0, 14).join("\n")}
              </pre>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-fg">{pick("말풍선 역삽입 적합도 검사", "Balloon Fit Check on Import")}</span>
                <span data-testid="tms-fit-summary" className={`rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${tmsImportReport.allSafe ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                  {pick(`적합 ${tmsImportReport.fitCount} · 축소 ${tmsImportReport.autoShrunkCount} · 차단 ${tmsImportReport.overflowBlockedCount}`, `Fit ${tmsImportReport.fitCount} · Shrink ${tmsImportReport.autoShrunkCount} · Blocked ${tmsImportReport.overflowBlockedCount}`)}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {tmsImportReport.items.map((item) => (
                  <li key={item.unitId} data-testid={`tms-fit-${item.unitId}`} className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-fg">{item.unitId} · {item.speaker} ({item.writingMode})</span>
                      <span className={`font-bold tabular-nums ${item.status === "overflow-blocked" ? "text-bad" : item.status === "tight-autoshrink" ? "text-warn" : "text-good"}`}>
                        {item.appliedFontSizePx}px · {(item.overflowRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-fg-2">{pick(item.reasonKo, item.reasonEn)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {tmsNotice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">{tmsNotice}</p>}
        </div>
      )}

      {activeTab === "standards" && (
        <div id={`${uid}-panel-standards`} role="tabpanel" aria-labelledby={`${uid}-tab-standards`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {c2paCheck.valid ? <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-bad" aria-hidden="true" />}
                <span className="text-xs font-bold text-fg">{pick("C2PA Content Credentials v2.1 무결성 · Anti-AI 증명", "C2PA Content Credentials v2.1 · Anti-AI Provenance")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setSimulateTamper((prev) => !prev)} className={`${BTN_CHOICE} ${simulateTamper ? "border-bad/40 bg-bad-soft text-bad" : BTN_IDLE}`}>
                  <span>{simulateTamper ? pick("원본 매니페스트 복구", "Restore Clean Manifest") : pick("위변조 탐지 테스트", "Simulate Tamper")}</span>
                </button>
                <button type="button" onClick={handleVerifyC2pa} className={BTN_PRIMARY}>
                  <span>{pick("SHA-256 해시 체인 검증", "Verify SHA-256 Chain")}</span>
                </button>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div data-testid="c2pa-integrity-badge" className={`rounded-lg border px-2.5 py-2 ${c2paCheck.valid ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                <div className="text-[11px] opacity-80">{pick("해시 체인 무결성", "Hash Chain Integrity")}</div>
                <div className="font-bold tabular-nums">{c2paCheck.valid ? pick("검증 통과", "VERIFIED") : pick("위변조 탐지", "TAMPERED")} ({c2paCheck.checkedLinkCount} links)</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">c2pa.training-mining</div>
                <div className="font-bold text-fg">{c2paCheck.antiAiDeclared ? "notAllowed (Anti-AI)" : "Unprotected"}</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("Rights BOM 권리", "Rights BOM Scope")}</div>
                <div className="font-bold tabular-nums text-fg">
                  {activeManifest.ingredients.length}{pick("건", " items")} · {c2paCheck.rightsClearForCommercial && c2paCheck.rightsClearForGlobal ? pick("상업·글로벌·인쇄 OK", "Comm/Global/Print OK") : pick("일부 제한", "Restricted")}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">JUMBF / SHA-256</div>
                <div className="truncate font-bold tabular-nums text-fg">{activeManifest.manifestSha256.slice(0, 16)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-fg"><Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("OpenRaster(.ora) · OpenColorIO v2", "OpenRaster (.ora) · OpenColorIO v2")}</span>
                <span data-testid="ora-roundtrip-badge" className="rounded-md border border-good/40 bg-good-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-good">
                  {oraParsed.width}×{oraParsed.height} · {oraParsed.colorSpace} OK
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COLOR_SPACES.map((cs) => (
                  <button key={cs} type="button" aria-pressed={targetColorSpace === cs} onClick={() => setTargetColorSpace(cs)} className={`${BTN_CHOICE} px-2.5 ${targetColorSpace === cs ? BTN_ACTIVE : BTN_IDLE}`}>
                    <span>{cs}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-lg border border-line bg-canvas px-2.5 py-2 tabular-nums text-[11px] text-fg-2">
                OCIO {ocioConfig.ocioProfileVersion} ({baseOraDoc.colorSpace} → {targetColorSpace}) · {sampleColorCheck.totalAreaCoveragePercent !== undefined ? `TAC ${sampleColorCheck.totalAreaCoveragePercent}%` : sampleColorCheck.channels.join(", ")} · {ocioConfig.configSha256.slice(0, 10)}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-fg"><Cloud className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("클라우드 해시 차분 미러링", "Cloud SHA-256 Delta Mirror")}</span>
                <span data-testid="cloud-savings-badge" className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-bold tabular-nums text-fg">
                  {cloudSyncPlan.protocol} · {(cloudSyncPlan.bandwidthSavingsRatio * 100).toFixed(1)}% {pick("절감", "saved")}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CLOUD_PROVIDERS.map((p) => (
                  <button key={p.id} type="button" aria-pressed={cloudProvider === p.id} onClick={() => setCloudProvider(p.id)} className={`${BTN_CHOICE} px-2.5 ${cloudProvider === p.id ? BTN_ACTIVE : BTN_IDLE}`}>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-lg border border-line bg-canvas px-2.5 py-2 tabular-nums text-[11px] text-fg-2">
                {pick(`업로드 ${cloudSyncPlan.uploadCount}건 · 동일 해시 생략 ${cloudSyncPlan.skippedCount}건 · 전송 ${(cloudSyncPlan.transferBytes / 1024).toFixed(1)} KiB`, `Upload ${cloudSyncPlan.uploadCount} · Skipped ${cloudSyncPlan.skippedCount} · Transfer ${(cloudSyncPlan.transferBytes / 1024).toFixed(1)} KiB`)}
              </div>
            </div>
          </div>

          {standardsNotice && <p role="status" className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${c2paCheck.valid ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>{standardsNotice}</p>}
        </div>
      )}
    </section>
  );
}
