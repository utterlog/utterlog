import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { pluginsApi, type ExtensionManifest } from '@/lib/api';
import { ConfirmDialog, EmptyPanel, LoadingState } from '@/components/ui';

export default function Plugins() {
  const [plugins, setPlugins] = useState<ExtensionManifest[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const r: any = await pluginsApi.list();
      const d = r.data || r;
      setPlugins(d.plugins || []);
      setActive(d.active || []);
    } catch {
      toast.error('获取插件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('请上传 .zip 格式的插件包');
      return;
    }
    setUploading(true);
    const tid = toast.loading('正在上传…');
    try {
      const r: any = await pluginsApi.upload(file);
      toast.success(`插件「${r.data?.name || r.name || '未命名'}」已安装`, { id: tid });
      fetchList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '上传失败', { id: tid });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      if (enabled) {
        await pluginsApi.deactivate(id);
        toast.success('插件已禁用');
        setActive((prev) => prev.filter((x) => x !== id));
      } else {
        await pluginsApi.activate(id);
        toast.success('插件已启用');
        setActive((prev) => [...prev, id]);
      }
      setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !enabled } : p)));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '操作失败');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(null);
    try {
      await pluginsApi.remove(id);
      toast.success('插件已删除');
      fetchList();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || '删除失败');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="text-sub" style={{ fontSize: 13 }}>
          共 {plugins.length} 个插件 · 启用中 <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{active.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-square" onClick={fetchList} disabled={loading} title="刷新列表">
            <i className="fa-regular fa-arrows-rotate" style={{ fontSize: 14 }} />
          </button>
          <button className="btn btn-primary btn-square" onClick={() => fileInputRef.current?.click()} disabled={uploading} title={uploading ? '上传中…' : '上传插件 .zip'}>
            <i className={uploading ? 'fa-regular fa-spinner fa-spin' : 'fa-regular fa-upload'} style={{ fontSize: 14 }} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>
      </div>

      <div style={{
        padding: '12px 16px', marginBottom: 20,
        background: 'var(--color-bg-soft)',
        border: '1px solid var(--color-border)',
        fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-sub)',
      }}>
        <i className="fa-regular fa-lightbulb" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
        插件包为 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: 11 }}>.zip</code> 格式，根目录包含 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: 11 }}>manifest.json</code>。上传后解压到 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: 11 }}>content/plugins/&lt;id&gt;/</code>，默认**不自动启用**，需手动开启。
      </div>

      {loading ? (
        <LoadingState padding={60} />
      ) : plugins.length === 0 ? (
        <EmptyPanel title="暂无插件，点「上传插件」安装第一个" actionText="上传插件" onAction={() => fileInputRef.current?.click()} padding={60} fontSize={13} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {plugins.map((plugin, idx) => {
            const enabled = plugin.enabled;
            return (
              <div
                key={plugin.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  borderBottom: idx < plugins.length - 1 ? '1px solid var(--color-divider)' : 'none',
                  background: enabled ? 'color-mix(in srgb, var(--color-primary) 3%, transparent)' : 'transparent',
                }}
              >
                <div style={{
                  width: 40, height: 40, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: enabled ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-bg-soft)',
                }}>
                  <i className="fa-regular fa-plug" style={{ fontSize: 16, color: enabled ? 'var(--color-primary)' : 'var(--color-text-dim)' }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--color-text-main)' }}>
                      {plugin.name}
                    </h3>
                    <span className="text-dim" style={{ fontSize: 11 }}>v{plugin.version}</span>
                    {plugin.author && (
                      <span className="text-dim" style={{ fontSize: 11 }}>· {plugin.author}</span>
                    )}
                    {plugin.builtin && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px',
                        background: 'var(--color-bg-soft)', color: 'var(--color-text-sub)',
                      }}>内置</span>
                    )}
                  </div>
                  {plugin.description && (
                    <p className="text-sub" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                      {plugin.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {plugin.homepage && (
                    <a
                      href={plugin.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dim"
                      title="插件主页"
                      style={{
                        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-dim)'; }}
                    >
                      <i className="fa-regular fa-up-right-from-square" style={{ fontSize: 12 }} />
                    </a>
                  )}

                  {enabled ? (
                    <button
                      className="btn btn-sm"
                      disabled={toggling === plugin.id}
                      onClick={() => handleToggle(plugin.id, true)}
                      title="点击禁用"
                      style={{
                        minWidth: 84,
                        background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                        color: 'var(--color-primary)',
                        borderColor: 'var(--color-primary)',
                      }}
                    >
                      <i className="fa-solid fa-check" style={{ fontSize: 11 }} />
                      {toggling === plugin.id ? '切换中…' : '已启用'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={toggling === plugin.id}
                      onClick={() => handleToggle(plugin.id, false)}
                      style={{ minWidth: 84 }}
                    >
                      {toggling === plugin.id ? '切换中…' : '启用'}
                    </button>
                  )}

                  {!plugin.builtin && (
                    <button
                      onClick={() => setDeleteId(plugin.id)}
                      title="删除"
                      style={{
                        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--color-text-dim)', transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-dim)'; }}
                    >
                      <i className="fa-regular fa-trash" style={{ fontSize: 12 }} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="确认删除插件？"
        message={`将永久删除插件「${plugins.find((p) => p.id === deleteId)?.name || ''}」，不可撤销。`}
        confirmText="删除"
      />
    </div>
  );
}
