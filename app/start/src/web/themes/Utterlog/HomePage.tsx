import PostCard from './PostCard';
import Pagination from './Pagination';

export default function HomePage({ posts, page, totalPages }: { posts: any[]; page: number; totalPages: number }) {
  return (
    <div>
      {/* Profile card — Utterlog style */}
      <div style={{
        background: '#fff', borderRadius: '4px', padding: '24px',
        marginBottom: '24px', border: '1px solid #e9e9e9',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #3368d9, #5b8ff9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '24px', fontWeight: 700, flexShrink: 0,
        }}>
          U
        </div>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#202020', marginBottom: '4px' }}>Utterlog</h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>记录思考，分享见解</p>
        </div>
      </div>

      {/* Posts */}
      {posts.length > 0 ? (
        <div>
          {posts.map((post, idx) => <PostCard key={post.id} post={post} priority={idx === 0} />)}
        </div>
      ) : (
        <div style={{
          background: '#fff', borderRadius: '4px', padding: '60px',
          textAlign: 'center', color: '#9ca3af', border: '1px solid #e9e9e9',
        }}>
          <p style={{ fontSize: '16px' }}>暂无文章</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
