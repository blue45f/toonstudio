import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';

const path=['apps/web/src/shared/components/ranking-board.tsx','src/shared/components/ranking-board.tsx','ranking-board.tsx'].map(p=>resolve(process.cwd(),p)).find(existsSync);
const source=readFileSync(path!,'utf8');
describe('ranking board content-first source contract',()=>{
 it('keeps result branches before collapsible supporting signals',()=>{
  const result=source.indexOf('{/* 랭킹 — 3가지 표시 방식 */}');
  const detail=source.indexOf('<details data-testid="ranking-supporting-details"');
  expect(result).toBeGreaterThan(0);expect(detail).toBeGreaterThan(result);
  expect(source.indexOf('<SignalWorkbench')).toBeGreaterThan(detail);
  expect(source.slice(detail,source.indexOf('<summary',detail))).not.toMatch(/\bopen\b/);
 });
 it('keeps primary axes and period inputs before results and advanced conditions reachable',()=>{
  expect(source.indexOf('<RankingPrimaryControls')).toBeGreaterThan(0);
  expect(source.indexOf('<RankingPrimaryControls')).toBeLessThan(source.indexOf('<RankingSkeleton'));
  expect(source.indexOf('period={period}')).toBeLessThan(source.indexOf('<RankingSkeleton'));
  for(const handler of ['setStatus','setPricing','setMinRating','setRisingOnly','setGenre','setPlatform','setView','setShowFilters','setWindowLimit'])expect(source).toContain(handler);
  expect(source).toContain('상태·가격·평점·상승 조건');
  expect(source).toContain('데이터 출처·갱신 정보');
 });
});
