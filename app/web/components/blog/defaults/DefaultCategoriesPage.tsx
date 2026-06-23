import Link from 'next/link';
import PageTitle from '@/components/blog/PageTitle';

function getCatIcon(name: string, icon?: string) {
  if (icon && (icon.startsWith('fa-') || icon.startsWith('fa '))) return icon;
  return 'fa-sharp fa-light fa-folder';
}

interface DefaultCategoriesPageProps {
  categories: any[];
}

export default function DefaultCategoriesPage({ categories }: DefaultCategoriesPageProps) {
  return (
    <div>
      <PageTitle
        title="分类"
        icon="fa-solid fa-folder-tree"
        meta={<><strong>{categories.length}</strong> 个分类</>}
      />

      <div style={{ padding: '0 32px 32px' }}>
      {categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              prefetch={false}
              className="group flex items-center gap-4 p-5 bg-card border border-line hover:shadow-card transition-all"
              style={{ borderRadius: 0 }}
            >
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={getCatIcon(cat.name, cat.icon)} style={{ fontSize: '20px', color: 'var(--color-primary)' }} />
              </div>
              <div className="flex-1">
                <h2 className="font-medium text-main group-hover:text-primary-themed transition-colors">{cat.name}</h2>
                {cat.description && <p className="text-sm text-dim mt-0.5 line-clamp-1">{cat.description}</p>}
              </div>
              <span className="text-sm text-dim">{cat.count || 0} 篇</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center py-16 text-dim">暂无分类</p>
      )}
      </div>
    </div>
  );
}
