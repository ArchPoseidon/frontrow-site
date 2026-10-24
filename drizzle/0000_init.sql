CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"urgency" text,
	"sent_at" timestamp with time zone,
	"status" text,
	"user_action" text,
	"telegram_message_id" bigint,
	CONSTRAINT "alerts_user_event_kind_channel" UNIQUE("user_id","event_id","kind","channel"),
	CONSTRAINT "alerts_kind_check" CHECK ("alerts"."kind" in ('new_show','early_bird_open','sale_soon','closing_soon','tier_change','digest','test')),
	CONSTRAINT "alerts_channel_check" CHECK ("alerts"."channel" in ('telegram','email')),
	CONSTRAINT "alerts_urgency_check" CHECK ("alerts"."urgency" in ('red','amber','info'))
);
--> statement-breakpoint
CREATE TABLE "artist_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"input_text" text NOT NULL,
	"candidates" jsonb,
	"status" text DEFAULT 'open',
	CONSTRAINT "artist_candidates_status_check" CHECK ("artist_candidates"."status" in ('open','resolved','removed'))
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[],
	"spotify_id" text,
	"mbid" text,
	"image_url" text,
	"genres" text[],
	"origin" text DEFAULT 'unknown',
	"identity_status" text,
	"last_india_show" text,
	"last_india_date" date,
	"last_checked_at" timestamp with time zone,
	"upcoming_count" integer DEFAULT 0,
	CONSTRAINT "artists_spotify_id_unique" UNIQUE("spotify_id"),
	CONSTRAINT "artists_mbid_unique" UNIQUE("mbid"),
	CONSTRAINT "artists_origin_check" CHECK ("artists"."origin" in ('india','international','unknown')),
	CONSTRAINT "artists_identity_status_check" CHECK ("artists"."identity_status" in ('verified','needs_review','unverified'))
);
--> statement-breakpoint
CREATE TABLE "event_sources" (
	"event_id" uuid NOT NULL,
	"raw_item_id" uuid,
	"url" text NOT NULL,
	"platform" text,
	CONSTRAINT "event_sources_event_id_url_pk" PRIMARY KEY("event_id","url")
);
--> statement-breakpoint
CREATE TABLE "event_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_inr" integer,
	"status" text,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "event_tiers_status_check" CHECK ("event_tiers"."status" in ('upcoming','open','sold_out','closed'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"title" text,
	"venue" text,
	"city" text,
	"state" text,
	"event_date" date,
	"event_time" text,
	"ticket_url" text,
	"platform" text,
	"status" text,
	"sale_opens_at" timestamp with time zone,
	"confidence" real,
	"is_festival" boolean DEFAULT false,
	"lineup" text[],
	"dedupe_key" text NOT NULL,
	"is_sample" boolean DEFAULT false,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	CONSTRAINT "events_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "events_status_check" CHECK ("events"."status" in ('rumored','announced','sale_soon','on_sale','early_bird','sold_out','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"url" text,
	"title" text,
	"content" text,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"status" text DEFAULT 'new',
	"error" text,
	CONSTRAINT "raw_items_content_hash_unique" UNIQUE("content_hash"),
	CONSTRAINT "raw_items_status_check" CHECK ("raw_items"."status" in ('new','processed','skipped','error'))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone,
	"items_in" integer,
	"events_new" integer,
	"alerts_sent" integer,
	"firecrawl_credits" integer,
	"errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"config" jsonb,
	"enabled" boolean DEFAULT true,
	"interval_minutes" integer,
	"last_run_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0,
	"last_content_hash" text,
	CONSTRAINT "sources_kind_check" CHECK ("sources"."kind" in ('news_rss','listing','grounded_sweep','event_page'))
);
--> statement-breakpoint
CREATE TABLE "spotify_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"spotify_user_id" text,
	"refresh_token" text,
	"access_token" text,
	"expires_at" timestamp with time zone,
	"broken" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "user_artists" (
	"user_id" text NOT NULL,
	"artist_id" uuid NOT NULL,
	"priority" text DEFAULT 'follow',
	"added_via" text,
	CONSTRAINT "user_artists_user_id_artist_id_pk" PRIMARY KEY("user_id","artist_id"),
	CONSTRAINT "user_artists_priority_check" CHECK ("user_artists"."priority" in ('must_see','follow','muted')),
	CONSTRAINT "user_artists_added_via_check" CHECK ("user_artists"."added_via" in ('spotify_followed','spotify_top','spotify_link','search','paste','suggested'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp with time zone,
	"image" text,
	"home_city" text DEFAULT 'Bengaluru',
	"watch_cities" text[] DEFAULT '{ALL_INDIA}'::text[],
	"telegram_chat_id" bigint,
	"telegram_link_code" text,
	"email_enabled" boolean DEFAULT true,
	"telegram_enabled" boolean DEFAULT true,
	"onboarding_step" integer DEFAULT 0,
	"onboarded_at" timestamp with time zone,
	"is_owner" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_telegram_link_code_unique" UNIQUE("telegram_link_code")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_candidates" ADD CONSTRAINT "artist_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_raw_item_id_raw_items_id_fk" FOREIGN KEY ("raw_item_id") REFERENCES "public"."raw_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tiers" ADD CONSTRAINT "event_tiers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_connections" ADD CONSTRAINT "spotify_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_artists" ADD CONSTRAINT "user_artists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_artists" ADD CONSTRAINT "user_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artists_normalized_name_trgm" ON "artists" USING gin ("normalized_name" gin_trgm_ops);