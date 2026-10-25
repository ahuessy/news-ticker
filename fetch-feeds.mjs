// Holt alle RSS-Feeds und schreibt die Meldungen gesammelt in news.json.
// Läuft mit Node 20 ohne weitere Pakete.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAX_AGE_DAYS = 7, PER_FEED = 25, MAX_ITEMS = 600, TIMEOUT_MS = 15000, PARALLEL = 8;
// [Name, Feed-URL, Gruppe (dach|kons|intl), feste Kategorie oder "", Schweiz? (1)]
export const SRC = [
["The Times of India","https://timesofindia.indiatimes.com/rssfeeds/296589292.cms","dach","Welt"],
["Salonkolumnisten","https://www.salonkolumnisten.com/feed/","dach",""],
["Fliegende Bretter","https://fliegende-bretter.blogspot.com/feeds/posts/default?alt=rss","dach",""],
["WSJ",["https://feeds.content.dowjones.io/public/rss/RSSWorldNews","https://feeds.a.dj.com/rss/RSSWorldNews.rss"],"dach",""],
["manager magazin","https://www.manager-magazin.de/news/index.rss","dach","Wirtschaft"],
["Handelsblatt",["https://www.handelsblatt.com/contentexport/feed/top-themen","https://www.handelsblatt.com/contentexport/feed/rss/schlagzeilen"],"dach","Wirtschaft"],
["taz","https://taz.de/rss.xml","dach",""],
["Jüdische Allgemeine","https://www.juedische-allgemeine.de/feed/","dach",""],
["The New York Times","https://rss.nytimes.com/services/xml/rss/nyt/World.xml","dach",""],
["CNN Business","http://rss.cnn.com/rss/money_latest.rss","dach","Wirtschaft"],
["Sport Spiegel","https://www.spiegel.de/sport/index.rss","dach","Sport"],
["Sportschau ARD","https://www.sportschau.de/index~rss2.xml","dach","Sport"],
["Ruhrbarone","https://www.ruhrbarone.de/feed/","dach",""],
["20 Minuten",["https://partner-feeds.20min.ch/rss/20minuten","https://www.20min.ch/rss/rss/20min.xml","https://www.20min.ch/rss/schweiz"],"dach","",1],
["Tichys Einblick","https://www.tichyseinblick.de/feed/","kons",""],
["Achse des Guten",["https://www.achgut.com/rss","https://www.achgut.com/rss.xml","https://www.achgut.com/feed/"],"kons",""],
["Cicero Online","https://www.cicero.de/rss.xml","kons",""],
["WELT","https://www.welt.de/feeds/latest.rss","dach",""],
["NZZ",["https://www.nzz.ch/recent.rss","https://www.nzz.ch/startseite.rss","https://www.nzz.ch/schweiz.rss","https://www.nzz.ch/feed/"],"dach","",1],
["Der Standard","https://www.derstandard.at/rss","dach",""],
["Blick","https://www.blick.ch/news/rss.xml","dach","",1],
["Bild",["https://www.bild.de/feed/alles.xml","https://www.bild.de/rssfeeds/vw-alles/vw-alles-26970192,sort=1,view=rss2.bild.xml","https://www.bild.de/rssfeeds/rss3-2075.xml"],"dach",""],
["Tages-Anzeiger",["https://www.tagesanzeiger.ch/rss.html","https://www.tagesanzeiger.ch/schweiz/rss.html","https://www.tagesanzeiger.ch/rss"],"dach","",1],
["ARD",["https://www.tagesschau.de/index~rss2.xml","https://www.tagesschau.de/inland/index~rss2.xml","https://www.tagesschau.de/rss2"],"dach",""],
["ZDF","https://www.zdf.de/rss/zdf/nachrichten","dach",""],
["SRF",["https://www.srf.ch/news/bnf/rss/1646","https://www.srf.ch/news/bnf/rss/1890","https://www.srf.ch/news/bnf/rss"],"dach","",1],
["Stern",["https://www.stern.de/feed/standard/alle-nachrichten/","https://www.stern.de/feed/standard/politik/","https://www.stern.de/feed/standard.xml"],"dach",""],
["Tagesspiegel",["https://www.tagesspiegel.de/contentexport/feed/home","https://www.tagesspiegel.de/contentexport/feed/politik","https://www.tagesspiegel.de/contentexport/feed/homepage"],"dach",""],
["Aargauer Zeitung",["https://www.aargauerzeitung.ch/aargau.rss","https://www.aargauerzeitung.ch/schweiz.rss","https://www.aargauerzeitung.ch/rss"],"dach","",1],
["The Telegraph",["https://www.telegraph.co.uk/rss.xml","https://www.telegraph.co.uk/news/rss.xml"],"intl",""],
["The American Conservative","https://www.theamericanconservative.com/feed/","intl",""],
["Fox News",["https://moxie.foxnews.com/google-publisher/latest.xml","https://moxie.foxnews.com/feedburner/latest.xml","https://feeds.foxnews.com/fox-news/rss.xml"],"intl",""]
];
// Meldungen, die nicht angezeigt werden sollen: [Quelle (oder null = alle Quellen), Muster im Titel]
const BLOCK = [
  ["ZDF", /Nachrichtenstudio|Pressemitteilungen/i],
];
const KW = [
["Kriege",/krieg|ukraine|gaza|westjordan|israel|hamas|hisbollah|russland|moskau|kiew|militär|armee|waffenruhe|offensive|iran|rakete|drohnen|\bwar\b|army|missile|troops|ceasefire|hostage|invasion/i],
["Wirtschaft",/wirtschaft|börse|aktie|dax|zins|inflation|unternehmen|konzern|insolvenz|zoll|zölle|handel|markt|bank|konjunktur|arbeitsmarkt|economy|stocks|market|tariff|trade|earnings/i],
["Politik",/bundestag|regierung|wahl|partei|kanzler|minister|afd|cdu|csu|spd|grüne|politik|präsident|parlament|koalition|senat|election|president|congress|trump|government|senate|vote/i],
["Sport",/bundesliga|fußball|fussball|tennis|formel 1|olymp|liga|trainer|weltcup|football|soccer|nba|nfl|premier league|champions league|golf|eishockey/i]
];
const categorize = (s, t) => { if (s[3] && s[3] !== "Welt") return s[3]; for (const [c, re] of KW) if (re.test(t)) return c; return "Welt"; };

