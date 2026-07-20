// Spinner — the single loading entry point for the admin. Now Lucide-based.
//
//   <Spinner inline />     → icon only, inline (buttons / icon-only)
//   <Spinner />            → block, centered in its container
//   <Spinner overlay />    → fixed full-screen overlay (route / auth / blocking)
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface SpinnerProps {
  inline?: boolean;
  overlay?: boolean;
  text?: string;
  size?: number;
}

export default function Spinner({ inline, overlay, text, size = 14 }: SpinnerProps) {
  if (inline) {
    return <Loader2 className="animate-spin" style={{ width: size, height: size }} aria-hidden="true" />;
  }

  const { t } = useI18n();
  const label = text ?? t('common.loading', '加载中…');

  const content = (
    <>
      <Loader2 className="mr-2 animate-spin text-primary" style={{ width: size, height: size }} aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </>
  );

  if (overlay) {
    return (
      <div role="status" aria-live="polite" className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/70 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-[200px] items-center justify-center px-4 py-6">
      {content}
    </div>
  );
}
