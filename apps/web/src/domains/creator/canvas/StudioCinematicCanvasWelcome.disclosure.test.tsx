// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudioCinematicCanvasWelcome } from './StudioCinematicCanvasWelcome';
import { STUDIO_CREATION_MODE_EVENT } from '../studio-creation-mode';
import { STUDIO_CANVAS_START_DOCK_STORAGE_KEY } from './studio-canvas-start-dock-preference';

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });
it('초회는 바로 그리기·사용법·다른 시작 방법·닫기만 노출하며 포커스를 가져가지 않는다', () => {
  render(<button>캔버스</button>); const canvas=screen.getByRole('button',{name:'캔버스'}); canvas.focus();
  render(<StudioCinematicCanvasWelcome pageKey="one" visible onOpenTutorial={vi.fn()} />);
  expect(document.activeElement).toBe(canvas);
  expect(screen.getAllByRole('button')).toHaveLength(5);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(window.localStorage.getItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY)).toBeNull();
});
it.each(['draw','story','character','background','assets','ai'])('펼친 %s 시작 경로의 원래 이벤트를 한 번 보낸다', mode => {
 const listener=vi.fn(); window.addEventListener(STUDIO_CREATION_MODE_EVENT,listener);
 try {
  const {container}=render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
  fireEvent.click(screen.getByRole('button',{name:'다른 시작 방법'}));
  const action=container.querySelector(`[data-canvas-start-mode="${mode}"]`);
  expect(action).toBeTruthy(); if(action) fireEvent.click(action);
  expect(listener).toHaveBeenCalledOnce(); expect(listener.mock.calls[0]?.[0].detail).toEqual({mode});
 } finally {window.removeEventListener(STUDIO_CREATION_MODE_EVENT,listener);}
});
it('닫기와 Escape는 같은 페이지 재진입을 남기고 초점을 돌려준다', () => {
 render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
 fireEvent.click(screen.getByRole('button',{name:'시작 안내 닫기'}));
 const reopen=screen.getByRole('button',{name:/시작 방법 보기/u}); expect(document.activeElement).toBe(reopen);
 fireEvent.click(reopen);
 expect(screen.getByRole('heading')).toBeTruthy();
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'다른 시작 방법'}));
 fireEvent.keyDown(screen.getByRole('button',{name:'시작 안내 닫기'}),{key:'Escape'});
 expect(document.activeElement).toBe(screen.getByRole('button',{name:/시작 방법 보기/u}));
});
it('저장 차단 상태에서도 닫기와 재진입이 유지된다', () => {
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
 render(<StudioCinematicCanvasWelcome pageKey="one" visible />);
 fireEvent.click(screen.getByRole('button',{name:'시작 안내 닫기'}));
 fireEvent.click(screen.getByRole('button',{name:/시작 방법 보기/u}));
 expect(screen.getByRole('heading')).toBeTruthy();
});
it('오류·로드·협업 경계의 visible=false 상태를 우회하지 않는다', () => {
 const {container}=render(<StudioCinematicCanvasWelcome pageKey="one" visible={false} />);
 expect(container.childElementCount).toBe(0);
});
