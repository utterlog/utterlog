import { createFileRoute } from '@tanstack/react-router';
import { visitorProfileByEmail } from '@backend/public-read';
import { apiOk } from '../../../server/http';

/**
 * 侧栏「欢迎回来」用的访客档案。
 *
 * 前台 localStorage 里只有访客自己填过的昵称 / 邮箱（评论表单缓存的），
 * 头像要 MD5 算 Gravatar、等级要聚合评论数，都得后端来。
 *
 * 只回公开信息（昵称、头像、等级、累计条数），不回邮箱本身也不回 IP。
 * 传的邮箱查不到就是 found:false —— 拿别人邮箱来探测，最多知道「这个邮箱
 * 在本站评论过几次」，和评论列表本来就公开的信息一致。
 */
export const Route = createFileRoute('/api/v1/visitor')({ server: { handlers: {
  GET: async ({ request }) => {
    const email = new URL(request.url).searchParams.get('email') || '';
    return apiOk(await visitorProfileByEmail(email));
  },
} } });
