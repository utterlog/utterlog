import { useEffect, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { optionsApi, mediaApi } from '@/lib/api';
import { LoadingState } from '@/components/ui';

interface FooterIcon {
  icon: string;   // FA class | inline SVG | image URL
  label: string;
  href?: string;
  copy?: string;  // when set, click copies this text instead of navigating
}

const DEFAULT_OPTION_KEY = 'theme_footer_icons';

const defaultEmptyRow: FooterIcon = { icon: 'fa-light fa-link', label: '按钮', href: '' };
const actionButtonStyle = {
  width: 28,
  minWidth: 28,
  height: 28,
  padding: 0,
  flex: '0 0 28px',
  fontSize: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

interface FooterIconsEditorProps {
  optionKey?: string;
  title?: string;
  description?: ReactNode;
  emptyText?: string;
  emptyRow?: FooterIcon;
}

export default function FooterIconsEditor({
  optionKey = DEFAULT_OPTION_KEY,
  title = '页脚图标按钮',
  description,
  emptyText = '尚未配置额外按钮，页脚仍会显示固定的 RSS 按钮。',
  emptyRow = defaultEmptyRow,
}: FooterIconsEditorProps) {
  const [items, setItems] = useState<FooterIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    (async () => {
      try {
        const r: any = await optionsApi.list();
        const data = r.data || r;
        const raw = data[optionKey];
        if (raw) {
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) setItems(parsed);
          } catch { /* ignore bad JSON */ }
        }
      } catch { toast.error('加载配置失败'); }
      finally { setLoading(false); }
    })();
  }, [optionKey]);

  const addRow = () => setItems([...items, { ...emptyRow }]);
  const removeRow = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<FooterIcon>) =>
    setItems(items.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Strip empty copy fields so JSON stays clean
      const clean = items.map(r => {
        const out: FooterIcon = { icon: r.icon.trim(), label: r.label.trim() };
        if (r.href && r.href.trim()) out.href = r.href.trim();
        if (r.copy && r.copy.trim()) out.copy = r.copy.trim();
        return out;
      }).filter(r => r.icon && r.label);
      await optionsApi.updateMany({ [optionKey]: JSON.stringify(clean) });
      toast.success('已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadClick = (idx: number) => {
    activeRowRef.current = idx;
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = activeRowRef.current;
    e.target.value = '';
    if (!file || idx === null) return;
    setUploadingIdx(idx);
    try {
      const r: any = await mediaApi.upload(file, 'theme-icons');
      const url = r.data?.url || r.url;
      if (url) updateRow(idx, { icon: url });
      toast.success('图标已上传');
    } catch {
      toast.error('上传失败');
    } finally {
      setUploadingIdx(null);
      activeRowRef.current = null;
    }
  };

  const renderPreview = (icon: string) => {
    if (!icon) return <i className="fa-regular fa-circle-question" style={{ color: 'var(--color-text-dim)' }} />;
    if (icon.trim().startsWith('<svg')) return <span style={{ width: 16, height: 16, display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: icon }} />;
    if (icon.startsWith('http') || icon.startsWith('/uploads/')) return <img src={icon} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />;
    return <i className={icon} style={{ fontSize: 14 }} />;
  };

  if (loading) return <LoadingState padding="20px 0" />;

  return (
    <div className="card" style={{ padding: 20, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="text-main" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
        <button className="btn btn-secondary btn-square" onClick={addRow} title="添加">
          <i className="fa-regular fa-plus" style={{ fontSize: 12 }} />
        </button>
      </div>
      <p className="text-dim" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
        {description || (
          <>
            显示在博客页脚右侧的额外图标按钮；固定 RSS 按钮由主题始终显示，不在这里删除。图标支持 FontAwesome 类名（如 <code>fa-light fa-link</code>）、
            图片 URL、内联 SVG、或上传图片。链接留空将作为纯文本标签显示；「复制文本」填写后点击时复制该内容到剪贴板。
          </>
        )}
      </p>

      {items.length === 0 ? (
        <div className="text-dim" style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, border: '1px dashed var(--color-border)' }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((row, i) => (
            <div key={i} style={{
              border: '1px solid var(--color-border)', padding: 12,
              display: 'grid',
              gridTemplateColumns: '32px 1fr 120px 1fr 120px auto',
              gap: 8, alignItems: 'center',
            }}>
              {/* Preview */}
              <div style={{
                width: 28, height: 28, border: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-bg)', color: 'var(--color-text-sub)',
              }}>
                {renderPreview(row.icon)}
              </div>
              {/* Icon source */}
              <input
                className="input"
                value={row.icon}
                onChange={e => updateRow(i, { icon: e.target.value })}
                placeholder="fa-light fa-link / <svg…/> / https://…"
                style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}
              />
              {/* Label */}
              <input
                className="input"
                value={row.label}
                onChange={e => updateRow(i, { label: e.target.value })}
                placeholder="标题"
                style={{ fontSize: 13 }}
              />
              {/* Href */}
              <input
                className="input"
                value={row.href || ''}
                onChange={e => updateRow(i, { href: e.target.value })}
                placeholder="/feed 或 https://..."
                style={{ fontSize: 12 }}
              />
              {/* Copy text */}
              <input
                className="input"
                value={row.copy || ''}
                onChange={e => updateRow(i, { copy: e.target.value })}
                placeholder="复制文本（可选）"
                style={{ fontSize: 12 }}
                title="填写后点击图标会复制这段文本到剪贴板，优先于链接"
              />
              {/* Actions — 统一 28×28 正方形，与预览框同尺寸 */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-secondary" onClick={() => handleUploadClick(i)}
                  disabled={uploadingIdx === i} title="上传图片作为图标"
                  style={actionButtonStyle}>
                  <i className={uploadingIdx === i ? 'fa-regular fa-spinner fa-spin' : 'fa-regular fa-upload'} />
                </button>
                <button className="btn btn-secondary" onClick={() => moveRow(i, -1)} disabled={i === 0} title="上移"
                  style={actionButtonStyle}>
                  <i className="fa-regular fa-chevron-up" />
                </button>
                <button className="btn btn-secondary" onClick={() => moveRow(i, 1)} disabled={i === items.length - 1} title="下移"
                  style={actionButtonStyle}>
                  <i className="fa-regular fa-chevron-down" />
                </button>
                <button className="btn btn-secondary" onClick={() => removeRow(i)} title="删除"
                  style={{ ...actionButtonStyle, color: '#dc2626' }}>
                  <i className="fa-regular fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
