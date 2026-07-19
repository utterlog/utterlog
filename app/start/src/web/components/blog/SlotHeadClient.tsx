'use client';

import { useEffect, useRef } from 'react';

export default function SlotHeadClient({ html }: { html: string }) {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current || !html) return;
    injected.current = true;

    const temp = document.createElement('div');
    temp.innerHTML = html;

    Array.from(temp.children).forEach(el => {
      if (el.tagName === 'SCRIPT') {
        // Scripts inserted via innerHTML don't execute — must re-create
        const script = document.createElement('script');
        Array.from(el.attributes).forEach(attr => script.setAttribute(attr.name, attr.value));
        if (el.textContent) script.textContent = el.textContent;
        document.head.appendChild(script);
      } else {
        document.head.appendChild(el.cloneNode(true));
      }
    });
  }, [html]);

  return null;
}
