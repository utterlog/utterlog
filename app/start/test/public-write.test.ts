import { expect, test } from 'bun:test';
import { applyForLink, editVisitorComment, PublicWriteError } from '../src/backend/services/public-write';

test('link applications reject invalid URLs before database access', async () => {
  expect(applyForLink({ name: 'Example', url: 'not-a-url' })).rejects.toBeInstanceOf(PublicWriteError);
});

test('visitor comment edits reject invalid IDs before database access', async () => {
  expect(editVisitorComment(0, { content: 'valid comment', visitor_id: 'visitor' })).rejects.toBeInstanceOf(PublicWriteError);
});
