/**
 * 판매자 센터 정본 선언 (S1-5, BLUEPRINT §1.2 · personal P-5).
 *
 * 판매 표면은 셋으로 흩어져 있었다 — 등록(/market/publish), 서버 패키지
 * 관리(/market/manage), 포인트 판매대(/market/seller). 이제 정본은
 * /market/seller(판매자 센터) 하나이고, 나머지 둘은 센터의 탭으로
 * 재정의한다. URL은 지우지 않는다: 구 URL은 탭의 딥링크로 그대로
 * 동작하고, 내비 노출은 판매자 센터 하나로 수렴한다.
 */

/** 판매자 센터 정본 경로. 내비가 가리키는 유일한 판매 입구다. */
export const SELLER_CENTER_PATH = "/market/seller";

/** 등록 탭 딥링크 — 단계형 마법사(제작 워크숍 + 5단계 게시)가 열리는 경로. */
export const SELLER_REGISTER_PATH = "/market/publish";

/** 패키지 관리 탭 딥링크 — 서버 패키지 head·공개 상태를 관리하는 경로. */
export const SELLER_PACKAGES_PATH = "/market/manage";

export type SellerCenterTabId = "center" | "register" | "packages";

export interface SellerCenterTab {
  readonly id: SellerCenterTabId;
  readonly href: string;
  /** [ko, en] — MarketNavHeader의 라벨 튜플 관례를 따른다. */
  readonly label: readonly [string, string];
  readonly description: readonly [string, string];
}

/** 센터 탭은 이 순서가 유일한 정본이다. 내비·페이지 상단 탭이 함께 소비한다. */
export const SELLER_CENTER_TABS: readonly SellerCenterTab[] = [
  {
    id: "center",
    href: SELLER_CENTER_PATH,
    label: ["판매자 센터", "Seller center"],
    description: [
      "포인트 판매·공동구매 현황과 내 판매를 한곳에서 봅니다.",
      "Point sales, group buys, and your sales in one place.",
    ],
  },
  {
    id: "register",
    href: SELLER_REGISTER_PATH,
    label: ["에셋 등록", "Register asset"],
    description: [
      "단계형 마법사로 새 에셋을 서버에 게시합니다.",
      "Publish a new asset to the server with the step wizard.",
    ],
  },
  {
    id: "packages",
    href: SELLER_PACKAGES_PATH,
    label: ["패키지 관리", "Package management"],
    description: [
      "게시한 서버 패키지의 공개 상태와 버전을 관리합니다.",
      "Manage listing status and versions of your server packages.",
    ],
  },
];

/**
 * 경로가 어느 센터 탭에 속하는지. 딥링크 URL이 바뀌지 않았으므로
 * 판정은 정확 일치만으로 충분하고, 모르는 경로는 null(탭 없음)이다.
 */
export function sellerCenterTabForPath(pathname: string): SellerCenterTabId | null {
  const normalized = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  switch (normalized) {
    case SELLER_CENTER_PATH:
      return "center";
    case SELLER_REGISTER_PATH:
      return "register";
    case SELLER_PACKAGES_PATH:
      return "packages";
    default:
      return null;
  }
}

/** 포인트 리스팅 등록 마법사의 단계. MarketSellerDashboard가 순서대로 소비한다. */
export const SELLER_LISTING_WIZARD_STEPS = [
  { id: "details", label: ["기본 정보", "Basics"] },
  { id: "pricing", label: ["설명·가격", "Description & price"] },
  { id: "review", label: ["확인·등록", "Review & create"] },
] as const;

export type SellerListingWizardStepId =
  (typeof SELLER_LISTING_WIZARD_STEPS)[number]["id"];
