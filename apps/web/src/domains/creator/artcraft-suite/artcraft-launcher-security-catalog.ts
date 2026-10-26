/**
 * artcraft-launcher-security-catalog.ts
 *
 * [3] ArtCraft Launcher (storytold/craft-launcher v0.8.1) 및 15종 스위트 정본 카탈로그,
 * CWE-78 / CWE-180 / CWE-789 보안 가드레일, Debian/AUR 호환 버전 파서,
 * SHA256SUMS 매니페스트 검증기, craft-ai-integrations 로컬/클라우드 AI 라우터.
 */

export type ArtCraftAppId =
  | "artcraft-launcher"
  | "photocraft"
  | "vectorcraft"
  | "filmcraft"
  | "lightcraft"
  | "pdfcraft"
  | "effectcraft"
  | "designcraft"
  | "figcraft"
  | "wordcraft"
  | "soundcraft"
  | "deckcraft"
  | "cadcraft"
  | "gridcraft"
  | "anicraft";

export type ArtCraftCategory =
  | "launcher"
  | "creative-media"
  | "publishing-design"
  | "office-audio-cad"
  | "unreleased-animation";

export type SrgbTriplet = readonly [number, number, number];

export interface ArtCraftAppCatalogEntry {
  readonly id: ArtCraftAppId;
  readonly namuSection: string;
  readonly name: string;
  readonly bundleId: string;
  readonly formerIds: readonly string[];
  readonly version: string;
  readonly gitCommit: string | null;
  readonly category: ArtCraftCategory;
  readonly industryCounterpart: string;
  readonly taglineKo: string;
  readonly taglineEn: string;
  readonly nativeExtension: string;
  readonly color: SrgbTriplet;
  readonly inkLight: SrgbTriplet;
  readonly inkDark: SrgbTriplet;
  readonly webBundleSha256: string | null;
  readonly reaViewEvidenceId: string;
  readonly cliBinarySha256?: string;
  readonly reaCliEvidenceId?: string;
}

/**
 * `crates/launcher-core/src/catalog.rs`에서 역공학한 정본 14종 + 4.1절 미공개 `AniCraft` 통합 카탈로그.
 */
