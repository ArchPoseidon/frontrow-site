const TRACKING = /^(utm_.*|fbclid|gclid|igshid|igsh|mc_.*|ref|ref_src|came_from|cmpid|campaign|source|si|spm|_ga|yclid|msclkid)$/i;
const SOCIAL = /(^|\.)(instagram|facebook|twitter|x|tiktok|youtube|linkedin)\.com$/i;

export function canonicalize(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return null;
  }
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// Link-in-bio pages list everything an artist links to; they are never the exact page for one show.
const AGGREGATORS = /(^|\.)(linktr\.ee|linktree\.com|linkin\.bio|beacons\.ai|bio\.link|lnk\.bio|solo\.to|campsite\.bio|taplink\.cc|linkpop\.com|many\.link|allmylinks\.com|tap\.bio|link\.tree|carrd\.co|stan\.store|fanlink\.to|ffm\.to|smarturl\.it|orcd\.co|lnk\.to)$/i;

// A homepage, a bare listing, a link-in-bio page or a social profile is not "the exact page" for one show.
export function isGenericUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (AGGREGATORS.test(u.hostname)) return true;
    const segs = u.pathname.split("/").filter(Boolean).filter((s) => !/^[a-z]{2}(-[a-z]{2})?$/i.test(s)); // drop /en, /en-in
    if (segs.length === 0) return true;
    if (SOCIAL.test(u.hostname)) {
      // Specific: facebook.com/events/<id>, instagram.com/p/<id>, /reel/<id>, youtube.com/watch?v=. A bare profile or page is not.
      if (/youtube\.com$/.test(u.hostname)) return !(u.searchParams.has("v") || ["shorts", "live"].includes(segs[0].toLowerCase()));
      return !(["events", "p", "reel", "reels", "tv", "posts", "photo", "watch"].includes(segs[0].toLowerCase()) && segs.length >= 2);
    }
    // Pure listing pages: /events, /concerts, /explore/..., /city/events
    if (segs.length === 1 && /^(events?|concerts?|music|shows?|tickets?|explore|whats-on|upcoming|calendar|festivals?)$/i.test(segs[0])) return true;
    return false;
  } catch {
    return true;
  }
}

const TICKETING = /(bookmyshow|district\.in|insider\.in|skillboxes|skillbox|sortmyscene|allevents\.in|ticketgenie|townscript|ticketfairy|paytm|eventbrite|bandsintown|songkick|ticketmaster|livefiesta|zomato|dice\.fm|ticket)/i;
export const isTicketingHost = (url: string) => TICKETING.test(hostOf(url));

// Google News links are redirectors that only browsers follow; decode to the publisher's article URL.
export async function decodeGoogleNews(link: string): Promise<string | null> {
  try {
    const u = new URL(link);
    if (u.hostname !== "news.google.com" || !/\/(rss\/)?articles\//.test(u.pathname)) return null;
    const id = u.pathname.split("/").pop()!;
    const page = await fetch(`https://news.google.com/rss/articles/${id}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }).then((r) => r.text());
    const sg = /data-n-a-sg="([^"]+)"/.exec(page)?.[1];
    const ts = /data-n-a-ts="([^"]+)"/.exec(page)?.[1];
    if (!sg || !ts) return null;
    const payload = ["Fbv4je", `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`];
    const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "Mozilla/5.0" },
      body: `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`,
      signal: AbortSignal.timeout(8000),
    });
    const m = /\\"(https?:[^"\\]+)\\"/.exec(await r.text());
    return m ? canonicalize(m[1].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&")) : null;
  } catch {
    return null;
  }
}
