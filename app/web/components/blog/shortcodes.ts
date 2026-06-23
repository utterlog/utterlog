function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function processGithubRepoLinks(text: string): string {
  const repoLinePattern = /^[ \t]{0,3}https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:\/)?(?:[?#][^\s]*)?[ \t]*$/;
  const xPostLinePattern = /^[ \t]{0,3}(https?:\/\/(?:x\.com|twitter\.com|mobile\.twitter\.com)\/[^/\s]+\/status(?:es)?\/\d+(?:[/?#][^\s]*)?)[ \t]*$/i;
  let inFence = false;

  return text.split('\n').map(line => {
    const trimmed = line.trimStart();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    const match = line.match(repoLinePattern);
    if (match) {
      const cleanRepo = String(match[2] || '').replace(/\.git$/i, '');
      if (!match[1] || !cleanRepo) return line;

      const safeOwner = escapeAttr(String(match[1]));
      const safeRepo = escapeAttr(cleanRepo);
      const safeUrl = `https://github.com/${safeOwner}/${safeRepo}`;
      return `<div data-github-repo-card data-owner="${safeOwner}" data-repo="${safeRepo}" data-url="${safeUrl}"></div>`;
    }

    const xMatch = line.match(xPostLinePattern);
    if (xMatch) {
      return `<div data-x-post-embed data-url="${escapeAttr(xMatch[1])}"></div>`;
    }

    return line;
  }).join('\n');
}
