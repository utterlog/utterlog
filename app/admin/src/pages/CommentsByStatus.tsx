import { useParams } from 'react-router-dom';
import CommentsPage from './Comments';

// /admin/comments/:status → status="pending" | "spam" | "trash" | "mine"
export default function CommentsByStatus() {
  const { status } = useParams<{ status: string }>();
  return <CommentsPage initialStatus={status} />;
}
