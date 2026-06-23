import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import { mediaApi, optionsApi } from '@/lib/api';
import FooterIconsEditor from '@/components/FooterIconsEditor';
import { LoadingState } from '@/components/ui';

type AzureProfileForm = {
  azure_sidebar_profile_enabled: string;
  azure_sidebar_profile_avatar: string;
  azure_sidebar_profile_mood: string;
  azure_sidebar_profile_name: string;
  azure_sidebar_profile_tagline: string;
  azure_sidebar_profile_welcome: string;
  azure_sidebar_profile_bio: string;
  azure_sidebar_weather_enabled: string;
  azure_sidebar_weather_default_city: string;
  azure_sidebar_weather_default_country: string;
  azure_sidebar_weather_default_country_code: string;
  azure_sidebar_weather_default_latitude: string;
  azure_sidebar_weather_default_longitude: string;
};

const defaultForm: AzureProfileForm = {
  azure_sidebar_profile_enabled: 'true',
  azure_sidebar_profile_avatar: '',
  azure_sidebar_profile_mood: '',
  azure_sidebar_profile_name: '',
  azure_sidebar_profile_tagline: '',
  azure_sidebar_profile_welcome: '',
  azure_sidebar_profile_bio: '',
  azure_sidebar_weather_enabled: 'true',
  azure_sidebar_weather_default_city: '塔什干',
  azure_sidebar_weather_default_country: '乌兹别克斯坦',
  azure_sidebar_weather_default_country_code: 'UZ',
  azure_sidebar_weather_default_latitude: '41.2995',
  azure_sidebar_weather_default_longitude: '69.2401',
};

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '180px minmax(0, 1fr)',
  minHeight: 58,
  borderBottom: '1px solid var(--color-border)',
} as const;

const labelStyle = {
  padding: '18px 16px 12px 0',
  color: 'var(--color-text-sub)',
  fontSize: 13,
  fontWeight: 600,
} as const;

const valueStyle = {
  padding: '10px 0',
  minWidth: 0,
} as const;

