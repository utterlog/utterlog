import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const issuer = 'utterlog-app';
const audience = 'utterlog-client';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const configured = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  let appOrigin = '';
  try {
    appOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : '';
  } catch {
    appOrigin = '';
  }
  const allowed = configured.length > 0 ? configured : [appOrigin].filter(Boolean);
  const allowOrigin = configured.includes('*') ? '*' : allowed.includes(origin) ? origin : appOrigin;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function verifyAuth(req: Request) {
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret === 'change-this-secret-key') return false;
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return false;
  const key = new TextEncoder().encode(secret);
  const verified = await jwtVerify(token, key, { issuer, audience }).catch(async () => jwtVerify(token, key, { issuer }));
  if (verified.payload.type !== 'access') return false;
  const userId = Number.parseInt(verified.payload.sub || '', 10);
  return Number.isFinite(userId) && userId > 0;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req);
  if (!(await verifyAuth(req))) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401, headers },
    );
  }
  try {
    // Optional: POST body `{ paths: ['/', '/posts/slug'], tags: ['theme', 'posts'] }`
    let paths: string[] = ['/'];
    let tags: string[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.paths)) paths = body.paths;
      if (Array.isArray(body?.tags)) tags = body.tags;
    } catch {
      // empty body is fine — revalidate root layout only
    }

    for (const p of paths) revalidatePath(p, 'layout');
    // Next.js 16 requires a second `profile` arg on revalidateTag — { expire: 0 }
    // triggers immediate invalidation for the given tag.
    for (const t of tags) revalidateTag(t, { expire: 0 });

    return NextResponse.json(
      { success: true, message: 'Cache cleared', paths, tags },
      { headers },
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Failed to clear cache', error: err?.message },
      { status: 500, headers },
    );
  }
}
