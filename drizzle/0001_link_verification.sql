ALTER TABLE "event_sources" ADD COLUMN "status" text DEFAULT 'unchecked';--> statement-breakpoint
ALTER TABLE "event_sources" ADD COLUMN "http_status" integer;--> statement-breakpoint
ALTER TABLE "event_sources" ADD COLUMN "final_url" text;--> statement-breakpoint
ALTER TABLE "event_sources" ADD COLUMN "page_title" text;--> statement-breakpoint
ALTER TABLE "event_sources" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_status" text DEFAULT 'unchecked';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_checked_at" timestamp with time zone;