import { RefreshCw, Check, Lightbulb, Plug, Trash2, ExternalLink, Upload, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { pluginsApi, type ExtensionManifest } from '@/lib/api';
import {
  Button, Badge, Card, ConfirmDialog, EmptyState, LoadingState,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';

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
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 {plugins.length} 个插件 · 启用中 <span className="font-semibold text-primary">{active.length}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchList} disabled={loading} title="刷新列表">
            <RefreshCw className="size-4" />
          </Button>
          <Button size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} title={uploading ? '上传中…' : '上传插件 .zip'}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Lightbulb className="mt-0.5 size-4 shrink-0" />
        <p className="m-0">
          插件包为 <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">.zip</code> 格式，根目录包含 <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">manifest.json</code>。上传后解压到 <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">content/plugins/&lt;id&gt;/</code>，默认**不自动启用**，需手动开启。
        </p>
      </div>

      {loading ? (
        <LoadingState />
      ) : plugins.length === 0 ? (
        <EmptyState
          title="暂无插件，点「上传插件」安装第一个"
          actionText="上传插件"
          onAction={() => fileInputRef.current?.click()}
          icon={<Plug />}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          {plugins.map((plugin, idx) => {
            const enabled = plugin.enabled;
            return (
              <div
                key={plugin.id}
                className={cn(
                  'flex items-center gap-3.5 px-[18px] py-3.5',
                  idx < plugins.length - 1 && 'border-b border-border',
                  enabled && 'bg-primary/5',
                )}
              >
                <div className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-md',
                  enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}>
                  <Plug className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <h3 className="m-0 text-sm font-semibold text-foreground">
                      {plugin.name}
                    </h3>
                    <span className="text-[11px] text-muted-foreground">v{plugin.version}</span>
                    {plugin.author && (
                      <span className="text-[11px] text-muted-foreground">· {plugin.author}</span>
                    )}
                    {plugin.builtin && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">内置</Badge>
                    )}
                  </div>
                  {plugin.description && (
                    <p className="m-0 text-xs leading-normal text-muted-foreground">
                      {plugin.description}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {plugin.homepage && (
                    <a
                      href={plugin.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-primary"
                      title="插件主页"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}

                  {enabled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-w-[84px] border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      disabled={toggling === plugin.id}
                      onClick={() => handleToggle(plugin.id, true)}
                      title="点击禁用"
                    >
                      <Check className="size-4" />
                      {toggling === plugin.id ? '切换中…' : '已启用'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="min-w-[84px]"
                      disabled={toggling === plugin.id}
                      onClick={() => handleToggle(plugin.id, false)}
                    >
                      {toggling === plugin.id ? '切换中…' : '启用'}
                    </Button>
                  )}

                  {!plugin.builtin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-[30px] text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(plugin.id)}
                      title="删除"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="确认删除插件？"
        message={`将永久删除插件「${plugins.find((p) => p.id === deleteId)?.name || ''}」，不可撤销。`}
        confirmText="删除"
      />
    </div>
  );
}
