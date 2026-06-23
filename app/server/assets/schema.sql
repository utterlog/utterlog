--
-- PostgreSQL database dump
--

-- \restrict 6ycODpwHtO1bZBhD1SW8boycnYV0UzGzOtWvhb4mYmFUwbeXNdEA2DwrQYRE4Sy  -- psql meta-command, removed for lib/pq compatibility

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg12+1)
-- Dumped by pg_dump version 18.3 (Debian 18.3-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
-- SELECT pg_catalog.set_config('search_path', '', false);  -- Disabled: would persist on pooled connections, causing "relation does not exist" for unqualified table names. CREATE statements below use schema-qualified names so this is unnecessary.
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.ul_relationships DROP CONSTRAINT IF EXISTS ul_relationships_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_relationships DROP CONSTRAINT IF EXISTS ul_relationships_meta_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_posts DROP CONSTRAINT IF EXISTS ul_posts_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_post_meta DROP CONSTRAINT IF EXISTS ul_post_meta_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_playlists DROP CONSTRAINT IF EXISTS ul_playlists_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_playlist_songs DROP CONSTRAINT IF EXISTS ul_playlist_songs_playlist_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_playlist_songs DROP CONSTRAINT IF EXISTS ul_playlist_songs_music_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_notifications DROP CONSTRAINT IF EXISTS ul_notifications_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_music DROP CONSTRAINT IF EXISTS ul_music_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_movies DROP CONSTRAINT IF EXISTS ul_movies_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_moments DROP CONSTRAINT IF EXISTS ul_moments_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_goods DROP CONSTRAINT IF EXISTS ul_goods_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_followers DROP CONSTRAINT IF EXISTS ul_followers_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_followers DROP CONSTRAINT IF EXISTS ul_followers_follower_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_feed_items DROP CONSTRAINT IF EXISTS ul_feed_items_subscription_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_federated_users DROP CONSTRAINT IF EXISTS ul_federated_users_local_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_comments DROP CONSTRAINT IF EXISTS ul_comments_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_books DROP CONSTRAINT IF EXISTS ul_books_blog_author_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_messages DROP CONSTRAINT IF EXISTS ul_ai_messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_logs DROP CONSTRAINT IF EXISTS ul_ai_logs_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_conversations DROP CONSTRAINT IF EXISTS ul_ai_conversations_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_conversations DROP CONSTRAINT IF EXISTS ul_ai_conversations_provider_id_fkey;
DROP INDEX IF EXISTS public.idx_users_status;
DROP INDEX IF EXISTS public.idx_users_role;
DROP INDEX IF EXISTS public.idx_users_email;
DROP INDEX IF EXISTS public.idx_sec_events_ip;
DROP INDEX IF EXISTS public.idx_sec_events_created;
DROP INDEX IF EXISTS public.idx_rss_subs_user;
DROP INDEX IF EXISTS public.idx_relationships_post;
DROP INDEX IF EXISTS public.idx_relationships_meta;
DROP INDEX IF EXISTS public.idx_posts_type;
DROP INDEX IF EXISTS public.idx_posts_status;
DROP INDEX IF EXISTS public.idx_posts_slug;
DROP INDEX IF EXISTS public.idx_posts_search;
DROP INDEX IF EXISTS public.idx_posts_published;
DROP INDEX IF EXISTS public.idx_posts_embedding;
DROP INDEX IF EXISTS public.idx_posts_created;
DROP INDEX IF EXISTS public.idx_posts_author;
DROP INDEX IF EXISTS public.idx_post_meta_value;
DROP INDEX IF EXISTS public.idx_post_meta_post;
DROP INDEX IF EXISTS public.idx_post_meta_key;
DROP INDEX IF EXISTS public.idx_playlists_default;
DROP INDEX IF EXISTS public.idx_playlists_author;
DROP INDEX IF EXISTS public.idx_playlist_songs_playlist;
DROP INDEX IF EXISTS public.idx_playlist_songs_order;
DROP INDEX IF EXISTS public.idx_passkeys_user;
DROP INDEX IF EXISTS public.idx_passkeys_cred;
DROP INDEX IF EXISTS public.idx_options_name;
DROP INDEX IF EXISTS public.idx_options_autoload;
DROP INDEX IF EXISTS public.idx_notifications_user;
DROP INDEX IF EXISTS public.idx_notifications_unread;
DROP INDEX IF EXISTS public.idx_notifications_created;
DROP INDEX IF EXISTS public.idx_music_platform;
DROP INDEX IF EXISTS public.idx_music_created;
DROP INDEX IF EXISTS public.idx_music_author;
DROP INDEX IF EXISTS public.idx_movies_created;
DROP INDEX IF EXISTS public.idx_movies_author;
DROP INDEX IF EXISTS public.idx_moments_visibility;
DROP INDEX IF EXISTS public.idx_moments_source;
DROP INDEX IF EXISTS public.idx_moments_created;
DROP INDEX IF EXISTS public.idx_moments_author;
DROP INDEX IF EXISTS public.idx_metas_type;
DROP INDEX IF EXISTS public.idx_metas_slug_type;
DROP INDEX IF EXISTS public.idx_metas_parent;
DROP INDEX IF EXISTS public.idx_metas_order;
DROP INDEX IF EXISTS public.idx_media_source;
DROP INDEX IF EXISTS public.idx_media_driver;
DROP INDEX IF EXISTS public.idx_media_created;
DROP INDEX IF EXISTS public.idx_media_album;
DROP INDEX IF EXISTS public.idx_links_status_order;
DROP INDEX IF EXISTS public.idx_links_sync_provenance;
DROP INDEX IF EXISTS public.idx_links_status;
DROP INDEX IF EXISTS public.idx_links_order;
DROP INDEX IF EXISTS public.idx_links_group;
DROP INDEX IF EXISTS public.idx_ip_rep_score;
DROP INDEX IF EXISTS public.idx_ip_rep_ip;
DROP INDEX IF EXISTS public.idx_ip_bans_ip;
DROP INDEX IF EXISTS public.idx_ip_bans_expires;
DROP INDEX IF EXISTS public.idx_goods_created;
DROP INDEX IF EXISTS public.idx_goods_category;
DROP INDEX IF EXISTS public.idx_goods_author;
DROP INDEX IF EXISTS public.idx_followers_user;
DROP INDEX IF EXISTS public.idx_followers_mutual;
DROP INDEX IF EXISTS public.idx_followers_follower;
DROP INDEX IF EXISTS public.idx_feed_items_sub;
DROP INDEX IF EXISTS public.idx_feed_items_date;
DROP INDEX IF EXISTS public.idx_federated_remote;
DROP INDEX IF EXISTS public.idx_federated_local;
DROP INDEX IF EXISTS public.idx_fed_tokens_user;
DROP INDEX IF EXISTS public.idx_ai_comment_queue_comment;
DROP INDEX IF EXISTS public.idx_ai_comment_queue_status;
DROP INDEX IF EXISTS public.idx_comments_user;
DROP INDEX IF EXISTS public.idx_comments_status;
DROP INDEX IF EXISTS public.idx_comments_source;
DROP INDEX IF EXISTS public.idx_comments_post_status_parent;
DROP INDEX IF EXISTS public.idx_comments_post;
DROP INDEX IF EXISTS public.idx_comments_parent;
DROP INDEX IF EXISTS public.idx_comments_created;
DROP INDEX IF EXISTS public.idx_books_progress;
DROP INDEX IF EXISTS public.idx_books_created;
DROP INDEX IF EXISTS public.idx_books_author;
DROP INDEX IF EXISTS public.idx_annotations_post;
DROP INDEX IF EXISTS public.idx_annotations_block;
DROP INDEX IF EXISTS public.idx_albums_slug;
DROP INDEX IF EXISTS public.idx_ai_msg_conv;
DROP INDEX IF EXISTS public.idx_ai_logs_user;
DROP INDEX IF EXISTS public.idx_ai_logs_created;
DROP INDEX IF EXISTS public.idx_ai_logs_action;
DROP INDEX IF EXISTS public.idx_ai_conv_user;
DROP INDEX IF EXISTS public.idx_ai_conv_updated;
DROP INDEX IF EXISTS public.idx_access_visitor;
DROP INDEX IF EXISTS public.idx_access_path;
DROP INDEX IF EXISTS public.idx_access_ip;
DROP INDEX IF EXISTS public.idx_access_created;
DROP INDEX IF EXISTS public.idx_access_country;
ALTER TABLE IF EXISTS ONLY public.ul_videos DROP CONSTRAINT IF EXISTS ul_videos_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_users DROP CONSTRAINT IF EXISTS ul_users_username_key;
ALTER TABLE IF EXISTS ONLY public.ul_users DROP CONSTRAINT IF EXISTS ul_users_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_users DROP CONSTRAINT IF EXISTS ul_users_email_key;
ALTER TABLE IF EXISTS ONLY public.ul_security_events DROP CONSTRAINT IF EXISTS ul_security_events_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_rss_subscriptions DROP CONSTRAINT IF EXISTS ul_rss_subscriptions_user_id_feed_url_key;
ALTER TABLE IF EXISTS ONLY public.ul_rss_subscriptions DROP CONSTRAINT IF EXISTS ul_rss_subscriptions_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_relationships DROP CONSTRAINT IF EXISTS ul_relationships_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_posts DROP CONSTRAINT IF EXISTS ul_posts_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_post_meta DROP CONSTRAINT IF EXISTS ul_post_meta_post_id_meta_key_key;
ALTER TABLE IF EXISTS ONLY public.ul_post_meta DROP CONSTRAINT IF EXISTS ul_post_meta_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_playlists DROP CONSTRAINT IF EXISTS ul_playlists_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_playlist_songs DROP CONSTRAINT IF EXISTS ul_playlist_songs_playlist_id_music_id_key;
ALTER TABLE IF EXISTS ONLY public.ul_playlist_songs DROP CONSTRAINT IF EXISTS ul_playlist_songs_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_passkeys DROP CONSTRAINT IF EXISTS ul_passkeys_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_passkeys DROP CONSTRAINT IF EXISTS ul_passkeys_credential_id_key;
ALTER TABLE IF EXISTS ONLY public.ul_options DROP CONSTRAINT IF EXISTS ul_options_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_options DROP CONSTRAINT IF EXISTS ul_options_name_key;
ALTER TABLE IF EXISTS ONLY public.ul_notifications DROP CONSTRAINT IF EXISTS ul_notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_music DROP CONSTRAINT IF EXISTS ul_music_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_movies DROP CONSTRAINT IF EXISTS ul_movies_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_moments DROP CONSTRAINT IF EXISTS ul_moments_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_metas DROP CONSTRAINT IF EXISTS ul_metas_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_media DROP CONSTRAINT IF EXISTS ul_media_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_links DROP CONSTRAINT IF EXISTS ul_links_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ip_reputation DROP CONSTRAINT IF EXISTS ul_ip_reputation_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ip_reputation DROP CONSTRAINT IF EXISTS ul_ip_reputation_ip_key;
ALTER TABLE IF EXISTS ONLY public.ul_ip_bans DROP CONSTRAINT IF EXISTS ul_ip_bans_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ip_bans DROP CONSTRAINT IF EXISTS ul_ip_bans_ip_key;
ALTER TABLE IF EXISTS ONLY public.ul_goods DROP CONSTRAINT IF EXISTS ul_goods_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_games DROP CONSTRAINT IF EXISTS ul_games_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_followers DROP CONSTRAINT IF EXISTS ul_followers_user_id_follower_id_key;
ALTER TABLE IF EXISTS ONLY public.ul_followers DROP CONSTRAINT IF EXISTS ul_followers_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_feed_items DROP CONSTRAINT IF EXISTS ul_feed_items_subscription_id_guid_key;
ALTER TABLE IF EXISTS ONLY public.ul_feed_items DROP CONSTRAINT IF EXISTS ul_feed_items_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_federation_tokens DROP CONSTRAINT IF EXISTS ul_federation_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_federated_users DROP CONSTRAINT IF EXISTS ul_federated_users_remote_site_remote_user_id_key;
ALTER TABLE IF EXISTS ONLY public.ul_federated_users DROP CONSTRAINT IF EXISTS ul_federated_users_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_federated_users DROP CONSTRAINT IF EXISTS ul_federated_users_local_user_id_remote_site_key;
ALTER TABLE IF EXISTS ONLY public.ul_ai_comment_queue DROP CONSTRAINT IF EXISTS ul_ai_comment_queue_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_comments DROP CONSTRAINT IF EXISTS ul_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_books DROP CONSTRAINT IF EXISTS ul_books_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_annotations DROP CONSTRAINT IF EXISTS ul_annotations_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_albums DROP CONSTRAINT IF EXISTS ul_albums_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_providers DROP CONSTRAINT IF EXISTS ul_ai_providers_slug_key;
ALTER TABLE IF EXISTS ONLY public.ul_ai_providers DROP CONSTRAINT IF EXISTS ul_ai_providers_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_messages DROP CONSTRAINT IF EXISTS ul_ai_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_logs DROP CONSTRAINT IF EXISTS ul_ai_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_ai_conversations DROP CONSTRAINT IF EXISTS ul_ai_conversations_pkey;
ALTER TABLE IF EXISTS ONLY public.ul_access_logs DROP CONSTRAINT IF EXISTS ul_access_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.migrations DROP CONSTRAINT IF EXISTS migrations_pkey;
ALTER TABLE IF EXISTS ONLY public.migrations DROP CONSTRAINT IF EXISTS migrations_migration_key;
ALTER TABLE IF EXISTS public.ul_videos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_security_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_rss_subscriptions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_posts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_post_meta ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_playlists ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_playlist_songs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_passkeys ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_options ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_music ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_movies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_moments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_metas ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_media ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_links ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ip_reputation ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ip_bans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_goods ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_games ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_followers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_feed_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_federation_tokens ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_federated_users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_comments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ai_comment_queue ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_books ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_annotations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_albums ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ai_providers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ai_messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ai_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_ai_conversations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ul_access_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.migrations ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.ul_videos_id_seq;
DROP TABLE IF EXISTS public.ul_videos;
DROP SEQUENCE IF EXISTS public.ul_users_id_seq;
DROP TABLE IF EXISTS public.ul_users;
DROP SEQUENCE IF EXISTS public.ul_security_events_id_seq;
DROP TABLE IF EXISTS public.ul_security_events;
DROP SEQUENCE IF EXISTS public.ul_rss_subscriptions_id_seq;
DROP TABLE IF EXISTS public.ul_rss_subscriptions;
DROP TABLE IF EXISTS public.ul_relationships;
DROP SEQUENCE IF EXISTS public.ul_posts_id_seq;
DROP TABLE IF EXISTS public.ul_posts;
DROP SEQUENCE IF EXISTS public.ul_post_meta_id_seq;
DROP TABLE IF EXISTS public.ul_post_meta;
DROP SEQUENCE IF EXISTS public.ul_playlists_id_seq;
DROP TABLE IF EXISTS public.ul_playlists;
DROP SEQUENCE IF EXISTS public.ul_playlist_songs_id_seq;
DROP TABLE IF EXISTS public.ul_playlist_songs;
DROP SEQUENCE IF EXISTS public.ul_ai_comment_queue_id_seq;
DROP TABLE IF EXISTS public.ul_ai_comment_queue;
DROP SEQUENCE IF EXISTS public.ul_passkeys_id_seq;
DROP TABLE IF EXISTS public.ul_passkeys;
DROP SEQUENCE IF EXISTS public.ul_options_id_seq;
DROP TABLE IF EXISTS public.ul_options;
DROP SEQUENCE IF EXISTS public.ul_notifications_id_seq;
DROP TABLE IF EXISTS public.ul_notifications;
DROP SEQUENCE IF EXISTS public.ul_music_id_seq;
DROP TABLE IF EXISTS public.ul_music;
DROP SEQUENCE IF EXISTS public.ul_movies_id_seq;
DROP TABLE IF EXISTS public.ul_movies;
DROP SEQUENCE IF EXISTS public.ul_moments_id_seq;
DROP TABLE IF EXISTS public.ul_moments;
DROP SEQUENCE IF EXISTS public.ul_metas_id_seq;
DROP TABLE IF EXISTS public.ul_metas;
DROP SEQUENCE IF EXISTS public.ul_media_id_seq;
DROP TABLE IF EXISTS public.ul_media;
DROP SEQUENCE IF EXISTS public.ul_links_id_seq;
DROP TABLE IF EXISTS public.ul_links;
DROP SEQUENCE IF EXISTS public.ul_ip_reputation_id_seq;
DROP TABLE IF EXISTS public.ul_ip_reputation;
DROP SEQUENCE IF EXISTS public.ul_ip_bans_id_seq;
DROP TABLE IF EXISTS public.ul_ip_bans;
DROP SEQUENCE IF EXISTS public.ul_goods_id_seq;
DROP TABLE IF EXISTS public.ul_goods;
DROP SEQUENCE IF EXISTS public.ul_games_id_seq;
DROP TABLE IF EXISTS public.ul_games;
DROP SEQUENCE IF EXISTS public.ul_followers_id_seq;
DROP TABLE IF EXISTS public.ul_followers;
DROP SEQUENCE IF EXISTS public.ul_feed_items_id_seq;
DROP TABLE IF EXISTS public.ul_feed_items;
DROP SEQUENCE IF EXISTS public.ul_federation_tokens_id_seq;
DROP TABLE IF EXISTS public.ul_federation_tokens;
DROP SEQUENCE IF EXISTS public.ul_federated_users_id_seq;
DROP TABLE IF EXISTS public.ul_federated_users;
DROP SEQUENCE IF EXISTS public.ul_comments_id_seq;
DROP TABLE IF EXISTS public.ul_comments;
DROP SEQUENCE IF EXISTS public.ul_books_id_seq;
DROP TABLE IF EXISTS public.ul_books;
DROP SEQUENCE IF EXISTS public.ul_annotations_id_seq;
DROP TABLE IF EXISTS public.ul_annotations;
DROP SEQUENCE IF EXISTS public.ul_albums_id_seq;
DROP TABLE IF EXISTS public.ul_albums;
DROP SEQUENCE IF EXISTS public.ul_ai_providers_id_seq;
DROP TABLE IF EXISTS public.ul_ai_providers;
DROP SEQUENCE IF EXISTS public.ul_ai_messages_id_seq;
DROP TABLE IF EXISTS public.ul_ai_messages;
DROP SEQUENCE IF EXISTS public.ul_ai_logs_id_seq;
DROP TABLE IF EXISTS public.ul_ai_logs;
DROP SEQUENCE IF EXISTS public.ul_ai_conversations_id_seq;
DROP TABLE IF EXISTS public.ul_ai_conversations;
DROP SEQUENCE IF EXISTS public.ul_access_logs_id_seq;
DROP TABLE IF EXISTS public.ul_access_logs;
DROP SEQUENCE IF EXISTS public.migrations_id_seq;
DROP TABLE IF EXISTS public.migrations;
DROP EXTENSION IF EXISTS vector;
DROP EXTENSION IF EXISTS "uuid-ossp";
--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    migration character varying(255) NOT NULL,
    executed_at integer NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: ul_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_access_logs (
    id bigint NOT NULL,
    ip character varying(50) NOT NULL,
    ip_masked character varying(50) DEFAULT ''::character varying,
    path character varying(500) NOT NULL,
    method character varying(10) DEFAULT 'GET'::character varying,
    referer character varying(500) DEFAULT ''::character varying,
    referer_host character varying(200) DEFAULT ''::character varying,
    user_agent text DEFAULT ''::text,
    device_type character varying(20) DEFAULT 'Desktop'::character varying,
    browser character varying(50) DEFAULT ''::character varying,
    browser_version character varying(20) DEFAULT ''::character varying,
    os character varying(50) DEFAULT ''::character varying,
    os_version character varying(20) DEFAULT ''::character varying,
    country character varying(10) DEFAULT ''::character varying,
    country_name character varying(100) DEFAULT ''::character varying,
    region character varying(100) DEFAULT ''::character varying,
    city character varying(100) DEFAULT ''::character varying,
    latitude numeric(10,6) DEFAULT 0,
    longitude numeric(10,6) DEFAULT 0,
    duration integer DEFAULT 0,
    guid character varying(64) DEFAULT ''::character varying,
    created_at integer DEFAULT 0,
    visitor_id character varying(64) DEFAULT ''::character varying,
    fingerprint character varying(64) DEFAULT ''::character varying
);


--
-- Name: ul_access_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_access_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_access_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_access_logs_id_seq OWNED BY public.ul_access_logs.id;


--
-- Name: ul_ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ai_conversations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(200) DEFAULT ''::character varying,
    provider_id integer,
    message_count integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0
);


