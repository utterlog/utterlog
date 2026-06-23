import { useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { ImportUrlModal } from '@/components/ui/import-url-modal';

// VideoFormSection —— 影视编辑器（v2.4.2）
//
// 由 PostCreate/PostEdit 在 type=video 时渲染。统一管理两块状态：
//
//   1. meta —— 影视元数据 JSON 对象（写入 ul_posts.meta JSONB）
//      字段约定见 Bun API 的 posts/video payload。
//
//   2. episodes —— 剧集数组（写入 ul_post_episodes，整体替换语义）
//      每集字段：{episode_no, title, video_url, embed_url, platform,
//      alt_sources: [{label, url, platform?}], duration, cover_url}
//
// onChange 把内部状态同步给父组件，父组件存到自己的 state，提交时
// 在 payload 里加入 meta + episodes 字段，复用现有 postsApi.create/update。
//
// 「豆瓣/NeoDB 导入」按钮调 /media/parse —— 后端用 JSON-LD + #info 抓
// 豆瓣电影页的导演/主演/年份/评分/类型/地区/语言/IMDb；NeoDB 走自家
// 公开 API。回包通过 onImportedExtras 传递封面/标题/简介给父组件，
// 父组件可选择写入 cover_url 字段或追加到正文。

export interface VideoMeta {
  video_type?: string;   // tv | movie | show | anime | doc
  region?: string;
  year?: number | '';
  total_episodes?: number | '';
  directors?: string;    // 用逗号/空格分隔的字符串简化输入；保存时按数组存
  actors?: string;
  genres?: string;
  language?: string;
  douban_rating?: number | '';
  douban_url?: string;
  imdb_id?: string;
  tips?: string;
}

export interface VideoEpisode {
  episode_no: number;
  title: string;
  video_url: string;
  embed_url: string;
  platform: string;
  alt_sources: Array<{ label: string; url: string; platform?: string }>;
  duration: string;
  cover_url: string;
}

interface Props {
  initialMeta?: any;
  initialEpisodes?: any[];
  onChange: (data: { meta: any; episodes: VideoEpisode[] }) => void;
  // 豆瓣/NeoDB 导入回包里有封面 / 标题 / 简介，VideoFormSection 只管 meta，
  // 父组件用这个回调写入 PostCreate/PostEdit 自己的 cover_url / title / 正文。
  onImportedExtras?: (extras: { coverUrl?: string; title?: string; summary?: string }) => void;
}

// 把 video URL 自动推导成 iframe 嵌入 URL（与 Videos.tsx 同逻辑保持一致）
function deriveEmbedUrl(url: string): string {
  if (!url) return '';
  const yt = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const bv = url.match(/(BV[a-zA-Z0-9]+)/);
  if (bv) return `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0`;
  const av = url.match(/av(\d+)/);
  if (av) return `https://player.bilibili.com/player.html?aid=${av[1]}&autoplay=0`;
  if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(url)) return url;
  return '';
}

function derivePlatform(url: string): string {
  if (!url) return '';
  if (/youtu\.?be/.test(url)) return 'youtube';
  if (/bilibili/.test(url) || /^bv|^av/i.test(url)) return 'bilibili';
  if (/\.m3u8(\?|$)/i.test(url)) return 'hls';
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return 'direct';
  return '';
}

// 元数据数组字段（directors / actors / genres）在表单里以 "张三, 李四"
// 字符串形式编辑，保存到 meta 时序列化成字符串数组。
function splitTags(s: string): string[] {
  if (!s) return [];
  return s.split(/[,，、\s]+/).map(x => x.trim()).filter(Boolean);
}
function joinTags(arr: any): string {
  if (!Array.isArray(arr)) return typeof arr === 'string' ? arr : '';
  return arr.join(', ');
}

