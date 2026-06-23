export function firstMarkdownH1(content: string): { title: string; content: string } | null {
  const lines = content.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/^[ \t]+/, '');
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = trimmed.match(/^#(?!#)[ \t]+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const title = match[1].trim();
    if (!title) continue;

    const body = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n').trim();
    return { title, content: body };
  }

  return null;
}

export function resolveMarkdownTitle(title: string, content: string) {
  if (title.trim()) return { title, content };
  const h1 = firstMarkdownH1(content);
  return h1 || { title, content };
}