export const ARTCRAFT_SUITE_CATALOG: readonly ArtCraftAppCatalogEntry[] = Object.freeze([
  {
    id: "artcraft-launcher",
    namuSection: "3",
    name: "ArtCraft Launcher",
    bundleId: "ai.storyteller.artcraft-launcher",
    formerIds: [],
    version: "0.8.1",
    gitCommit: "6c5f5ea2f5186cefe35797ddacd7d8a866ae2eeb",
    category: "launcher",
    industryCounterpart: "Adobe Creative Cloud Desktop",
    taglineKo: "15종 ArtCraft 스위트 통합 허브 · CWE-78/180/789 보안 검증 · SHA-256 릴리스 관리자",
    taglineEn: "Desktop hub to install, update, verify, and launch every ArtCraft application",
    nativeExtension: ".json",
    color: [0x0b, 0x0b, 0x0c],
    inkLight: [0x0b, 0x0b, 0x0c],
    inkDark: [0xf2, 0xf1, 0xee],
    webBundleSha256: "e0cac2cb30fce2677bfcfeb01806d95702cffbee92717faf3ce0c34fecc0bb4e",
    reaViewEvidenceId: "ev_2df9d6bb26a2a2654b5620039703f2a1dead0000f2f80b35a614b6202c9ebbd8",
  },
  {
    id: "photocraft",
    namuSection: "3.1",
    name: "PhotoCraft",
    bundleId: "ai.storyteller.photocraft",
    formerIds: [],
    version: "0.16.0",
    gitCommit: "3877bb1db09c65c5d491b3efdc8d1d4649bf8069",
    category: "creative-media",
    industryCounterpart: "Adobe Photoshop",
    taglineKo: "BLAKE3 타일 중복 제거 .pcraft · 비유한 부동소수점 차단 · PSD/PSB & ICC 컬러 엔진",
    taglineEn: "Layered raster editor with BLAKE3 tiled .pcraft, PSD/PSB import, and ICC CMS",
    nativeExtension: ".pcraft",
    color: [0x2f, 0x7b, 0xf5],
    inkLight: [0x1a, 0x5b, 0xc4],
    inkDark: [0x7f, 0xb0, 0xff],
    webBundleSha256: "2e4a87b71ec056af675f46ff34ddced0e28e94f7b3eef266f1b0b6df86eeb6ae",
    reaViewEvidenceId: "ev_1c6ba22f18d07d57fbb4c4301e87243591ac6bb871edf934a34afa41af53583c",
    cliBinarySha256: "1579a4111d62d9663b5607f102fd17631d13b56dda3c42d29a66e35cd2754a29",
    reaCliEvidenceId: "ev_33d803c8571dc35666efb7794493b26d9ff4bd252bc95d9696ef910196a9eede",
  },
  {
    id: "vectorcraft",
    namuSection: "3.2",
    name: "VectorCraft",
    bundleId: "ai.storyteller.vectorcraft",
    formerIds: [],
    version: "0.17.0",
    gitCommit: "4ddd0332cd965889ca4f6b29a0870492f4183075",
    category: "creative-media",
    industryCounterpart: "Adobe Illustrator",
    taglineKo: "정밀 3차 베지어 Pathfinder 불리언 · 5종 벡터 브러시 · Image Trace · 3D 벡터 셰이딩",
    taglineEn: "Precision vector illustration with exact curve booleans, 5 brush types, and 3D effects",
    nativeExtension: ".vectorcraft",
    color: [0xe8, 0x57, 0x3f],
    inkLight: [0xb8, 0x3a, 0x24],
    inkDark: [0xff, 0x8a, 0x70],
    webBundleSha256: "8850209e86d504bf93bb307d14cedbeb7d28963b7d1d3158e4240b7e9d0b8e9c",
    reaViewEvidenceId: "ev_fb30c7f3074d5932a971cc923e87fa2174a0bfde3e4d02a931a27d443088c0be",
  },
  {
    id: "filmcraft",
    namuSection: "3.3",
    name: "FlimCraft (FilmCraft)",
    bundleId: "ai.storyteller.filmcraft",
    formerIds: ["flimcraft"],
    version: "0.13.0",
    gitCommit: "de529c88f6ae47400ac85e6a40b50e0e74316bc3",
    category: "creative-media",
    industryCounterpart: "Adobe Premiere Pro",
    taglineKo: "정수 Tick 타임베이스 · Ripple/Roll/Slip 편집 대수 · 역재생 연속성 · EBU R128 라우드니스",
    taglineEn: "Non-linear video editor with integer Tick timebase, ripple/roll algebra, and scopes",
    nativeExtension: ".fcproj",
    color: [0x8b, 0x5c, 0xf6],
    inkLight: [0x6a, 0x3f, 0xd6],
    inkDark: [0xb6, 0x9c, 0xff],
    webBundleSha256: "735a7fe34ea8c86b2a06f3d76449d8e7f688c8f632103a80e084240e9e0be39a",
    reaViewEvidenceId: "ev_f6ac70cbdd58b62b600d5f3040112390ccf2bbf81a6f1cb57e24bdd0164e09e5",
  },
  {
    id: "lightcraft",
    namuSection: "3.4",
    name: "LightCraft",
    bundleId: "ai.storyteller.lightcraft",
    formerIds: [],
    version: "0.14.0",
    gitCommit: "387bed19949f77a010dbde2cb0eddc88812d9835",
    category: "creative-media",
    industryCounterpart: "Adobe Lightroom",
    taglineKo: "32비트 부동소수점 비파괴 현상 · FNV-1a 64-bit 캐시 · SAM 3 마스크 · HDR/파노라마 병합",
    taglineEn: "Non-destructive RAW developer and photo catalog with 32-bit pipeline and SAM 3 masks",
    nativeExtension: ".lightcraft",
    color: [0xf2, 0xa5, 0x16],
    inkLight: [0x8a, 0x58, 0x00],
    inkDark: [0xff, 0xc1, 0x4d],
    webBundleSha256: "1c9257bc1f08792ba3c7c74fc985500d692c756bf0b2e449422f07066e9e0432",
    reaViewEvidenceId: "ev_0b81479a076bb29cf23d475a2211507c8547ecd118169b253a12e9508dc0fb36",
  },
  {
    id: "pdfcraft",
    namuSection: "3.5",
    name: "PdfCraft",
    bundleId: "ai.storyteller.pdfcraft",
    formerIds: ["printcraft"],
    version: "0.14.0",
    gitCommit: "13bfbd076370aa4cdbd3c37be13f1c71559560be",
    category: "publishing-design",
    industryCounterpart: "Adobe Acrobat Pro",
    taglineKo: "위장 먹칠(Faux-Redaction) 보안 감사 · 진정한 글리프 제거 · 32규칙 PDF/UA · PDF/A-2b",
    taglineEn: "Full-featured PDF editor with faux-redaction security audit, true redaction, and PDF/UA",
    nativeExtension: ".pdf",
    color: [0x12, 0xa5, 0x8a],
    inkLight: [0x0a, 0x75, 0x63],
    inkDark: [0x3f, 0xd6, 0xb8],
    webBundleSha256: "1ba6c12761afc61eb50a2ea6bf7df3fa53f106891caa83508e43167f9c407d68",
    reaViewEvidenceId: "ev_da686cbda7facfecc037f8c01358e831d354fd458ab045d5010d1869ae5c0992",
    cliBinarySha256: "5c3fdd2c98e0bda1e585af9f0d1b784c37a9dba0a127e296565f85258307f770",
    reaCliEvidenceId: "ev_13093bf9ac3ffea1a57b9c61710ebb41ee4cf0bf6ddb348419f2c5d2512c59f5",
  },
  {
    id: "effectcraft",
    namuSection: "3.6",
    name: "EffectCraft",
    bundleId: "ai.storyteller.effectcraft",
    formerIds: [],
    version: "0.17.0",
    gitCommit: "f31a6b0ae55c3c6fa64652ca48573d574c475f9c",
    category: "creative-media",
    industryCounterpart: "Adobe After Effects",
    taglineKo: "38종 블렌드 합성 · 시간/공간 베지어 키프레임 · AE 표현식(wiggle/loopOut) · Lottie & 트래킹",
    taglineEn: "Motion graphics and VFX compositor with 38 blend modes, AE expressions, and Lottie",
    nativeExtension: ".ecproj",
    color: [0xe0, 0x36, 0x8f],
    inkLight: [0xb0, 0x20, 0x6c],
    inkDark: [0xff, 0x7a, 0xb8],
    webBundleSha256: "13257eca411a55c1fb9b3e548d607d3f7722ad066181bfe017c0589af4b3d67d",
    reaViewEvidenceId: "ev_6c04e2d967c22924e5580b684d0be24c3ec50fb9891aa677975a303acdca8b92",
    cliBinarySha256: "fa8880f840c80c3231a5ba395ca4f137512ce8398c3c077d41db3f40fb083237",
    reaCliEvidenceId: "ev_ca5b6e61505fdf275cbb3bf17682fc397460dd4044341417b637e2194f1aefd8",
  },
  {
    id: "designcraft",
    namuSection: "3.7",
    name: "DesignCraft",
    bundleId: "ai.storyteller.designcraft",
    formerIds: [],
    version: "0.13.0",
    gitCommit: "18246dddd5109fb3c42b62119205ea760a8a3e03",
    category: "publishing-design",
    industryCounterpart: "Adobe InDesign",
    taglineKo: "Knuth-Plass 최적 문단 줄바꿈 조판 · CJK 루비/권점 · IDML/INDD & EPUB 3 단행본 출판",
    taglineEn: "Desktop publishing with Knuth-Plass paragraph composer, IDML/INDD, and EPUB 3",
    nativeExtension: ".designcraft",
    color: [0x7b, 0xb5, 0x1c],
    inkLight: [0x45, 0x70, 0x08],
    inkDark: [0xa6, 0xe0, 0x4a],
    webBundleSha256: "59c638881124e32e96fb6b038fbe285fad5b2e92a23aff3b8c553f588e167560",
    reaViewEvidenceId: "ev_be8b98dd35304b5ab4cb7604d523d52f0b403777b275165503eb5e7b740c7da7",
  },
  {
    id: "figcraft",
    namuSection: "3.8",
    name: "FigCraft",
    bundleId: "ai.storyteller.figcraft",
    formerIds: [],
    version: "0.11.2",
    gitCommit: "d27061036518ae84152ce122473ca0245848e396",
    category: "publishing-design",
    industryCounterpart: "Figma",
    taglineKo: "Auto Layout(Hug/Fill/Fixed) · 디자인 토큰 변수 모드 · Fractional Indexing 협업 · 코드 핸드오프",
    taglineEn: "Collaborative interface design with Auto Layout, Variables, CRDT, and code handoff",
    nativeExtension: ".figcraft",
    color: [0x02, 0xda, 0x96],
    inkLight: [0x04, 0x7a, 0x56],
    inkDark: [0x4f, 0xe8, 0xb6],
    webBundleSha256: "fa2c20820fcd59c52968ea31d9147082743ebbb1b64805484ad89242e75c7b12",
    reaViewEvidenceId: "ev_f3bc03d38d4bf1e6e2c68393b34983cb608be18fefe3a8f0c83bb48188df48f4",
  },
  {
    id: "wordcraft",
    namuSection: "3.9",
    name: "WordCraft",
    bundleId: "ai.storyteller.wordcraft",
    formerIds: [],
    version: "0.11.0",
    gitCommit: "6d3370635443408bfcc49307dc704d01ef060711",
    category: "office-audio-cad",
    industryCounterpart: "Microsoft Word",
    taglineKo: "Track Changes 리비전 병합 · pt/twips/EMU 정밀 단위 · DOCX/ODT/LaTeX & Zotero 서지 연동",
    taglineEn: "Word processor with Track Changes revisions, twips/EMU units, and Zotero citations",
    nativeExtension: ".docx",
    color: [0x3f, 0x5f, 0xe0],
    inkLight: [0x2a, 0x44, 0xb8],
    inkDark: [0x8e, 0xa2, 0xff],
    webBundleSha256: "553a50567f324921828ee40865d6270b6525f39cc2242e166762cb735e52fc63",
    reaViewEvidenceId: "ev_07ec24596f5d84f5c3b99811ba102b10647f4984e5b968674ce8967ade456ac5",
  },
  {
    id: "soundcraft",
    namuSection: "3.10",
    name: "SoundCraft",
    bundleId: "ai.storyteller.soundcraft",
    formerIds: [],
    version: "0.13.1",
    gitCommit: "e14cea42be97932cc789477c64caedfaab9c9a63",
    category: "office-audio-cad",
    industryCounterpart: "Avid Pro Tools",
    taglineKo: "Shuffle/Slip/Spot/Grid 4모드 편집 · 5대 타임베이스 · 자동 플러그인 지연 보상(ADC) · 오토메이션",
    taglineEn: "Digital audio workstation with Pro Tools edit modes, 5 timebases, and bus ADC",
    nativeExtension: ".scproj",
    color: [0x1f, 0xa5, 0xc9],
    inkLight: [0x0e, 0x72, 0x90],
    inkDark: [0x5f, 0xd0, 0xee],
    webBundleSha256: "67370b224352bbfd38dffb6b6954fe45375560ccad0036cdc9109bb65c0c7992",
    reaViewEvidenceId: "ev_da66792b93f5c0548f19fcccf18e8e8c7e4e55a003aa6a4c882ce58cff29ffa9",
    cliBinarySha256: "ad1eef56c9997939af892d487a41a8c58c8edd0af313be3472d1b281fae0ce05",
    reaCliEvidenceId: "ev_84bc10db79491cf8fa2b3a16c9af25821840f2fdeb10aceae2718996c54e1187",
  },
  {
    id: "deckcraft",
    namuSection: "3.11",
    name: "DeckCraft",
    bundleId: "ai.storyteller.deckcraft",
    formerIds: [],
    version: "0.11.1",
    gitCommit: "3418dec9eb989c0441cb77b0fb11457d2b5788f5",
    category: "office-audio-cad",
    industryCounterpart: "Microsoft PowerPoint",
    taglineKo: "슬라이드 마스터 상속 · 연속 스토리보드 개체 Morph 트랜지션 보간 · PPTX 라운드트립",
    taglineEn: "Presentation studio with Slide Masters, Morph transitions, and PPTX round-trip",
    nativeExtension: ".deckcraft",
    color: [0xf0, 0x7a, 0x1e],
    inkLight: [0xa8, 0x4f, 0x0a],
    inkDark: [0xff, 0xa0, 0x60],
    webBundleSha256: "2d9a4a126c00bbdbf1a94e53126696a7b516be8dd0bca89f883bc8e960401f60",
    reaViewEvidenceId: "ev_17b2ac0cb3abbbd93498ed840673f32a204ed7a390cfdb0ebe7dfd188f9be4da",
  },
  {
    id: "cadcraft",
    namuSection: "3.12",
    name: "CADCraft",
    bundleId: "ai.storyteller.cadcraft",
    formerIds: [],
    version: "0.13.0",
    gitCommit: "f56be0999621520a5d32826c31c4be820fc5d495",
    category: "office-audio-cad",
    industryCounterpart: "Autodesk AutoCAD",
    taglineKo: "@거리<각도 제도 커맨드 · 감쇠 가우스-뉴턴 2D 파라메트릭 기하 제약 솔버 · DXF/DWG & ACI 255",
    taglineEn: "2D CAD drafting with Damped Gauss-Newton parametric constraint solver and DXF/DWG",
    nativeExtension: ".dxf",
    color: [0x3e, 0xa6, 0xe8],
    inkLight: [0x1a, 0x6f, 0xa8],
    inkDark: [0x7c, 0xc8, 0xff],
    webBundleSha256: "6b469a13872d00697393fa26d9eeae0aca7e877e05f9c1bae7ecf3b6a4bcc800",
    reaViewEvidenceId: "ev_f18c4082b99ce8c7b8e8c0fde21733b25c50002cb1e3b0cd21d3f93d58fd95e1",
    cliBinarySha256: "979548b03d96284ac1b060cd074fce1cc24790d635c6192b5f3c27b0e99ca927",
    reaCliEvidenceId: "ev_0566ff2a6784ac45e8aa187edd0823d5786c0758724e3120ddef3439734227f8",
  },
  {
    id: "gridcraft",
    namuSection: "3.13",
    name: "GridCraft",
    bundleId: "ai.storyteller.gridcraft",
    formerIds: [],
    version: "0.12.1",
    gitCommit: "6f0e43c21b72053ef8b2886ba983dc74f3856410",
    category: "office-audio-cad",
    industryCounterpart: "Microsoft Excel",
    taglineKo: "위상 정렬 수식 엔진 · 동적 배열 스필(#SPILL!) · 유니코드 폴딩 LET/LAMBDA · Flash Fill",
    taglineEn: "Spreadsheet engine with Dynamic Arrays, Unicode-folded LET/LAMBDA, and Flash Fill",
    nativeExtension: ".xlsx",
    color: [0x1f, 0x9d, 0x55],
    inkLight: [0x12, 0x70, 0x3a],
    inkDark: [0x4f, 0xd6, 0x8a],
    webBundleSha256: "2277ef8371ac74cc956f6728c4577add24d2c289d6d022f1caabd04cf1b2f56f",
    reaViewEvidenceId: "ev_2ccdc8c281d9bc03330673d5c3747e2204dc7f108e7b2491cde4791b10401537",
    cliBinarySha256: "94002be6eca83054900befb82bdab125c8dec432829cceaeba4a0aab1f207bdd",
    reaCliEvidenceId: "ev_4af2d94b45e73b5a1c947f05664f990376aaa5f1b1533773a056b20ef46ca403",
  },
  {
    id: "anicraft",
    namuSection: "4.1",
    name: "AniCraft (미공개)",
    bundleId: "ai.storyteller.anicraft",
    formerIds: [],
    version: "0.1.0-pre",
    gitCommit: null,
    category: "unreleased-animation",
    industryCounterpart: "CLIP STUDIO EX / Toon Boom Harmony / OpenToonz",
    taglineKo: "순수 Rust 2D 셀 애니메이션 · 1k/2k/3k X-Sheet · 어니언 스키닝 · 틈새 닫기 채색 · 음소 립싱크",
    taglineEn: "Unreleased 2D cel animation studio with X-Sheet timing, onion skinning, and lip-sync",
    nativeExtension: ".anicraft",
    color: [0xff, 0x5c, 0x8a],
    inkLight: [0xb8, 0x26, 0x54],
    inkDark: [0xff, 0x94, 0xb6],
    webBundleSha256: null,
    reaViewEvidenceId: "ev_e5e15829994df22ecdad2bcffbe37425c117e21cba3c87869053be8dce403842",
  },
]);

