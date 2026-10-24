import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ---------- Auth.js (Drizzle adapter shape) ---------- */

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: tstz("emailVerified"),
  image: text("image"),
  homeCity: text("home_city").default("Bengaluru"),
  watchCities: text("watch_cities")
    .array()
    .default(sql`'{ALL_INDIA}'::text[]`),
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
  telegramLinkCode: text("telegram_link_code").unique(),
  emailEnabled: boolean("email_enabled").default(true),
  telegramEnabled: boolean("telegram_enabled").default(true),
  onboardingStep: integer("onboarding_step").default(0),
  onboardedAt: tstz("onboarded_at"),
  firstScanAt: tstz("first_scan_at"), // set when the first scan for this user is started (import, or the welcome screen)
  isOwner: boolean("is_owner").default(false),
  // City priorities: P1 = alert instantly, P2 = also tell me; watchAllIndia = also digest everything else.
  p1Cities: text("p1_cities").array().default(sql`'{}'::text[]`),
  p2Cities: text("p2_cities").array().default(sql`'{}'::text[]`),
  watchAllIndia: boolean("watch_all_india").default(true),
  phoneE164: text("phone_e164"),
  phoneConsentAt: tstz("phone_consent_at"),
  plan: text("plan").default("free"),
  lastSeenAt: tstz("last_seen_at"),
  disabledAt: tstz("disabled_at"),
  createdAt: tstz("created_at").defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: tstz("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: tstz("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ---------- Spotify ---------- */

export const spotifyConnections = pgTable("spotify_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  spotifyUserId: text("spotify_user_id"),
  displayName: text("display_name"), // the Spotify account name shown to the user ("Connected as ...")
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: tstz("expires_at"),
  broken: boolean("broken").default(false),
});

/* ---------- Artists ---------- */

export const artists = pgTable(
  "artists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliases: text("aliases").array().default(sql`'{}'::text[]`),
    spotifyId: text("spotify_id").unique(),
    mbid: text("mbid").unique(),
    imageUrl: text("image_url"),
    genres: text("genres").array(),
    origin: text("origin").default("unknown"),
    identityStatus: text("identity_status"),
    lastIndiaShow: text("last_india_show"),
    lastIndiaDate: date("last_india_date"),
    lastCheckedAt: tstz("last_checked_at"),
    upcomingCount: integer("upcoming_count").default(0),
    isDeceased: boolean("is_deceased").default(false),
    deceasedCheckedAt: tstz("deceased_checked_at"),
    inactiveReason: text("inactive_reason"), // 'deceased' | 'disbanded'
  },
  (t) => [
    index("artists_normalized_name_trgm").using("gin", sql`${t.normalizedName} gin_trgm_ops`),
    check("artists_origin_check", sql`${t.origin} in ('india','international','unknown')`),
    check(
      "artists_identity_status_check",
      sql`${t.identityStatus} in ('verified','needs_review','unverified')`,
    ),
  ],
);

export const userArtists = pgTable(
  "user_artists",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    priority: text("priority").default("follow"),
    addedVia: text("added_via"),
    callMe: boolean("call_me").default(false),
    callLeadMinutes: integer("call_lead_minutes").default(60),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.artistId] }),
    check("user_artists_priority_check", sql`${t.priority} in ('must_see','follow','muted')`),
    check(
      "user_artists_added_via_check",
      sql`${t.addedVia} in ('spotify_followed','spotify_top','spotify_link','search','paste','suggested')`,
    ),
  ],
);

export const artistCandidates = pgTable(
  "artist_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputText: text("input_text").notNull(),
    candidates: jsonb("candidates"),
    status: text("status").default("open"),
  },
  (t) => [check("artist_candidates_status_check", sql`${t.status} in ('open','resolved','removed')`)],
);

/* ---------- Sources and raw items ---------- */

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    config: jsonb("config"),
    enabled: boolean("enabled").default(true),
    intervalMinutes: integer("interval_minutes"),
    lastRunAt: tstz("last_run_at"),
    lastOkAt: tstz("last_ok_at"),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").default(0),
    lastContentHash: text("last_content_hash"),
  },
  (t) => [
    check(
      "sources_kind_check",
      sql`${t.kind} in ('news_rss','listing','grounded_sweep','event_page')`,
    ),
  ],
);

export const rawItems = pgTable(
  "raw_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    url: text("url"),
    title: text("title"),
    content: text("content"),
    contentHash: text("content_hash").notNull().unique(),
    fetchedAt: tstz("fetched_at").defaultNow(),
    status: text("status").default("new"),
    error: text("error"),
  },
  (t) => [check("raw_items_status_check", sql`${t.status} in ('new','processed','skipped','error')`)],
);

