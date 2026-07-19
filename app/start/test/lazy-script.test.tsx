import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import LazyScript from '../src/web/components/LazyScript';

test('lazy scripts do not mutate the document before hydration', () => {
  expect(renderToString(<LazyScript src="https://example.test/sdk.js" strategy="lazyOnload" />)).toBe('');
});
