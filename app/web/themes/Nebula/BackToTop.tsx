'use client';

import { useEffect, useRef, useState } from 'react';

function getScrollableMain(): HTMLElement | null {
  const main = document.querySelector('.blog-main') as HTMLElement | null;
  if (main && main.scrollHeight > main.clientHeight + 1) return main;
  return null;
}

/**
 * 「回到顶部」按钮 —— 现在贴在 footer 右侧、.nebula-container 之外
 * （也就是页面最右侧），脱离主内容流，垂直居中于 footer。
 *
 * 注意：globals.css 给 .blog-main 加了 overflow-y: scroll !important，
 * 真正的滚动容器是 .blog-main 而非 window，因此监听 + 滚动目标都用它。
 *
 * 滚动距离 ≤ 400px：visibility:hidden 占位（避免按钮跳出/抖动）
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const returningTopRef = useRef(false);

  useEffect(() => {
    const main = getScrollableMain();
    const update = () => {
      const scrollTop = main ? main.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;
      if (returningTopRef.current && scrollTop <= 4) {
        returningTopRef.current = false;
      }
      setVisible(returningTopRef.current || scrollTop > 400);
    };
    update();
    main?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      main?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, []);

  const scrollToTop = () => {
    const main = getScrollableMain();
    returningTopRef.current = true;
    setVisible(true);
    (document.activeElement as HTMLElement | null)?.blur?.();

    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
      window.setTimeout(() => {
        if (main.scrollTop > 2) main.scrollTo({ top: 0, behavior: 'auto' });
        returningTopRef.current = false;
        setVisible(false);
      }, 900);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.setTimeout(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        if (scrollTop > 2) window.scrollTo({ top: 0, behavior: 'auto' });
        returningTopRef.current = false;
        setVisible(false);
      }, 900);
    }
  };

  return (
    <button
      type="button"
      className={`nebula-back-to-top${visible ? '' : ' is-hidden'}`}
      onClick={scrollToTop}
      title="回到顶部"
      aria-label="回到顶部"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <i className="fa-solid fa-arrow-up" aria-hidden="true" />
    </button>
  );
}
