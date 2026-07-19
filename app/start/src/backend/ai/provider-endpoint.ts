export function isAnthropicEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.hostname.toLowerCase().includes('anthropic.com') || url.pathname.toLowerCase().includes('/anthropic');
  } catch {
    const value = endpoint.toLowerCase();
    return value.includes('anthropic.com') || value.includes('/anthropic');
  }
}

// Provider settings accept either a complete API endpoint or an SDK-style base URL.
// Normalize only the compatible text/embedding APIs; image providers have different paths.
export function normalizeAiEndpoint(rawEndpoint: string, type: string) {
  const endpoint = rawEndpoint.trim();
  if (!endpoint || type === 'image') return endpoint;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return endpoint;
  }

  const path = url.pathname.replace(/\/+$/, '');
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('/chat/completions') || lowerPath.endsWith('/messages') || lowerPath.endsWith('/embeddings')) {
    return endpoint;
  }

  if (type === 'embedding') {
    url.pathname = `${path}/embeddings`;
  } else if (isAnthropicEndpoint(endpoint)) {
    url.pathname = lowerPath.endsWith('/v1') ? `${path}/messages` : `${path}/v1/messages`;
  } else {
    url.pathname = `${path}/chat/completions`;
  }
  return url.toString();
}
