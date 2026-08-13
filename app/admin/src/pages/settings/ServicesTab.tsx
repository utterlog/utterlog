/**
 * 设置页「第三方服务」tab。
 *
 * 从 Settings.tsx 抽出来 —— 原先整页挤在一个函数里，切 tab 时整个函数体
 * 重新执行。JSX 原样搬运，字段名一字未改。
 *
 * serviceSections 只有本 tab 用，一并搬进来：它是 53 行的字面量，留在父组件
 * 里的话，别的 tab 每次输入都要重建一次。
 */

import { useMemo } from 'react';
import type { UseFormRegister, UseFormWatch } from 'react-hook-form';
import { GitBranch, Globe, LocateFixed, Map, MapPin, Minimize2, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/shadcn';
import type { useI18n } from '@/lib/i18n';
import { CredentialTest, Row, SelectRow, SettingsSection } from './shared';

export default function ServicesTab({ t, register, watch }: {
  t: ReturnType<typeof useI18n>['t'];
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
}) {
  const serviceSections: Array<{
    title: string;
    icon: LucideIcon;
    description: string;
    footerHint?: string;
    fields: Array<{ name: string; label: string; type?: string; placeholder?: string; hint?: string; testable?: boolean }>;
  }> = useMemo(() => [
    {
      title: t('admin.settings.services.mapbox.section', 'Mapbox'),
      icon: Map,
      description: t('admin.settings.services.mapbox.description', '全站统一 Mapbox 配置。数据统计访客地图和前台足迹地图都会从这里读取。'),
      footerHint: t('admin.settings.services.mapbox.footer', 'Mapbox public token 通常以 pk. 开头，可在 account.mapbox.com 创建。旧版足迹设置里的 token 会自动兼容并同步到这里。API 地址默认走 api.mapbox.com，自建代理需要改动时联系维护者。'),
      fields: [
        { name: 'mapbox_access_token', label: t('admin.settings.services.mapbox.token', 'Mapbox Token'), type: 'password', placeholder: 'pk.eyJ1...' , testable: true},
      ],
    },
    {
      title: t('admin.settings.services.github.section', 'GitHub'),
      icon: GitBranch,
      description: t('admin.settings.services.github.description', '全站统一 GitHub Token。可不填；填写后用于服务端 GitHub API 调用并提升速率上限。'),
      footerHint: t('admin.settings.services.github.footer', '建议只授予最小只读权限。Token 只保存在服务端，不会输出到前台；公开页面不会因为配置 Token 自动混入私有仓库。'),
      fields: [
        { name: 'github_access_token', label: t('admin.settings.services.github.token', 'GitHub Token'), type: 'password', placeholder: 'github_pat_...' , testable: true},
      ],
    },
    {
      title: t('admin.settings.services.google.section', 'Google Maps'),
      icon: MapPin,
      description: t('admin.settings.services.google.description', '预留给后续地理编码、地图或地址服务使用。当前足迹地理编码仍使用足迹页配置的临时服务。'),
      fields: [
        { name: 'google_maps_api_key', label: t('admin.settings.services.google.apiKey', 'Google Maps API Key'), type: 'password', placeholder: 'AIza...' , testable: true},
      ],
    },
    {
      title: t('admin.settings.services.amap.section', '高德地图'),
      icon: MapPin,
      description: t('admin.settings.services.amap.description', '用于国内经纬度反查城市名、地址解析等地理编码能力。后续说说位置和足迹地理编码可从这里读取。'),
      footerHint: t('admin.settings.services.amap.footer', '填写高德开放平台 Web 服务 Key。建议只给服务端接口使用，不在前台公开输出。'),
      fields: [
        { name: 'amap_api_key', label: t('admin.settings.services.amap.apiKey', '高德地图 Web 服务 Key'), type: 'password', placeholder: 'AMap Web Service Key' , testable: true},
      ],
    },
    {
      title: t('admin.settings.services.tencent.section', '腾讯位置服务'),
      icon: LocateFixed,
      description: t('admin.settings.services.tencent.description', '用于国内逆地址解析、城市名识别和后续位置服务。可作为 Mapbox 的国内兜底服务。'),
      footerHint: t('admin.settings.services.tencent.footer', '填写腾讯位置服务 WebService API Key。建议只给服务端接口使用，不在前台公开输出。'),
      fields: [
        { name: 'tencent_maps_api_key', label: t('admin.settings.services.tencent.apiKey', '腾讯位置服务 Key'), type: 'password', placeholder: 'Tencent Location Service Key' , testable: true},
      ],
    },
    {
      title: t('admin.settings.services.tinypng.section', 'TinyPNG'),
      icon: Minimize2,
      description: t('admin.settings.services.tinypng.description', '集中保存 TinyPNG Key。当前上传压缩仍走系统内置编码器，TinyPNG 在线压缩接入后会直接读取这里。'),
      fields: [
        { name: 'tinypng_api_key', label: t('admin.settings.services.tinypng.apiKey', 'TinyPNG API Key'), type: 'password', placeholder: 'TinyPNG API Key' , testable: true},
      ],
    },
  ], [t]);

  return (
    <>
      {serviceSections.map((section) => (
        <SettingsSection
          key={section.title}
          title={section.title}
          icon={section.icon}
          description={section.description}
          inlineDescription
          footerHint={section.footerHint}
        >
          {section.fields.map((field, index) => (
            <Row
              key={field.name}
              label={field.label}
              hint={field.hint}
              last={index === section.fields.length - 1}
            >
              {/* 输入框和测试按钮同行：按钮单独占一行会把本来就长的
                  第三方服务页拉得更长，而且它和输入框是一件事。 */}
              <div className="flex w-full items-center gap-2">
                <Input
                  type={field.type}
                  placeholder={field.placeholder}
                  {...register(field.name)}
                />
                {field.testable && (
                  <CredentialTest
                    field={field.name}
                    getValue={() => String(watch(field.name) || '')}
                  />
                )}
              </div>
            </Row>
          ))}
        </SettingsSection>
      ))}

      {/* GeoIP 数据源原先挂在已下线的安全中心页里，但读它的是访客统计、评论
          归属地、足迹同步、天气和服务器出口 IP 识别 —— 全是第三方 IP 库的事，
          所以跟着其它外部服务一起放这儿。 */}
      <SettingsSection
        title={t('admin.settings.services.geoip.section', 'IP 归属地')}
        icon={Globe}
        description={t('admin.settings.services.geoip.description', '访客统计、评论归属地、足迹和服务器出口 IP 识别都从这个数据源取。')}
        inlineDescription
      >
        <SelectRow
          label={t('admin.settings.services.geoip.provider', 'GeoIP 数据源')}
          hint={t('admin.settings.services.geoip.providerHint', '国际源对境外 IP 更准，国内源对境内 IP 更准。')}
          register={register('ip_geo_provider')}
          options={[
            { value: 'ipx', label: t('admin.settings.services.geoip.providerIpx', '国际默认源（国外更准确）') },
            { value: 'cnip', label: t('admin.settings.services.geoip.providerCnip', '国内备用源（国内更准确）') },
          ]}
          last
        />
      </SettingsSection>
    </>
  );
}
