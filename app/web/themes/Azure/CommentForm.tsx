'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { getVisitorId } from '@/lib/fingerprint';
import toast from 'react-hot-toast';
import emojiPack from '@/public/emoji/bilibili/pack-bilibili.json';
import CommentCaptcha from './CommentCaptcha';
import LoadingSpinner from '@/components/blog/LoadingSpinner';
import { useThemeContext } from '@/lib/theme-context';

function md5(s:string){let h0=1732584193,h1=-271733879,h2=-1732584194,h3=271733878;const k=[],w=[];for(let i=0;i<64;i++)k[i]=Math.floor(2**32*Math.abs(Math.sin(i+1)));const bytes=[];for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c<128)bytes.push(c);else if(c<2048){bytes.push(192|(c>>6));bytes.push(128|(c&63));}else{bytes.push(224|(c>>12));bytes.push(128|((c>>6)&63));bytes.push(128|(c&63));}}const bl=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);bytes.push(bl&0xff,(bl>>8)&0xff,(bl>>16)&0xff,(bl>>24)&0xff,0,0,0,0);for(let i=0;i<bytes.length;i+=64){for(let j=0;j<16;j++)w[j]=bytes[i+j*4]|(bytes[i+j*4+1]<<8)|(bytes[i+j*4+2]<<16)|(bytes[i+j*4+3]<<24);let[a,b,c,d]=[h0,h1,h2,h3];for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|((~b)&d);g=i;}else if(i<32){f=(d&b)|((~d)&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|(~d));g=(7*i)%16;}const r=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];const t=d;d=c;c=b;const x=(a+f+k[i]+w[g])>>>0;b=(b+(((x<<r[i])|(x>>>(32-r[i])))>>>0))>>>0;a=t;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;}const hex=(n:number)=>[0,8,16,24].map(s=>((n>>>s)&0xff).toString(16).padStart(2,'0')).join('');return hex(h0)+hex(h1)+hex(h2)+hex(h3);}

