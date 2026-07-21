import { Ghost } from 'lucide-react';
import { Link } from '@/lib/router';
import { buttonVariants } from '@/components/ui/shadcn';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center px-5 py-20 text-center">
      <Ghost className="size-12 text-muted-foreground" />
      <h1 className="mb-2 text-xl font-semibold">{t('admin.notFound.title', '页面未找到')}</h1>
      <p className="mb-5 text-sm text-muted-foreground">{t('admin.notFound.description', '此页面正在迁移中或不存在')}</p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>{t('admin.notFound.back', '返回概览')}</Link>
    </div>
  );
}