export function srgbTripletToHex(triplet: SrgbTriplet): string {
  return `#${triplet.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `catalog::find` + `former_ids` 호환 조회 (`printcraft` -> `pdfcraft`, `flimcraft` -> `filmcraft`).
 */
export function resolveArtCraftAppById(idOrFormerId: string): ArtCraftAppCatalogEntry | null {
  const normalized = idOrFormerId.trim().toLowerCase();
  for (const entry of ARTCRAFT_SUITE_CATALOG) {
    if (
      entry.id === normalized ||
      entry.bundleId.toLowerCase() === normalized ||
      entry.formerIds.includes(normalized)
    ) {
      return entry;
    }
  }
  return null;
}

const SHELL_METACHARACTERS = new Set([
  "&",
  "|",
  ";",
  "`",
  "$",
  "<",
  ">",
  "(",
  ")",
  '"',
  "'",
  "\\",
]);

/**
 * `crates/launcher-gui/src/main.rs`의 `safe_web_link` (CWE-78 방어):
 * `http://` 또는 `https://` 스킴, 2048B 이하, 공백/제어문자 및 쉘 메타문자 포함 여부를 검사한다.
 */
export function isSafeArtCraftWebLink(url: string): boolean {
  if (url.length === 0 || url.length > 2048) return false;
  if (!url.startsWith("https://") && !url.startsWith("http://")) return false;
  const rest = url.startsWith("https://") ? url.slice(8) : url.slice(7);
  if (rest.length === 0 || rest.startsWith("/")) return false;
  for (const ch of url) {
    const code = ch.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || SHELL_METACHARACTERS.has(ch)) {
      return false;
    }
  }
  return true;
}

