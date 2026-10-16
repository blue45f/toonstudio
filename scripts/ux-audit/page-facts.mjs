/**
 * 브라우저 안에서 화면의 "사실"을 모으는 단일 함수. `page.evaluate(collectPageFacts)` 로 실행되므로 자급자족해야 한다.
 * 사실만 모으고 위반 판정(제목 건너뜀, 팔레트 클래스, 번역 키 등)은 Node 쪽 순수 함수가 한다.
 * 각 구역은 독립적으로 try/catch 되어, 한 구역이 실패해도 나머지는 남는다.
 */
export function collectPageFacts(size) {
  const result = {};
  // 모바일 에뮬레이션에서 가로로 넘치는 문서는 window.innerWidth/innerHeight 가 늘어나므로 레이아웃 뷰포트 폭(clientWidth)과
  // 측정 프로필의 높이를 기준으로 삼는다.
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = size && size.height ? size.height : window.innerHeight;
  const safe = (name, build) => {
    try {
      result[name] = build();
    } catch (error) {
      result[name] = { error: String((error && error.message) || error) };
    }
  };

  const describe = (element) => {
    if (!element || !element.tagName) return "";
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = (element.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map((name) => `.${name}`).join("");
    const text = (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${tag}${id}${classes}${text ? ` "${text}"` : ""}`.slice(0, 120);
  };

  const styleCache = new WeakMap();
  const styleOf = (element) => {
    let style = styleCache.get(element);
    if (!style) {
      style = getComputedStyle(element);
      styleCache.set(element, style);
    }
    return style;
  };
  const canCheckVisibility = typeof Element.prototype.checkVisibility === "function";
  /** overflow 로 내용을 자르는 조상의 안쪽 사각형을 캐시한다(position:fixed 조상 위로는 올라가지 않는다). */
  const clipRectCache = new WeakMap();
  const clipRectOf = (ancestor) => {
    let known = clipRectCache.get(ancestor);
    if (known === undefined) {
      const style = styleOf(ancestor);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const rect = ancestor.getBoundingClientRect();
        known = {
          left: rect.left + ancestor.clientLeft,
          top: rect.top + ancestor.clientTop,
          right: rect.left + ancestor.clientLeft + ancestor.clientWidth,
          bottom: rect.top + ancestor.clientTop + ancestor.clientHeight,
          fixed: style.position === "fixed",
        };
      } else {
        known = { none: true, fixed: style.position === "fixed" };
      }
      clipRectCache.set(ancestor, known);
    }
    return known;
  };
  /** 조상의 overflow 에 완전히 잘려 화면에 하나도 보이지 않는지. */
  const clippedAway = (element, rect) => {
    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      const clip = clipRectOf(current);
      if (!clip.none && (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom)) return true;
      if (clip.fixed) break;
      current = current.parentElement;
    }
    return false;
  };
  /**
   * 사용자가 실제로 볼 수 있는 요소의 사각형. display:none · content-visibility:hidden(닫힌 details 포함) · visibility:hidden ·
   * 조상 opacity:0 · overflow 에 완전히 잘린 요소는 null.
   */
  const visibleRect = (element) => {
    if (canCheckVisibility && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (!canCheckVisibility) {
      const style = styleOf(element);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return null;
    }
    if (clippedAway(element, rect)) return null;
    return rect;
  };
  /** 보조기기에 노출되는지: display:none · content-visibility:hidden · visibility:hidden · hidden/aria-hidden/inert 가 아니다. 투명(opacity:0)·sr-only 는 노출된다. */
  const exposedToAssistive = (element) => {
    if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    if (canCheckVisibility) return element.checkVisibility({ checkVisibilityCSS: true });
    return element.getClientRects().length > 0 && styleOf(element).visibility !== "hidden";
  };

  const clipCache = new WeakMap();
  /** 이 요소가 가로로 자식을 잘라 내거나 스크롤시키는 컨테이너이고 뷰포트 안에 있으면 그 사각형을 돌려준다. */
  const containingClip = (element) => {
    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      let hit = clipCache.get(current);
      if (hit === undefined) {
        const overflowX = styleOf(current).overflowX;
        hit = null;
        if (overflowX !== "visible") {
          const rect = current.getBoundingClientRect();
          if (rect.right <= viewportWidth + 1 && rect.left >= -1) hit = rect;
        }
        clipCache.set(current, hit);
      }
      if (hit) return hit;
      current = current.parentElement;
    }
    return null;
  };

  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="slider"], [role="combobox"], [role="textbox"], [role="searchbox"], [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';
  const interactive = [];
  for (const element of document.querySelectorAll(INTERACTIVE)) {
    if (element.disabled || element.getAttribute("aria-disabled") === "true") continue;
    if (element.closest("[hidden], [inert]")) continue;
    const rect = visibleRect(element);
    if (!rect) continue;
    // sr-only 처럼 1px 로 접힌 요소는 눈에 보이지 않으므로 탭 대상이 아니다.
    if (rect.width <= 1 || rect.height <= 1) continue;
    interactive.push({ element, rect });
  }

  safe("layout", () => {
    const doc = document.documentElement;
    const scrollWidth = Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const clientWidth = doc.clientWidth;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);
    const offenders = [];
    if (overflowPx > 1) {
      for (const element of document.body.querySelectorAll("*")) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.right <= clientWidth + 1) continue;
        if (styleOf(element).position === "fixed") continue;
        if (containingClip(element)) continue;
        offenders.push({ element, over: Math.round(rect.right - clientWidth) });
      }
      offenders.sort((left, right) => right.over - left.over);
    }
    return {
      scrollWidth,
      clientWidth,
      overflowPx,
      offenders: offenders.slice(0, 8).map((entry) => ({ over: entry.over, element: describe(entry.element) })),
    };
  });

  safe("clipped", () => {
    const candidates = document.querySelectorAll("a[href], button, input:not([type=\"hidden\"]), select, textarea, h1, h2, h3, h4, h5, h6, img, video, canvas, p, li, label, summary");
    const flagged = new Set();
    const details = new Map();
    for (const element of candidates) {
      const rect = visibleRect(element);
      if (!rect || rect.width <= 1 || rect.height <= 1) continue;
      if (rect.right <= 0 || rect.left >= viewportWidth) continue;
      const overRight = rect.right - viewportWidth;
      const overLeft = -rect.left;
      if (overRight <= 2 && overLeft <= 2) continue;
      if (containingClip(element)) continue;
      flagged.add(element);
      details.set(element, Math.round(Math.max(overRight, overLeft)));
    }
    const outermost = [...flagged].filter((element) => {
      let parent = element.parentElement;
      while (parent) {
        if (flagged.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
    return {
      count: outermost.length,
      samples: outermost.slice(0, 8).map((element) => ({ over: details.get(element), element: describe(element) })),
    };
  });

  safe("obscured", () => {
    const covered = [];
    const temporary = [];
    let inspected = 0;
    const scrollable = document.documentElement.scrollHeight > viewportHeight + 1;
    const anchorCache = new WeakMap();
    /** 뷰포트에 고정(fixed)·고착(sticky)된 요소이거나 그 안에 있으면 스크롤해도 같은 자리에 머문다. */
    const anchored = (element) => {
      let current = element;
      const chain = [];
      let result = false;
      while (current && current !== document.documentElement) {
        const known = anchorCache.get(current);
        if (known !== undefined) {
          result = known;
          break;
        }
        chain.push(current);
        const position = styleOf(current).position;
        if (position === "fixed" || position === "sticky") {
          result = true;
          break;
        }
        current = current.parentElement;
      }
      for (const entry of chain) anchorCache.set(entry, result);
      return result;
    };
    // 모달 대화상자가 열려 있으면 뒤쪽 화면은 의도적으로 비활성이므로 모달 안의 컨트롤만 본다.
    const modal = Array.from(document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')).find((candidate) => visibleRect(candidate));
    for (const { element, rect } of interactive) {
      if (modal && !modal.contains(element)) continue;
      if (rect.bottom <= 0 || rect.top >= viewportHeight || rect.right <= 0 || rect.left >= viewportWidth) continue;
      inspected += 1;
      if (inspected > 400) break;
      const left = Math.max(rect.left, 0);
      const top = Math.max(rect.top, 0);
      const right = Math.min(rect.right, viewportWidth - 1);
      const bottom = Math.min(rect.bottom, viewportHeight - 1);
      if (right - left < 2 || bottom - top < 2) continue;
      const points = [
        [(left + right) / 2, (top + bottom) / 2],
        [left + (right - left) * 0.25, top + (bottom - top) * 0.25],
        [left + (right - left) * 0.75, top + (bottom - top) * 0.25],
        [left + (right - left) * 0.25, top + (bottom - top) * 0.75],
        [left + (right - left) * 0.75, top + (bottom - top) * 0.75],
      ];
      let hidden = 0;
      let cover = null;
      for (const [x, y] of points) {
        const topmost = document.elementFromPoint(x, y);
        if (!topmost || topmost === element || element.contains(topmost) || topmost.contains(element)) continue;
        const label = topmost.closest("label");
        if (label && (label.contains(element) || (element.labels && Array.from(element.labels).includes(label)))) continue;
        hidden += 1;
        cover = topmost;
      }
      if (hidden < 3) continue;
      // 고정 요소(하단 바·플레이어)가 스크롤하는 본문 컨트롤을 일시적으로 덮는 경우는 스크롤하면 풀리므로 점수에서 뺀다.
      const entry = { element: describe(element), cover: describe(cover) };
      if (scrollable && anchored(cover) && !anchored(element)) temporary.push(entry);
      else covered.push(entry);
    }
    return { count: covered.length, inspected, temporaryCount: temporary.length, samples: covered.slice(0, 8), temporarySamples: temporary.slice(0, 5) };
  });

  safe("tapTargets", () => {
    let small44 = 0;
    let small40 = 0;
    let small24 = 0;
    let inlineExempt = 0;
    const smallest = [];
    for (const { element, rect } of interactive) {
      let width = rect.width;
      let height = rect.height;
      const type = element.getAttribute("type");
      if (element.tagName === "INPUT" && (type === "checkbox" || type === "radio")) {
        const label = element.labels && element.labels[0] ? element.labels[0] : element.closest("label");
        if (label) {
          const labelRect = label.getBoundingClientRect();
          width = Math.max(width, labelRect.width);
          height = Math.max(height, labelRect.height);
        }
      }
      const style = styleOf(element);
      const parent = element.parentElement;
      const insideSentence = element.tagName === "A" && style.display === "inline" && parent
        && Array.from(parent.childNodes).some((node) => node.nodeType === 3 && node.textContent.trim().length > 0);
      if (insideSentence) {
        inlineExempt += 1;
        continue;
      }
      if (width < 44 || height < 44) {
        small44 += 1;
        smallest.push({ area: width * height, width: Math.round(width), height: Math.round(height), element: describe(element) });
      }
      if (width < 40 || height < 40) small40 += 1;
      if (width < 24 || height < 24) small24 += 1;
    }
    smallest.sort((left, right) => left.area - right.area);
    return {
      total: interactive.length,
      small44,
      small40,
      small24,
      inlineExempt,
      samples: smallest.slice(0, 8).map((entry) => ({ width: entry.width, height: entry.height, element: entry.element })),
    };
  });

  safe("headings", () => {
    const list = [];
    for (const element of document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=\"heading\"]")) {
      if (!exposedToAssistive(element)) continue;
      const tagLevel = /^H([1-6])$/.test(element.tagName) ? Number(element.tagName[1]) : 0;
      const ariaLevel = Number(element.getAttribute("aria-level"));
      const level = ariaLevel >= 1 && ariaLevel <= 6 ? ariaLevel : tagLevel || 2;
      list.push({ level, text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60) });
    }
    return list;
  });

  safe("landmarks", () => {
    const labelOf = (element) => {
      const direct = element.getAttribute("aria-label");
      if (direct && direct.trim()) return direct.trim();
      const ids = element.getAttribute("aria-labelledby");
      if (ids) {
        const text = ids.split(/\s+/).map((id) => {
          const target = document.getElementById(id);
          return target ? (target.textContent || "").trim() : "";
        }).join(" ").trim();
        if (text) return text;
      }
      return "";
    };
    const roleOf = (element) => {
      const explicit = (element.getAttribute("role") || "").split(/\s+/)[0];
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === "main") return "main";
      if (tag === "nav") return "navigation";
      if (tag === "aside") return "complementary";
      if (tag === "header") return element.closest("article, aside, main, nav, section") ? "" : "banner";
      if (tag === "footer") return element.closest("article, aside, main, nav, section") ? "" : "contentinfo";
      if (tag === "form") return labelOf(element) ? "form" : "";
      if (tag === "section") return labelOf(element) ? "region" : "";
      return "";
    };
    const landmarks = [];
    for (const element of document.querySelectorAll("main, nav, aside, header, footer, form, section, [role]")) {
      if (!exposedToAssistive(element)) continue;
      const role = roleOf(element);
      if (!["main", "banner", "contentinfo", "navigation", "complementary", "search", "form", "region"].includes(role)) continue;
      landmarks.push({ role, label: labelOf(element) });
    }
    return landmarks;
  });

  safe("classes", () => {
    const COLOR_LIKE = /(?:^|:)!?-?(?:text|bg|border|ring|outline|fill|stroke|from|via|to|accent|caret|decoration|placeholder|shadow|divide|inset-ring|inset-shadow|drop-shadow|mask|scrollbar)-/;
    const usage = new Map();
    for (const element of document.querySelectorAll("[class]")) {
      const raw = element.getAttribute("class");
      if (!raw) continue;
      for (const token of new Set(raw.trim().split(/\s+/))) {
        if (!token || !COLOR_LIKE.test(token)) continue;
        const entry = usage.get(token);
        if (entry) entry.elements += 1;
        else usage.set(token, { name: token, elements: 1, sample: describe(element) });
      }
    }
    return { distinctTokens: usage.size, usage: Array.from(usage.values()) };
  });

  safe("inlineColors", () => {
    const COLOR_PROPERTIES = /^(?:color|background|background-color|background-image|border|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color|column-rule-color|stop-color|flood-color)$/;
    // DESIGN.md 는 rgb()/hex 대신 OKLCH 를 쓰라고 하므로 oklch()·oklab()·color-mix() 는 허용 표기로 보고 세지 않는다.
    const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|color)\(|\b(?:white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|silver|gold|cyan|magenta|navy|teal|lime|maroon|olive|aqua|fuchsia|brown)\b/;
    const stripVar = (value) => {
      let output = value;
      for (let guard = 0; guard < 6; guard += 1) {
        const next = output.replace(/var\([^()]*\)/g, "").replace(/url\([^)]*\)/g, "");
        if (next === output) break;
        output = next;
      }
      return output;
    };
    const SVG_COLOR_ATTRIBUTES = ["fill", "stroke", "stop-color", "flood-color", "color"];
    const ALLOWED_ATTRIBUTE = /^(?:none|currentcolor|inherit|transparent|initial|unset)$/i;
    let elements = 0;
    const samples = [];
    // 인라인 SVG 일러스트(작품 미리보기 등)는 요소마다 세면 한 그림이 수십 건이 되므로 svg 루트 하나를 1건으로 센다.
    const countedSvgRoots = new Set();
    for (const element of document.querySelectorAll("[style], [fill], [stroke], [stop-color], [flood-color], [color]")) {
      if (element.closest("head")) continue;
      const svgRoot = element.closest("svg");
      if (svgRoot && countedSvgRoots.has(svgRoot)) continue;
      let hit = "";
      const style = element.getAttribute("style");
      if (style) {
        for (const declaration of style.split(";")) {
          const index = declaration.indexOf(":");
          if (index < 0) continue;
          const property = declaration.slice(0, index).trim().toLowerCase();
          if (!COLOR_PROPERTIES.test(property)) continue;
          const value = stripVar(declaration.slice(index + 1).trim());
          const found = value.match(LITERAL);
          if (found) {
            hit = `${property} 의 ${found[0]} (${declaration.slice(index + 1).trim().slice(0, 48)})`;
            break;
          }
        }
      }
      if (!hit) {
        for (const attribute of SVG_COLOR_ATTRIBUTES) {
          const value = element.getAttribute(attribute);
          if (!value || ALLOWED_ATTRIBUTE.test(value.trim()) || /^url\(/i.test(value.trim()) || /^var\(/i.test(value.trim())) continue;
          if (LITERAL.test(value)) {
            hit = `${attribute}=${value.trim().slice(0, 48)}`;
            break;
          }
        }
      }
      if (!hit) continue;
      if (svgRoot) countedSvgRoots.add(svgRoot);
      elements += 1;
      if (samples.length < 10) samples.push({ element: describe(svgRoot || element), declaration: hit });
    }
    return { elements, samples };
  });

  safe("copy", () => {
    const SKIP_PARENT = "script, style, noscript, template, textarea, code, pre, kbd, samp, [hidden]";
    const cache = new WeakMap();
    const textVisible = (element) => {
      let visible = cache.get(element);
      if (visible === undefined) {
        visible = element.getClientRects().length > 0 && styleOf(element).visibility !== "hidden" && Number(styleOf(element).opacity) !== 0;
        cache.set(element, visible);
      }
      return visible;
    };
    const texts = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_PARENT) || !textVisible(parent)) continue;
      const langRoot = parent.closest("[lang]");
      if (langRoot && !/^ko/i.test(langRoot.getAttribute("lang") || "ko")) continue;
      const text = (node.textContent || "").trim().replace(/\s+/g, " ");
      if (text.length < 2) continue;
      const entry = texts.get(text);
      if (entry) entry.count += 1;
      else if (texts.size < 3000) texts.set(text, { text: text.slice(0, 300), count: 1, tag: parent.tagName.toLowerCase() });
    }
    const attributes = new Map();
    for (const element of document.querySelectorAll("[aria-label], [title], [placeholder], img[alt]")) {
      if (element.getClientRects().length === 0) continue;
      for (const kind of ["aria-label", "title", "placeholder", "alt"]) {
        const value = element.getAttribute(kind);
        if (!value || value.trim().length < 2) continue;
        const key = `${kind}\u0000${value.trim()}`;
        const entry = attributes.get(key);
        if (entry) entry.count += 1;
        else if (attributes.size < 1500) attributes.set(key, { kind, text: value.trim().slice(0, 200), count: 1, tag: element.tagName.toLowerCase() });
      }
    }
    let emptyButtons = 0;
    const emptyButtonSamples = [];
    for (const element of document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]')) {
      if (!visibleRect(element)) continue;
      const aria = element.getAttribute("aria-label");
      const labelledBy = element.getAttribute("aria-labelledby");
      const title = element.getAttribute("title");
      const value = element.tagName === "INPUT" ? element.getAttribute("value") : "";
      const hasGraphic = Boolean(element.querySelector("svg, img, canvas, picture, video, iframe, i, [class*=\"icon\"]"));
      const textual = (element.innerText || "").trim();
      const named = [aria, title, value].some((candidate) => candidate && candidate.trim()) || Boolean(labelledBy);
      if (!textual && !named && !hasGraphic) {
        emptyButtons += 1;
        if (emptyButtonSamples.length < 8) emptyButtonSamples.push(describe(element));
      }
    }
    return { texts: Array.from(texts.values()), attributes: Array.from(attributes.values()), emptyButtons, emptyButtonSamples };
  });

  safe("meta", () => ({
    url: location.pathname + location.search,
    title: document.title,
    lang: document.documentElement.lang,
    domNodes: document.getElementsByTagName("*").length,
    interactiveCount: interactive.length,
    viewport: { width: viewportWidth, height: viewportHeight },
  }));

  return result;
}
