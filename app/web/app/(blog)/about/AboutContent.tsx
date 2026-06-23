'use client';

import { useThemeContext } from '@/lib/theme-context';
import SocialLinks from '@/components/blog/SocialLinks';
import PageTitle from '@/components/blog/PageTitle';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type AboutProfile = {
  name?: string;
  avatar?: string;
  title?: string;
  bio?: string;
  mbti?: string;
  location?: string;
  status?: string;
  occupation?: string;
  languages?: string;
  focus?: string;
};

type AboutHobby = {
  icon?: string;
  title?: string;
  description?: string;
};

type AboutMusic = {
  title?: string;
  artist?: string;
  note?: string;
  url?: string;
};

type AboutUpdate = {
  date?: string;
  type?: string;
  title?: string;
  description?: string;
};

type AboutConfig = {
  mode?: 'template' | 'markdown';
  template?: string;
  profile?: AboutProfile;
  hobbies?: AboutHobby[];
  music?: AboutMusic[];
  updates?: AboutUpdate[];
};

const defaultHobbies: AboutHobby[] = [
  { icon: 'fa-sharp fa-light fa-pen-nib', title: '写作', description: '记录产品、设计、技术和生活里的长期问题。' },
  { icon: 'fa-sharp fa-light fa-camera-retro', title: '摄影', description: '用图片保存路上的光线、城市和一些偶然瞬间。' },
  { icon: 'fa-sharp fa-light fa-music', title: '音乐', description: '工作和通勤时离不开的背景声，也会收藏阶段性的循环歌单。' },
  { icon: 'fa-sharp fa-light fa-plane-departure', title: '旅行', description: '喜欢慢一点认识城市，把去过的地方写进文章和足迹。' },
];

const defaultMusic: AboutMusic[] = [
  { title: 'Late Night Drive', artist: 'Playlist', note: '适合深夜写作' },
  { title: 'City Walk', artist: 'Daily Mix', note: '适合散步和整理思路' },
  { title: 'Focus Mode', artist: 'Instrumental', note: '适合编码和阅读' },
];

const defaultUpdates: AboutUpdate[] = [
  { date: '2026-04-29', type: '更新', title: '关于页升级', description: '将关于页面改为结构化个人资料、兴趣、音乐和站点记录。' },
  { date: '2026-04-01', type: '记录', title: '持续写作', description: '继续用文章保存想法、项目和旅途中的观察。' },
  { date: '2026-01-01', type: '开始', title: '新的一年', description: '整理站点方向，让博客更像一个长期主页。' },
];

function parseAboutConfig(raw: unknown): AboutConfig {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed as AboutConfig : {};
  } catch {
    return {};
  }
}

function notEmpty<T extends { title?: string }>(items: T[] | undefined, fallback: T[]) {
  const clean = Array.isArray(items) ? items.filter(item => item?.title?.trim()) : [];
  return clean.length > 0 ? clean : fallback;
}

function formatNumber(value: number) {
  if (!value) return '0';
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString();
}

