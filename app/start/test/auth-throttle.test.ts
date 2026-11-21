import { beforeEach, describe, expect, test } from 'bun:test';
import { checkAuthThrottle, resetAuthThrottle } from '../src/server/auth-throttle';

const post = (path: string) => new Request(`https://example.com${path}`, { method: 'POST' });

function hammer(path: string, ip: string, times: number) {
  let blocked: Response | null = null;
  for (let i = 0; i < times; i += 1) {
    blocked = checkAuthThrottle(post(path), ip);
  }
  return blocked;
}

describe('认证接口限流', () => {
  beforeEach(() => resetAuthThrottle());

  test('登录在一分钟内放行 10 次，第 11 次拦下', () => {
    expect(hammer('/api/v1/auth/login', '1.2.3.4', 10)).toBeNull();
    const blocked = checkAuthThrottle(post('/api/v1/auth/login'), '1.2.3.4');
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  test('安装向导的管理员验证共享同一条限流计数', () => {
    const path = '/api/v1/install/create-admin';
    expect(hammer(path, '1.2.3.4', 10)).toBeNull();
    expect(checkAuthThrottle(post(`${path}/`), '1.2.3.4')?.status).toBe(429);
  });

  test('找回密码更严，第 6 次就拦', () => {
    expect(hammer('/api/v1/auth/forgot-password', '1.2.3.4', 5)).toBeNull();
    expect(checkAuthThrottle(post('/api/v1/auth/forgot-password'), '1.2.3.4')?.status).toBe(429);
  });

  test('计数按 IP 隔离，一个人被限不影响别人', () => {
    hammer('/api/v1/auth/login', '1.2.3.4', 11);
    expect(checkAuthThrottle(post('/api/v1/auth/login'), '5.6.7.8')).toBeNull();
  });

  test('计数按路径隔离，登录被限不影响 TOTP', () => {
    hammer('/api/v1/auth/login', '1.2.3.4', 11);
    expect(checkAuthThrottle(post('/api/v1/auth/totp/verify'), '1.2.3.4')).toBeNull();
  });

  test('非认证路径一律放行', () => {
    expect(hammer('/api/v1/posts', '1.2.3.4', 200)).toBeNull();
    expect(hammer('/api/v1/comments', '1.2.3.4', 200)).toBeNull();
  });

  test('GET 不计数 —— 只有提交凭据的写请求才需要限', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(checkAuthThrottle(new Request('https://example.com/api/v1/auth/login'), '1.2.3.4')).toBeNull();
    }
  });

  test('取不到 IP 时放行，避免所有匿名请求挤同一个桶互相顶掉', () => {
    expect(hammer('/api/v1/auth/login', 'unknown', 50)).toBeNull();
    expect(hammer('/api/v1/auth/login', '', 50)).toBeNull();
  });

  test('429 响应体是标准错误结构', async () => {
    hammer('/api/v1/auth/login', '9.9.9.9', 10);
    const blocked = checkAuthThrottle(post('/api/v1/auth/login'), '9.9.9.9');
    const body = await blocked!.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});