/**
 * `crates/launcher-core/src/installer.rs`의 `download_url_under` (CWE-180 방어):
 * 다운로드 URL이 정확히 `<repoUrl>/releases/download/<tag>/<assetName>` 경계 안에 있는지 검증한다.
 */
export function isConfinedArtCraftReleaseDownloadUrl(
  downloadUrl: string,
  repoUrl: string,
  expectedAssetName?: string,
): boolean {
  const normalizedRepo = repoUrl.replace(/\/+$/u, "");
  const prefix = `${normalizedRepo}/releases/download/`;
  if (!downloadUrl.startsWith(prefix)) return false;
  const tail = downloadUrl.slice(prefix.length);
  const slashIndex = tail.indexOf("/");
  if (slashIndex <= 0) return false;
  const tag = tail.slice(0, slashIndex);
  const name = tail.slice(slashIndex + 1);
  if (!tag || !name) return false;
  if (name.includes("/") || name.includes("..") || tag.includes("..")) {
    return false;
  }
  if (expectedAssetName !== undefined && name !== expectedAssetName) {
    return false;
  }
  return true;
}

export const ARTCRAFT_SCREENSHOT_BUDGET = Object.freeze({
  maxBytes: 2 * 1024 * 1024, // 2 MiB
  maxPixels: 8192 * 8192, // 67,108,864 pixels
});

