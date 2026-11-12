// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteScrollRestoration } from './RouteScrollRestoration';
import { createNavigationMemory } from '@/shared/lib/navigation-memory';

const routing = vi.hoisted(() => ({
  location: { pathname: '/learn', search: '', hash: '', key: 'learn-entry', state: null },
  navigation: 'POP',
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useLocation: () => routing.location,
  useNavigationType: () => routing.navigation,
}));

let position = 0;
let height = 12000;
const originalY = Object.getOwnPropertyDescriptor(window, 'scrollY');
const originalHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight');
const originalIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

beforeEach(() => {
  position = 0;
  height = 12000;
  routing.location = { pathname: '/learn', search: '', hash: '', key: 'learn-entry', state: null };
  routing.navigation = 'POP';
  vi.stubGlobal('ResizeObserver', undefined);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => height });
  vi.spyOn(window, 'scrollTo').mockImplementation((first?: number | ScrollToOptions, second?: number) => {
    position = typeof first === 'number' ? second ?? 0 : first?.top ?? 0;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalY) Object.defineProperty(window, 'scrollY', originalY);
  else Reflect.deleteProperty(window, 'scrollY');
  if (originalHeight) Object.defineProperty(document.documentElement, 'scrollHeight', originalHeight);
  else Reflect.deleteProperty(document.documentElement, 'scrollHeight');
  if (originalIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

function routeContent(children?: ReactNode) {
  return <><RouteScrollRestoration /><main id="main-content" tabIndex={-1}>{children}</main></>;
}
function card(focusKey = 'work:w1') {
  return <a href="/showcase/work/w1" data-route-return-focus={focusKey} onClick={(event) => event.preventDefault()}>작품 보기</a>;
}
function lateCard(focusKey = 'work:w1') {
  const anchor = document.createElement('a');
  anchor.href = '/showcase/work/w1';
  anchor.dataset.routeReturnFocus = focusKey;
  anchor.textContent = '다시 표시된 작품';
  document.getElementById('main-content')?.append(anchor);
  return anchor;
}
const ignoredClicks: readonly (MouseEventInit & { name: string; target?: string; download?: string; href?: string })[] = [
  { name: '새 탭', target: '_blank' },
  { name: '다운로드', download: '' },
  { name: '외부', href: 'https://example.com/work' },
  { name: 'Studio 목적지', href: '/studio/canvas' },
  { name: '잘못된 주소', href: 'https://[' },
  { name: 'Ctrl', ctrlKey: true },
  { name: 'Meta', metaKey: true },
  { name: 'Shift', shiftKey: true },
  { name: 'Alt', altKey: true },
  { name: '가운데 버튼', button: 1 },
];

describe('명시한 공개 카드로 history 초점 복귀', () => {
  beforeEach(() => {
    // JSDOM은 레이아웃이 없으므로 카드의 존재하는 상자만 모사한다. 실측 터치·가림 검사가 아니다.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      const rect = new DOMRect(0, 100, 100, 120);
      return Object.assign(this.matches('a[data-route-return-focus]') ? [rect] : [], { item: (index: number) => index === 0 ? rect : null });
    });
  });
  function leaveAndReturn(view: ReturnType<typeof render>, hash = '') {
    navigate('/showcase/work/w1', 'detail-entry');
    view.rerender(routeContent(<p>상세 응답을 불러오지 못했습니다.</p>));
    navigate('/learn', 'learn-entry', 'POP');
    routing.location.hash = hash;
    view.rerender(routeContent(<p>목록을 불러오는 중</p>));
  }

  it('같은 높이의 늦은 목록을 기다려 원래 카드와 스크롤을 함께 복구한다', async () => {
    const view = render(routeContent(card()));
    const original = view.getByRole('link', { name: '작품 보기' });
    act(() => { position = 1600; fireEvent.scroll(window); });
    // Enter 활성화가 만드는 detail=0 click을 모사하며 실제 키보드 입력 성공을 주장하지 않는다.
    fireEvent.keyDown(original, { key: 'Enter' });
    fireEvent.click(original, { button: 0, detail: 0 });
    act(() => { position = 1700; fireEvent.scroll(window); });
    leaveAndReturn(view);
    expect(position).toBe(1700);
    const returned = lateCard();
    const focus = vi.spyOn(returned, 'focus');
    await waitFor(() => expect(document.activeElement).toBe(returned));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(position).toBe(1700);
  });

  it('공개 ID 문자를 selector로 해석하지 않고 같은 키로만 찾는다', async () => {
    const focusKey = 'work:제목["목록"]';
    const view = render(routeContent(card(focusKey)));
    fireEvent.click(view.getByRole('link'));
    leaveAndReturn(view);
    const returned = lateCard(focusKey);
    await waitFor(() => expect(document.activeElement).toBe(returned));
  });

  it.each(['pointerdown', 'keydown'])('복귀 대기 중 %s 입력은 늦은 초점 복원을 취소한다', async (input) => {
    const view = render(routeContent(card()));
    act(() => { position = 1800; fireEvent.scroll(window); });
    fireEvent.click(view.getByRole('link'));
    leaveAndReturn(view);
    if (input === 'pointerdown') fireEvent.pointerDown(window);
    else fireEvent.keyDown(window, { key: 'Tab' });
    const returned = lateCard();
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).not.toBe(returned);
    expect(position).toBe(1800);
  });

  it('다른 입력이 이미 선택되면 늦은 카드가 그 초점을 빼앗지 않는다', async () => {
    const view = render(routeContent(card()));
    fireEvent.click(view.getByRole('link'));
    leaveAndReturn(view);
    const input = document.createElement('input');
    document.getElementById('main-content')?.append(input);
    input.focus();
    lateCard();
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(input);
  });

  it('유효한 hash가 있으면 카드 키보다 기존 fragment 복원이 우선한다', async () => {
    const view = render(routeContent(card()));
    fireEvent.click(view.getByRole('link'));
    leaveAndReturn(view, '#late-fragment');
    const returned = lateCard();
    const fragment = document.createElement('section');
    fragment.id = 'late-fragment';
    document.getElementById('main-content')?.append(fragment);
    await waitFor(() => expect(document.activeElement).toBe(fragment));
    expect(fragment.scrollIntoView).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(returned);
  });

  it('중복 보이는 카드는 선택하지 않고 숨김·inert·닫힌 details를 제외한 한 개만 복귀한다', async () => {
    const view = render(routeContent(card()));
    fireEvent.click(view.getByRole('link'));
    leaveAndReturn(view);
    const first = lateCard();
    const second = lateCard();
    const inert = lateCard(); inert.setAttribute('inert', '');
    const closed = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = '접힌 목록'; closed.append(summary);
    const hiddenInDetails = lateCard(); closed.append(hiddenInDetails);
    document.getElementById('main-content')?.append(closed);
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).not.toBe(second);
    first.hidden = true;
    await waitFor(() => expect(document.activeElement).toBe(second));
  });

  it('5초 제한 뒤 도착한 카드는 초점을 바꾸지 않는다', async () => {
    vi.useFakeTimers();
    try {
      const view = render(routeContent(card()));
      fireEvent.click(view.getByRole('link'));
      leaveAndReturn(view);
      act(() => { vi.advanceTimersByTime(5000); });
      const returned = lateCard();
      await act(async () => { await Promise.resolve(); });
      expect(document.activeElement).not.toBe(returned);
    } finally { vi.useRealTimers(); }
  });

  it('다른 일반 링크 이동은 이전 카드 키를 지운다', async () => {
    const view = render(routeContent(<>{card()}<a href="/about" onClick={(event) => event.preventDefault()}>소개</a></>));
    fireEvent.click(view.getByRole('link', { name: '작품 보기' }));
    fireEvent.click(view.getByRole('link', { name: '소개' }));
    leaveAndReturn(view);
    const returned = lateCard();
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).not.toBe(returned);
  });

  it.each(ignoredClicks)('$name 클릭은 현재 entry의 복귀 키를 만들지 않는다', async ({ target, download, href, ...click }) => {
    const view = render(routeContent(<a href={href ?? '/showcase/work/w1'} target={target} download={download} data-route-return-focus="work:w1" onClick={(event) => event.preventDefault()}>작품 보기</a>));
    fireEvent.click(view.getByRole('link'), click);
    leaveAndReturn(view);
    const returned = lateCard();
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).not.toBe(returned);
  });

  it('Studio의 카드 클릭과 POP에는 공개 복귀 observer를 추가하지 않는다', () => {
    navigate('/studio/canvas', 'studio-entry', 'POP');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const view = render(routeContent(card()));
    fireEvent.click(view.getByRole('link'));
    navigate('/about', 'about-entry'); view.rerender(routeContent());
    navigate('/studio/canvas', 'studio-entry', 'POP'); view.rerender(routeContent(card()));
    expect(observe).not.toHaveBeenCalled();
  });
});

