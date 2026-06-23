import { useState } from 'react';
import { FormSectionA, FormFieldA, FormActionsA, FormRowA } from '@/components/form/FormA';
import { FormSectionC, FormRowC, FormRowInputC } from '@/components/form/FormC';

/**
 * Form style demo — /form-demo
 * Renders the same settings data in both style A and style C so you can pick.
 */
export default function FormDemo() {
  const [active, setActive] = useState<'A' | 'C'>('A');

  const [siteTitle, setSiteTitle] = useState('Utterlog');
  const [siteUrl, setSiteUrl] = useState('https://yoursite.com');
  const [siteDesc, setSiteDesc] = useState('一个关于设计、技术和生活的博客');
  const [email, setEmail] = useState('hi@example.com');
  const [allowComments, setAllowComments] = useState(true);
  const [moderation, setModeration] = useState(false);
  const [postsPerPage, setPostsPerPage] = useState('10');
  const [theme, setTheme] = useState('Azure');

  return (
    <div>
      {/* Style switcher */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24,
        padding: '8px 12px', background: 'var(--color-bg-soft)',
        border: '1px solid var(--color-border)',
      }}>
        <span className="text-sub" style={{ fontSize: 12, fontWeight: 600 }}>Form 风格：</span>
        {(['A', 'C'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            style={{
              padding: '4px 14px', fontSize: 12, fontWeight: 500,
              background: active === k ? 'var(--color-primary)' : 'var(--color-bg-card)',
              color: active === k ? '#fff' : 'var(--color-text-sub)',
              border: `1px solid ${active === k ? 'var(--color-primary)' : 'var(--color-border)'}`,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            风格 {k} {k === 'A' ? '(卡片分组)' : '(iOS 列表)'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="text-dim" style={{ fontSize: 11 }}>
          相同数据 · 两种渲染 · 点按钮切换
        </span>
      </div>

      {/* ================ Style A ================ */}
      {active === 'A' && (
        <div>
          <FormSectionA title="站点基础信息" description="访客第一眼看到的核心信息。">
            <FormRowA cols={2}>
              <FormFieldA label="站点名称" required hint="显示在浏览器 tab 和 Header">
                <input className="input" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} />
              </FormFieldA>
              <FormFieldA label="管理员邮箱" required>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormFieldA>
            </FormRowA>
            <FormFieldA label="站点 URL" hint="不含末尾 /，例：https://yoursite.com">
              <input className="input" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
            </FormFieldA>
            <FormFieldA label="站点描述" hint="出现在首页、SEO meta 中">
              <textarea className="input" rows={3} value={siteDesc} onChange={(e) => setSiteDesc(e.target.value)} />
            </FormFieldA>
          </FormSectionA>

          <FormSectionA title="评论">
            <FormFieldA label="允许评论" hint="关闭后所有文章都不会显示评论区" horizontal>
              <ToggleA checked={allowComments} onChange={setAllowComments} />
            </FormFieldA>
            <FormFieldA label="评论需审核" hint="新评论需手动批准后才显示" horizontal>
              <ToggleA checked={moderation} onChange={setModeration} />
            </FormFieldA>
            <FormFieldA label="每页文章数" horizontal>
              <input className="input text-sm" style={{ width: 100 }} type="number"
                value={postsPerPage} onChange={(e) => setPostsPerPage(e.target.value)} />
            </FormFieldA>
          </FormSectionA>

          <FormSectionA title="外观">
            <FormFieldA label="当前主题" hint="前台展示用的主题" horizontal>
              <select className="input text-sm" style={{ width: 200 }}
                value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option>Utterlog</option>
                <option>Azure</option>
                <option>Flux</option>
                <option>Chred</option>
              </select>
            </FormFieldA>
          </FormSectionA>

          <FormActionsA>
            <button className="btn btn-secondary">取消</button>
            <button className="btn">保存</button>
          </FormActionsA>
        </div>
      )}

      {/* ================ Style C ================ */}
      {active === 'C' && (
        <div>
          <FormSectionC title="站点基础信息" footerHint="访客第一眼看到的核心信息。">
            <FormRowInputC label="站点名称" value={siteTitle} onChange={setSiteTitle} hint="必填 · 显示在 tab 和 Header" />
            <FormRowInputC label="管理员邮箱" value={email} onChange={setEmail} type="email" hint="必填" />
            <FormRowInputC label="站点 URL" value={siteUrl} onChange={setSiteUrl} placeholder="https://..." />
            <FormRowInputC label="站点描述" value={siteDesc} onChange={setSiteDesc} />
          </FormSectionC>

          <FormSectionC title="评论">
            <FormRowC label="允许评论" hint="关闭后所有文章都不显示评论区">
              <ToggleC checked={allowComments} onChange={setAllowComments} />
            </FormRowC>
            <FormRowC label="评论需审核" hint="新评论需手动批准后才显示">
              <ToggleC checked={moderation} onChange={setModeration} />
            </FormRowC>
            <FormRowInputC label="每页文章数" value={postsPerPage} onChange={setPostsPerPage} type="number" />
          </FormSectionC>

          <FormSectionC title="外观">
            <FormRowC label="当前主题" value={theme} action="chevron" onClick={() => alert('跳到主题选择页')} />
            <FormRowC label="导出主题配置" hint="下载 JSON 备份"
              action="chevron" onClick={() => alert('导出')} icon="fa-regular fa-download" />
            <FormRowC label="重置为默认" danger action="chevron" onClick={() => alert('重置')}
              icon="fa-regular fa-arrow-rotate-left" />
          </FormSectionC>

          <FormSectionC title="账号">
            <FormRowC label="个人资料" action="chevron" icon="fa-regular fa-user" onClick={() => {}} />
            <FormRowC label="安全设置" action="chevron" icon="fa-regular fa-shield" onClick={() => {}} />
            <FormRowC label="退出登录" danger action="chevron" icon="fa-solid fa-right-from-bracket" onClick={() => {}} />
          </FormSectionC>
        </div>
      )}
    </div>
  );
}

function ToggleA({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, position: 'relative',
        background: checked ? 'var(--color-primary)' : 'var(--color-border)',
        border: 'none', cursor: 'pointer', transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 18, height: 18, background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function ToggleC({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <ToggleA checked={checked} onChange={onChange} />;
}