/**
 * `crates/launcher-gui/src/screenshot_cache.rs`의 `jpeg_dimensions` (CWE-789 압축 폭탄 방어):
 * 전체 디코딩 전에 JPEG SOF0(`0xC0`), SOF1(`0xC1`), SOF2(`0xC2`) 마커에서 가로·세로 픽셀을 추출한다.
 */
export function parseJpegSofDimensions(
  bytes: Uint8Array,
): { readonly width: number; readonly height: number } | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let i = 2;
  while (i + 1 < bytes.byteLength) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    while (i < bytes.byteLength && bytes[i] === 0xff) {
      i += 1;
    }
    if (i >= bytes.byteLength) return null;
    const marker = bytes[i]!;
    i += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    if (i + 1 >= bytes.byteLength) return null;
    const segmentLength = (bytes[i]! << 8) | bytes[i + 1]!;
    if (segmentLength < 2 || i + segmentLength > bytes.byteLength) {
      return null;
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (segmentLength < 7) return null;
      const height = (bytes[i + 3]! << 8) | bytes[i + 4]!;
      const width = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      return { width, height };
    }
    i += segmentLength;
  }
  return null;
}

export function isScreenshotWithinArtCraftBudget(bytes: Uint8Array): {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly dimensions?: { readonly width: number; readonly height: number };
} {
  if (bytes.byteLength > ARTCRAFT_SCREENSHOT_BUDGET.maxBytes) {
    return { allowed: false, reason: "ScreenshotExceedsMaxByteBudget" };
  }
  const dims = parseJpegSofDimensions(bytes);
  if (dims) {
    const totalPixels = dims.width * dims.height;
    if (dims.width <= 0 || dims.height <= 0 || totalPixels > ARTCRAFT_SCREENSHOT_BUDGET.maxPixels) {
      return {
        allowed: false,
        reason: "JpegDecompressionBombPixelBudgetExceeded",
        dimensions: dims,
      };
    }
    return { allowed: true, dimensions: dims };
  }
  return { allowed: true };
}