--
-- Name: ul_ai_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ai_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ai_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ai_conversations_id_seq OWNED BY public.ul_ai_conversations.id;


--
-- Name: ul_ai_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ai_logs (
    id integer NOT NULL,
    user_id integer,
    provider character varying(64) DEFAULT ''::character varying,
    model character varying(128) DEFAULT ''::character varying,
    action character varying(64) DEFAULT 'chat'::character varying,
    prompt_tokens integer DEFAULT 0,
    completion_tokens integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    status character varying(16) DEFAULT 'success'::character varying,
    message text DEFAULT ''::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at integer DEFAULT 0
);


--
-- Name: ul_ai_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ai_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ai_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ai_logs_id_seq OWNED BY public.ul_ai_logs.id;


--
-- Name: ul_ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ai_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role character varying(16) DEFAULT 'user'::character varying NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    tokens integer DEFAULT 0,
    model character varying(128) DEFAULT ''::character varying,
    created_at integer DEFAULT 0
);


--
-- Name: ul_ai_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ai_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ai_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ai_messages_id_seq OWNED BY public.ul_ai_messages.id;


--
-- Name: ul_ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ai_providers (
    id integer NOT NULL,
    name character varying(64) NOT NULL,
    slug character varying(64) NOT NULL,
    type character varying(16) DEFAULT 'text'::character varying,
    endpoint character varying(500) NOT NULL,
    model character varying(128) NOT NULL,
    api_key character varying(500) DEFAULT ''::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 4096,
    timeout integer DEFAULT 30,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    extra jsonb DEFAULT '{}'::jsonb,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0
);


