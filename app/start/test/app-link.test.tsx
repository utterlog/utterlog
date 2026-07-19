import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import AppLink, { isDocumentHref } from '../src/web/components/AppLink';

test('admin links leave the public TanStack Router and load the admin SPA', () => {
  expect(isDocumentHref('/admin')).toBe(true);
  expect(isDocumentHref('/admin/moments')).toBe(true);
  expect(isDocumentHref('/administrator')).toBe(false);

  expect(renderToString(<AppLink href="/admin">控制台</AppLink>))
    .toBe('<a href="/admin">控制台</a>');
});
