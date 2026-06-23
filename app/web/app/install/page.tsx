'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/lib/navigation';

type Step = 'welcome' | 'admin' | 'site' | 'done';

interface StatusChecks {
  database: boolean;
  schema: boolean;
  admin_count: number;
}

interface StatusResp {
  installed: boolean;
  pending_finish?: boolean;
  install_token?: string;
  checks: StatusChecks;
  version: string;
}

const apiBase = (typeof window !== 'undefined' && (window as any).__utterlog_api_url) ||
  (process.env.NEXT_PUBLIC_API_URL || '/api/v1');

async function apiCall(path: string, opts: RequestInit = {}) {
  const r = await fetch(apiBase + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok || !data.success) {
    throw new Error(data?.error?.message || `HTTP ${r.status}`);
  }
  return data;
}

export default function InstallPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [installToken, setInstallToken] = useState('');

  const [admin, setAdmin] = useState({ username: '', email: '', password: '', nickname: '' });
  const [site, setSite] = useState({ site_title: 'Utterlog', site_url: '', description: '' });

  useEffect(() => {
    // Default site_url from browser
    if (typeof window !== 'undefined' && !site.site_url) {
      setSite(s => ({ ...s, site_url: window.location.origin }));
    }
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const r = await apiCall('/install/status');
      setStatus(r.data);
      if (r.data.installed) {
        setStep('done');
      } else if (r.data.pending_finish && r.data.install_token) {
        setInstallToken(r.data.install_token);
        setStep('site');
      } else if (r.data.checks.schema && r.data.checks.admin_count === 0) {
        // Schema ready, just need admin
        setStep('welcome');
      }
    } catch (e: any) {
      setError('无法连接后端 API：' + e.message);
    }
    setChecking(false);
  };

  const submitAdmin = async () => {
    setError('');
    if (!admin.username.trim() || !admin.email.trim() || !admin.password) {
      setError('请填写所有必填项');
      return;
    }
    if (admin.password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiCall('/install/create-admin', {
        method: 'POST',
        body: JSON.stringify(admin),
      });
      setInstallToken(r.data?.install_token || '');
      setStep('site');
    } catch (e: any) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  const submitSite = async () => {
    setError('');
    setSubmitting(true);
    try {
      await apiCall('/install/finish', {
        method: 'POST',
        body: JSON.stringify({ ...site, install_token: installToken }),
      });
      setStep('done');
    } catch (e: any) {
      setError(e.message);
    }
    setSubmitting(false);
  };

  // ===== Styles =====
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', background: '#f8f9fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const cardStyle: React.CSSProperties = {
    width: '100%', maxWidth: '520px', background: '#fff',
    border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  };
  const headerStyle: React.CSSProperties = {
    padding: '28px 32px 20px', borderBottom: '1px solid #e5e7eb',
  };
  const bodyStyle: React.CSSProperties = { padding: '28px 32px' };
  const footerStyle: React.CSSProperties = {
    padding: '16px 32px', borderTop: '1px solid #e5e7eb',
    display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#fafafa',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: '14px',
    border: '1px solid #d1d5db', outline: 'none', background: '#fff',
    color: '#111', fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: 600,
    color: '#374151', marginBottom: '6px',
  };
  const primaryBtn: React.CSSProperties = {
    padding: '8px 20px', fontSize: '13px', fontWeight: 600,
    border: 'none', background: '#0052D9', color: '#fff',
    cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
  };
  const secondaryBtn: React.CSSProperties = {
    padding: '8px 20px', fontSize: '13px', fontWeight: 500,
    border: '1px solid #d1d5db', background: '#fff', color: '#374151',
    cursor: 'pointer',
  };

  const StepIndicator = () => {
    const steps: { key: Step; label: string }[] = [
      { key: 'welcome', label: '欢迎' },
      { key: 'admin', label: '管理员' },
      { key: 'site', label: '站点信息' },
      { key: 'done', label: '完成' },
    ];
    const idx = steps.findIndex(s => s.key === step);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
        {steps.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '22px', height: '22px', fontSize: '11px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i <= idx ? '#0052D9' : '#e5e7eb',
              color: i <= idx ? '#fff' : '#6b7280',
              borderRadius: '50%',
            }}>{i + 1}</div>
            <span style={{
              fontSize: '12px', fontWeight: i === idx ? 600 : 400,
              color: i === idx ? '#111' : '#6b7280',
            }}>{s.label}</span>
            {i < steps.length - 1 && <span style={{ color: '#d1d5db' }}>›</span>}
          </div>
        ))}
      </div>
    );
  };

  if (checking) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#6b7280', fontSize: '14px' }}>正在检查环境…</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#111' }}>Utterlog 安装向导</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0' }}>几步完成初始化</p>
          <StepIndicator />
        </div>

        <div style={bodyStyle}>
          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: '16px',
              background: '#fef2f2', border: '1px solid #fecaca',
              color: '#b91c1c', fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          {/* ===== Step 1: Welcome / environment check ===== */}
          {step === 'welcome' && status && (
            <>
              <p style={{ fontSize: '14px', color: '#374151', lineHeight: 1.7, margin: '0 0 16px' }}>
                欢迎使用 Utterlog — 一个现代化的个人博客系统。环境检测如下：
              </p>
              <div style={{ background: '#f9fafb', padding: '14px 16px', marginBottom: '20px' }}>
                <EnvCheck label="数据库连接" ok={status.checks.database} />
                <EnvCheck label="数据库 Schema" ok={status.checks.schema}
                  hint={!status.checks.schema ? '正在等待 schema 初始化，请稍后刷新重试' : undefined} />
                <EnvCheck label="管理员账号" ok={status.checks.admin_count > 0}
                  hint={status.checks.admin_count === 0 ? '下一步创建' : undefined} />
              </div>
              {!status.checks.schema && (
                <div style={{
                  padding: '10px 14px', marginBottom: '16px',
                  background: '#fffbeb', border: '1px solid #fde68a',
                  color: '#92400e', fontSize: '12px', lineHeight: 1.7,
                }}>
                  数据库尚未初始化。Bun app 会在数据库可连接时自动加载 <code style={{ background: '#fde68a', padding: '1px 5px' }}>app/server/assets/schema.sql</code>；如果长时间未就绪，请检查应用日志和数据库权限。
                </div>
              )}
            </>
          )}

          {/* ===== Step 2: Admin ===== */}
          {step === 'admin' && (
            <>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                创建管理员账号 — 你将用它登录后台。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>用户名 *</label>
                  <input style={inputStyle} value={admin.username}
                    onChange={e => setAdmin({ ...admin, username: e.target.value })} placeholder="admin" />
                </div>
                <div>
                  <label style={labelStyle}>昵称</label>
                  <input style={inputStyle} value={admin.nickname}
                    onChange={e => setAdmin({ ...admin, nickname: e.target.value })} placeholder="留空默认同用户名" />
                </div>
                <div>
                  <label style={labelStyle}>邮箱 *</label>
                  <input style={inputStyle} type="email" value={admin.email}
                    onChange={e => setAdmin({ ...admin, email: e.target.value })} placeholder="you@example.com" />
                </div>
                <div>
                  <label style={labelStyle}>密码 * <span style={{ color: '#9ca3af', fontWeight: 400 }}>（至少 8 位）</span></label>
                  <input style={inputStyle} type="password" value={admin.password}
                    onChange={e => setAdmin({ ...admin, password: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {/* ===== Step 3: Site ===== */}
          {step === 'site' && (
            <>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                设置站点基础信息，稍后可在后台「设置」中随时修改。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>站点名称</label>
                  <input style={inputStyle} value={site.site_title}
                    onChange={e => setSite({ ...site, site_title: e.target.value })} placeholder="我的博客" />
                </div>
                <div>
                  <label style={labelStyle}>站点 URL</label>
                  <input style={inputStyle} value={site.site_url}
                    onChange={e => setSite({ ...site, site_url: e.target.value })} placeholder="https://yourdomain.com" />
                </div>
                <div>
                  <label style={labelStyle}>站点描述</label>
                  <input style={inputStyle} value={site.description}
                    onChange={e => setSite({ ...site, description: e.target.value })} placeholder="一句话介绍你的博客" />
                </div>
              </div>
            </>
          )}

          {/* ===== Step 4: Done ===== */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: '56px', height: '56px', margin: '0 auto 16px',
                borderRadius: '50%', background: '#dcfce7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="fa-solid fa-check" style={{ color: '#16a34a', fontSize: '24px' }} />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px', color: '#111' }}>安装完成</h2>
              <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.7, margin: 0 }}>
                Utterlog 已就绪。现在可以登录后台开始使用。
              </p>
            </div>
          )}
        </div>

        <div style={footerStyle}>
          {step === 'welcome' && (
            <button style={primaryBtn}
              disabled={!status?.checks.database || !status?.checks.schema}
              onClick={() => setStep('admin')}>
              下一步 →
            </button>
          )}
          {step === 'admin' && (
            <>
              <button style={secondaryBtn} onClick={() => setStep('welcome')}>← 上一步</button>
              <button style={primaryBtn} onClick={submitAdmin} disabled={submitting}>
                {submitting ? '创建中…' : '创建管理员 →'}
              </button>
            </>
          )}
          {step === 'site' && (
            <button style={primaryBtn} onClick={submitSite} disabled={submitting}>
              {submitting ? '保存中…' : '完成安装'}
            </button>
          )}
          {step === 'done' && (
            <>
              <button style={secondaryBtn} onClick={() => router.push('/')}>访问首页</button>
              <button style={primaryBtn} onClick={() => { window.location.href = '/admin/login'; }}>登录后台</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EnvCheck({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '6px 0', fontSize: '13px',
    }}>
      <span style={{
        width: '18px', height: '18px', borderRadius: '50%',
        background: ok ? '#16a34a' : '#dc2626', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px',
      }}>{ok ? '✓' : '!'}</span>
      <span style={{ color: '#374151', fontWeight: 500 }}>{label}</span>
      {hint && <span style={{ color: '#6b7280', fontSize: '12px' }}>— {hint}</span>}
    </div>
  );
}
