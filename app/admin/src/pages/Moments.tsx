
import { useEffect, useState } from 'react';
import { momentsApi, optionsApi, mediaApi, geoApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Modal, ConfirmDialog, EmptyPanel, LoadingState } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { usePageBadge } from '@/layouts/DashboardLayout';

export default function MomentsPage() {
  const { t } = useI18n();
  const { setPageBadge } = usePageBadge();
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ content: '', location: '', mood: '', images: '', visibility: 'public' });
  const [formImages, setFormImages] = useState<string[]>([]);
  const [imgUploading, setImgUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  // Tag management
  const [tags, setTags] = useState<string[]>(['随想', '技术', '生活', '阅读']);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [editingTag, setEditingTag] = useState<{ old: string; draft: string } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); fetchTags(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await momentsApi.list(); setMoments(r.data || []); }
    catch { toast.error(t('admin.moments.toast.fetchFailed', '获取失败')); }
    finally { setLoading(false); }
  };

  const fetchTags = async () => {
    try {
      const r: any = await optionsApi.get('moment_tags');
      const val = r.data?.value || r.value || '';
      if (val) setTags(val.split(',').map((t: string) => t.trim()).filter(Boolean));
    } catch {
      // 404 = option not created yet, use defaults already set in state
    }
  };

  const saveTags = async (newTags: string[]) => {
    setTags(newTags);
    try {
      await optionsApi.update('moment_tags', newTags.join(','));
    } catch {
      toast.error(t('admin.moments.toast.saveTagsFailed', '保存标签失败'));
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) { setNewTag(''); return; }
    saveTags([...tags, tag]);
    setNewTag('');
    toast.success(t('admin.moments.toast.tagAdded', '已添加标签「{tag}」', { tag }));
  };

  // Inline rename: 用户在胶囊里直接改名后点 ✓ 或回车 / 失焦保存。
  // 空输入 = 删除（保留删除路径，不需要再点别的按钮）。
  const commitTagEdit = (oldName: string, draft: string) => {
    const next = draft.trim();
    if (next === oldName) { setEditingTag(null); return; }
    if (!next) {
      saveTags(tags.filter(t => t !== oldName));
      setEditingTag(null);
      toast.success(t('admin.moments.toast.tagRemoved', '已删除标签「{tag}」', { tag: oldName }));
      return;
    }
    if (tags.some(t => t === next && t !== oldName)) {
      toast.error(t('admin.moments.toast.tagExists', '标签「{tag}」已存在', { tag: next }));
      return;
    }
    saveTags(tags.map(t => (t === oldName ? next : t)));
    setEditingTag(null);
    toast.success(t('admin.moments.toast.tagRenamed', '「{old}」已重命名为「{newName}」', { old: oldName, newName: next }));
  };

  const parseImages = (m: any): string[] => {
    if (!m.images) return [];
    if (Array.isArray(m.images)) return m.images;
    if (typeof m.images === 'string') {
      let str = m.images;
      // Decode base64 from older API payloads that encoded pg arrays this way.
      if (/^[A-Za-z0-9+/]+=*$/.test(str) && !str.startsWith('http') && !str.startsWith('{')) {
        try { str = atob(str); } catch {}
      }
      // PostgreSQL array literal: {url1,url2}
      if (str.startsWith('{') && str.endsWith('}')) {
        const inner = str.slice(1, -1);
        if (!inner) return [];
        return inner.split(',').map((s: string) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
      }
      try { const p = JSON.parse(str); if (Array.isArray(p)) return p; } catch {}
      return str.split(',').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
    }
    return [];
  };

  const openCreate = () => { setEditingId(null); setForm({ content: '', location: '', mood: '', images: '', visibility: 'public' }); setFormImages([]); setIsModalOpen(true); };
  const openEdit = (m: any) => { setEditingId(m.id); const imgs = parseImages(m); setFormImages(imgs); setForm({ content: m.content, location: m.location || '', mood: m.mood || '', images: '', visibility: m.visibility }); setIsModalOpen(true); };

  // 浏览器定位 + 反查地址。统一走后端 /api/v1/location/reverse —— 与前台
  // 说说发布（app/web/app/(blog)/moments/MomentsClient.tsx）共用同一服务端
  // 实现：Mapbox → 高德 → 腾讯三档 fallback，且全部限定到城市/区/省/国家
  // 五级，不返回街道或 POI，保证 admin / 前台写入数据库的 location 粒度
  // 一致（城市名）。
  const fetchCurrentLocation = async () => {
    if (!('geolocation' in navigator)) {
      toast.error(t('admin.moments.toast.geolocationUnsupported', '当前浏览器不支持地理位置 API'));
      return;
    }
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60_000,
        });
      });
      const { latitude: lat, longitude: lng } = position.coords;

      const res: any = await geoApi.reverse(lat, lng);
      const data = res?.data || res || {};
      const resolved = String(data.location || data.city || data.region || data.country || '').trim();

      if (!resolved) {
        toast.error(t('admin.moments.toast.locationNotResolved', '未能识别城市，请手动填写位置'));
        return;
      }

      setForm(prev => ({ ...prev, location: resolved }));
      toast.success(t('admin.moments.toast.locationFetched', '位置已获取'));
    } catch (err: any) {
      let msg = t('admin.moments.toast.locationFailed', '位置获取失败');
      if (err?.code === 1) msg = t('admin.moments.toast.locationDenied', '位置权限被拒绝，请在浏览器/系统设置中允许');
      else if (err?.code === 2) msg = t('admin.moments.toast.locationUnavailable', '位置不可用，请检查 GPS / 网络');
      else if (err?.code === 3) msg = t('admin.moments.toast.locationTimeout', '位置获取超时，请重试');
      toast.error(msg);
    } finally {
      setLocating(false);
    }
  };

  const handleImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setImgUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const r: any = await mediaApi.upload(files[i], 'moments');
        const url = r.url || r.data?.url;
        if (url) setFormImages(prev => [...prev, url]);
      }
    } catch { toast.error(t('admin.common.uploadFailed', '上传失败')); }
    finally { setImgUploading(false); e.target.value = ''; }
  };

  const removeFormImage = (idx: number) => setFormImages(prev => prev.filter((_, i) => i !== idx));

  const onSubmit = async () => {
    if (!form.content.trim()) { toast.error(t('admin.moments.toast.contentRequired', '内容不能为空')); return; }
    setSubmitting(true);
    const payload: any = { ...form, images: formImages.length > 0 ? formImages : [] };
    if (!editingId) payload.source = '网页';
    try {
      if (editingId) { await momentsApi.update(editingId, payload); toast.success(t('admin.common.updateSuccess', '更新成功')); }
      else { await momentsApi.create(payload); toast.success(t('admin.moments.toast.published', '发布成功')); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await momentsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchData(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  };

  // Search filter — content / location / mood (关键词) 三字段命中即显示
  const searchTerm = search.trim().toLowerCase();
  const filteredMoments = searchTerm
    ? moments.filter((m: any) => {
        const haystack = [m.content, m.location, m.mood]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      })
    : moments;

  // Push count badge into the global header (next to "说说管理 · Moments")
  useEffect(() => {
    setPageBadge(
      <span>
        {searchTerm
          ? t('admin.moments.totalFiltered', '共 {count} 条说说 · 命中 {matched} 条', { count: moments.length, matched: filteredMoments.length })
          : t('admin.moments.total', '共 {count} 条说说', { count: moments.length })}
      </span>
    );
    return () => setPageBadge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments.length, filteredMoments.length, searchTerm, t]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap', rowGap: 8 }}>
        {/* Left: 关键词 + 发布（正方形 icon-only） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button
            className="btn-square"
            variant={showTagManager ? 'primary' : 'secondary'}
            title={t('admin.posts.columns.keywords', '关键词')}
            aria-label={t('admin.posts.columns.keywords', '关键词')}
            onClick={() => setShowTagManager(!showTagManager)}
          >
            <i className="fa-solid fa-hashtag" style={{ fontSize: 14 }} />
          </Button>
          <Button
            className="btn-square"
            title={t('admin.moments.publish', '发布')}
            aria-label={t('admin.moments.publish', '发布')}
            onClick={openCreate}
          >
            <i className="fa-solid fa-plus" style={{ fontSize: 14 }} />
          </Button>
        </div>

        {/* Right: 搜索框 + 🔍 + ✕ */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input
            placeholder={t('admin.moments.searchPlaceholder', '检索内容 / 位置 / 关键词')}
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <Button
            className="btn-square"
            title={t('common.search', '搜索')}
            aria-label={t('common.search', '搜索')}
            onClick={() => { /* 即时搜索：按钮仅作视觉锚点 */ }}
          >
            <i className="fa-regular fa-magnifying-glass" style={{ fontSize: 14 }} />
          </Button>
          {search && (
            <Button
              className="btn-square"
              variant="secondary"
              title={t('admin.common.clear', '清空')}
              aria-label={t('admin.common.clear', '清空')}
              onClick={() => setSearch('')}
            >
              <i className="fa-regular fa-xmark" style={{ fontSize: 14 }} />
            </Button>
          )}
        </div>
      </div>

      {/* Tag Manager */}
      {showTagManager && (
        <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>{t('admin.moments.tagManagerTitle', '说说关键词管理')}</h3>
          <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>{t('admin.moments.tagManagerHint', '管理前台说说发布时可选的关键词标签，发布后显示在卡片右上角')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {tags.map(tag => {
              const isEditing = editingTag?.old === tag;
              const draft = isEditing ? editingTag!.draft : tag;
              return (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '5px 12px', borderRadius: '16px', fontSize: '13px',
                    background: isEditing ? 'var(--color-bg-card)' : 'var(--color-bg-soft)',
                    color: 'var(--color-text-sub)',
                    border: `1px solid ${isEditing ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    transition: 'border-color 0.12s, background 0.12s',
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={e => setEditingTag({ old: tag, draft: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitTagEdit(tag, draft); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditingTag(null); }
                      }}
                      onFocus={e => e.currentTarget.select()}
                      onBlur={() => commitTagEdit(tag, draft)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--color-text-main)',
                        fontSize: '13px',
                        padding: 0,
                        // 让宽度跟着内容长度走（中英混排粗略按 1ch ≈ 1 字符宽估算）
                        width: `${Math.max(2, draft.length) + 1}ch`,
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingTag({ old: tag, draft: tag })}
                      title={t('admin.common.edit', '编辑')}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        color: 'inherit', font: 'inherit',
                        cursor: 'text',
                      }}
                    >
                      {tag}
                    </button>
                  )}
                  <button
                    type="button"
                    // 防止 mousedown 把 input blur 掉造成双触发；click 时显式提交
                    onMouseDown={e => { if (isEditing) e.preventDefault(); }}
                    onClick={() => {
                      if (isEditing) commitTagEdit(tag, draft);
                      else setEditingTag({ old: tag, draft: tag });
                    }}
                    title={isEditing ? t('admin.common.confirm', '确认') : t('admin.common.edit', '编辑')}
                    aria-label={isEditing ? t('admin.common.confirm', '确认') : t('admin.common.edit', '编辑')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: isEditing ? 'var(--color-primary)' : 'var(--color-text-dim)',
                      display: 'flex',
                    }}
                  >
                    <i className="fa-solid fa-check" style={{ fontSize: '12px' }} />
                  </button>
                </span>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className="input focus-ring"
              placeholder={t('admin.moments.newTagPlaceholder', '输入新关键词')}
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              style={{ width: '180px' }}
            />
            <Button variant="secondary" onClick={addTag}>{t('admin.common.add', '添加')}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label={t('common.loading', '加载中…')} />
      ) : moments.length === 0 ? (
        <EmptyPanel title={t('admin.moments.empty', '还没有说说')} actionText={t('admin.moments.first', '发第一条')} onAction={openCreate} />
      ) : filteredMoments.length === 0 ? (
        <EmptyPanel title={t('admin.moments.noMatch', '没有匹配 "{q}" 的说说', { q: search })} fontSize="14px" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredMoments.map((m) => (
            <div key={m.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p className="text-main" style={{ fontSize: '14px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                  {parseImages(m).length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {parseImages(m).map((url: string, idx: number) => (
                        <img key={idx} src={url} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                      ))}
                    </div>
                  )}
                  <div className="text-dim" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: '10px' }}>
                    <span>{formatTime(m.created_at)}</span>
                    {m.location && <><span>&middot;</span><i className="fa-regular fa-location-dot" style={{ fontSize: '12px' }} /><span>{m.location}</span></>}
                    {m.mood && (
                      <>
                        <span>&middot;</span>
                        <span style={{
                          padding: '1px 8px', borderRadius: '8px', fontSize: '11px',
                          background: 'var(--color-bg-soft)', color: 'var(--color-primary)',
                          fontWeight: 500,
                        }}>{m.mood}</span>
                      </>
                    )}
                    {m.visibility !== 'public' && <><span>&middot;</span><span>{m.visibility === 'private' ? t('admin.moments.visibility.private', '仅自己') : t('admin.moments.visibility.unlisted', '不公开')}</span></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => openEdit(m)} className="action-btn primary" title={t('admin.common.edit', '编辑')}><i className="fa-regular fa-pen" style={{ fontSize: '14px' }} /></button>
                  <button onClick={() => setDeleteId(m.id)} className="action-btn danger" title={t('admin.common.delete', '删除')}><i className="fa-regular fa-trash" style={{ fontSize: '14px' }} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? t('admin.moments.editMoment', '编辑说说') : t('admin.moments.publishMoment', '发布说说')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <textarea className="input focus-ring" rows={5} placeholder={t('admin.moments.contentPlaceholder', '说点什么…')} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} />

          {/* Image upload */}
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.moments.imageAttachments', '图片附件')}</label>
            {formImages.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {formImages.map((url, idx) => (
                  <div key={idx} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removeFormImage(idx)} style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fa-solid fa-xmark" style={{ fontSize: '8px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label
              className="btn btn-secondary btn-toolbar-square"
              title={imgUploading ? t('admin.cover.uploading', '上传中…') : t('admin.cover.uploadImage', '上传图片')}
              style={{ cursor: imgUploading ? 'wait' : 'pointer', opacity: imgUploading ? 0.6 : 1 }}
            >
              <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} />
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImgUpload} disabled={imgUploading} />
            </label>
          </div>

          {/* Tag selector */}
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.posts.columns.keywords', '关键词')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setForm({ ...form, mood: form.mood === tag ? '' : tag })}
                  style={{
                    padding: '4px 12px', borderRadius: '14px', fontSize: '12px',
                    border: `1px solid ${form.mood === tag ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: form.mood === tag ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    background: form.mood === tag ? 'rgba(var(--color-primary-rgb,0,0,0),0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  {tag}
                </button>
              ))}
              <input
                className="input focus-ring"
                placeholder={t('admin.posts.permalinkCustom', '自定义')}
                value={tags.includes(form.mood) ? '' : form.mood}
                onChange={e => setForm({ ...form, mood: e.target.value })}
                style={{ width: '80px', fontSize: '12px', padding: '4px 8px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input focus-ring"
              placeholder={t('admin.moments.locationPlaceholder', '位置（可选 / 点右侧定位获取）')}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              style={{ flex: 1 }}
            />
            <Button
              type="button"
              variant="secondary"
              className="btn-square"
              title={t('admin.moments.fetchLocation', '获取当前位置')}
              aria-label={t('admin.moments.fetchLocation', '获取当前位置')}
              onClick={fetchCurrentLocation}
              loading={locating}
              disabled={locating}
            >
              <i className="fa-solid fa-location-crosshairs" style={{ fontSize: 14 }} />
            </Button>
          </div>
          <select className="input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="public">{t('admin.moments.visibility.public', '公开')}</option>
            <option value="unlisted">{t('admin.moments.visibility.unlisted', '不公开')}</option>
            <option value="private">{t('admin.moments.visibility.private', '仅自己')}</option>
          </select>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? t('admin.common.save', '保存') : t('admin.moments.publish', '发布')}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.common.deleteIrreversible', '删除后无法恢复')} />
    </div>
  );
}
