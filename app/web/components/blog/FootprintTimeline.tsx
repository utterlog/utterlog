'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type FootprintTimelineItem = {
  id: number;
  href: string;
  title: string;
  cover: string;
  location: string;
  flag?: string;
  date: string;
  placeKey: string;
  countryKey?: string;
  cityKey?: string;
  order: number;
};

type Line = {
  targetId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: string;
};

function sharesPlace(a: FootprintTimelineItem, b: FootprintTimelineItem) {
  return (
    (!!a.cityKey && a.cityKey === b.cityKey) ||
    (!!a.countryKey && a.countryKey === b.countryKey) ||
    (!!a.placeKey && a.placeKey === b.placeKey)
  );
}

export default function FootprintTimeline({ items }: { items: FootprintTimelineItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const linkedItemIds = useMemo(() => {
    const ids = new Set<number>();
    items.forEach((item) => {
      if (items.some((target) => target.id !== item.id && sharesPlace(item, target))) {
        ids.add(item.id);
      }
    });
    return ids;
  }, [items]);

  const setCardRef = useCallback((id: number, node: HTMLElement | null) => {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  }, []);

  const updateLines = useCallback(() => {
    const container = containerRef.current;
    const activeItem = items.find((item) => item.id === activeItemId);
    if (!container || !activeItem) {
      setLines([]);
      return;
    }
    const relatedItems = items.filter((item) => item.id !== activeItem.id && sharesPlace(activeItem, item));
    if (relatedItems.length === 0) {
      setLines([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeNode = cardRefs.current.get(activeItem.id);
    if (!activeNode) {
      setLines([]);
      return;
    }
    const activeTarget = activeNode.querySelector<HTMLElement>('.footprint-card-cover') || activeNode;
    const activeRect = activeTarget.getBoundingClientRect();
    const source = {
      x: activeRect.left - containerRect.left + activeRect.width / 2 + container.scrollLeft,
      y: activeRect.top - containerRect.top + activeRect.height / 2 + container.scrollTop,
    };

    setLines(relatedItems
      .map((item) => {
        const node = cardRefs.current.get(item.id);
        if (!node) return null;
        const target = node.querySelector<HTMLElement>('.footprint-card-cover') || node;
        const rect = target.getBoundingClientRect();
        const x2 = rect.left - containerRect.left + rect.width / 2 + container.scrollLeft;
        const y2 = rect.top - containerRect.top + rect.height / 2 + container.scrollTop;
        const dx = x2 - source.x;
        const dy = y2 - source.y;
        const distance = Math.hypot(dx, dy) || 1;
        const bend = Math.min(80, Math.max(24, distance * 0.16));
        const direction = item.id > activeItem.id ? 1 : -1;
        const cx = (source.x + x2) / 2 + (-dy / distance) * bend * direction;
        const cy = (source.y + y2) / 2 + (dx / distance) * bend * direction;
        return {
          targetId: item.id,
          x1: source.x,
          y1: source.y,
          x2,
          y2,
          path: `M ${source.x} ${source.y} Q ${cx} ${cy} ${x2} ${y2}`,
        };
      })
      .filter(Boolean) as Line[]);
  }, [activeItemId, items]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateLines);
    window.addEventListener('resize', updateLines);
    window.addEventListener('scroll', updateLines, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateLines);
      window.removeEventListener('scroll', updateLines, true);
    };
  }, [updateLines]);

  if (items.length === 0) {
    return <div className="footprint-empty">暂无足迹文章</div>;
  }

  return (
    <div ref={containerRef} className="footprint-timeline-wrap">
      <svg className="footprint-link-lines" aria-hidden="true">
        <defs>
          <marker
            id="footprint-link-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill="currentColor" />
          </marker>
        </defs>
        {lines.map((line) => (
          <path
            key={`${activeItemId || 'idle'}-${line.targetId}`}
            className="footprint-link-line"
            d={line.path}
            markerEnd="url(#footprint-link-arrow)"
          />
        ))}
      </svg>
      <div className="footprint-timeline">
        {items.map((item) => {
          const hasLinkedPosts = linkedItemIds.has(item.id);
          const activeItem = activeItemId ? items.find((entry) => entry.id === activeItemId) : null;
          const active = item.id === activeItemId || (!!activeItem && sharesPlace(activeItem, item));
          return (
            <article
              key={item.id}
              ref={(node) => setCardRef(item.id, node)}
              className={`footprint-card${hasLinkedPosts ? ' is-linkable' : ''}${active ? ' is-active' : ''}`}
              onMouseEnter={() => setActiveItemId(item.id)}
              onMouseLeave={() => setActiveItemId(null)}
              onFocus={() => setActiveItemId(item.id)}
              onBlur={() => setActiveItemId(null)}
            >
              <Link href={item.href} prefetch={false} className="footprint-card-cover" onClick={(event) => event.stopPropagation()}>
                <img src={item.cover} alt="" loading="lazy" onLoad={updateLines} />
                {item.id === activeItemId && (
                  <span className="footprint-card-pulse" aria-hidden="true">
                    <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
                      <g fill="none" fillRule="evenodd" transform="translate(1 1)" strokeWidth="2">
                        <circle cx="22" cy="22" r="6" strokeOpacity="0">
                          <animate attributeName="r" begin="0s" dur="3s" values="6;22" calcMode="linear" repeatCount="indefinite" />
                          <animate attributeName="stroke-opacity" begin="0s" dur="3s" values="1;0" calcMode="linear" repeatCount="indefinite" />
                          <animate attributeName="stroke-width" begin="0s" dur="3s" values="2;0" calcMode="linear" repeatCount="indefinite" />
                        </circle>
                        <circle cx="22" cy="22" r="6" strokeOpacity="0">
                          <animate attributeName="r" begin="1.5s" dur="3s" values="6;22" calcMode="linear" repeatCount="indefinite" />
                          <animate attributeName="stroke-opacity" begin="1.5s" dur="3s" values="1;0" calcMode="linear" repeatCount="indefinite" />
                          <animate attributeName="stroke-width" begin="1.5s" dur="3s" values="2;0" calcMode="linear" repeatCount="indefinite" />
                        </circle>
                        <circle cx="22" cy="22" r="8">
                          <animate attributeName="r" begin="0s" dur="1.5s" values="6;1;2;3;4;5;6" calcMode="linear" repeatCount="indefinite" />
                        </circle>
                      </g>
                    </svg>
                  </span>
                )}
                <span className="footprint-card-order">{item.order}</span>
              </Link>
              <div className="footprint-card-body">
                <Link href={item.href} prefetch={false} className="footprint-card-title" onClick={(event) => event.stopPropagation()}>
                  <strong>{item.title}</strong>
                </Link>
                <div className="footprint-card-meta">
                  <span className="footprint-card-location">
                    {item.flag && <img src={item.flag} alt="" loading="lazy" />}
                    <span>{item.location || '未命名地点'}</span>
                  </span>
                  {item.date && <time dateTime={item.date}>{item.date}</time>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
