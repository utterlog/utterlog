import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { table } from '../src/backend/config';
import { initDb, sql } from '../src/backend/db/client';
import { batchAdminComments, updateAdminComment } from '../src/backend/services/comments';

const integration = process.env.UTTERLOG_INTEGRATION_DB === '1' ? describe : describe.skip;

integration('comment service integration', () => {
  let postId = 0;
  let userId = 0;
  let parentId = 0;
  let childId = 0;

  beforeAll(async () => {
    expect(await initDb()).toBe(true);
    const users = await sql.unsafe<{ id: number }[]>(
      `insert into ${table('users')} (username,email,password,role,status,created_at,updated_at)
       values ('integration','integration@example.test','test','admin','active',0,0) returning id`,
    );
    userId = Number(users[0].id);
    const posts = await sql.unsafe<{ id: number }[]>(
      `insert into ${table('posts')}
       (title, slug, content, type, status, author_id, created_at, updated_at, published_at, comment_count)
       values ('integration post','integration-post','test','post','publish',$1,
               extract(epoch from now())::bigint,extract(epoch from now())::bigint,now(),2)
       returning id`,
      [userId],
    );
    postId = Number(posts[0].id);
    const comments = await sql.unsafe<{ id: number }[]>(
      `insert into ${table('comments')}
       (post_id, author_name, content, parent_id, status, created_at, updated_at)
       values
       ($1,'parent','parent comment',0,'approved',extract(epoch from now())::bigint,extract(epoch from now())::bigint),
       ($1,'child','child comment',currval(pg_get_serial_sequence('${table('comments')}','id')),'approved',extract(epoch from now())::bigint,extract(epoch from now())::bigint)
       returning id`,
      [postId],
    );
    parentId = Number(comments[0].id);
    childId = Number(comments[1].id);
    await sql.unsafe(`update ${table('comments')} set parent_id = $1 where id = $2`, [parentId, childId]);
  });

  afterAll(async () => {
    if (postId) await sql.unsafe(`delete from ${table('posts')} where id = $1`, [postId]);
    if (userId) await sql.unsafe(`delete from ${table('users')} where id = $1`, [userId]);
    await sql.end({ timeout: 2 });
  });

  test('status changes recalculate post counts', async () => {
    await updateAdminComment(parentId, { status: 'spam' });
    const rows = await sql.unsafe<{ comment_count: number }[]>(`select comment_count from ${table('posts')} where id = $1`, [postId]);
    expect(Number(rows[0].comment_count)).toBe(1);
    await updateAdminComment(parentId, { status: 'approved' });
    const restored = await sql.unsafe<{ comment_count: number }[]>(`select comment_count from ${table('posts')} where id = $1`, [postId]);
    expect(Number(restored[0].comment_count)).toBe(2);
  });

  test('permanent deletion removes descendants and repairs counts', async () => {
    const result = await batchAdminComments({ ids: [parentId], action: 'delete' });
    expect(result.affected).toBe(2);
    const comments = await sql.unsafe<{ count: string }[]>(`select count(*)::text as count from ${table('comments')} where post_id = $1`, [postId]);
    const posts = await sql.unsafe<{ comment_count: number }[]>(`select comment_count from ${table('posts')} where id = $1`, [postId]);
    expect(Number(comments[0].count)).toBe(0);
    expect(Number(posts[0].comment_count)).toBe(0);
  });
});
