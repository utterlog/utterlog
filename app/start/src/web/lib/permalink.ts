/**
 * Permalink helpers — re-exported from the shared single source of truth.
 * Edit app/shared/permalink.ts (token vocabulary, builder, parser, presets).
 */
export {
  PERMALINK_PRESETS,
  DEFAULT_PERMALINK,
  buildPermalink,
  parsePermalink,
  type PermalinkPreset,
  type PostLike,
} from '@shared/permalink';
