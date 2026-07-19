import { createFileRoute } from '@tanstack/react-router';
import MusicPlaylists from '@/pages/MusicPlaylists';

export const Route = createFileRoute('/_authenticated/music_/playlists')({
  component: MusicPlaylists,
});
