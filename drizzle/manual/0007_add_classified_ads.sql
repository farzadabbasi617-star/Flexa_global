-- Classified ads monitoring for gaming-related ads on Divar / Sheypoor.
-- Used by the admin console and Telegram bot for manual outreach.

CREATE TABLE IF NOT EXISTS "classified_ads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform" varchar(30) NOT NULL,
  "external_id" varchar(255) NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text,
  "url" text NOT NULL,
  "price" varchar(100),
  "city" varchar(100),
  "district" varchar(100),
  "category" varchar(100),
  "image_url" text,
  "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "raw_payload" jsonb,
  "status" varchar(30) DEFAULT 'new' NOT NULL,
  "contacted_at" timestamp,
  "contact_method" varchar(50),
  "admin_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "classified_ads_platform_external_id_unique" UNIQUE("platform", "external_id")
);

CREATE INDEX IF NOT EXISTS "classified_ads_status_idx" ON "classified_ads" ("status");
CREATE INDEX IF NOT EXISTS "classified_ads_platform_idx" ON "classified_ads" ("platform");
CREATE INDEX IF NOT EXISTS "classified_ads_created_at_idx" ON "classified_ads" ("created_at");
CREATE INDEX IF NOT EXISTS "classified_ads_keywords_idx" ON "classified_ads" USING GIN ("keywords");

-- Keep track of scrape runs to avoid hammering the classified sites.
CREATE TABLE IF NOT EXISTS "classified_scrape_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "platform" varchar(30) NOT NULL,
  "status" varchar(30) NOT NULL,
  "items_found" integer DEFAULT 0,
  "items_new" integer DEFAULT 0,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
