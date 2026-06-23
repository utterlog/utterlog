'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

export interface CaptchaResult {
  challenge: string;
  nonce: string;
  captcha_id?: string;
  captcha_code?: string;
}

interface CommentCaptchaProps {
  onVerified: (result: CaptchaResult) => void;
  onReset?: () => void;
}

// SHA-256 via Web Crypto API
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PoW solver
async function solvePoW(challenge: string, difficulty: number, onProgress?: (attempts: number) => void): Promise<string> {
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  const batchSize = 1000;
  while (true) {
    for (let i = 0; i < batchSize; i++) {
      const n = nonce.toString();
      const hash = await sha256(challenge + n);
      if (hash.startsWith(prefix)) return n;
      nonce++;
    }
    onProgress?.(nonce);
    await new Promise(r => setTimeout(r, 0));
  }
}

export default function CommentCaptcha({ onVerified, onReset }: CommentCaptchaProps) {
  const [mode, setMode] = useState<'pow' | 'image' | 'off' | null>(null);
  // PoW state
  const [powState, setPowState] = useState<'idle' | 'loading' | 'solving' | 'verified' | 'hidden'>('idle');
  const [attempts, setAttempts] = useState(0);
  const challengeRef = useRef<string>('');
  const timerRef = useRef<NodeJS.Timeout>(undefined);
  // Image captcha state
  const [imgId, setImgId] = useState('');
  const [imgSrc, setImgSrc] = useState('');
  const [imgCode, setImgCode] = useState('');
  const [imgLoading, setImgLoading] = useState(false);

  // Detect mode on mount
  useEffect(() => {
    api.get('/captcha/challenge').then((r: any) => {
      const data = r.data || r;
      if (data.enabled === false || data.mode === 'off') {
        setMode('off');
        onVerified({ challenge: '', nonce: '' });
      } else {
        setMode(data.mode || 'pow');
        if (data.mode === 'image') loadImageCaptcha();
      }
    }).catch(() => {
      setMode('off');
      onVerified({ challenge: '', nonce: '' });
    });
  }, []);

  // ======== PoW ========
  const startPoW = async () => {
    if (powState === 'verified') return;
    setPowState('loading');
    try {
      const r: any = await api.get('/captcha/challenge');
      const data = r.data || r;
      if (data.enabled === false) {
        setPowState('idle'); onVerified({ challenge: '', nonce: '' }); return;
      }
      const { challenge, difficulty, expires } = data;
      challengeRef.current = challenge;
      setPowState('solving');
      const expiresIn = (expires - Math.floor(Date.now() / 1000)) * 1000;
      timerRef.current = setTimeout(() => { setPowState('idle'); onReset?.(); }, expiresIn);
      const nonce = await solvePoW(challenge, difficulty, setAttempts);
      setPowState('verified');
      onVerified({ challenge, nonce });
      setTimeout(() => setPowState('hidden'), 2000);
    } catch { setPowState('idle'); }
  };

  // ======== Image Captcha ========
  const loadImageCaptcha = async () => {
    setImgLoading(true);
    setImgCode('');
    try {
      const r: any = await api.get('/captcha/image');
      const data = r.data || r;
      setImgId(data.id);
      setImgSrc(data.image);
    } catch {}
    finally { setImgLoading(false); }
  };

  const handleImgCodeChange = (val: string) => {
    setImgCode(val);
    if (val.length === 4) {
      onVerified({ challenge: '', nonce: '', captcha_id: imgId, captcha_code: val });
    }
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (mode === null) return null;
  if (mode === 'off') return null;

  // ======== PoW UI ========
  if (mode === 'pow') {
    if (powState === 'hidden') return null;
    const isVerified = powState === 'verified';
    const isWorking = powState === 'loading' || powState === 'solving';

    return (
      <div
        onClick={powState === 'idle' ? startPoW : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
          width: '150px', padding: '8px 12px', height: '36px', boxSizing: 'border-box',
          border: '1px solid var(--color-border, #e5e5e5)',
          background: 'var(--color-bg-soft, #fafafa)',
          cursor: powState === 'idle' ? 'pointer' : 'default',
          userSelect: 'none', transition: 'border-color 0.3s',
        }}
      >
        <a href="https://docs.utterlog.io/captcha" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, textDecoration: 'none' }}
          title="Utterlog PoW Captcha"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill={isVerified ? '#0052D9' : '#ccc'} style={{ transition: 'fill 0.3s' }} />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: isVerified ? '#16a34a' : 'var(--color-text-sub, #666)' }}>
            {powState === 'idle' ? '点击验证' : isVerified ? '验证成功' : '验证中…'}
          </span>
          <span style={{
            width: isWorking ? '22px' : isVerified ? '22px' : '16px',
            height: isWorking ? '22px' : isVerified ? '22px' : '16px',
            borderRadius: '50%', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            border: isVerified ? 'none' : isWorking ? 'none' : '2px solid #ccc',
            background: isVerified ? '#16a34a' : 'transparent',
            transition: 'all 0.3s',
          }}>
            {isWorking && (
              <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#0052D9">
                <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
                <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
                  <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
                </path>
              </svg>
            )}
            {isVerified && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </span>
        </div>
      </div>
    );
  }

  // ======== Image Captcha UI ========
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px' }}>
      {imgSrc ? (
        <img
          src={imgSrc} alt="captcha"
          onClick={loadImageCaptcha}
          style={{ height: '36px', cursor: 'pointer', border: '1px solid var(--color-border, #e5e5e5)' }}
          title="点击刷新验证码"
        />
      ) : (
        <div style={{
          width: '100px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--color-border, #e5e5e5)', background: 'var(--color-bg-soft, #fafafa)',
          fontSize: '11px', color: 'var(--color-text-dim)',
        }}>
          {imgLoading ? '加载中…' : '验证码'}
        </div>
      )}
      <input
        type="text"
        value={imgCode}
        onChange={e => handleImgCodeChange(e.target.value.toUpperCase())}
        maxLength={4}
        placeholder="输入验证码"
        style={{
          width: '120px', height: '36px', padding: '0 10px', boxSizing: 'border-box',
          border: '1px solid var(--color-border, #e5e5e5)', background: 'var(--color-bg-card, #fff)',
          fontSize: '14px', fontFamily: 'monospace', letterSpacing: imgCode ? '2px' : 'normal',
          outline: 'none',
        }}
      />
    </div>
  );
}
