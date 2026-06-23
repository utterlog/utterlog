import { expect, test } from 'bun:test';
import { botSqlPattern, isBotUa } from '../src/bot-detect';

test('bot detection matches the legacy Go crawler filters', () => {
  expect(isBotUa('')).toBe(true);
  expect(isBotUa('curl/8.0')).toBe(true);
  expect(isBotUa('axios/1.6.0')).toBe(true);
  expect(isBotUa('Mozilla/5.0 (compatible; ExampleCrawler/1.0; https://example.com/bot)')).toBe(true);
  expect(isBotUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')).toBe(false);
});

test('bot SQL cleanup pattern includes empty, short, and scripted user agents', () => {
  expect(botSqlPattern).toContain('user_agent is null');
  expect(botSqlPattern).toContain('length(user_agent) < 15');
  expect(botSqlPattern).toContain("'%axios/%'");
  expect(botSqlPattern).toContain("'%playwright%'");
});
