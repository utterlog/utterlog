import { expect, test } from 'bun:test';
import { rowsChanged } from '../src/analytics/rollup';

test('rollup row counter reads postgres.js Result count from array-like results', () => {
  const result = [] as unknown[] & { count?: number };
  result.count = 7;

  expect(rowsChanged(result)).toBe(7);
  expect(rowsChanged({ count: 3 })).toBe(3);
  expect(rowsChanged([])).toBe(0);
  expect(rowsChanged(null)).toBe(0);
});