function getGreeting(timeZone?: string): string {
  let h = 0;
  try {
    if (timeZone) {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
      h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    } else {
      h = new Date().getHours();
    }
  } catch {
    h = new Date().getHours();
  }
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

interface CommentFormProps {
  postId: number;
  parentId?: number;
  onSuccess?: (commentId?: number) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function CommentForm({ postId, parentId, onSuccess, onCancel, compact }: CommentFormProps) {
  const { user, accessToken, logout } = useAuthStore();
  const { timeZone } = useThemeContext();
  const isAdmin = !!accessToken && !!user;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passportIdentity, setPassportIdentity] = useState<any>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const [captchaResult, setCaptchaResult] = useState<{ challenge: string; nonce: string; captcha_id?: string; captcha_code?: string } | null>(null);

  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  const [hasCached, setHasCached] = useState(false);
  useEffect(() => {
    if (isAdmin && user) {
      setName(user.nickname || user.username || '');
      setEmail(user.email || '');
    } else {
      const saved = localStorage.getItem('comment_user');
      if (saved) {
        try {
          const d = JSON.parse(saved);
          if (d.name) setName(d.name);
          if (d.email) setEmail(d.email);
          if (d.url) setUrl(d.url);
          if (d.name && d.email) setHasCached(true);
        } catch {}
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    const existing = (window as any).__utterlogIdentity;
    if (existing?.identified) applyPassport(existing);
    function handler(e: any) { if (e.detail?.identified) applyPassport(e.detail); }
    window.addEventListener('utterlog-identity', handler);
    return () => window.removeEventListener('utterlog-identity', handler);
  }, [isAdmin]);

  function applyPassport(identity: any) {
    setPassportIdentity(identity);
    if (identity.nickname && !name) setName(identity.nickname);
    if (identity.email && !email) setEmail(identity.email);
    if (identity.site_url && !url) setUrl(identity.site_url);
  }

  const handleLogout = () => { logout(); setHasCached(false); setName(''); setEmail(''); setUrl(''); setEditing(false); };
  const handleClearCache = () => { localStorage.removeItem('comment_user'); setHasCached(false); setName(''); setEmail(''); setUrl(''); setEditing(false); };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('请输入昵称'); return; }
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error('邮箱格式不正确'); return; }
    if (!content.trim()) { toast.error('请输入评论内容'); return; }
    if ([...content.trim()].length < 5) { toast.error('评论内容至少 5 个字'); return; }

    setSubmitting(true);
    try {
      let clientHints = '';
      try {
        const uad = (navigator as any).userAgentData;
        if (uad?.getHighEntropyValues) {
          const h = await uad.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'fullVersionList', 'mobile']);
          let browserName = '', browserVersion = '';
          if (h.fullVersionList) {
            const real = h.fullVersionList.find((b: any) => !b.brand.startsWith('Not') && b.brand !== 'Chromium');
            if (real) { browserName = real.brand.replace('Google Chrome', 'Chrome').replace('Microsoft Edge', 'Edge'); browserVersion = real.version; }
          }
          clientHints = JSON.stringify({ platform: h.platform || '', platformVersion: h.platformVersion || '', browser: browserName, browserVersion, mobile: !!h.mobile, architecture: h.architecture || '' });
        }
      } catch {}

      const passportToken = passportIdentity?.token || (window as any).__utterlogIdentity?.token || '';
      const headers: Record<string, string> = {};
      if (passportToken) headers['X-Utterlog-Passport'] = passportToken;

      const res: any = await api.post('/comments', {
        post_id: postId, parent_id: parentId || 0,
        author: name.trim(), email: email.trim(), url: url.trim() || undefined,
        content: content.trim(), visitor_id: getVisitorId(), client_hints: clientHints || undefined,
        captcha_challenge: captchaResult?.challenge || '', captcha_nonce: captchaResult?.nonce || '',
        captcha_id: captchaResult?.captcha_id || '', captcha_code: captchaResult?.captcha_code || '',
      }, { headers });

      localStorage.setItem('comment_user', JSON.stringify({ name, email, url }));
      setHasCached(true);
      setEditing(false);

      const status = res?.status || res?.data?.status;
      if (status === 'approved') {
        const toasts = ['妙笔生花，评论已上墙', '言之有物，已成功发表', '高见已收，感谢分享', '一字千金，评论发布成功', '才思敏捷，已发表成功', '留言已至，期待下次光临', '字字珠玑，感谢你的评论', '好评如潮，你的观点已发布'];
        toast.success(toasts[Math.floor(Math.random() * toasts.length)]);
      } else {
        toast.success('评论已提交，审核通过后将显示');
      }
      setContent('');
      const newId = res?.data?.id || res?.id;
      onSuccess?.(newId);
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || err?.response?.data?.message || '评论提交失败';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const avatarHash = email.trim() ? md5(email.trim().toLowerCase()) : '';
  const avatarUrl = email.trim() ? `https://gravatar.bluecdn.com/avatar/${avatarHash}?d=mp&s=80` : '';
  const showInfoFields = !isAdmin && !passportIdentity?.identified && (!hasCached || editing);

  // Compact mode (reply form)
  if (compact) {
    const identified = isAdmin || passportIdentity?.identified || (hasCached && !editing);
    const compactAvatarUrl = isAdmin && user?.avatar ? user.avatar : avatarUrl;
    const compactName = isAdmin
      ? (user?.nickname || user?.username || '')
      : passportIdentity?.identified ? passportIdentity.nickname
      : name;

    const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '11px', padding: 0 };
    const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: '7px 10px', fontSize: '12px', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', outline: 'none', borderRadius: 0, color: 'var(--color-text-main)', fontFamily: 'inherit' };

    return (
      <div style={{ background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)' }}>
        {/* Header bar: 发表回复 + 身份/提示 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: '42px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-regular fa-reply" style={{ fontSize: '12px', color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>发表回复</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
            {identified && (
              <>
                {compactAvatarUrl ? (
                  <img src={compactAvatarUrl} alt="" style={{ width: '22px', height: '22px', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-card)', flexShrink: 0 }}>
                    <i className="fa-regular fa-user" style={{ fontSize: '11px', color: '#bbb' }} />
                  </div>
                )}
                <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{compactName}</span>
                {isAdmin && (
                  <span style={{ fontSize: '10px', padding: '1px 6px', background: 'var(--color-primary)', color: '#fff' }}>管理员</span>
                )}
                {!isAdmin && passportIdentity?.identified && (
                  <span style={{ fontSize: '10px', padding: '1px 6px', background: '#f3e5f5', color: '#7b1fa2', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <i className="fa-solid fa-globe" style={{ fontSize: '8px' }} /> Utterlog
                  </span>
                )}
                {!isAdmin && !passportIdentity?.identified && hasCached && !editing && (
                  <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>已记住</span>
                )}
                {isAdmin && (
                  <button onClick={handleLogout} style={linkBtn}>注销</button>
                )}
                {!isAdmin && hasCached && !editing && (
                  <>
                    <button onClick={() => setEditing(true)} style={linkBtn}>更换</button>
                    <span style={{ color: '#ddd' }}>|</span>
                    <button onClick={handleClearCache} style={linkBtn}>退出</button>
                  </>
                )}
              </>
            )}
            {!identified && !editing && (
              <span>必填项已用 <span style={{ color: '#e53e3e' }}>*</span> 标注</span>
            )}
            {!identified && editing && (
              <button onClick={() => setEditing(false)} style={linkBtn}>取消更换</button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '12px' }}>
          {/* Info fields (anonymous first-timer OR editing cached info) */}
          {showInfoFields && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="昵称*" style={inputStyle} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="邮箱*" type="email" style={inputStyle} />
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="网站" style={inputStyle} />
            </div>
          )}

          <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
            placeholder="写下你的回复…" rows={3}
            style={{ width: '100%', padding: '10px', fontSize: '13px', lineHeight: 1.6, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', outline: 'none', resize: 'vertical', color: 'var(--color-text-main)', fontFamily: 'inherit', borderRadius: 0 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {!isAdmin && (
              <CommentCaptcha onVerified={setCaptchaResult} onReset={() => setCaptchaResult(null)} />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginLeft: 'auto' }}>
              {onCancel && <button onClick={onCancel} style={{ padding: '6px 14px', fontSize: '12px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-sub)', cursor: 'pointer' }}>取消</button>}
              <button onClick={handleSubmit} disabled={submitting}
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '...' : '回复'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="azure-comment-form" style={{ border: '1px solid var(--color-border, #eee)', marginTop: '24px' }}>
      {/* Header bar */}
      <div className="azure-comment-form-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '60px', borderBottom: '1px solid var(--color-border, #eee)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin && user?.avatar ? (
            <img src={user.avatar} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', flexShrink: 0 }} />
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <i className="fa-regular fa-comment-dots" style={{ fontSize: '20px', color: 'var(--color-primary, #0052D9)' }} />
          )}
          <span style={{ fontSize: '14px', fontWeight: 600 }}>发表评论</span>
        </div>

        {/* Right side: user state */}
        <div className="azure-comment-form-user-state" style={{ fontSize: '12px', color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isAdmin && (
            <>
              <span>以 <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{name}</span> 的身份登录。</span>
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>注销?</button>
            </>
          )}
          {!isAdmin && hasCached && !editing && (
            <>
              <span>{getGreeting(timeZone)}，<span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{name}</span></span>
              <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>更换资料</button>
              <span style={{ color: '#ddd' }}>|</span>
              <button onClick={handleClearCache} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: '12px', padding: 0 }}>退出</button>
            </>
          )}
          {!isAdmin && !hasCached && !passportIdentity?.identified && (
            <span>必填项已用 <span style={{ color: '#e53e3e' }}>*</span> 标注</span>
          )}
          {!isAdmin && passportIdentity?.identified && (
            <>
              <span style={{ fontSize: '10px', padding: '1px 6px', background: '#f3e5f5', color: '#7b1fa2', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <i className="fa-solid fa-globe" style={{ fontSize: '8px' }} /> Utterlog
              </span>
              <span>{passportIdentity.nickname}</span>
            </>
          )}
        </div>
      </div>

      {/* Info fields (for new/editing visitors) */}
      {showInfoFields && (
        <div className="azure-comment-form-fields" style={{ display: 'flex', borderBottom: '1px solid var(--color-border, #eee)' }}>
          <div className="azure-comment-form-field" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', height: '50px', borderRight: '1px solid var(--color-border, #eee)' }}>
            <i className="fa-regular fa-user" style={{ fontSize: '12px', color: '#bbb' }} />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="昵称*"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', background: 'transparent', color: 'var(--color-text-main)' }} />
          </div>
          <div className="azure-comment-form-field" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', height: '50px', borderRight: '1px solid var(--color-border, #eee)' }}>
            <i className="fa-regular fa-envelope" style={{ fontSize: '12px', color: '#bbb' }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="邮箱*" type="email"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', background: 'transparent', color: 'var(--color-text-main)' }} />
          </div>
          <div className="azure-comment-form-field" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px', height: '50px' }}>
            <i className="fa-regular fa-globe" style={{ fontSize: '12px', color: '#bbb' }} />
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="网站"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', background: 'transparent', color: 'var(--color-text-main)' }} />
          </div>
        </div>
      )}

      {/* Textarea */}
      <div className="azure-comment-form-textarea-wrap" style={{ position: 'relative' }}>
        <div className="azure-comment-form-textarea-row" style={{ display: 'flex', alignItems: 'flex-start', padding: '12px 12px 12px 16px', gap: '6px', minHeight: '250px', borderBottom: showEmoji ? 'none' : undefined }}>
          <i className="fa-regular fa-pen-to-square" style={{ fontSize: '12px', color: '#bbb', marginTop: '4px' }} />
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="评论"
            style={{
              flex: 1, border: 'none', outline: 'none', resize: 'vertical',
              fontSize: '14px', lineHeight: 1.7, background: 'transparent',
              color: 'var(--color-text-main)', fontFamily: 'inherit', padding: 0,
              minHeight: '220px',
            }}
          />
        </div>

        {/* Emoji button inside textarea area */}
        <div style={{ position: 'absolute', left: '12px', bottom: '8px' }}>
          <button type="button" onClick={() => setShowEmoji(!showEmoji)} title="表情"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: showEmoji ? 'var(--color-primary)' : 'var(--color-text-dim)', fontSize: '18px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}>
            <i className="fa-regular fa-face-smile" />
          </button>
        </div>

        {/* 评论礼仪提示 */}
        <span className="comment-hint" style={{
          position: 'absolute', right: '34px', bottom: '8px',
          fontSize: '11px', color: 'var(--color-text-dim, #999)', opacity: 0.55,
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          pointerEvents: 'none', userSelect: 'none', transition: 'opacity 0.2s',
        }}>
          <i className="fa-regular fa-circle-exclamation" style={{ fontSize: '11px' }} />
          请理性讨论，禁止广告及无关内容
        </span>

        {/* Emoji panel */}
        {showEmoji && (
          <div ref={emojiRef} className="azure-comment-form-emoji-panel" style={{
            position: 'absolute', left: '8px', bottom: '36px', zIndex: 50,
            width: '342px', padding: '6px',
            background: 'var(--color-bg-card, #fff)', border: '1px solid var(--color-border, #eee)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
            display: 'grid', gridTemplateColumns: 'repeat(10, 32px)', gap: '1px',
            maxHeight: '176px', overflowY: 'auto', overflowX: 'hidden',
          }}>
            {emojiPack.emojis.map(e => (
              <button key={e.slug} type="button" title={e.name}
                onClick={() => {
                  const tag = `[:${e.slug}:]`;
                  const ta = textareaRef.current;
                  if (ta) {
                    const start = ta.selectionStart, end = ta.selectionEnd;
                    setContent(content.slice(0, start) + tag + content.slice(end));
                    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + tag.length; }, 0);
                  } else {
                    setContent(content + tag);
                  }
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s', width: '32px', height: '32px' }}
                onMouseEnter={ev => { ev.currentTarget.style.transform = 'scale(1.2)'; }}
                onMouseLeave={ev => { ev.currentTarget.style.transform = 'scale(1)'; }}
              >
                <img src={`/emoji/bilibili/${e.file}`} alt={e.name} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
              </button>
            ))}
          </div>
        )}
      </div>

    </div>

    {/* Bottom: captcha + submit (outside the border box) */}
    <div className="azure-comment-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '12px', gap: '8px' }}>
      {!isAdmin && (
        <CommentCaptcha onVerified={setCaptchaResult} onReset={() => setCaptchaResult(null)} />
      )}
      <button onClick={handleSubmit} disabled={submitting}
        style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '80px' }}>
        {submitting ? (
          <LoadingSpinner size={14} color="#fff" />
        ) : '提交评论'}
      </button>
    </div>
    </>
  );
}
