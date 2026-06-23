export function serverApiBase() {
  if (typeof window !== 'undefined') {
    const publicUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
    if (publicUrl.startsWith('/')) return publicUrl.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(publicUrl)) return publicUrl.replace(/\/+$/, '');
    return '/api/v1';
  }
  const internal = process.env.INTERNAL_API_URL || '';
  if (/^https?:\/\//i.test(internal)) return internal.replace(/\/+$/, '');
  const publicUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (publicUrl.startsWith('/')) return publicUrl.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(publicUrl)) return publicUrl.replace(/\/+$/, '');
  return 'http://127.0.0.1:8080/api/v1';
}
