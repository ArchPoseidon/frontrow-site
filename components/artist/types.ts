export type Priority = "must_see" | "follow" | "muted";

export type Candidate = {
  source: "spotify" | "musicbrainz";
  spotifyId?: string;
  mbid?: string;
  name: string;
  imageUrl?: string | null;
  genres?: string[];
  hint?: string;
  alreadyAdded?: boolean;
};

export type MyArtist = {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[] | null;
  origin: string | null;
  identityStatus: "verified" | "needs_review" | "unverified" | null;
  priority: Priority;
  lastIndiaShow: string | null;
  lastCheckedAt: string | null;
  upcomingCount: number | null;
};

export type ReviewItem = { candidateId: string; inputText: string; candidates: Candidate[] };

export const PRIORITY_LABEL: Record<Priority, string> = { follow: "Follow", must_see: "Must-see", muted: "Muted" };
export const NEXT_PRIORITY: Record<Priority, Priority> = { follow: "must_see", must_see: "muted", muted: "follow" };
