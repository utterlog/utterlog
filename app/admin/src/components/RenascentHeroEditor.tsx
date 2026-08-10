import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { optionsApi } from '@/lib/api';
import { Button } from '@/components/ui/shadcn/button';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Label } from '@/components/ui/shadcn/label';

/**
 * Renascent 首页 Hero 的站长配置。
 *
 * 四个字段全是多行文本，解析规则写在
 * `app/start/src/web/themes/Renascent/hero-config.ts`，两边要一起改。
 * 留空的字段前台整块不渲染，所以什么都不填也是完整版面。
 */

const FIELDS = [
  {
    key: 'renascent_hero_places',
    label: '常驻城市',
    placeholder: '深圳 · 东京 · 香港 · 北京',
    hint: '用 · 或换行分隔。内置了常见城市的坐标，会在右侧卡片的世界地图上落点；' +
      '认不出的城市照样显示名字，只是不落点。想手动指定写成「城市名@经度,纬度」。最多 8 个。',
    rows: 2,
  },
  {
    key: 'renascent_hero_facts',
    label: '档案表',
    placeholder: 'FIRST BOOK = 2004 · TOEFL 高分作文\nLANGUAGES = 中文 · English\nCADENCE = ~2 articles / week\nSINCE = 2018（this journal）',
    hint: '每行一条，用 = 或：分隔标签和内容。显示在大标题下方。最多 6 行。',
    rows: 5,
  },
  {
    key: 'renascent_hero_projects',
    label: '在做的项目',
    placeholder: 'vmark.app | https://vmark.app\nclaudepot | | 尚未发布\nlixiaolai.com | https://lixiaolai.com',
    hint: '每行一条，格式「名称 | 链接 | 备注」，后两段可以省略（但分隔的 | 要留）。' +
      '显示在右侧卡片的 WRITING 行。最多 6 条。',
    rows: 4,
  },
] as const;

export default function RenascentHeroEditor() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await optionsApi.list();
        const data = r.data || r;
        const next: Record<string, string> = {};
        for (const f of FIELDS) next[f.key] = String(data[f.key] || '');
        setValues(next);
      } catch {
        toast.error('读取配置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      for (const f of FIELDS) {
        await optionsApi.update(f.key, values[f.key] ?? '');
      }
      toast.success('已保存，刷新前台生效');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        首页顶部 Hero 的内容。大标题和描述取自「站点设置」的副标题与描述，
        在标题里用 <code className="px-1 py-0.5 bg-muted">*星号*</code> 包住某个词，
        前台会把它渲染成蓝色斜体强调（例：<code className="px-1 py-0.5 bg-muted">A life-long learner, *reborn* with AI.</code>）。
        下面几项留空的话，对应板块不显示。
      </div>

      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-2">
          <Label htmlFor={f.key}>{f.label}</Label>
          <Textarea
            id={f.key}
            rows={f.rows}
            value={values[f.key] ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{f.hint}</p>
        </div>
      ))}

      <Button onClick={save} disabled={saving}>
        {saving ? '保存中…' : '保存'}
      </Button>
    </div>
  );
}