const dec = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const tagRaw = (x, name) => { const m = x.match(new RegExp("<" + name + "(?:\\s[^>]*?)?>([\\s\\S]*?)</" + name + ">", "i")); if (!m) return ""; const c = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/); return c ? c[1] : dec(m[1]); };
const clean = (h, max = 0) => { let t = dec(String(h).replace(/<[^>]*>/g, " ")).replace(/Der Beitrag[\s\S]*erschien zuerst auf[\s\S]*$/, "").replace(/\s+/g, " ").trim();
  return max && t.length > max ? t.slice(0, max - 3).replace(/\s+\S*$/, "") + " …" : t; };
const safeUrl = u => { try { const x = new URL(u.trim()); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };

export function parseFeed(xml, s, now = Date.now()) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const n = m[0];
    let link = clean(tagRaw(n, "link"));
    if (!link) for (const l of n.matchAll(/<link\b([^>]*)>/gi)) {
      const href = l[1].match(/href="([^"]+)"/i), rel = l[1].match(/rel="([^"]+)"/i);
      if (href && (!rel || rel[1] === "alternate")) { link = dec(href[1]); break; }
    }
    link = safeUrl(link);
    const title = clean(tagRaw(n, "title"));
    const date = new Date(clean(tagRaw(n, "pubDate") || tagRaw(n, "dc:date") || tagRaw(n, "published") || tagRaw(n, "updated")));
    if (BLOCK.some(([q, re]) => (!q || q === s[0]) && re.test(title))) continue;
    if (!title || !link || isNaN(date) || now - date > MAX_AGE_DAYS * 864e5 || date - now > 864e5) continue;
    let desc = clean(tagRaw(n, "description") || tagRaw(n, "summary") || tagRaw(n, "content:encoded"), 240);
    if (desc === title) desc = "";
    out.push({ src: s[0], title, desc, link, date: date.toISOString(), cat: categorize(s, title + " " + desc), swiss: !!s[4], grp: s[2] });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, PER_FEED);
}

async function main() {
  const prev = existsSync("news.json") ? JSON.parse(readFileSync("news.json", "utf8")) : { items: [] };
  const errors = {}, fresh = {};
  let idx = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (idx < SRC.length) {
      const s = SRC[idx++], urls = [].concat(s[1]), fails = [];
      for (const u of urls) {
        try {
          const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PalgoaTicker/1.0)", Accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const items = parseFeed(await r.text(), s);
          if (!items.length) throw new Error("keine aktuellen Meldungen gefunden");
          fresh[s[0]] = items;
          if (u !== urls[0]) console.log(` OK über Alternative: ${s[0]} - ${u}`);
          break;
        } catch (e) { fails.push(String(e.message || e)); }
      }
      if (!fresh[s[0]]) errors[s[0]] = fails.join(" | ");
    }
  }));
  const ok = Object.keys(fresh).length;
  console.log(`${ok} von ${SRC.length} Feeds geladen`);
  for (const [k, v] of Object.entries(errors)) console.log(" Fehler:", k, "-", v);
  if (!ok) { console.error("Kein Feed erreichbar, news.json bleibt unverändert."); process.exit(1); }
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  const items = [];
  for (const s of SRC) {
    const list = fresh[s[0]] || prev.items.filter(i => i.src === s[0] && new Date(i.date) > cutoff); // bei Fehler: alter Stand
    items.push(...list);
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync("news.json", JSON.stringify({ updated: new Date().toISOString(), sources: SRC.map(s => [s[0], s[2], s[4] ? 1 : 0]), errors, items: items.slice(0, MAX_ITEMS) }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
