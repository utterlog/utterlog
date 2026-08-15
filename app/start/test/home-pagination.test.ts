import { expect, test } from 'bun:test';
import {
  HOME_PAGE_MAX,
  homePagePathRewrite,
  homePublicPathname,
  isHomePageNumber,
} from '../src/lib/home-pagination';

const { input, output } = homePagePathRewrite;
const u = (href: string) => new URL(href, 'https://example.com');

test('把 /page/N 翻成首页路由的 search 参数', () => {
  expect(input({ url: u('/page/2') })?.href).toBe('https://example.com/?page=2');
  expect(input({ url: u('/page/999999') })?.href).toBe('https://example.com/?page=999999');
});

test('翻译时保留其余 query 与 hash', () => {
  expect(input({ url: u('/page/3?foo=bar') })?.search).toBe('?foo=bar&page=3');
  expect(input({ url: u('/page/3#comments') })?.hash).toBe('#comments');
});

test('不接手的路径原样放行给 /page/$num 路由处理', () => {
  // 第 1 页在那条路由上 301 回 `/`，一页内容只留一个地址
  expect(input({ url: u('/page/1') })).toBeUndefined();
  // 这些要落到真 404，不能被改写成渲染不出东西的 search 地址
  expect(input({ url: u('/page/0') })).toBeUndefined();
  expect(input({ url: u('/page/abc') })).toBeUndefined();
  expect(input({ url: u('/page/007') })).toBeUndefined();
  expect(input({ url: u(`/page/${HOME_PAGE_MAX + 1}`) })).toBeUndefined();
  // 其他路径一律不碰
  expect(input({ url: u('/') })).toBeUndefined();
  expect(input({ url: u('/archives/12') })).toBeUndefined();
  expect(input({ url: u('/category/tech/page/2') })).toBeUndefined();
});

test('反向：内部地址写回地址栏时变成 /page/N', () => {
  expect(output({ url: u('/?page=2') })?.href).toBe('https://example.com/page/2');
  expect(output({ url: u('/?foo=bar&page=3') })?.href).toBe('https://example.com/page/3?foo=bar');
});

test('output 的守卫与 input 对称，不制造 input 不认的死链', () => {
  expect(output({ url: u('/?page=1') })).toBeUndefined();
  expect(output({ url: u('/?page=abc') })).toBeUndefined();
  expect(output({ url: u(`/?page=${HOME_PAGE_MAX + 1}`) })).toBeUndefined();
  expect(output({ url: u('/') })).toBeUndefined();
  expect(output({ url: u('/archives/12?page=2') })).toBeUndefined();
});

test('两个方向互为逆运算', () => {
  for (const n of [2, 3, 10, 999999]) {
    const back = output({ url: input({ url: u(`/page/${n}`) })! });
    expect(back?.pathname).toBe(`/page/${n}`);
    expect(back?.search).toBe('');
  }
});

test('绝不就地修改传进来的 URL 对象', () => {
  // input 就地改会让 cache-policy 漏判 /page/N（当成可缓存公开页）；
  // output 就地改会把 router 内部的 href 一起改掉，路由立刻匹配不上 '/'。
  const a = u('/page/2');
  input({ url: a });
  expect(a.href).toBe('https://example.com/page/2');

  const b = u('/?page=2');
  output({ url: b });
  expect(b.href).toBe('https://example.com/?page=2');
});

test('对外 pathname 与 rewrite 用的是同一份判据', () => {
  expect(homePublicPathname({ pathname: '/', search: { page: 2 } })).toBe('/page/2');
  expect(homePublicPathname({ pathname: '/', search: { page: 1 } })).toBe('/');
  expect(homePublicPathname({ pathname: '/', search: {} })).toBe('/');
  expect(homePublicPathname({ pathname: '/', search: null })).toBe('/');
  expect(homePublicPathname({ pathname: '/archives/12', search: { page: 2 } })).toBe('/archives/12');
});

test('页码判据只认 2 起步的整数', () => {
  expect(isHomePageNumber(2)).toBe(true);
  expect(isHomePageNumber('2')).toBe(true);
  expect(isHomePageNumber(1)).toBe(false);
  expect(isHomePageNumber(0)).toBe(false);
  expect(isHomePageNumber(-2)).toBe(false);
  expect(isHomePageNumber(2.5)).toBe(false);
  expect(isHomePageNumber('02')).toBe(false);
  expect(isHomePageNumber(null)).toBe(false);
  expect(isHomePageNumber(undefined)).toBe(false);
});