export default function VideoFormSection({ initialMeta, initialEpisodes, onChange, onImportedExtras }: Props) {
  // meta 字符串化字段（directors/actors/genres）保留 raw 字符串形式
  const [meta, setMeta] = useState<VideoMeta>({
    video_type: initialMeta?.video_type || 'tv',
    region: initialMeta?.region || '',
    year: initialMeta?.year || '',
    total_episodes: initialMeta?.total_episodes || '',
    directors: joinTags(initialMeta?.directors),
    actors: joinTags(initialMeta?.actors),
    genres: joinTags(initialMeta?.genres),
    language: initialMeta?.language || '',
    douban_rating: initialMeta?.douban_rating || '',
    douban_url: initialMeta?.douban_url || '',
    imdb_id: initialMeta?.imdb_id || '',
    tips: initialMeta?.tips || '',
  });

  const [episodes, setEpisodes] = useState<VideoEpisode[]>(() => {
    if (!initialEpisodes || initialEpisodes.length === 0) return [];
    return initialEpisodes.map((e: any) => ({
      episode_no: e.episode_no,
      title: e.title || '',
      video_url: e.video_url || '',
      embed_url: e.embed_url || '',
      platform: e.platform || '',
      alt_sources: Array.isArray(e.alt_sources) ? e.alt_sources :
        (typeof e.alt_sources === 'string' ? (() => { try { return JSON.parse(e.alt_sources); } catch { return []; } })() : []),
      duration: e.duration || '',
      cover_url: e.cover_url || '',
    }));
  });

  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // 把 /media/parse 回包合并进 meta —— 只填写空字段（不覆盖用户已经手填的内容）
  const applyImportedMeta = (data: any) => {
    const ext = data?.extra || {};
    const next: VideoMeta = { ...meta };
    const setIfEmpty = (k: keyof VideoMeta, v: any) => {
      if (v === undefined || v === null || v === '') return;
      if (next[k] === undefined || next[k] === '' || next[k] === 0) {
        (next as any)[k] = v;
      }
    };
    setIfEmpty('directors', data.artist);
    setIfEmpty('actors', ext.actors);
    setIfEmpty('genres', ext.genres || ext.genre);
    setIfEmpty('region', ext.region || ext.area);
    setIfEmpty('language', ext.language);
    setIfEmpty('imdb_id', ext.imdb_id);
    if (data.year) setIfEmpty('year', parseInt(String(data.year), 10) || undefined as any);
    if (data.rating) setIfEmpty('douban_rating', data.rating);
    if (ext.total_episodes) setIfEmpty('total_episodes', parseInt(String(ext.total_episodes), 10) || undefined as any);
    if (data.platform === 'douban' && data.url) setIfEmpty('douban_url', data.url);
    setMeta(next);
    // 封面 / 标题 / 简介交给父组件按需写入（VideoFormSection 不持有这些字段）
    if (onImportedExtras) {
      onImportedExtras({ coverUrl: data.cover_url, title: data.title, summary: data.summary });
    }
  };

  // meta + episodes 任一变化都通知父组件
  useEffect(() => {
    const serialized = {
      ...meta,
      year: typeof meta.year === 'string' && meta.year === '' ? undefined : Number(meta.year) || undefined,
      total_episodes: typeof meta.total_episodes === 'string' && meta.total_episodes === '' ? undefined : Number(meta.total_episodes) || undefined,
      douban_rating: typeof meta.douban_rating === 'string' && meta.douban_rating === '' ? undefined : Number(meta.douban_rating) || undefined,
      directors: splitTags(meta.directors || ''),
      actors: splitTags(meta.actors || ''),
      genres: splitTags(meta.genres || ''),
    };
    // 移除 undefined 值（保持 meta JSON 干净）
    Object.keys(serialized).forEach((k) => {
      if ((serialized as any)[k] === undefined || (serialized as any)[k] === '') delete (serialized as any)[k];
    });
    onChange({ meta: serialized, episodes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, episodes]);

  const addEpisode = () => {
    const nextNo = episodes.length === 0 ? 1 : Math.max(...episodes.map(e => e.episode_no)) + 1;
    setEpisodes([...episodes, {
      episode_no: nextNo,
      title: `第 ${String(nextNo).padStart(2, '0')} 集`,
      video_url: '', embed_url: '', platform: '', alt_sources: [], duration: '', cover_url: '',
    }]);
  };

  const updateEpisode = (idx: number, patch: Partial<VideoEpisode>) => {
    setEpisodes(eps => eps.map((e, i) => {
      if (i !== idx) return e;
      const next = { ...e, ...patch };
      // 用户改 video_url 时自动推导 embed_url 和 platform（若用户未手填）
      if (patch.video_url !== undefined && next.video_url) {
        if (!e.embed_url || e.embed_url === e.video_url) {
          next.embed_url = deriveEmbedUrl(next.video_url);
        }
        if (!e.platform) {
          next.platform = derivePlatform(next.video_url);
        }
      }
      return next;
    }));
  };

  const deleteEpisode = (idx: number) => setEpisodes(eps => eps.filter((_, i) => i !== idx));

  const moveEpisode = (idx: number, dir: -1 | 1) => {
    setEpisodes(eps => {
      const j = idx + dir;
      if (j < 0 || j >= eps.length) return eps;
      const next = [...eps];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const addAltSource = (epIdx: number) => {
    setEpisodes(eps => eps.map((e, i) => i === epIdx
      ? { ...e, alt_sources: [...e.alt_sources, { label: `备线 ${e.alt_sources.length + 1}`, url: '' }] }
      : e));
  };
  const updateAlt = (epIdx: number, altIdx: number, patch: Partial<{ label: string; url: string }>) => {
    setEpisodes(eps => eps.map((e, i) => i === epIdx
      ? { ...e, alt_sources: e.alt_sources.map((a, j) => j === altIdx ? { ...a, ...patch } : a) }
      : e));
  };
  const deleteAlt = (epIdx: number, altIdx: number) => {
    setEpisodes(eps => eps.map((e, i) => i === epIdx
      ? { ...e, alt_sources: e.alt_sources.filter((_, j) => j !== altIdx) }
      : e));
  };

  // 批量粘贴：每行一个 URL，自动编号递增；或 "N|title|url" 三段格式
  const applyBulkPaste = () => {
    const lines = bulkPasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const startNo = episodes.length === 0 ? 1 : Math.max(...episodes.map(e => e.episode_no)) + 1;
    const next: VideoEpisode[] = [...episodes];
    lines.forEach((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      let no: number, title: string, url: string;
      if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
        no = parseInt(parts[0], 10);
        title = parts[1] || `第 ${String(no).padStart(2, '0')} 集`;
        url = parts[2];
      } else {
        no = startNo + idx;
        title = `第 ${String(no).padStart(2, '0')} 集`;
        url = line;
      }
      next.push({
        episode_no: no, title, video_url: url,
        embed_url: deriveEmbedUrl(url), platform: derivePlatform(url),
        alt_sources: [], duration: '', cover_url: '',
      });
    });
    setEpisodes(next);
    setBulkPasteOpen(false);
    setBulkPasteText('');
  };

  const sectionTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 4 };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      {/* ============================= 元数据 ============================= */}
      <h3 style={sectionTitleStyle}>
        <i className="fa-regular fa-clapperboard-play" style={{ marginRight: 6 }} />
        影视元数据
        <span style={{ float: 'right' }}>
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <i className="fa-regular fa-cloud-arrow-down" style={{ fontSize: 11 }} /> 链接导入（豆瓣 / NeoDB）
          </Button>
        </span>
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>类型</label>
          <select className="input" value={meta.video_type} onChange={e => setMeta({ ...meta, video_type: e.target.value })}>
            <option value="tv">剧集</option>
            <option value="movie">电影</option>
            <option value="show">综艺</option>
            <option value="anime">动漫</option>
            <option value="doc">纪录片</option>
          </select>
        </div>
        <div><label style={labelStyle}>地区</label><Input value={meta.region} onChange={(e: any) => setMeta({ ...meta, region: e.target.value })} placeholder="美国 / 大陆 / 韩国" /></div>
        <div><label style={labelStyle}>年份</label><Input type="number" value={String(meta.year)} onChange={(e: any) => setMeta({ ...meta, year: e.target.value })} placeholder="2024" /></div>
        <div><label style={labelStyle}>总集数</label><Input type="number" value={String(meta.total_episodes)} onChange={(e: any) => setMeta({ ...meta, total_episodes: e.target.value })} placeholder="22" /></div>
        <div><label style={labelStyle}>语言</label><Input value={meta.language} onChange={(e: any) => setMeta({ ...meta, language: e.target.value })} placeholder="中文 / 英语" /></div>
        <div><label style={labelStyle}>豆瓣评分</label><Input type="number" step="0.1" value={String(meta.douban_rating)} onChange={(e: any) => setMeta({ ...meta, douban_rating: e.target.value })} placeholder="8.5" /></div>
        <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>导演（用逗号分隔）</label><Input value={meta.directors} onChange={(e: any) => setMeta({ ...meta, directors: e.target.value })} placeholder="导演 1, 导演 2" /></div>
        <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>主演（用逗号分隔）</label><Input value={meta.actors} onChange={(e: any) => setMeta({ ...meta, actors: e.target.value })} placeholder="主演 1, 主演 2" /></div>
        <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>类型标签（用逗号分隔）</label><Input value={meta.genres} onChange={(e: any) => setMeta({ ...meta, genres: e.target.value })} placeholder="剧情, 悬疑, 越狱" /></div>
        <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>豆瓣 URL</label><Input value={meta.douban_url} onChange={(e: any) => setMeta({ ...meta, douban_url: e.target.value })} placeholder="https://movie.douban.com/..." /></div>
        <div><label style={labelStyle}>IMDB ID</label><Input value={meta.imdb_id} onChange={(e: any) => setMeta({ ...meta, imdb_id: e.target.value })} placeholder="tt0944947" /></div>
        <div style={{ gridColumn: 'span 3' }}>
          <label style={labelStyle}>温馨提示（显示在影视页底部）</label>
          <textarea className="input" rows={2} value={meta.tips} onChange={e => setMeta({ ...meta, tips: e.target.value })}
            style={{ resize: 'vertical' }} placeholder="例如：本片仅限学习交流..." />
        </div>
      </div>

      {/* ============================= 剧集列表 ============================= */}
      <h3 style={sectionTitleStyle}>
        <i className="fa-regular fa-list-ol" style={{ marginRight: 6 }} />
        剧集列表（{episodes.length} 集）
        <span style={{ float: 'right', display: 'inline-flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => setBulkPasteOpen(true)}>
            <i className="fa-regular fa-paste" style={{ fontSize: 11 }} /> 批量粘贴
          </Button>
          <Button size="sm" onClick={addEpisode}>
            <i className="fa-regular fa-plus" style={{ fontSize: 11 }} /> 添加一集
          </Button>
        </span>
      </h3>

      {episodes.length === 0 ? (
        <div className="text-dim" style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, border: '1px dashed var(--color-border)' }}>
          暂无剧集。点上方「添加一集」或「批量粘贴」开始。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {episodes.map((ep, idx) => (
            <div key={idx} style={{ border: '1px solid var(--color-border)', padding: 12, background: 'var(--color-bg-card)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 120px 1fr 100px 96px', gap: 8, alignItems: 'center' }}>
                <Input value={String(ep.episode_no)} onChange={(e: any) => updateEpisode(idx, { episode_no: parseInt(e.target.value, 10) || 0 })}
                  placeholder="集号" style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', textAlign: 'center' }} />
                <Input value={ep.title} onChange={(e: any) => updateEpisode(idx, { title: e.target.value })} placeholder="第 01 集" style={{ fontSize: 13 }} />
                <Input value={ep.video_url} onChange={(e: any) => updateEpisode(idx, { video_url: e.target.value })}
                  placeholder="主线视频 URL（mp4/m3u8/YouTube/Bilibili）" style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }} />
                <Input value={ep.platform} onChange={(e: any) => updateEpisode(idx, { platform: e.target.value })}
                  placeholder="自动" style={{ fontSize: 11 }} />
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-square btn-sm" disabled={idx === 0} onClick={() => moveEpisode(idx, -1)} title="上移">
                    <i className="fa-regular fa-chevron-up" style={{ fontSize: 11 }} />
                  </button>
                  <button className="btn btn-secondary btn-square btn-sm" disabled={idx === episodes.length - 1} onClick={() => moveEpisode(idx, 1)} title="下移">
                    <i className="fa-regular fa-chevron-down" style={{ fontSize: 11 }} />
                  </button>
                  <button className="btn btn-secondary btn-square btn-sm" onClick={() => deleteEpisode(idx)} title="删除"
                    style={{ color: '#dc2626' }}>
                    <i className="fa-regular fa-trash" style={{ fontSize: 11 }} />
                  </button>
                </div>
              </div>

              {/* 备线（alt_sources）—— 折叠展开 */}
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--color-text-sub)' }}>
                  备用线路 ({ep.alt_sources.length})
                </summary>
                <div style={{ marginTop: 8, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ep.alt_sources.map((a, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 32px', gap: 6 }}>
                      <Input value={a.label} onChange={(e: any) => updateAlt(idx, j, { label: e.target.value })} placeholder="备线名称" style={{ fontSize: 12 }} />
                      <Input value={a.url} onChange={(e: any) => updateAlt(idx, j, { url: e.target.value })} placeholder="备线 URL" style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }} />
                      <button className="btn btn-secondary btn-square btn-sm" onClick={() => deleteAlt(idx, j)} title="删除" style={{ color: '#dc2626' }}>
                        <i className="fa-regular fa-xmark" style={{ fontSize: 10 }} />
                      </button>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => addAltSource(idx)} style={{ alignSelf: 'flex-start' }}>
                    <i className="fa-regular fa-plus" style={{ fontSize: 10 }} /> 加一条备线
                  </Button>
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {/* 豆瓣 / NeoDB 链接导入 */}
      <ImportUrlModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={applyImportedMeta}
        type="movie"
        platforms="豆瓣电影、NeoDB（自动填写导演 / 主演 / 年份 / 评分 / 类型 / 地区 / 语言 / IMDb，封面回填到右侧封面字段）"
      />

      {/* 批量粘贴弹窗（用 details 当 modal 简化） */}
      {bulkPasteOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setBulkPasteOpen(false)}>
          <div className="card" style={{ width: 600, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>批量粘贴剧集</h3>
            <p className="text-dim" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.7 }}>
              每行一个 URL，自动按当前最大集号 +1 递增编号。<br/>
              或写「编号 | 标题 | URL」三段（用 <code>|</code> 分隔）精确指定每集。
            </p>
            <textarea className="input" rows={12} value={bulkPasteText} onChange={e => setBulkPasteText(e.target.value)}
              placeholder={`https://...e01.mp4\nhttps://...e02.mp4\n或\n1 | 第 01 集 序章 | https://...e01.mp4\n2 | 第 02 集 决战 | https://...e02.mp4`}
              style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <Button variant="secondary" onClick={() => setBulkPasteOpen(false)}>取消</Button>
              <Button onClick={applyBulkPaste}>追加 {bulkPasteText.split(/\r?\n/).filter(Boolean).length} 集</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