describe('선택적 공개 focusKey 메모리 계약', () => {
  it('기본 80개 한도·복사·좌표 정규화를 유지하고 키를 명시적으로 지운다', () => {
    const memory = createNavigationMemory();
    memory.set('card', { x: -1, y: Infinity, focusKey: 'work:w1' });
    const copied = memory.get('card');
    if (!copied) throw new Error('기억한 위치가 없습니다.');
    copied.focusKey = 'work:other';
    expect(memory.get('card')).toEqual({ x: 0, y: 0, focusKey: 'work:w1' });
    memory.set('card', { x: 0, y: 10 });
    expect(memory.get('card')).toEqual({ x: 0, y: 10 });
    for (let index = 0; index < 80; index += 1) memory.set(`entry-${index}`, { x: 0, y: index });
    expect(memory.size).toBe(80);
    expect(memory.get('card')).toBeUndefined();
  });
  it.each(['', ' work:w1', 'work:w1 ', 'x'.repeat(257), `work:${String.fromCharCode(0)}w1`])('유효하지 않은 키는 좌표와 함께 보관하지 않는다', (focusKey) => {
    const memory = createNavigationMemory();
    memory.set('card', { x: 1, y: 2, focusKey });
    expect(memory.get('card')).toEqual({ x: 1, y: 2 });
  });
});

