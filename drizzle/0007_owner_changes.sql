CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "artist_news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"publisher" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "artist_news_artist_url" UNIQUE("artist_id","url")
);
--> statement-breakpoint
CREATE TABLE "call_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"artist_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled',
	"attempts" integer DEFAULT 0,
	"provider_call_id" text,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "call_reminders_user_event" UNIQUE("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"user_id" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cart_items_user_id_variant_id_pk" PRIMARY KEY("user_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "merch_products" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_inr" integer NOT NULL,
	"category" text,
	"is_demo" boolean DEFAULT true,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "merch_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"size" text,
	"sku" text,
	"stock" integer DEFAULT 0,
	CONSTRAINT "merch_variant_product_size" UNIQUE("product_id","size")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payment_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"pinelabs_order_id" text,
	"amount_inr" integer,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "is_deceased" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "deceased_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "inactive_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_report_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user_artists" ADD COLUMN "call_me" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_artists" ADD COLUMN "call_lead_minutes" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "p1_cities" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "p2_cities" text[] DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "watch_all_india" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_news" ADD CONSTRAINT "artist_news_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_reminders" ADD CONSTRAINT "call_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_reminders" ADD CONSTRAINT "call_reminders_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_reminders" ADD CONSTRAINT "call_reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_merch_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."merch_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_variants" ADD CONSTRAINT "merch_variants_product_id_merch_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merch_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_type_created" ON "activity_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "activity_user_created" ON "activity_events" USING btree ("user_id","created_at");