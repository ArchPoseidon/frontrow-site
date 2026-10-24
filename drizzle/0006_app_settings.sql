CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);

--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('crawlers_paused', '1') ON CONFLICT DO NOTHING;