function navigate(pathname: string, key: string, navigation = 'PUSH') {
  routing.location = { pathname, key, search: '', hash: '', state: null };
  routing.navigation = navigation;
}

describe('공개 경로의 이전 스크롤 위치 보존', () => {
  it('새 화면의 높이 축소로 0이 된 좌표가 이전 경로의 기록을 덮어쓰지 않는다', () => {
    const view = render(<RouteScrollRestoration />);
    act(() => { position = 6511; fireEvent.scroll(window); });
    // React가 새 화면을 반영하며 높이를 줄인 뒤 이전 layout effect를 정리하는 상황.
    position = 0;
    navigate('/market/browse', 'market-entry');
    view.rerender(<RouteScrollRestoration />);
    navigate('/learn', 'learn-entry', 'POP');
    view.rerender(<RouteScrollRestoration />);
    expect(position).toBe(6511);
  });
  it('복원을 기다리는 짧은 로딩 화면을 떠나도 원래의 목적 좌표를 잃지 않는다', () => {
    const view = render(<RouteScrollRestoration />);
    act(() => { position = 6400; fireEvent.scroll(window); });
    navigate('/market/browse', 'market-entry');
    view.rerender(<RouteScrollRestoration />);
    height = 800;
    navigate('/learn', 'learn-entry', 'POP');
    view.rerender(<RouteScrollRestoration />);
    navigate('/about', 'about-entry');
    view.rerender(<RouteScrollRestoration />);
    height = 12000;
    navigate('/learn', 'learn-entry', 'POP');
    view.rerender(<RouteScrollRestoration />);
    expect(position).toBe(6400);
  });
  it('같은 페이지의 필터 변경은 사용자의 현재 스크롤을 초기화하지 않는다', () => {
    const view = render(<RouteScrollRestoration />);
    act(() => { position = 2100; fireEvent.scroll(window); });
    vi.mocked(window.scrollTo).mockClear();
    routing.location = { ...routing.location, search: '?level=beginner', key: 'filtered-entry' };
    routing.navigation = 'PUSH';
    view.rerender(<RouteScrollRestoration />);
    expect(position).toBe(2100);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each(['REPLACE', 'PUSH'])('같은 hash의 query-only %s는 검색 초점과 현재 스크롤을 보존한다', (navigation) => {
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(() => { position = 220; });
    routing.location.hash = '#query-anchor';
    const content = <><input aria-label="영상 찾기" /><section id="query-anchor" tabIndex={-1}>영상 목록</section></>;
    const view = render(routeContent(content));
    const fragment = view.getByText('영상 목록');
    expect(document.activeElement).toBe(fragment);
    expect(position).toBe(220);
    const input = view.getByRole('textbox'); input.focus();
    act(() => { position = 900; fireEvent.scroll(window); });
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    vi.mocked(window.scrollTo).mockClear();

    routing.location = { ...routing.location, search: '?q=별빛', key: `query-${navigation}` };
    routing.navigation = navigation;
    view.rerender(routeContent(content));

    expect(document.activeElement).toBe(input);
    expect(position).toBe(900);
    expect(fragment.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('같은 hash의 query POP는 현재 입력보다 기존 fragment 복원을 우선한다', () => {
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(() => { position = 220; });
    routing.location.hash = '#query-anchor';
    const content = <><input aria-label="영상 찾기" /><section id="query-anchor" tabIndex={-1}>영상 목록</section></>;
    const view = render(routeContent(content));
    act(() => { position = 900; fireEvent.scroll(window); });
    routing.location = { ...routing.location, search: '?q=별빛', key: 'query-entry' };
    routing.navigation = 'PUSH'; view.rerender(routeContent(content));
    const input = view.getByRole('textbox'); input.focus();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();

    routing.location = { ...routing.location, search: '', key: 'learn-entry' };
    routing.navigation = 'POP'; view.rerender(routeContent(content));

    expect(document.activeElement).toBe(view.getByText('영상 목록'));
    expect(position).toBe(220);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce();
  });

  it.each(['hash', 'pathname'])('%s가 바뀐 이동은 기존 fragment 이동을 유지한다', (change) => {
    routing.location.hash = '#query-anchor';
    const content = <><input aria-label="영상 찾기" /><section id="query-anchor" tabIndex={-1}>원래 목록</section><section id="new-anchor" tabIndex={-1}>새 목록</section></>;
    const view = render(routeContent(content));
    const input = view.getByRole('textbox'); input.focus();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    routing.location = { ...routing.location, pathname: change === 'pathname' ? '/promo-library' : '/learn', hash: change === 'hash' ? '#new-anchor' : '#query-anchor', key: 'changed-entry' };
    routing.navigation = 'PUSH'; view.rerender(routeContent(content));

    expect(document.activeElement).toBe(view.getByText(change === 'hash' ? '새 목록' : '원래 목록'));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledOnce();
  });
});
