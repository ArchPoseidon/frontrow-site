export type Candidate = {
  source: "spotify" | "musicbrainz";
  spotifyId?: string;
  mbid?: string;
  name: string;
  imageUrl?: string | null;
  genres?: string[];
  hint?: string; // e.g. MusicBrainz disambiguation / country
  country?: string | null;
};
