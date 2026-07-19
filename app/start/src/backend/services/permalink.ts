export type PermalinkTarget = {
  id?: number;
  displayId?: number;
  slug?: string;
};

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parsePermalinkPath(path: string, template: string): PermalinkTarget | null {
  const url = (path || '').split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  const tpl = (template || '/posts/%postname%').replace(/\/+$/, '') || '/';
  const tokenRe = /%(postname|post_id|display_id|year|month|day|category)%/g;
  const tokens: string[] = [];
  let source = '^';
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(tpl)) !== null) {
    source += escapeRegex(tpl.slice(last, match.index));
    tokens.push(match[1]);
    if (match[1] === 'postname' || match[1] === 'category') source += '([^/]+)';
    else if (match[1] === 'year') source += '(\\d{4})';
    else if (match[1] === 'month' || match[1] === 'day') source += '(\\d{2})';
    else source += '(\\d+)';
    last = match.index + match[0].length;
  }

  source += escapeRegex(tpl.slice(last));
  const result = url.match(new RegExp(`${source}$`));
  if (!result) return null;

  const captures: Record<string, string> = {};
  tokens.forEach((token, index) => {
    try {
      captures[token] = decodeURIComponent(result[index + 1] || '');
    } catch {
      captures[token] = result[index + 1] || '';
    }
  });
  if (captures.display_id) return { displayId: Number(captures.display_id) || 0 };
  if (captures.post_id) return { id: Number(captures.post_id) || 0 };
  if (captures.postname) return { slug: captures.postname };
  return null;
}