export interface ParsedArtCraftVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly preRelease: string | null;
}

/**
 * `crates/launcher-core/src/version.rs`의 `parse_package` 호환 버전 파서:
 * `v` 접두사, Debian epoch(`1:`), Debian revision(`-1`), AUR VCS(`.r12.gdeadbeef`), `~beta1`을 정규화한다.
 */
export function parseArtCraftPackageVersion(raw: string): ParsedArtCraftVersion | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith("v") || cleaned.startsWith("V")) {
    cleaned = cleaned.slice(1);
  }
  const colonIdx = cleaned.indexOf(":");
  if (colonIdx !== -1) {
    const epochStr = cleaned.slice(0, colonIdx);
    if (epochStr.length > 0 && /^\d+$/u.test(epochStr)) {
      cleaned = cleaned.slice(colonIdx + 1);
    }
  }
  const dashIdx = cleaned.lastIndexOf("-");
  const upstream = dashIdx !== -1 ? cleaned.slice(0, dashIdx) : cleaned;
  const normalized = upstream.replace(/~/gu, "-");
  const [corePart = "", prePart] = normalized.split("-", 2);
  const segments = corePart.split(".");
  if (segments.length < 2) return null;

  const major = Number.parseInt(segments[0] ?? "", 10);
  const minor = Number.parseInt(segments[1] ?? "", 10);
  const patch = segments.length >= 3 ? Number.parseInt(segments[2] ?? "0", 10) : 0;
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }
  return {
    major,
    minor,
    patch,
    preRelease: prePart ?? null,
  };
}

