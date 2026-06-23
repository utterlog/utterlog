export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
  }

  static redirect(url: string | URL, status = 302) {
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}

export type NextRequest = Request;