export default function AzureProfileSettings() {
  const [form, setForm] = useState<AzureProfileForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const r: any = await optionsApi.list();
        const options = r.data || r;
        setForm({
          azure_sidebar_profile_enabled: String(options.azure_sidebar_profile_enabled || defaultForm.azure_sidebar_profile_enabled),
          azure_sidebar_profile_avatar: String(options.azure_sidebar_profile_avatar || ''),
          azure_sidebar_profile_mood: String(options.azure_sidebar_profile_mood || ''),
          azure_sidebar_profile_name: String(options.azure_sidebar_profile_name || ''),
          azure_sidebar_profile_tagline: String(options.azure_sidebar_profile_tagline || ''),
          azure_sidebar_profile_welcome: String(options.azure_sidebar_profile_welcome || ''),
          azure_sidebar_profile_bio: String(options.azure_sidebar_profile_bio || ''),
          azure_sidebar_weather_enabled: String(options.azure_sidebar_weather_enabled || defaultForm.azure_sidebar_weather_enabled),
          azure_sidebar_weather_default_city: String(options.azure_sidebar_weather_default_city || defaultForm.azure_sidebar_weather_default_city),
          azure_sidebar_weather_default_country: String(options.azure_sidebar_weather_default_country || defaultForm.azure_sidebar_weather_default_country),
          azure_sidebar_weather_default_country_code: String(options.azure_sidebar_weather_default_country_code || defaultForm.azure_sidebar_weather_default_country_code),
          azure_sidebar_weather_default_latitude: String(options.azure_sidebar_weather_default_latitude || defaultForm.azure_sidebar_weather_default_latitude),
          azure_sidebar_weather_default_longitude: String(options.azure_sidebar_weather_default_longitude || defaultForm.azure_sidebar_weather_default_longitude),
        });
      } catch {
        toast.error('加载资料卡配置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (key: keyof AzureProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    setUploading(true);
    try {
      const r: any = await mediaApi.upload(file, 'theme-profile');
      const url = r.data?.url || r.url;
      if (url) update('azure_sidebar_profile_avatar', url);
      toast.success('头像已上传');
    } catch {
      toast.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await optionsApi.updateMany(form);
      toast.success('已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState padding="20px 0" />;

  return (
    <div>
      <div className="card" style={{ padding: 20, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
          <div>
            <h3 className="text-main" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>主题侧边栏资料卡</h3>
            <p className="text-dim" style={{ fontSize: 12, lineHeight: 1.7, margin: '8px 0 0' }}>
              留空时自动使用博主资料；访客填写过评论表单后，前台会读取同一份缓存显示欢迎回来。
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>显示资料卡</div>
          <div style={{ ...valueStyle, display: 'flex', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.azure_sidebar_profile_enabled !== 'false'}
                onChange={(e) => update('azure_sidebar_profile_enabled', e.target.checked ? 'true' : 'false')}
              />
              启用主题侧边栏资料卡
            </label>
          </div>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>头像</div>
          <div style={{ ...valueStyle, display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
            <div style={{
              width: 54, height: 54, border: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-bg-soft)', overflow: 'hidden',
            }}>
              {form.azure_sidebar_profile_avatar ? (
                <img src={form.azure_sidebar_profile_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <i className="fa-regular fa-user" style={{ color: 'var(--color-text-dim)' }} />
              )}
            </div>
            <input
              className="input"
              value={form.azure_sidebar_profile_avatar}
              onChange={(e) => update('azure_sidebar_profile_avatar', e.target.value)}
              placeholder="留空使用博主头像，也可以填写图片 URL"
            />
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <i className={uploading ? 'fa-regular fa-spinner fa-spin' : 'fa-regular fa-upload'} style={{ fontSize: 13 }} />
              {uploading ? '上传中' : '上传'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
          </div>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>名称</div>
          <div style={valueStyle}>
            <input
              className="input"
              value={form.azure_sidebar_profile_name}
              onChange={(e) => update('azure_sidebar_profile_name', e.target.value)}
              placeholder="留空使用博主昵称 / 站点标题"
            />
          </div>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>心情 Emoji</div>
          <div style={valueStyle}>
            <input
              className="input"
              value={form.azure_sidebar_profile_mood}
              onChange={(e) => update('azure_sidebar_profile_mood', e.target.value)}
              placeholder="例如 😄，留空不显示"
              maxLength={8}
            />
          </div>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>欢迎语</div>
          <div style={valueStyle}>
            <input
              className="input"
              value={form.azure_sidebar_profile_welcome}
              onChange={(e) => update('azure_sidebar_profile_welcome', e.target.value)}
              placeholder="无评论缓存时显示，例如 欢迎来到这里"
            />
          </div>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>短描述</div>
          <div style={valueStyle}>
            <input
              className="input"
              value={form.azure_sidebar_profile_tagline}
              onChange={(e) => update('azure_sidebar_profile_tagline', e.target.value)}
              placeholder="显示在名称下方，留空使用站点副标题 / 描述"
            />
          </div>
        </div>

        <div style={{ ...rowStyle, borderBottom: 0 }}>
          <div style={labelStyle}>悬浮简介</div>
          <div style={valueStyle}>
            <textarea
              className="input"
              value={form.azure_sidebar_profile_bio}
              onChange={(e) => update('azure_sidebar_profile_bio', e.target.value)}
              placeholder="鼠标悬浮资料卡时显示；留空使用博主简介 / 站点描述"
              rows={4}
              style={{ resize: 'vertical', lineHeight: 1.7, paddingTop: 10 }}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
          <div>
            <h3 className="text-main" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>主题侧边栏访客天气</h3>
            <p className="text-dim" style={{ fontSize: 12, lineHeight: 1.7, margin: '8px 0 0' }}>
              显示在原社交链接条位置。优先按访客 IP 获取城市天气，失败时显示默认城市天气。
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>显示天气条</div>
          <div style={{ ...valueStyle, display: 'flex', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.azure_sidebar_weather_enabled !== 'false'}
                onChange={(e) => update('azure_sidebar_weather_enabled', e.target.checked ? 'true' : 'false')}
              />
              启用访客天气
            </label>
          </div>
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>默认城市</div>
          <div style={{ ...valueStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 120px', gap: 10 }}>
            <input
              className="input"
              value={form.azure_sidebar_weather_default_city}
              onChange={(e) => update('azure_sidebar_weather_default_city', e.target.value)}
              placeholder="塔什干"
            />
            <input
              className="input"
              value={form.azure_sidebar_weather_default_country}
              onChange={(e) => update('azure_sidebar_weather_default_country', e.target.value)}
              placeholder="乌兹别克斯坦"
            />
            <input
              className="input"
              value={form.azure_sidebar_weather_default_country_code}
              onChange={(e) => update('azure_sidebar_weather_default_country_code', e.target.value.toUpperCase())}
              placeholder="UZ"
              maxLength={2}
            />
          </div>
        </div>

        <div style={{ ...rowStyle, borderBottom: 0 }}>
          <div style={labelStyle}>默认坐标</div>
          <div style={{ ...valueStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <input
              className="input"
              value={form.azure_sidebar_weather_default_latitude}
              onChange={(e) => update('azure_sidebar_weather_default_latitude', e.target.value)}
              placeholder="41.2995"
            />
            <input
              className="input"
              value={form.azure_sidebar_weather_default_longitude}
              onChange={(e) => update('azure_sidebar_weather_default_longitude', e.target.value)}
              placeholder="69.2401"
            />
          </div>
        </div>
      </div>

      <FooterIconsEditor
        optionKey="azure_sidebar_social_links"
        title="资料卡社交按钮"
        emptyText="尚未配置，资料卡不会显示社交按钮。"
        emptyRow={{ icon: 'fa-brands fa-github', label: 'GitHub', href: '' }}
        description={
          <>
            显示在主题侧边栏资料卡右下角，只渲染这里配置的按钮，不再自动追加站点固定网址。
            支持 FontAwesome 类名、图片 URL、内联 SVG；填写「复制文本」后点击按钮会复制内容。
          </>
        }
      />
    </div>
  );
}
