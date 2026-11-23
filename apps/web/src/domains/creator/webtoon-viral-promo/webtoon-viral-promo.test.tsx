// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { WebtoonViralPromoPanel } from "./WebtoonViralPromoPanel";
import {
  DEFAULT_FANDOM_WIDGET_INPUT,
  DEFAULT_GLOBAL_IP_REVENUE_PARAMS,
  buildFandomReactionWidgetSpec,
  buildLaunchPromotionChecklist,
  simulateGlobalIpRevenue,
} from "./fandom-widget-and-ip-revenue";
import {
  DEFAULT_WEBTOON_PROMO_INPUT,
  PROMO_MOOD_THEME_LIST,
  buildSnsTeaserCardPack,
  buildStandalonePromoLandingHtml,
  escapeHtml,
  sanitizeExternalUrl,
  type WebtoonPromoInput,
} from "./viral-landing-builder";

describe("webtoon-viral-promo: 정적 홍보 랜딩 · 3종 SNS SVG · 팬덤 위젯 · 투명 IP 수익 시뮬레이터", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("HTML 이스케이프와 URL 프로토콜 차단으로 XSS 페이로드를 완전히 무력화한다", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;",
    );
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeExternalUrl("https://comic.naver.com/webtoon?id=1")).toBe(
      "https://comic.naver.com/webtoon?id=1",
    );

    const hostileInput: WebtoonPromoInput = {
      title: `위험한 <script>alert(1)</script> 웹툰`,
      tagline: `<img src=x onerror="evil()"> '태그라인'`,
      genre: `스릴러 & "미스터리"`,
      authorName: `작가<b>해커</b>`,
      highlightCutCaptions: [
        `<svg onload=alert(1)>컷1`,
        `"><script>hack()</script>컷2`,
        `컷3 & '테스트'`,
      ],
      platformLinks: {
        naverWebtoon: "javascript:alert('xss')",
        kakaoPage: "https://page.kakao.com/content/123",
        x: "vbscript:msgbox(1)",
        instagram: "https://instagram.com/safe_author",
        youtube: "data:text/html,boom",
      },
      canonicalUrl: "javascript:void(0)",
      moodTheme: "midnight-thriller",
    };

    const html = buildStandalonePromoLandingHtml(hostileInput);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("vbscript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("https://page.kakao.com/content/123");
    expect(html).toContain("https://instagram.com/safe_author");
  });

  it("단일 파일 정적 홍보 HTML에 OpenGraph/Twitter 메타태그·3컷 스트립·구독 CTA·저작권이 포함되고 외부 CDN이 0건이다", () => {
    for (const theme of PROMO_MOOD_THEME_LIST) {
      const html = buildStandalonePromoLandingHtml({
        ...DEFAULT_WEBTOON_PROMO_INPUT,
        moodTheme: theme.id,
        canonicalUrl: "https://example.com/starlight-paper",
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain(`property="og:title"`);
      expect(html).toContain(`property="og:description"`);
      expect(html).toContain(`property="og:url" content="https://example.com/starlight-paper"`);
      expect(html).toContain(`name="twitter:card" content="summary_large_image"`);
      expect(html).toContain(`name="twitter:title"`);
      expect(html).toContain(`name="twitter:description"`);
      expect(html).toContain("CUT 01");
      expect(html).toContain("CUT 02");
      expect(html).toContain("CUT 03");
      expect(html).toContain("네이버웹툰에서 보기");
      expect(html).toContain("카카오페이지에서 보기");
      expect(html).toContain("© 2026 한별 스튜디오. All rights reserved.");
      expect(html).toContain(theme.bg);
      // 외부 CDN/외부 스크립트/외부 스타일시트 0건 검증
      expect(html).not.toMatch(/<script\b[^>]*src=/i);
      expect(html).not.toMatch(/<link\b[^>]*rel=["']stylesheet["']/i);
      expect(html).not.toMatch(/fonts\.googleapis|cdn\.jsdelivr|unpkg\.com/i);
    }
  });

  it("인스타그램 4:5 · X 16:9 · 유튜브 커뮤니티 1:1 3종 SNS SVG 뷰박스와 해시태그/후킹 카피를 정확히 생성한다", () => {
    const pack = buildSnsTeaserCardPack({
      ...DEFAULT_WEBTOON_PROMO_INPUT,
      title: `검은 <달>의 기록`,
      moodTheme: "ink-action",
    });

    expect(pack.cards).toHaveLength(3);
    const [ig, x, yt] = pack.cards;

    expect(ig.id).toBe("instagram");
    expect(ig.aspectRatio).toBe("4:5");
    expect(ig.viewBox).toBe("0 0 1080 1350");
    expect(ig.svg).toContain(`viewBox="0 0 1080 1350"`);
    expect(ig.svg).toContain("&lt;달&gt;");
    expect(ig.svg).not.toContain("<달>");

    expect(x.id).toBe("x");
    expect(x.aspectRatio).toBe("16:9");
    expect(x.viewBox).toBe("0 0 1200 675");
    expect(x.svg).toContain(`viewBox="0 0 1200 675"`);

    expect(yt.id).toBe("youtube-community");
    expect(yt.aspectRatio).toBe("1:1");
    expect(yt.viewBox).toBe("0 0 1080 1080");
    expect(yt.svg).toContain(`viewBox="0 0 1080 1080"`);

    for (const card of pack.cards) {
      expect(card.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(card.hookCopy.length).toBeGreaterThan(20);
      expect(card.svg).toContain(`xmlns="http://www.w3.org/2000/svg"`);
    }
    expect(pack.combinedCopyText).toContain("인스타그램 4:5");
    expect(pack.combinedCopyText).toContain("X(트위터) 16:9");
    expect(pack.combinedCopyText).toContain("유튜브 커뮤니티 1:1");
  });

  it("팬덤 4종 컷 리액션·투표 위젯 JSON/정적 임베드 HTML과 D-14~D+7 런칭 체크리스트를 안전하게 생성한다", () => {
    const spec = buildFandomReactionWidgetSpec({
      ...DEFAULT_FANDOM_WIDGET_INPUT,
      workTitle: `종이공방</script><script>alert(1)</script>`,
      pollCategory: "character-popularity",
      pollQuestion: `가장 좋아하는 <캐릭터>는?`,
      pollOptions: ["세라", "카일", `악역"보스"`],
    });

    const parsed = JSON.parse(spec.configJson) as {
      schemaVersion: string;
      storageMode: string;
      reactions: { id: string; label: string }[];
      poll: { category: string; options: { label: string }[] };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.fandom-widget.v1");
    expect(parsed.storageMode).toBe("browser-local-only");
    expect(parsed.reactions.map((r) => r.label)).toEqual(["심쿵", "소름", "명대사", "다음화기대"]);
    expect(parsed.poll.category).toBe("character-popularity");
    expect(parsed.poll.options).toHaveLength(3);

    expect(spec.embedHtml).toContain(`role="radiogroup"`);
    expect(spec.embedHtml).toContain(`aria-pressed="false"`);
    expect(spec.embedHtml).toContain("인기 캐릭터 투표");
    expect(spec.embedHtml).toContain("localStorage");
    expect(spec.embedHtml).not.toContain("</script><script>alert(1)</script>");
    expect(spec.embedHtml).toContain("&lt;캐릭터&gt;");

    const checklist = buildLaunchPromotionChecklist({
      workTitle: DEFAULT_WEBTOON_PROMO_INPUT.title,
      genre: DEFAULT_WEBTOON_PROMO_INPUT.genre,
      platformLinks: DEFAULT_WEBTOON_PROMO_INPUT.platformLinks,
      hasGlobalPlan: true,
      hasGoodsPlan: true,
    });
    expect(checklist.rangeLabel).toBe("D-14 ~ D+7");
    expect(checklist.items.map((item) => item.dayOffset)).toContain("D-14");
    expect(checklist.items.map((item) => item.dayOffset)).toContain("D+7");
    expect(checklist.items.some((item) => item.category === "rights-bom")).toBe(true);
    expect(checklist.items.some((item) => item.category === "hook-check")).toBe(true);
    expect(checklist.items.some((item) => item.category === "teaser-shortform")).toBe(true);
    expect(checklist.items.some((item) => item.category === "community")).toBe(true);
  });

  it("글로벌 IP 수익 시뮬레이터의 수수료·원천징수 3.3% 정확도, 단조성, 음수 방어 및 손익분기 회차를 검증한다", () => {
    // 1) 수수료 30% + 원천징수 3.3% 정확도 검증 (단일 한국 유료 미리보기 시나리오)
    const exactCheck = simulateGlobalIpRevenue({
      monthlyFreeReaders: 10_000,
      krPaidConversionRatePct: 10,
      krPreviewPriceKrw: 1_000,
      krPaidEpisodesPerReader: 1,
      krPlatformFeePct: 30,
      episodesPerMonth: 4,
      productionCostPerEpisodeKrw: 100_000,
      enableJapanLaunch: false,
      japanReaderRatioPct: 0,
      japanRevenueSharePct: 35,
      japanArpuKrw: 0,
      enableNorthAmericaLaunch: false,
      northAmericaReaderRatioPct: 0,
      northAmericaRevenueSharePct: 35,
      northAmericaArpuKrw: 0,
      goodsKeyringMonthlyUnits: 0,
      goodsKeyringNetMarginKrw: 0,
      goodsBookSeasonUnits: 0,
      goodsBookNetMarginKrw: 0,
      withholdingTaxPct: 3.3,
      seasonMonths: 3,
    });

    // 총매출 1,000,000원 -> 수수료 300,000원 -> 세전 700,000원 -> 원천징수 3.3% (23,100원) -> 실수령 676,900원
    expect(exactCheck.scenarios.base.monthlyGrossRevenueKrw).toBe(1_000_000);
    expect(exactCheck.scenarios.base.monthlyPlatformFeesKrw).toBe(300_000);
    expect(exactCheck.scenarios.base.monthlyPreTaxPayoutKrw).toBe(700_000);
    expect(exactCheck.scenarios.base.monthlyWithholdingTaxKrw).toBe(23_100);
    expect(exactCheck.scenarios.base.monthlyNetPayoutKrw).toBe(676_900);
    expect(exactCheck.scenarios.base.seasonNetPayoutKrw).toBe(2_030_700);
    // 회당 실수령 169,225원 - 제작비 100,000원 = 69,225원/화 -> 무료 3화 원가 300,000원 회수 = ceil(300000/69225)=5 -> 3+5=8화
    expect(exactCheck.scenarios.base.breakEvenEpisodeCount).toBe(8);
    expect(exactCheck.disclaimer).toContain("가정");
    expect(exactCheck.disclaimer).toContain("추정치");

    // 2) 시나리오 순서 및 단조성 검증
    const lowReaders = simulateGlobalIpRevenue({
      ...DEFAULT_GLOBAL_IP_REVENUE_PARAMS,
      monthlyFreeReaders: 20_000,
      enableJapanLaunch: false,
      enableNorthAmericaLaunch: false,
    });
    const highReaders = simulateGlobalIpRevenue({
      ...DEFAULT_GLOBAL_IP_REVENUE_PARAMS,
      monthlyFreeReaders: 80_000,
      enableJapanLaunch: false,
      enableNorthAmericaLaunch: false,
    });
    const withGlobal = simulateGlobalIpRevenue({
      ...DEFAULT_GLOBAL_IP_REVENUE_PARAMS,
      monthlyFreeReaders: 80_000,
      enableJapanLaunch: true,
      enableNorthAmericaLaunch: true,
    });
    const higherFee = simulateGlobalIpRevenue({
      ...DEFAULT_GLOBAL_IP_REVENUE_PARAMS,
      monthlyFreeReaders: 80_000,
      krPlatformFeePct: 45,
      enableJapanLaunch: true,
      enableNorthAmericaLaunch: true,
    });

    expect(lowReaders.scenarios.conservative.monthlyNetPayoutKrw).toBeLessThanOrEqual(
      lowReaders.scenarios.base.monthlyNetPayoutKrw,
    );
    expect(lowReaders.scenarios.base.monthlyNetPayoutKrw).toBeLessThanOrEqual(
      lowReaders.scenarios.optimistic.monthlyNetPayoutKrw,
    );
    expect(highReaders.scenarios.base.monthlyNetPayoutKrw).toBeGreaterThan(
      lowReaders.scenarios.base.monthlyNetPayoutKrw,
    );
    expect(withGlobal.scenarios.base.monthlyNetPayoutKrw).toBeGreaterThan(
      highReaders.scenarios.base.monthlyNetPayoutKrw,
    );
    expect(higherFee.scenarios.base.monthlyNetPayoutKrw).toBeLessThan(
      withGlobal.scenarios.base.monthlyNetPayoutKrw,
    );

    // 3) 음수·NaN 방어 검증
    const hostileNumbers = simulateGlobalIpRevenue({
      ...DEFAULT_GLOBAL_IP_REVENUE_PARAMS,
      monthlyFreeReaders: -50_000,
      krPaidConversionRatePct: Number.NaN,
      krPreviewPriceKrw: -500,
      goodsKeyringMonthlyUnits: -100,
      goodsBookSeasonUnits: Number.NEGATIVE_INFINITY,
      withholdingTaxPct: -10,
    });
    expect(hostileNumbers.scenarios.base.monthlyNetPayoutKrw).toBe(0);
    expect(hostileNumbers.scenarios.optimistic.monthlyNetPayoutKrw).toBe(0);
    expect(hostileNumbers.scenarios.base.breakEvenEpisodeCount).toBeNull();
  });

  it("WebtoonViralPromoPanel UI 렌더링·탭 전환·다운로드 트리거·슬라이더 갱신 및 EN 모드를 검증한다", () => {
    const createObjectUrlSpy = vi.fn(() => "blob:promo-download-url");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrlSpy, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrlSpy, configurable: true });
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<WebtoonViralPromoPanel />);

    // 1번 탭 기본 렌더링 확인
    expect(screen.getByText("완성 웹툰 바이럴 홍보 스튜디오")).toBeTruthy();
    expect(screen.getByText("100% 로컬 생성 · 외부 CDN 0건")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "홍보 랜딩·SNS 카드 팩" }).getAttribute("aria-selected")).toBe("true");

    // 무드 테마 전환 + 작품 제목 수정 + 코드 미리보기 열기 + HTML 다운로드·복사 트리거
    fireEvent.click(screen.getByRole("button", { name: /미드나잇 스릴러/ }));
    expect(screen.getByRole("button", { name: /미드나잇 스릴러/ }).getAttribute("aria-pressed")).toBe("true");

    const titleInput = screen.getByLabelText("작품 제목");
    fireEvent.change(titleInput, { target: { value: "달빛 만화방 24시" } });
    fireEvent.click(screen.getByRole("button", { name: "HTML 미리보기 코드" }));
    expect(screen.getByText(/달빛 만화방 24시 — 한별 스튜디오/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "랜딩 HTML 다운로드" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:promo-download-url");

    fireEvent.click(screen.getByRole("button", { name: "HTML 코드 복사" }));
    expect(screen.getByRole("status").textContent).toContain("복사했습니다");

    // SNS SVG 다운로드 트리거
    const svgDownloadButtons = screen.getAllByRole("button", { name: "SVG 다운로드" });
    expect(svgDownloadButtons).toHaveLength(3);
    fireEvent.click(svgDownloadButtons[0]);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);

    // 2번 탭 전환: 팬덤 리액션·투표 위젯 + 런칭 체크리스트
    fireEvent.click(screen.getByRole("tab", { name: "팬덤 리액션·투표 위젯" }));
    expect(screen.getByText("심쿵")).toBeTruthy();
    expect(screen.getByText("다음화기대")).toBeTruthy();
    expect(screen.getByText("1 / 7")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "인기 캐릭터 투표" }));
    fireEvent.click(screen.getByRole("button", { name: "JSON 보기 전환" }));
    expect(screen.getByText(/"toonstudio.fandom-widget.v1"/)).toBeTruthy();
    expect(screen.getByText(/"character-popularity"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "위젯 HTML 내보내기" }));
    fireEvent.click(screen.getByRole("button", { name: "설정 JSON 내보내기" }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(4);

    const free3Checkbox = screen.getByLabelText(/무료 공개 3화 훅·엔딩 절단 점검/);
    fireEvent.click(free3Checkbox);
    expect(screen.getByText("2 / 7")).toBeTruthy();

    // 3번 탭 전환: IP 수익 시뮬레이터 + 슬라이더 및 글로벌 권역 토글 변화 검증
    fireEvent.click(screen.getByRole("tab", { name: "IP 수익 시뮬레이터" }));
    expect(screen.getByText(/가정 기반 로컬 수식 시뮬레이션/)).toBeTruthy();

    const readersSlider = screen.getByLabelText(/월 무료 유입 독자 수/);
    const beforeBaseText = screen.getAllByText(/\/월/)[1]?.parentElement?.textContent ?? "";
    fireEvent.change(readersSlider, { target: { value: "200000" } });
    const afterBaseText = screen.getAllByText(/\/월/)[1]?.parentElement?.textContent ?? "";
    expect(afterBaseText).not.toBe(beforeBaseText);

    const jpToggle = screen.getByLabelText(/일본 번역 연재 포함/);
    fireEvent.click(jpToggle);
    const afterJpOffText = screen.getAllByText(/\/월/)[1]?.parentElement?.textContent ?? "";
    expect(afterJpOffText).not.toBe(afterBaseText);
  });

  it("생성된 HTML/SVG 산출물과 패널 DOM 전수에 raw hex/rgb/hsl이 0건이며 EN 모드 크롬이 정상 전환된다", () => {
    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

    for (const theme of PROMO_MOOD_THEME_LIST) {
      const html = buildStandalonePromoLandingHtml({
        ...DEFAULT_WEBTOON_PROMO_INPUT,
        moodTheme: theme.id,
      });
      expect(rawColorRegex.test(html), `landing HTML (${theme.id}) must avoid raw hex/rgb/hsl`).toBe(false);

      const sns = buildSnsTeaserCardPack({
        ...DEFAULT_WEBTOON_PROMO_INPUT,
        moodTheme: theme.id,
      });
      for (const card of sns.cards) {
        expect(rawColorRegex.test(card.svg), `SNS SVG (${theme.id}/${card.id}) must avoid raw hex/rgb/hsl`).toBe(false);
      }

      const widget = buildFandomReactionWidgetSpec({
        ...DEFAULT_FANDOM_WIDGET_INPUT,
        moodTheme: theme.id,
      });
      expect(rawColorRegex.test(widget.embedHtml), `widget HTML (${theme.id}) must avoid raw hex/rgb/hsl`).toBe(false);
    }

    // EN 모드 렌더링 확인 (3개 탭 전체 + DOM raw color/transition-all 0건)
    useI18n.setState({ lang: "en" });
    const { container } = render(
      <WebtoonViralPromoPanel
        initialTitle="Starlight Paper Studio"
        initialAuthorName="Hanbyeol Studio"
        initialGenre="Fantasy Romance"
      />,
    );
    expect(screen.getByText("Webtoon Viral Promo Studio")).toBeTruthy();
    expect(screen.getByText("100% Local · 0 External CDNs")).toBeTruthy();
    expect(container.innerHTML.includes("transition-all")).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: "Fandom Widget & Launch" }));
    expect(screen.getByText("D-14 to D+7 Launch Promo Checklist")).toBeTruthy();
    expect(screen.getByText("Heart-flutter")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "IP Revenue Simulator" }));
    expect(screen.getByText(/Assumption-based local formula simulation/)).toBeTruthy();
    expect(screen.getByText("Conservative (65%)")).toBeTruthy();
    expect(screen.getByText("Optimistic (145%)")).toBeTruthy();
  });
});