/* ---------- Events ---------- */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    title: text("title"),
    venue: text("venue"),
    city: text("city"),
    state: text("state"),
    eventDate: date("event_date"),
    eventTime: text("event_time"),
    ticketUrl: text("ticket_url"),
    platform: text("platform"),
    status: text("status"),
    saleOpensAt: tstz("sale_opens_at"),
    confidence: real("confidence"),
    isFestival: boolean("is_festival").default(false),
    lineup: text("lineup").array(),
    // 'unchecked' | 'exact' (loaded, specific page, names the artist) | 'ok' (loaded, specific, name not found in text)
    // | 'generic' (homepage/listing) | 'broken' | 'blocked' (bot wall, could not load) | 'none' (no link found)
    ticketStatus: text("ticket_status").default("unchecked"),
    ticketCheckedAt: tstz("ticket_checked_at"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    isSample: boolean("is_sample").default(false),
    ticketVerifiedAt: tstz("ticket_verified_at"),
    ticketReportCount: integer("ticket_report_count").default(0),
    firstSeenAt: tstz("first_seen_at").defaultNow(),
    updatedAt: tstz("updated_at"),
  },
  (t) => [
    check(
      "events_status_check",
      sql`${t.status} in ('rumored','announced','sale_soon','on_sale','early_bird','sold_out','cancelled')`,
    ),
  ],
);

export const eventTiers = pgTable(
  "event_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceInr: integer("price_inr"),
    status: text("status"),
    opensAt: tstz("opens_at"),
    closesAt: tstz("closes_at"),
    observedAt: tstz("observed_at").defaultNow(),
  },
  (t) => [
    check("event_tiers_status_check", sql`${t.status} in ('upcoming','open','sold_out','closed')`),
  ],
);

export const eventSources = pgTable(
  "event_sources",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    rawItemId: uuid("raw_item_id").references(() => rawItems.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    platform: text("platform"),
    status: text("status").default("unchecked"), // same vocabulary as events.ticket_status
    httpStatus: integer("http_status"),
    finalUrl: text("final_url"), // after redirects, tracking params stripped
    pageTitle: text("page_title"),
    checkedAt: tstz("checked_at"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.url] })],
);

/* ---------- Alerts and runs ---------- */

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    urgency: text("urgency"),
    sentAt: tstz("sent_at"),
    status: text("status"),
    userAction: text("user_action"),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
  },
  (t) => [
    unique("alerts_user_event_kind_channel").on(t.userId, t.eventId, t.kind, t.channel),
    check(
      "alerts_kind_check",
      sql`${t.kind} in ('new_show','early_bird_open','sale_soon','closing_soon','tier_change','digest','test')`,
    ),
    check("alerts_channel_check", sql`${t.channel} in ('telegram','email')`),
    check("alerts_urgency_check", sql`${t.urgency} in ('red','amber','info')`),
  ],
);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  startedAt: tstz("started_at").defaultNow(),
  finishedAt: tstz("finished_at"),
  itemsIn: integer("items_in"),
  eventsNew: integer("events_new"),
  alertsSent: integer("alerts_sent"),
  firecrawlCredits: integer("firecrawl_credits"),
  scrapedoCredits: integer("scrapedo_credits"),
  errors: jsonb("errors"),
});

// Small key/value switches the owner can flip at runtime (for example crawlers_paused, set from Telegram).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: tstz("updated_at").defaultNow(),
});

/* ---------- Calendar entries ---------- */

// Shows a user added to their calendar (the in-app calendar view, and Google Calendar when connected).
export const calendarEntries = pgTable(
  "calendar_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id"),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);

/* ---------- Activity, news, merch, plans, calls ---------- */

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    meta: jsonb("meta"),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [index("activity_type_created").on(t.type, t.createdAt), index("activity_user_created").on(t.userId, t.createdAt)],
);

export const artistNews = pgTable(
  "artist_news",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    publisher: text("publisher"),
    publishedAt: tstz("published_at"),
    fetchedAt: tstz("fetched_at").defaultNow(),
  },
  (t) => [unique("artist_news_artist_url").on(t.artistId, t.url)],
);

export const merchProducts = pgTable("merch_products", {
  id: text("id").primaryKey(),
  artistId: uuid("artist_id").references(() => artists.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  priceInr: integer("price_inr").notNull(),
  category: text("category"),
  isDemo: boolean("is_demo").default(true),
  active: boolean("active").default(true),
  createdAt: tstz("created_at").defaultNow(),
});

export const merchVariants = pgTable(
  "merch_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id").notNull().references(() => merchProducts.id, { onDelete: "cascade" }),
    size: text("size"),
    sku: text("sku"),
    stock: integer("stock").default(0),
  },
  (t) => [unique("merch_variant_product_size").on(t.productId, t.size)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => merchVariants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.variantId] })],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  status: text("status").notNull(), // active | pending | cancelled | failed
  pinelabsOrderId: text("pinelabs_order_id"),
  amountInr: integer("amount_inr"),
  currentPeriodEnd: tstz("current_period_end"),
  createdAt: tstz("created_at").defaultNow(),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull().unique(),
  payload: jsonb("payload"),
  receivedAt: tstz("received_at").defaultNow(),
});

export const callReminders = pgTable(
  "call_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    scheduledFor: tstz("scheduled_for").notNull(),
    status: text("status").default("scheduled"), // scheduled | calling | done | failed | cancelled | no_answer
    attempts: integer("attempts").default(0),
    providerCallId: text("provider_call_id"),
    outcome: jsonb("outcome"),
    createdAt: tstz("created_at").defaultNow(),
  },
  (t) => [unique("call_reminders_user_event").on(t.userId, t.eventId)],
);
