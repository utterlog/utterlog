
import { useEffect, useState } from 'react';
import { playlistsApi, musicApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, EmptyPanel, Input, LoadingState, Modal, ConfirmDialog } from '@/components/ui';

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', description: '', cover_url: '', is_default: false });
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importForm, setImportForm] = useState({ server: 'netease', playlist_id: '', title: '' });
  const [importing, setImporting] = useState(false);

  // Songs management
  const [activePlaylist, setActivePlaylist] = useState<any | null>(null);
  const [playlistSongs, setPlaylistSongs] = useState<any[]>([]);
  const [allMusic, setAllMusic] = useState<any[]>([]);
  const [showAddSong, setShowAddSong] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => { fetchPlaylists(); }, []);

  const fetchPlaylists = async () => {
    setLoading(true);
    try { const r: any = await playlistsApi.list(); setPlaylists(r.data || []); }
    catch { toast.error('获取歌单失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', description: '', cover_url: '', is_default: false }); setShowModal(true); };
  const openEdit = (p: any) => { setEditingId(p.id); setForm({ title: p.title, description: p.description || '', cover_url: p.cover_url || '', is_default: p.is_default }); setShowModal(true); };

  const onSubmit = async () => {
    if (!form.title.trim()) { toast.error('歌单名称不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await playlistsApi.update(editingId, form); toast.success('更新成功'); }
      else { await playlistsApi.create(form); toast.success('创建成功'); }
      setShowModal(false); fetchPlaylists();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await playlistsApi.delete(deleteId); toast.success('删除成功'); fetchPlaylists(); if (activePlaylist?.id === deleteId) setActivePlaylist(null); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const handleImport = async () => {
    if (!importForm.playlist_id.trim()) { toast.error('请输入歌单 ID'); return; }
    setImporting(true);
    try {
      const r: any = await playlistsApi.import(importForm.server, importForm.playlist_id, importForm.title || '导入歌单');
      toast.success(`导入成功，共 ${r.data?.imported || 0} 首`);
      setShowImport(false); fetchPlaylists();
    } catch (e: any) { toast.error(e?.response?.data?.error?.message || '导入失败'); }
    finally { setImporting(false); }
  };

  // Open playlist detail
  const openPlaylist = async (p: any) => {
    setActivePlaylist(p);
    try {
      const r: any = await playlistsApi.get(p.id);
      setPlaylistSongs(r.data?.songs || []);
    } catch { toast.error('获取歌曲失败'); }
  };

  // Add song to playlist
  const addSongToPlaylist = async (musicId: number) => {
    if (!activePlaylist) return;
    try {
      await playlistsApi.addSong(activePlaylist.id, musicId);
      toast.success('添加成功');
      openPlaylist(activePlaylist); // Refresh
      fetchPlaylists();
    } catch { toast.error('添加失败'); }
  };

  // Remove song from playlist
  const removeSong = async (musicId: number) => {
    if (!activePlaylist) return;
    try {
      await playlistsApi.removeSong(activePlaylist.id, musicId);
      toast.success('已移除');
      openPlaylist(activePlaylist);
      fetchPlaylists();
    } catch { toast.error('移除失败'); }
  };

  // Load all music for add-song picker
  const loadAllMusic = async () => {
    try { const r: any = await musicApi.list({ per_page: 500 }); setAllMusic(r.data || []); }
    catch {}
    setShowAddSong(true);
  };

  const filteredMusic = searchKeyword
    ? allMusic.filter(m => m.title?.includes(searchKeyword) || m.artist?.includes(searchKeyword))
    : allMusic;

  const songIds = new Set(playlistSongs.map((s: any) => s.id));

  return (
    <div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-regular fa-music text-primary-themed" style={{ fontSize: '20px' }} />
          <h1 className="text-main" style={{ fontSize: '18px', fontWeight: 700 }}>歌单管理</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={() => setShowImport(true)}>导入歌单</Button>
          <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />创建歌单</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Left: playlist list */}
        <div style={{ width: '300px', flexShrink: 0 }}>
          {loading ? (
            <LoadingState padding="40px" />
          ) : playlists.length === 0 ? (
            <EmptyPanel title="暂无歌单" actionText="创建" onAction={openCreate} padding="40px" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {playlists.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openPlaylist(p)}
                  className="card card-hover"
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    borderColor: activePlaylist?.id === p.id ? 'var(--color-primary)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                        {p.title}
                        {p.is_default && <span style={{ fontSize: '10px', marginLeft: '6px', padding: '1px 4px', borderRadius: '2px', background: 'var(--color-bg-soft)', color: 'var(--color-primary)' }}>默认</span>}
                      </h3>
                      <p className="text-dim" style={{ fontSize: '12px' }}>{p.song_count || 0} 首</p>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="action-btn primary" title="编辑"><i className="fa-regular fa-pen" style={{ fontSize: '13px' }} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }} className="action-btn danger" title="删除"><i className="fa-regular fa-trash" style={{ fontSize: '13px' }} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: playlist songs */}
        <div style={{ flex: 1 }}>
          {activePlaylist ? (
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{activePlaylist.title}</h2>
                <Button size="sm" onClick={loadAllMusic}><i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />添加歌曲</Button>
              </div>

              {playlistSongs.length === 0 ? (
                <EmptyPanel title="歌单暂无歌曲" padding="32px" fontSize="14px" />
              ) : (
                <div>
                  {playlistSongs.map((s: any, i: number) => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px',
                      borderBottom: i < playlistSongs.length - 1 ? '1px solid var(--color-divider)' : 'none',
                    }}>
                      <span className="text-dim" style={{ fontSize: '12px', width: '24px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      {s.cover_url && <img src={s.cover_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '1px', objectFit: 'cover', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-main" style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                        <p className="text-dim" style={{ fontSize: '11px' }}>{s.artist || ''}</p>
                      </div>
                      <span className="text-dim" style={{ fontSize: '11px', flexShrink: 0 }}>
                        {{ netease: '网易云', tencent: 'QQ', kugou: '酷狗', local: '本地' }[s.platform as string] || s.platform || ''}
                      </span>
                      <button onClick={() => removeSong(s.id)} className="action-btn danger" title="移除"><i className="fa-solid fa-xmark" style={{ fontSize: '14px' }} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyPanel title="选择左侧歌单查看歌曲" padding="80px" fontSize="14px" />
          )}
        </div>
      </div>

      {/* Create/Edit modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? '编辑歌单' : '创建歌单'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="歌单名称" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input label="封面 URL" value={form.cover_url} onChange={e => setForm({ ...form, cover_url: e.target.value })} placeholder="可选" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>描述</label>
            <textarea className="input focus-ring" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
            <span className="text-sub">设为默认歌单</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={onSubmit} loading={submitting}>{editingId ? '保存' : '创建'}</Button>
          </div>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="导入外部歌单" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>平台</label>
            <select className="input" value={importForm.server} onChange={e => setImportForm({ ...importForm, server: e.target.value })}>
              <option value="netease">网易云音乐</option>
              <option value="kugou">酷狗音乐</option>
            </select>
          </div>
          <Input label="歌单 ID" value={importForm.playlist_id} onChange={e => setImportForm({ ...importForm, playlist_id: e.target.value })} placeholder="从歌单链接中获取数字 ID" />
          <Input label="歌单名称" value={importForm.title} onChange={e => setImportForm({ ...importForm, title: e.target.value })} placeholder="可选，不填默认为'导入歌单'" />
          <p className="text-dim" style={{ fontSize: '12px' }}>网易云歌单 ID 在链接中：music.163.com/playlist?id=<strong>数字</strong></p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <Button variant="secondary" onClick={() => setShowImport(false)}>取消</Button>
            <Button onClick={handleImport} loading={importing}>导入</Button>
          </div>
        </div>
      </Modal>

      {/* Add song picker modal */}
      <Modal isOpen={showAddSong} onClose={() => setShowAddSong(false)} title="添加歌曲到歌单" size="md">
        <div>
          <Input placeholder="搜索已有歌曲…" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} style={{ marginBottom: '12px' }} />
          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {filteredMusic.length === 0 ? (
              <p className="text-dim" style={{ textAlign: 'center', padding: '24px', fontSize: '13px' }}>
                {allMusic.length === 0 ? '暂无歌曲，请先在音乐管理中添加' : '无匹配结果'}
              </p>
            ) : filteredMusic.map((m: any) => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px',
                borderBottom: '1px solid var(--color-divider)',
              }}>
                {m.cover_url && <img src={m.cover_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '1px', objectFit: 'cover' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-main" style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                  <p className="text-dim" style={{ fontSize: '11px' }}>{m.artist}</p>
                </div>
                {songIds.has(m.id) ? (
                  <span className="text-dim" style={{ fontSize: '11px' }}>已添加</span>
                ) : (
                  <Button size="sm" onClick={() => addSongToPlaylist(m.id)}><i className="fa-regular fa-plus" style={{ fontSize: '12px' }} /></Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除歌单后歌曲不会被删除" />
    </div>
  );
}
