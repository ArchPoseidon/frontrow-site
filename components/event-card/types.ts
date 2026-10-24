import type { Stage } from "@/lib/stage";

export type Urgency = "red" | "amber" | "info";

export type TierView = { name: string; priceInr: number | null; status: "upcoming" | "open" | "sold_out" | "closed" | null; opensAt: string | null; closesAt: string | null };

// Plain-JSON view of an event for one viewer, safe to pass from server to client components.
export type EventView = {
  id: string;
  artistId: string;
  artistName: string;
  artistImage: string | null;
  title: string | null;
  venue: string | null;
  city: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null;
  status: string | null;
  ticketUrl: string | null;
  isFestival: boolean;
  isSample: boolean;
  confidence: number | null;
  lineup: string[];
  tiers: TierView[];
  saleOpensAt: string | null;
  sources: { url: string; platform: string | null }[];
  urgency: Urgency;
  stage: Stage; // drives the colour: live red, soon purple, announced orange
  reason: string;
  countdown: { to: string; label: string } | null; // live countdown target
  inHomeCity: boolean;
  dismissed?: boolean;
  mine?: "going" | "saved" | null; // the viewer's own mark
  concertImage?: string | null; // a photo from this artist's own concert, when we have one
  notFollowed?: boolean; // shown only because tickets are live; the viewer does not follow this artist yet
  inCalendar?: boolean; // added to the viewer's calendar
  artistGenres?: string[];
  priority?: "must_see" | "follow"; // how the viewer ranks this artist (must_see = a favourite)
};

export type ArtistView = {
  id: string;
  name: string;
  imageUrl: string | null;
  identityStatus: string | null;
  priority: "must_see" | "follow" | "muted";
  lastIndiaShow: string | null;
  lastCheckedAt: string | null;
  upcomingCount: number;
};

export type AlertView = { id: string; artistName: string; city: string | null; date: string | null; channel: string; kind: string; urgency: string | null; sentAt: string | null; status: string | null; action: string | null };