export function parseSha256SumsManifest(text: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/u.exec(line);
    if (match) {
      map.set(match[2]!.trim(), match[1]!.toLowerCase());
    }
  }
  return map;
}

export type CraftAiRole =
  | "segmentation-sam3"
  | "inpaint-outpaint"
  | "upscale-denoise"
  | "stt-whisper"
  | "tts-kokoro"
  | "llm-script-assistant";

export interface CraftAiRouteDecision {
  readonly role: CraftAiRole;
  readonly preferOffline: boolean;
  readonly selectedEngine: string;
  readonly executionTarget: "local-rust-candle-rten" | "cloud-provider";
  readonly estimatedVramMb: number;
}

export function routeCraftAiTask(
  role: CraftAiRole,
  preferOffline = true,
): CraftAiRouteDecision {
  if (role === "segmentation-sam3") {
    return {
      role,
      preferOffline,
      selectedEngine: "craft-ai-sam3 (local rten/Burn ViT-B)",
      executionTarget: "local-rust-candle-rten",
      estimatedVramMb: 780,
    };
  }
  if (role === "stt-whisper" || role === "tts-kokoro") {
    return {
      role,
      preferOffline,
      selectedEngine: role === "stt-whisper" ? "Whisper-tiny/base (Candle)" : "Kokoro-82M / Formant TTS",
      executionTarget: "local-rust-candle-rten",
      estimatedVramMb: 420,
    };
  }
  if (preferOffline) {
    return {
      role,
      preferOffline,
      selectedEngine: "Local Burn/Candle + ComfyUI Bridge",
      executionTarget: "local-rust-candle-rten",
      estimatedVramMb: 2048,
    };
  }
  return {
    role,
    preferOffline,
    selectedEngine: "Cloud Hybrid (Gemini / OpenAI / Anthropic / FLUX)",
    executionTarget: "cloud-provider",
    estimatedVramMb: 0,
  };
}