--
-- Name: ul_ai_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ai_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ai_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ai_providers_id_seq OWNED BY public.ul_ai_providers.id;


--
-- Name: ul_albums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_albums (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(255) DEFAULT ''::character varying NOT NULL,
    description text DEFAULT ''::text,
    cover_url text DEFAULT ''::text,
    status character varying(20) DEFAULT 'private'::character varying NOT NULL,
    sort_order integer DEFAULT 0,
    photo_count integer DEFAULT 0,
    author_id integer DEFAULT 1,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: ul_albums_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_albums_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_albums_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_albums_id_seq OWNED BY public.ul_albums.id;


--
-- Name: ul_annotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_annotations (
    id integer NOT NULL,
    post_id integer NOT NULL,
    block_id character varying(64) NOT NULL,
    user_name character varying(100) NOT NULL,
    user_email character varying(200),
    user_avatar character varying(500),
    user_site character varying(300),
    utterlog_id character varying(100),
    content text NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: ul_annotations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_annotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_annotations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_annotations_id_seq OWNED BY public.ul_annotations.id;


--
-- Name: ul_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_books (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    author_name character varying(200),
    cover_url character varying(500),
    isbn character varying(20),
    publisher character varying(200),
    year smallint,
    platform character varying(20),
    platform_id character varying(100),
    platform_url character varying(500),
    rating smallint,
    platform_rating numeric(3,1),
    comment text,
    progress character varying(16) DEFAULT 'want'::character varying,
    status character varying(16) DEFAULT 'publish'::character varying,
    blog_author_id integer NOT NULL,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_books_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_books_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_books_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_books_id_seq OWNED BY public.ul_books.id;


--
-- Name: ul_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_comments (
    id integer NOT NULL,
    post_id integer NOT NULL,
    author_name character varying(150) NOT NULL,
    author_email character varying(150),
    author_url character varying(255),
    author_ip inet,
    author_agent character varying(511),
    content text NOT NULL,
    parent_id integer DEFAULT 0,
    user_id integer DEFAULT 0,
    status character varying(16) DEFAULT 'pending'::character varying,
    source character varying(20) DEFAULT 'local'::character varying,
    source_id character varying(100),
    like_count integer DEFAULT 0,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0,
    featured boolean DEFAULT false,
    geo text,
    visitor_id character varying(64) DEFAULT ''::character varying,
    is_ai_reply boolean DEFAULT false NOT NULL,
    client_hints text DEFAULT ''::text
);


--
-- Name: ul_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_comments_id_seq OWNED BY public.ul_comments.id;


--
-- Name: ul_ai_comment_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ai_comment_queue (
    id integer NOT NULL,
    comment_id integer NOT NULL,
    post_id integer NOT NULL,
    comment_text text NOT NULL,
    ai_reply text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at bigint NOT NULL,
    processed_at bigint DEFAULT 0 NOT NULL,
    error_msg character varying(500),
    reviewer_id integer DEFAULT 0 NOT NULL,
    ai_audit_passed boolean,
    ai_audit_confidence real,
    ai_audit_reason text
);


--
-- Name: ul_ai_comment_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ai_comment_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ai_comment_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ai_comment_queue_id_seq OWNED BY public.ul_ai_comment_queue.id;


--
-- Name: ul_federated_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_federated_users (
    id integer NOT NULL,
    local_user_id integer,
    remote_site character varying(255) NOT NULL,
    remote_user_id integer NOT NULL,
    remote_username character varying(100) NOT NULL,
    remote_avatar character varying(500),
    remote_url character varying(500),
    verified boolean DEFAULT false,
    last_sync_at integer DEFAULT 0,
    created_at integer DEFAULT 0
);


--
-- Name: ul_federated_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_federated_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_federated_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_federated_users_id_seq OWNED BY public.ul_federated_users.id;


--
-- Name: ul_federation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_federation_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(2000) NOT NULL,
    expires_at integer NOT NULL,
    created_at integer DEFAULT 0
);


--
-- Name: ul_federation_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_federation_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_federation_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_federation_tokens_id_seq OWNED BY public.ul_federation_tokens.id;


--
-- Name: ul_feed_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_feed_items (
    id integer NOT NULL,
    subscription_id integer,
    title character varying(500) NOT NULL,
    link character varying(500) NOT NULL,
    description text DEFAULT ''::text,
    pub_date integer DEFAULT 0,
    guid character varying(500) DEFAULT ''::character varying,
    is_read boolean DEFAULT false,
    created_at integer DEFAULT 0
);


--
-- Name: ul_feed_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_feed_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_feed_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_feed_items_id_seq OWNED BY public.ul_feed_items.id;


--
-- Name: ul_followers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_followers (
    id integer NOT NULL,
    user_id integer NOT NULL,
    follower_id integer NOT NULL,
    following_id integer DEFAULT 0,
    source_site character varying(255),
    source_user_id integer,
    status character varying(20) DEFAULT 'active'::character varying,
    mutual boolean DEFAULT false,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_followers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_followers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_followers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_followers_id_seq OWNED BY public.ul_followers.id;


--
-- Name: ul_games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_games (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    cover_url text DEFAULT ''::text,
    platform character varying(100) DEFAULT ''::character varying,
    url text DEFAULT ''::text,
    rating integer DEFAULT 0,
    comment text DEFAULT ''::text,
    status character varying(20) DEFAULT 'publish'::character varying,
    display_id integer DEFAULT 0,
    author_id integer DEFAULT 1,
    created_at bigint DEFAULT 0,
    updated_at bigint DEFAULT 0
);


--
-- Name: ul_games_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_games_id_seq OWNED BY public.ul_games.id;


--
-- Name: ul_goods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_goods (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    cover_url character varying(500),
    brand character varying(100),
    price character varying(50),
    purchase_url character varying(500),
    category character varying(50) DEFAULT 'other'::character varying,
    rating smallint,
    comment text,
    pros text,
    cons text,
    status character varying(16) DEFAULT 'publish'::character varying,
    author_id integer NOT NULL,
    purchased_at integer,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_goods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_goods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_goods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_goods_id_seq OWNED BY public.ul_goods.id;


--
-- Name: ul_ip_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ip_bans (
    id integer NOT NULL,
    ip character varying(50) NOT NULL,
    reason character varying(500) DEFAULT ''::character varying,
    ban_type character varying(20) DEFAULT 'manual'::character varying,
    duration integer DEFAULT 0,
    expires_at integer DEFAULT 0,
    created_at integer DEFAULT 0
);


--
-- Name: ul_ip_bans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ip_bans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ip_bans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ip_bans_id_seq OWNED BY public.ul_ip_bans.id;


--
-- Name: ul_ip_reputation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_ip_reputation (
    id integer NOT NULL,
    ip character varying(50) NOT NULL,
    score integer DEFAULT 0,
    request_count integer DEFAULT 0,
    last_seen integer DEFAULT 0,
    country character varying(10) DEFAULT ''::character varying,
    risk_level character varying(20) DEFAULT 'safe'::character varying,
    updated_at integer DEFAULT 0
);


--
-- Name: ul_ip_reputation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_ip_reputation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_ip_reputation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_ip_reputation_id_seq OWNED BY public.ul_ip_reputation.id;


--
-- Name: ul_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_links (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    url character varying(500) NOT NULL,
    description character varying(500),
    logo character varying(500),
    email character varying(150),
    order_num integer DEFAULT 0,
    status integer DEFAULT 1,
    rel character varying(50),
    group_name character varying(50) DEFAULT 'default'::character varying,
    click_count integer DEFAULT 0,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    rss_url character varying(500),
    display_id integer DEFAULT 0,
    source_site_uuid character varying(80) DEFAULT ''::character varying,
    source_type character varying(32) DEFAULT ''::character varying,
    source_id character varying(100) DEFAULT ''::character varying
);


--
-- Name: ul_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_links_id_seq OWNED BY public.ul_links.id;


--
-- Name: ul_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_media (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    filename character varying(500) NOT NULL,
    url text NOT NULL,
    mime_type character varying(100) NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    driver character varying(50) DEFAULT 'local'::character varying NOT NULL,
    created_at integer DEFAULT 0 NOT NULL,
    category character varying(20) DEFAULT 'other'::character varying,
    album_id integer DEFAULT 0,
    source_type character varying(32) DEFAULT ''::character varying,
    source_id integer DEFAULT 0,
    exif_data text DEFAULT ''::text
);


--
-- Name: ul_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_media_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_media_id_seq OWNED BY public.ul_media.id;


--
-- Name: ul_metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_metas (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    slug character varying(150) NOT NULL,
    type character varying(20) NOT NULL,
    icon character varying(100),
    color character varying(20),
    description text,
    parent_id integer DEFAULT 0,
    count integer DEFAULT 0,
    order_num integer DEFAULT 0,
    seo_title character varying(200),
    seo_description character varying(500),
    seo_keywords character varying(200),
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0
);


--
-- Name: ul_metas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_metas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_metas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_metas_id_seq OWNED BY public.ul_metas.id;


--
-- Name: ul_moments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_moments (
    id integer NOT NULL,
    content text NOT NULL,
    images text[] DEFAULT '{}'::text[],
    location character varying(200),
    mood character varying(50),
    source character varying(20) DEFAULT '网页'::character varying,
    source_id character varying(100),
    source_url character varying(500),
    author_id integer NOT NULL,
    visibility character varying(16) DEFAULT 'public'::character varying,
    is_pinned boolean DEFAULT false,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_moments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_moments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_moments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_moments_id_seq OWNED BY public.ul_moments.id;


--
-- Name: ul_movies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_movies (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    original_title character varying(200),
    cover_url character varying(500),
    year smallint,
    director character varying(200),
    genre character varying(200),
    platform character varying(20),
    platform_id character varying(100),
    platform_url character varying(500),
    rating smallint,
    platform_rating numeric(3,1),
    comment text,
    status character varying(16) DEFAULT 'publish'::character varying,
    author_id integer NOT NULL,
    watched_at integer,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_movies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_movies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_movies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_movies_id_seq OWNED BY public.ul_movies.id;


--
-- Name: ul_music; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_music (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    artist character varying(200),
    album character varying(200),
    cover_url character varying(500),
    play_url character varying(500),
    platform character varying(20),
    platform_id character varying(100),
    rating smallint,
    comment text,
    status character varying(16) DEFAULT 'publish'::character varying,
    author_id integer NOT NULL,
    listened_at integer,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_music_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_music_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_music_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_music_id_seq OWNED BY public.ul_music.id;


--
-- Name: ul_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    actor_id integer,
    actor_site character varying(255),
    actor_remote_id integer,
    actor_name character varying(100),
    actor_avatar character varying(500),
    target_type character varying(50),
    target_id integer,
    data jsonb,
    is_read boolean DEFAULT false,
    created_at integer DEFAULT 0
);


--
-- Name: ul_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_notifications_id_seq OWNED BY public.ul_notifications.id;


--
-- Name: ul_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_options (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    value text,
    autoload boolean DEFAULT true,
    created_at integer DEFAULT 0 NOT NULL,
    updated_at integer DEFAULT 0 NOT NULL,
    user_id integer DEFAULT 0
);


--
-- Name: ul_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_options_id_seq OWNED BY public.ul_options.id;


--
-- Name: ul_passkeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_passkeys (
    id integer NOT NULL,
    user_id integer NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type character varying(32) DEFAULT ''::character varying,
    aaguid bytea DEFAULT '\x'::bytea,
    sign_count integer DEFAULT 0,
    name character varying(128) DEFAULT ''::character varying,
    last_used_at bigint DEFAULT 0,
    created_at bigint NOT NULL,
    backup_eligible boolean DEFAULT false,
    backup_state boolean DEFAULT false
);


--
-- Name: ul_passkeys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_passkeys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_passkeys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_passkeys_id_seq OWNED BY public.ul_passkeys.id;


--
-- Name: ul_playlist_songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_playlist_songs (
    id integer NOT NULL,
    playlist_id integer NOT NULL,
    music_id integer NOT NULL,
    sort_order integer DEFAULT 0,
    created_at integer DEFAULT 0
);


--
-- Name: ul_playlist_songs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_playlist_songs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_playlist_songs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_playlist_songs_id_seq OWNED BY public.ul_playlist_songs.id;


--
-- Name: ul_playlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_playlists (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    cover_url character varying(500),
    is_default boolean DEFAULT false,
    status character varying(16) DEFAULT 'publish'::character varying,
    author_id integer NOT NULL,
    song_count integer DEFAULT 0,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    display_id integer DEFAULT 0
);


--
-- Name: ul_playlists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_playlists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_playlists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_playlists_id_seq OWNED BY public.ul_playlists.id;


--
-- Name: ul_post_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_post_meta (
    id integer NOT NULL,
    post_id integer NOT NULL,
    meta_key character varying(100) NOT NULL,
    meta_value jsonb,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0
);


--
-- Name: ul_post_meta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_post_meta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_post_meta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_post_meta_id_seq OWNED BY public.ul_post_meta.id;


--
-- Name: ul_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_posts (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    content text,
    excerpt text,
    author_id integer NOT NULL,
    seo_title character varying(200),
    seo_description character varying(500),
    seo_keywords character varying(200),
    canonical_url character varying(500),
    status character varying(16) DEFAULT 'draft'::character varying,
    password character varying(32),
    view_count integer DEFAULT 0,
    comment_count integer DEFAULT 0,
    type character varying(16) DEFAULT 'post'::character varying,
    template character varying(50),
    published_at timestamp without time zone,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    deleted_at integer DEFAULT 0,
    display_id integer DEFAULT 0,
    cover_url character varying(500),
    allow_comment boolean DEFAULT true,
    pinned boolean DEFAULT false,
    embedding public.vector(1536),
    ai_questions text,
    word_count integer DEFAULT 0,
    ai_summary text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: ul_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_posts_id_seq OWNED BY public.ul_posts.id;


--
-- Name: ul_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_relationships (
    post_id integer NOT NULL,
    meta_id integer NOT NULL,
    created_at integer DEFAULT 0
);


--
-- Name: ul_rss_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_rss_subscriptions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    site_url character varying(500) NOT NULL,
    feed_url character varying(500) NOT NULL,
    site_name character varying(200) DEFAULT ''::character varying,
    site_avatar character varying(500) DEFAULT ''::character varying,
    last_fetched_at integer DEFAULT 0,
    created_at integer DEFAULT 0
);


--
-- Name: ul_rss_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_rss_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_rss_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_rss_subscriptions_id_seq OWNED BY public.ul_rss_subscriptions.id;


--
-- Name: ul_security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_security_events (
    id integer NOT NULL,
    ip character varying(50) NOT NULL,
    event_type character varying(30) NOT NULL,
    detail text DEFAULT ''::text,
    score_delta integer DEFAULT 0,
    created_at integer DEFAULT 0
);


--
-- Name: ul_security_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_security_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_security_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_security_events_id_seq OWNED BY public.ul_security_events.id;


--
-- Name: ul_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_users (
    id integer NOT NULL,
    username character varying(32) NOT NULL,
    email character varying(150) NOT NULL,
    password character varying(255) NOT NULL,
    nickname character varying(32),
    avatar character varying(255),
    bio text,
    url character varying(255),
    role character varying(16) DEFAULT 'subscriber'::character varying,
    status character varying(16) DEFAULT 'active'::character varying,
    email_verified_at timestamp without time zone,
    last_login_at timestamp without time zone,
    last_login_ip inet,
    created_at integer DEFAULT 0,
    updated_at integer DEFAULT 0,
    totp_secret character varying(64) DEFAULT ''::character varying,
    totp_enabled boolean DEFAULT false,
    totp_backup_codes text DEFAULT ''::text,
    reset_token character varying(64) DEFAULT ''::character varying,
    reset_token_expires_at bigint DEFAULT 0,
    utterlog_id character varying(100) DEFAULT ''::character varying,
    utterlog_avatar character varying(500) DEFAULT ''::character varying
);


--
-- Name: ul_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_users_id_seq OWNED BY public.ul_users.id;


--
-- Name: ul_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ul_videos (
    id integer NOT NULL,
    title character varying(300) NOT NULL,
    cover_url text DEFAULT ''::text,
    video_url text DEFAULT ''::text,
    embed_url text DEFAULT ''::text,
    platform character varying(50) DEFAULT ''::character varying,
    platform_id character varying(100) DEFAULT ''::character varying,
    duration character varying(20) DEFAULT ''::character varying,
    comment text DEFAULT ''::text,
    status character varying(20) DEFAULT 'publish'::character varying,
    display_id integer DEFAULT 0,
    author_id integer DEFAULT 1,
    created_at bigint DEFAULT 0,
    updated_at bigint DEFAULT 0
);


--
-- Name: ul_videos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ul_videos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ul_videos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ul_videos_id_seq OWNED BY public.ul_videos.id;


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: ul_access_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_access_logs ALTER COLUMN id SET DEFAULT nextval('public.ul_access_logs_id_seq'::regclass);


--
-- Name: ul_ai_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_conversations ALTER COLUMN id SET DEFAULT nextval('public.ul_ai_conversations_id_seq'::regclass);


--
-- Name: ul_ai_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_logs ALTER COLUMN id SET DEFAULT nextval('public.ul_ai_logs_id_seq'::regclass);


--
-- Name: ul_ai_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_messages ALTER COLUMN id SET DEFAULT nextval('public.ul_ai_messages_id_seq'::regclass);


--
-- Name: ul_ai_providers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_providers ALTER COLUMN id SET DEFAULT nextval('public.ul_ai_providers_id_seq'::regclass);


--
-- Name: ul_albums id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_albums ALTER COLUMN id SET DEFAULT nextval('public.ul_albums_id_seq'::regclass);


--
-- Name: ul_annotations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_annotations ALTER COLUMN id SET DEFAULT nextval('public.ul_annotations_id_seq'::regclass);


--
-- Name: ul_books id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_books ALTER COLUMN id SET DEFAULT nextval('public.ul_books_id_seq'::regclass);


--
-- Name: ul_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_comments ALTER COLUMN id SET DEFAULT nextval('public.ul_comments_id_seq'::regclass);


--
-- Name: ul_ai_comment_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_comment_queue ALTER COLUMN id SET DEFAULT nextval('public.ul_ai_comment_queue_id_seq'::regclass);


--
-- Name: ul_federated_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federated_users ALTER COLUMN id SET DEFAULT nextval('public.ul_federated_users_id_seq'::regclass);


--
-- Name: ul_federation_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federation_tokens ALTER COLUMN id SET DEFAULT nextval('public.ul_federation_tokens_id_seq'::regclass);


--
-- Name: ul_feed_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_feed_items ALTER COLUMN id SET DEFAULT nextval('public.ul_feed_items_id_seq'::regclass);


--
-- Name: ul_followers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_followers ALTER COLUMN id SET DEFAULT nextval('public.ul_followers_id_seq'::regclass);


--
-- Name: ul_games id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_games ALTER COLUMN id SET DEFAULT nextval('public.ul_games_id_seq'::regclass);


--
-- Name: ul_goods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_goods ALTER COLUMN id SET DEFAULT nextval('public.ul_goods_id_seq'::regclass);


--
-- Name: ul_ip_bans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ip_bans ALTER COLUMN id SET DEFAULT nextval('public.ul_ip_bans_id_seq'::regclass);


--
-- Name: ul_ip_reputation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ip_reputation ALTER COLUMN id SET DEFAULT nextval('public.ul_ip_reputation_id_seq'::regclass);


--
-- Name: ul_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_links ALTER COLUMN id SET DEFAULT nextval('public.ul_links_id_seq'::regclass);


--
-- Name: ul_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_media ALTER COLUMN id SET DEFAULT nextval('public.ul_media_id_seq'::regclass);


--
-- Name: ul_metas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_metas ALTER COLUMN id SET DEFAULT nextval('public.ul_metas_id_seq'::regclass);


--
-- Name: ul_moments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_moments ALTER COLUMN id SET DEFAULT nextval('public.ul_moments_id_seq'::regclass);


--
-- Name: ul_movies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_movies ALTER COLUMN id SET DEFAULT nextval('public.ul_movies_id_seq'::regclass);


--
-- Name: ul_music id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_music ALTER COLUMN id SET DEFAULT nextval('public.ul_music_id_seq'::regclass);


--
-- Name: ul_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_notifications ALTER COLUMN id SET DEFAULT nextval('public.ul_notifications_id_seq'::regclass);


--
-- Name: ul_options id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_options ALTER COLUMN id SET DEFAULT nextval('public.ul_options_id_seq'::regclass);


--
-- Name: ul_passkeys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_passkeys ALTER COLUMN id SET DEFAULT nextval('public.ul_passkeys_id_seq'::regclass);


--
-- Name: ul_playlist_songs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlist_songs ALTER COLUMN id SET DEFAULT nextval('public.ul_playlist_songs_id_seq'::regclass);


--
-- Name: ul_playlists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlists ALTER COLUMN id SET DEFAULT nextval('public.ul_playlists_id_seq'::regclass);


--
-- Name: ul_post_meta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_post_meta ALTER COLUMN id SET DEFAULT nextval('public.ul_post_meta_id_seq'::regclass);


--
-- Name: ul_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_posts ALTER COLUMN id SET DEFAULT nextval('public.ul_posts_id_seq'::regclass);


--
-- Name: ul_rss_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_rss_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.ul_rss_subscriptions_id_seq'::regclass);


--
-- Name: ul_security_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_security_events ALTER COLUMN id SET DEFAULT nextval('public.ul_security_events_id_seq'::regclass);


--
-- Name: ul_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_users ALTER COLUMN id SET DEFAULT nextval('public.ul_users_id_seq'::regclass);


--
-- Name: ul_videos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_videos ALTER COLUMN id SET DEFAULT nextval('public.ul_videos_id_seq'::regclass);


--
-- Name: migrations migrations_migration_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_migration_key UNIQUE (migration);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: ul_access_logs ul_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_access_logs
    ADD CONSTRAINT ul_access_logs_pkey PRIMARY KEY (id);


--
-- Name: ul_ai_conversations ul_ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_conversations
    ADD CONSTRAINT ul_ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ul_ai_logs ul_ai_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_logs
    ADD CONSTRAINT ul_ai_logs_pkey PRIMARY KEY (id);


--
-- Name: ul_ai_messages ul_ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_messages
    ADD CONSTRAINT ul_ai_messages_pkey PRIMARY KEY (id);


--
-- Name: ul_ai_providers ul_ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_providers
    ADD CONSTRAINT ul_ai_providers_pkey PRIMARY KEY (id);


--
-- Name: ul_ai_providers ul_ai_providers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_providers
    ADD CONSTRAINT ul_ai_providers_slug_key UNIQUE (slug);


--
-- Name: ul_albums ul_albums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_albums
    ADD CONSTRAINT ul_albums_pkey PRIMARY KEY (id);


--
-- Name: ul_annotations ul_annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_annotations
    ADD CONSTRAINT ul_annotations_pkey PRIMARY KEY (id);


--
-- Name: ul_books ul_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_books
    ADD CONSTRAINT ul_books_pkey PRIMARY KEY (id);


--
-- Name: ul_comments ul_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_comments
    ADD CONSTRAINT ul_comments_pkey PRIMARY KEY (id);


--
-- Name: ul_ai_comment_queue ul_ai_comment_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_comment_queue
    ADD CONSTRAINT ul_ai_comment_queue_pkey PRIMARY KEY (id);


--
-- Name: ul_federated_users ul_federated_users_local_user_id_remote_site_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federated_users
    ADD CONSTRAINT ul_federated_users_local_user_id_remote_site_key UNIQUE (local_user_id, remote_site);


--
-- Name: ul_federated_users ul_federated_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federated_users
    ADD CONSTRAINT ul_federated_users_pkey PRIMARY KEY (id);


--
-- Name: ul_federated_users ul_federated_users_remote_site_remote_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federated_users
    ADD CONSTRAINT ul_federated_users_remote_site_remote_user_id_key UNIQUE (remote_site, remote_user_id);


--
-- Name: ul_federation_tokens ul_federation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federation_tokens
    ADD CONSTRAINT ul_federation_tokens_pkey PRIMARY KEY (id);


--
-- Name: ul_feed_items ul_feed_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_feed_items
    ADD CONSTRAINT ul_feed_items_pkey PRIMARY KEY (id);


--
-- Name: ul_feed_items ul_feed_items_subscription_id_guid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_feed_items
    ADD CONSTRAINT ul_feed_items_subscription_id_guid_key UNIQUE (subscription_id, guid);


--
-- Name: ul_followers ul_followers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_followers
    ADD CONSTRAINT ul_followers_pkey PRIMARY KEY (id);


--
-- Name: ul_games ul_games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_games
    ADD CONSTRAINT ul_games_pkey PRIMARY KEY (id);


--
-- Name: ul_goods ul_goods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_goods
    ADD CONSTRAINT ul_goods_pkey PRIMARY KEY (id);


--
-- Name: ul_ip_bans ul_ip_bans_ip_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ip_bans
    ADD CONSTRAINT ul_ip_bans_ip_key UNIQUE (ip);


--
-- Name: ul_ip_bans ul_ip_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ip_bans
    ADD CONSTRAINT ul_ip_bans_pkey PRIMARY KEY (id);


--
-- Name: ul_ip_reputation ul_ip_reputation_ip_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ip_reputation
    ADD CONSTRAINT ul_ip_reputation_ip_key UNIQUE (ip);


--
-- Name: ul_ip_reputation ul_ip_reputation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ip_reputation
    ADD CONSTRAINT ul_ip_reputation_pkey PRIMARY KEY (id);


--
-- Name: ul_links ul_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_links
    ADD CONSTRAINT ul_links_pkey PRIMARY KEY (id);


--
-- Name: ul_media ul_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_media
    ADD CONSTRAINT ul_media_pkey PRIMARY KEY (id);


--
-- Name: ul_metas ul_metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_metas
    ADD CONSTRAINT ul_metas_pkey PRIMARY KEY (id);


--
-- Name: ul_moments ul_moments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_moments
    ADD CONSTRAINT ul_moments_pkey PRIMARY KEY (id);


--
-- Name: ul_movies ul_movies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_movies
    ADD CONSTRAINT ul_movies_pkey PRIMARY KEY (id);


--
-- Name: ul_music ul_music_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_music
    ADD CONSTRAINT ul_music_pkey PRIMARY KEY (id);


--
-- Name: ul_notifications ul_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_notifications
    ADD CONSTRAINT ul_notifications_pkey PRIMARY KEY (id);


--
-- Name: ul_options ul_options_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_options
    ADD CONSTRAINT ul_options_name_key UNIQUE (name);


--
-- Name: ul_options ul_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_options
    ADD CONSTRAINT ul_options_pkey PRIMARY KEY (id);


--
-- Name: ul_passkeys ul_passkeys_credential_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_passkeys
    ADD CONSTRAINT ul_passkeys_credential_id_key UNIQUE (credential_id);


--
-- Name: ul_passkeys ul_passkeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_passkeys
    ADD CONSTRAINT ul_passkeys_pkey PRIMARY KEY (id);


--
-- Name: ul_playlist_songs ul_playlist_songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlist_songs
    ADD CONSTRAINT ul_playlist_songs_pkey PRIMARY KEY (id);


--
-- Name: ul_playlist_songs ul_playlist_songs_playlist_id_music_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlist_songs
    ADD CONSTRAINT ul_playlist_songs_playlist_id_music_id_key UNIQUE (playlist_id, music_id);


--
-- Name: ul_playlists ul_playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlists
    ADD CONSTRAINT ul_playlists_pkey PRIMARY KEY (id);


--
-- Name: ul_post_meta ul_post_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_post_meta
    ADD CONSTRAINT ul_post_meta_pkey PRIMARY KEY (id);


--
-- Name: ul_post_meta ul_post_meta_post_id_meta_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_post_meta
    ADD CONSTRAINT ul_post_meta_post_id_meta_key_key UNIQUE (post_id, meta_key);


--
-- Name: ul_posts ul_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_posts
    ADD CONSTRAINT ul_posts_pkey PRIMARY KEY (id);


--
-- Name: ul_relationships ul_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_relationships
    ADD CONSTRAINT ul_relationships_pkey PRIMARY KEY (post_id, meta_id);


--
-- Name: ul_rss_subscriptions ul_rss_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_rss_subscriptions
    ADD CONSTRAINT ul_rss_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: ul_rss_subscriptions ul_rss_subscriptions_user_id_feed_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_rss_subscriptions
    ADD CONSTRAINT ul_rss_subscriptions_user_id_feed_url_key UNIQUE (user_id, feed_url);


--
-- Name: ul_security_events ul_security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_security_events
    ADD CONSTRAINT ul_security_events_pkey PRIMARY KEY (id);


--
-- Name: ul_users ul_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_users
    ADD CONSTRAINT ul_users_email_key UNIQUE (email);


--
-- Name: ul_users ul_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_users
    ADD CONSTRAINT ul_users_pkey PRIMARY KEY (id);


--
-- Name: ul_users ul_users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_users
    ADD CONSTRAINT ul_users_username_key UNIQUE (username);


--
-- Name: ul_videos ul_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_videos
    ADD CONSTRAINT ul_videos_pkey PRIMARY KEY (id);


--
-- Name: idx_access_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_country ON public.ul_access_logs USING btree (country);


--
-- Name: idx_access_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_created ON public.ul_access_logs USING btree (created_at DESC);


--
-- Name: idx_access_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_ip ON public.ul_access_logs USING btree (ip);


--
-- Name: idx_access_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_path ON public.ul_access_logs USING btree (path);


--
-- Name: idx_access_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_visitor ON public.ul_access_logs USING btree (visitor_id) WHERE ((visitor_id)::text <> ''::text);


--
-- Name: idx_ai_conv_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conv_updated ON public.ul_ai_conversations USING btree (updated_at DESC);


--
-- Name: idx_ai_conv_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conv_user ON public.ul_ai_conversations USING btree (user_id);


--
-- Name: idx_ai_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_logs_action ON public.ul_ai_logs USING btree (action);


--
-- Name: idx_ai_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_logs_created ON public.ul_ai_logs USING btree (created_at DESC);


--
-- Name: idx_ai_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_logs_user ON public.ul_ai_logs USING btree (user_id);


--
-- Name: idx_ai_msg_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_msg_conv ON public.ul_ai_messages USING btree (conversation_id);


--
-- Name: idx_albums_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_albums_slug ON public.ul_albums USING btree (slug) WHERE ((slug)::text <> ''::text);


--
-- Name: idx_annotations_block; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_annotations_block ON public.ul_annotations USING btree (post_id, block_id);


--
-- Name: idx_annotations_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_annotations_post ON public.ul_annotations USING btree (post_id);


--
-- Name: idx_books_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_books_author ON public.ul_books USING btree (blog_author_id);


--
-- Name: idx_books_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_books_created ON public.ul_books USING btree (created_at DESC);


--
-- Name: idx_books_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_books_progress ON public.ul_books USING btree (progress);


--
-- Name: idx_comments_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_created ON public.ul_comments USING btree (created_at DESC);


--
-- Name: idx_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_parent ON public.ul_comments USING btree (parent_id);


--
-- Name: idx_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_post ON public.ul_comments USING btree (post_id);


--
-- Name: idx_comments_post_status_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_post_status_parent ON public.ul_comments USING btree (post_id, status, parent_id);


--
-- Name: idx_comments_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_source ON public.ul_comments USING btree (source, source_id);


--
-- Name: idx_comments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_status ON public.ul_comments USING btree (status);


--
-- Name: idx_comments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_user ON public.ul_comments USING btree (user_id);


--
-- Name: idx_ai_comment_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_comment_queue_status ON public.ul_ai_comment_queue USING btree (status, created_at DESC);


--
-- Name: idx_ai_comment_queue_comment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_comment_queue_comment ON public.ul_ai_comment_queue USING btree (comment_id);


--
-- Name: idx_fed_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fed_tokens_user ON public.ul_federation_tokens USING btree (user_id);


--
-- Name: idx_federated_local; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_federated_local ON public.ul_federated_users USING btree (local_user_id);


--
-- Name: idx_federated_remote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_federated_remote ON public.ul_federated_users USING btree (remote_site, remote_user_id);


--
-- Name: idx_feed_items_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_items_date ON public.ul_feed_items USING btree (pub_date DESC);


--
-- Name: idx_feed_items_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_items_sub ON public.ul_feed_items USING btree (subscription_id);


--
-- Name: idx_followers_follower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followers_follower ON public.ul_followers USING btree (follower_id);


--
-- Name: idx_followers_follower_site; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_followers_follower_site ON public.ul_followers USING btree (following_id, source_site) WHERE (((source_site)::text <> ''::text) AND (user_id = 0));


--
-- Name: idx_followers_mutual; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followers_mutual ON public.ul_followers USING btree (mutual) WHERE (mutual = true);


--
-- Name: idx_followers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followers_user ON public.ul_followers USING btree (user_id);


--
-- Name: idx_followers_following_site; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_followers_following_site ON public.ul_followers USING btree (user_id, source_site) WHERE (((source_site)::text <> ''::text) AND (following_id = 0));


--
-- Name: idx_goods_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_author ON public.ul_goods USING btree (author_id);


--
-- Name: idx_goods_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_category ON public.ul_goods USING btree (category);


--
-- Name: idx_goods_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_created ON public.ul_goods USING btree (created_at DESC);


--
-- Name: idx_ip_bans_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_bans_expires ON public.ul_ip_bans USING btree (expires_at);


--
-- Name: idx_ip_bans_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_bans_ip ON public.ul_ip_bans USING btree (ip);


--
-- Name: idx_ip_rep_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_rep_ip ON public.ul_ip_reputation USING btree (ip);


--
-- Name: idx_ip_rep_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_rep_score ON public.ul_ip_reputation USING btree (score DESC);


--
-- Name: idx_links_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_group ON public.ul_links USING btree (group_name);


--
-- Name: idx_links_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_order ON public.ul_links USING btree (order_num);


--
-- Name: idx_links_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_status ON public.ul_links USING btree (status);


--
-- Name: idx_links_status_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_links_status_order ON public.ul_links USING btree (status, order_num);


--
-- Name: idx_links_sync_provenance; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_links_sync_provenance ON public.ul_links USING btree (source_site_uuid, source_type, source_id) WHERE ((source_site_uuid)::text <> ''::text);


--
-- Name: idx_media_album; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_album ON public.ul_media USING btree (album_id) WHERE (album_id > 0);


--
-- Name: idx_media_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_created ON public.ul_media USING btree (created_at);


--
-- Name: idx_media_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_driver ON public.ul_media USING btree (driver);


--
-- Name: idx_media_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_source ON public.ul_media USING btree (source_type, source_id) WHERE ((source_type)::text <> ''::text);


--
-- Name: idx_metas_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_order ON public.ul_metas USING btree (order_num);


--
-- Name: idx_metas_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_parent ON public.ul_metas USING btree (parent_id);


--
-- Name: idx_metas_slug_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_metas_slug_type ON public.ul_metas USING btree (slug, type);


--
-- Name: idx_metas_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metas_type ON public.ul_metas USING btree (type);


--
-- Name: idx_moments_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moments_author ON public.ul_moments USING btree (author_id);


--
-- Name: idx_moments_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moments_created ON public.ul_moments USING btree (created_at DESC);


--
-- Name: idx_moments_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moments_source ON public.ul_moments USING btree (source);


--
-- Name: idx_moments_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moments_visibility ON public.ul_moments USING btree (visibility);


--
-- Name: idx_movies_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movies_author ON public.ul_movies USING btree (author_id);


--
-- Name: idx_movies_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movies_created ON public.ul_movies USING btree (created_at DESC);


--
-- Name: idx_music_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_author ON public.ul_music USING btree (author_id);


--
-- Name: idx_music_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_created ON public.ul_music USING btree (created_at DESC);


--
-- Name: idx_music_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_platform ON public.ul_music USING btree (platform);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.ul_notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.ul_notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.ul_notifications USING btree (user_id);


--
-- Name: idx_options_autoload; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_options_autoload ON public.ul_options USING btree (autoload);


--
-- Name: idx_options_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_options_name ON public.ul_options USING btree (name);


--
-- Name: idx_passkeys_cred; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_passkeys_cred ON public.ul_passkeys USING btree (credential_id);


--
-- Name: idx_passkeys_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passkeys_user ON public.ul_passkeys USING btree (user_id);


--
-- Name: idx_playlist_songs_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playlist_songs_order ON public.ul_playlist_songs USING btree (playlist_id, sort_order);


--
-- Name: idx_playlist_songs_playlist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playlist_songs_playlist ON public.ul_playlist_songs USING btree (playlist_id);


--
-- Name: idx_playlists_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playlists_author ON public.ul_playlists USING btree (author_id);


--
-- Name: idx_playlists_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playlists_default ON public.ul_playlists USING btree (is_default);


--
-- Name: idx_post_meta_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_meta_key ON public.ul_post_meta USING btree (meta_key);


--
-- Name: idx_post_meta_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_meta_post ON public.ul_post_meta USING btree (post_id);


--
-- Name: idx_post_meta_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_meta_value ON public.ul_post_meta USING gin (meta_value);


--
-- Name: idx_posts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author ON public.ul_posts USING btree (author_id);


--
-- Name: idx_posts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created ON public.ul_posts USING btree (created_at DESC);


--
-- Name: idx_posts_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_embedding ON public.ul_posts USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_posts_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_published ON public.ul_posts USING btree (published_at DESC) WHERE ((status)::text = 'publish'::text);


--
-- Name: idx_posts_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_search ON public.ul_posts USING gin (to_tsvector('simple'::regconfig, (((title)::text || ' '::text) || COALESCE(content, ''::text))));


--
-- Name: idx_posts_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_posts_slug ON public.ul_posts USING btree (slug) WHERE (deleted_at = 0);


--
-- Name: idx_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_status ON public.ul_posts USING btree (status);


--
-- Name: idx_posts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_type ON public.ul_posts USING btree (type);


--
-- Name: idx_relationships_meta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relationships_meta ON public.ul_relationships USING btree (meta_id);


--
-- Name: idx_relationships_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relationships_post ON public.ul_relationships USING btree (post_id);


--
-- Name: idx_rss_subs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rss_subs_user ON public.ul_rss_subscriptions USING btree (user_id);


--
-- Name: idx_sec_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sec_events_created ON public.ul_security_events USING btree (created_at DESC);


--
-- Name: idx_sec_events_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sec_events_ip ON public.ul_security_events USING btree (ip);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.ul_users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.ul_users USING btree (role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.ul_users USING btree (status);


--
-- Name: ul_ai_conversations ul_ai_conversations_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_conversations
    ADD CONSTRAINT ul_ai_conversations_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.ul_ai_providers(id) ON DELETE SET NULL;


--
-- Name: ul_ai_conversations ul_ai_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_conversations
    ADD CONSTRAINT ul_ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_ai_logs ul_ai_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_logs
    ADD CONSTRAINT ul_ai_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ul_users(id) ON DELETE SET NULL;


--
-- Name: ul_ai_messages ul_ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_ai_messages
    ADD CONSTRAINT ul_ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ul_ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ul_books ul_books_blog_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_books
    ADD CONSTRAINT ul_books_blog_author_id_fkey FOREIGN KEY (blog_author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_comments ul_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_comments
    ADD CONSTRAINT ul_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.ul_posts(id) ON DELETE CASCADE;


--
-- Name: ul_federated_users ul_federated_users_local_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_federated_users
    ADD CONSTRAINT ul_federated_users_local_user_id_fkey FOREIGN KEY (local_user_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_feed_items ul_feed_items_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_feed_items
    ADD CONSTRAINT ul_feed_items_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.ul_rss_subscriptions(id) ON DELETE CASCADE;


--
-- Name: ul_goods ul_goods_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_goods
    ADD CONSTRAINT ul_goods_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_moments ul_moments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_moments
    ADD CONSTRAINT ul_moments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_movies ul_movies_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_movies
    ADD CONSTRAINT ul_movies_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_music ul_music_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_music
    ADD CONSTRAINT ul_music_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_notifications ul_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_notifications
    ADD CONSTRAINT ul_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_playlist_songs ul_playlist_songs_music_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlist_songs
    ADD CONSTRAINT ul_playlist_songs_music_id_fkey FOREIGN KEY (music_id) REFERENCES public.ul_music(id) ON DELETE CASCADE;


--
-- Name: ul_playlist_songs ul_playlist_songs_playlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlist_songs
    ADD CONSTRAINT ul_playlist_songs_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.ul_playlists(id) ON DELETE CASCADE;


--
-- Name: ul_playlists ul_playlists_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_playlists
    ADD CONSTRAINT ul_playlists_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_post_meta ul_post_meta_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_post_meta
    ADD CONSTRAINT ul_post_meta_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.ul_posts(id) ON DELETE CASCADE;


--
-- Name: ul_posts ul_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_posts
    ADD CONSTRAINT ul_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.ul_users(id) ON DELETE CASCADE;


--
-- Name: ul_relationships ul_relationships_meta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_relationships
    ADD CONSTRAINT ul_relationships_meta_id_fkey FOREIGN KEY (meta_id) REFERENCES public.ul_metas(id) ON DELETE CASCADE;


--
-- Name: ul_relationships ul_relationships_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ul_relationships
    ADD CONSTRAINT ul_relationships_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.ul_posts(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

-- \unrestrict 6ycODpwHtO1bZBhD1SW8boycnYV0UzGzOtWvhb4mYmFUwbeXNdEA2DwrQYRE4Sy  -- psql meta-command, removed for lib/pq compatibility