export default function AboutContent() {
  const { options, owner, site, archiveStats } = useThemeContext();
  const config = parseAboutConfig(options.page_about_config);
  const aboutMode = config.mode === 'markdown' ? 'markdown' : 'template';
  const profile = config.profile || {};
  const name = profile.name || owner.nickname || site.title || 'Utterlog';
  const avatar = profile.avatar || owner.avatar || site.logo;
  const title = profile.title || site.subtitle || '用文字、图片和项目记录正在发生的生活。';
  const bio = profile.bio || owner.bio || site.description || '这里会持续保存关于产品、设计、开发、旅行和日常观察的内容。';
  const markdownContent = (options.page_about_markdown || '').trim();
  const hobbies = notEmpty(config.hobbies, defaultHobbies);
  const music = notEmpty(config.music, defaultMusic);
  const updates = notEmpty(config.updates, defaultUpdates);
  const detailItems = [
    { label: 'MBTI', value: profile.mbti || 'INTJ', icon: 'fa-sharp fa-light fa-brain-circuit' },
    { label: '所在地', value: profile.location || '地球在线', icon: 'fa-sharp fa-light fa-location-dot' },
    { label: '身份', value: profile.occupation || '独立博客作者', icon: 'fa-sharp fa-light fa-id-card-clip' },
    { label: '语言', value: profile.languages || '中文 / English', icon: 'fa-sharp fa-light fa-language' },
    { label: '正在关注', value: profile.focus || '产品、设计、开发', icon: 'fa-sharp fa-light fa-sparkles' },
    { label: '文章', value: `${archiveStats.post_count || 0} 篇`, icon: 'fa-sharp fa-light fa-newspaper' },
  ];

  return (
    <div className="about-page">
      <PageTitle title="关于" icon="fa-sharp fa-light fa-user" actions={<SocialLinks options={options} />} />

      {aboutMode === 'markdown' ? (
        <div className="about-wrap about-page-body">
          <section className="about-section">
            <div className="about-section-head">
              <i className="fa-brands fa-markdown" aria-hidden="true" />
              <h3>自定义介绍</h3>
            </div>
            <div className="blog-prose">
              {markdownContent ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node: _node, ...props }) => (
                      <a {...props} target={props.href?.startsWith('http') ? '_blank' : undefined} rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined} />
                    ),
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              ) : null}
            </div>
          </section>
        </div>
      ) : (
        <div className="about-wrap about-page-body">
        <section className="about-hero">
          <div className="about-avatar-box">
            {avatar ? (
              <img src={avatar} alt={name} className="about-avatar" />
            ) : (
              <i className="fa-sharp fa-light fa-user" aria-hidden="true" />
            )}
          </div>
          <div className="about-hero-copy">
            <div className="about-status">
              <span className="about-status-dot" />
              {profile.status || '持续写作中'}
            </div>
            <h2>{name}</h2>
            <p className="about-lead">{title}</p>
            <p className="about-bio">{bio}</p>
          </div>
          <div className="about-stat-panel">
            <div>
              <strong>{formatNumber(archiveStats.total_views || 0)}</strong>
              <span>总浏览</span>
            </div>
            <div>
              <strong>{formatNumber(archiveStats.word_count || 0)}</strong>
              <span>总字数</span>
            </div>
            <div>
              <strong>{archiveStats.days || 0}</strong>
              <span>运行天数</span>
            </div>
          </div>
        </section>

        <section className="about-section">
          <div className="about-section-head">
            <i className="fa-sharp fa-light fa-address-card" aria-hidden="true" />
            <h3>个人信息</h3>
          </div>
          <div className="about-detail-grid">
            {detailItems.map(item => (
              <div className="about-detail-item" key={item.label}>
                <i className={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="about-section">
          <div className="about-section-head">
            <i className="fa-sharp fa-light fa-stars" aria-hidden="true" />
            <h3>兴趣爱好</h3>
          </div>
          <div className="about-hobby-grid">
            {hobbies.map((item, index) => (
              <article className="about-hobby-card" key={`${item.title}-${index}`}>
                <i className={item.icon || 'fa-sharp fa-light fa-star'} aria-hidden="true" />
                <h4>{item.title}</h4>
                {item.description && <p>{item.description}</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="about-section">
          <div className="about-section-head">
            <i className="fa-sharp fa-light fa-music" aria-hidden="true" />
            <h3>最近喜欢</h3>
          </div>
          <div className="about-music-list">
            {music.map((item, index) => {
              const inner = (
                <>
                  <span className="about-music-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="about-music-title">{item.title}</span>
                  {item.artist && <span className="about-music-artist">{item.artist}</span>}
                  {item.note && <span className="about-music-note">{item.note}</span>}
                </>
              );
              return item.url ? (
                <a className="about-music-item" key={`${item.title}-${index}`} href={item.url} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <div className="about-music-item" key={`${item.title}-${index}`}>{inner}</div>
              );
            })}
          </div>
        </section>

        <section className="about-section">
          <div className="about-section-head">
            <i className="fa-sharp fa-light fa-timeline-arrow" aria-hidden="true" />
            <h3>站点更新记录</h3>
          </div>
          <div className="about-timeline">
            {updates.map((item, index) => (
              <article className="about-timeline-item" key={`${item.date}-${item.title}-${index}`}>
                <time>{item.date}</time>
                <div>
                  {item.type && <span>{item.type}</span>}
                  <h4>{item.title}</h4>
                  {item.description && <p>{item.description}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
        </div>
      )}
    </div>
  );
}
