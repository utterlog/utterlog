import { createFileRoute } from '@tanstack/react-router';
import Tools, { type ToolsTab } from '@/pages/Tools';

export const Route = createFileRoute('/_authenticated/tools')({
  validateSearch: ({ tab }: Record<string, unknown>): { tab?: ToolsTab } =>
    tab === 'backup' || tab === 'wp-sync' || tab === 'typecho-sync' ? { tab } : {},
  component: ToolsRoute,
});

function ToolsRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <Tools activeTab={tab ?? 'wp-sync'} onTabChange={(nextTab) => {
    void navigate({ to: '/tools', search: { tab: nextTab }, replace: true });
  }} />;
}
