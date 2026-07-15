'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const UA = 'LyraLyricsDemo/1.0 (educational interface; contact: local-demo@example.invalid)';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/search') return await handleSearch(url, res);
    if (url.pathname === '/api/lyrics') return await handleLyrics(url, res);
    if (url.pathname === '/runtime-config.js' && process.env.YOUTUBE_API_KEY) {
      return javascript(res, 200, `window.LYRA_CONFIG = Object.freeze(${JSON.stringify({ youtubeApiKey: process.env.YOUTUBE_API_KEY })});\n`);
    }
    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Unexpected server error' });
  }
});

async function handleSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  const filter = url.searchParams.get('filter') || 'all';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 24)));
  if (!q) return json(res, 400, { error: 'Missing q' });

  const params = new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: String(limit), country: 'MX', lang: 'es_mx' });
  const attributeMap = { song: 'songTerm', artist: 'artistTerm', album: 'albumTerm' };
  if (attributeMap[filter]) params.set('attribute', attributeMap[filter]);

  const response = await fetchExternal(`https://itunes.apple.com/search?${params}`, { headers: { 'User-Agent': UA } });
  if (!response.ok) return json(res, response.status, { error: 'Catalog provider unavailable' });
  const data = await response.json();
  const results = (data.results || []).map(item => ({
    id: item.trackId || `${item.artistName}-${item.trackName}-${item.collectionName}`,
    title: item.trackName || 'Sin título',
    artist: item.artistName || 'Artista desconocido',
    album: item.collectionName || '',
    artworkUrl: item.artworkUrl100 || '',
    previewUrl: item.previewUrl || '',
    durationMs: item.trackTimeMillis || 0,
    trackViewUrl: item.trackViewUrl || item.collectionViewUrl || '',
    genre: item.primaryGenreName || '',
    releaseDate: item.releaseDate || '',
  }));
  json(res, 200, { results });
}

async function handleLyrics(url, res) {
  const track = (url.searchParams.get('track') || '').trim();
  const artist = (url.searchParams.get('artist') || '').trim();
  const rawAlbum = (url.searchParams.get('album') || '').trim();
  const album = rawAlbum === 'YouTube' ? '' : rawAlbum;
  const duration = Number(url.searchParams.get('duration') || 0);
  if (!track || !artist) return json(res, 400, { error: 'Missing track or artist' });

  if (album && duration) {
    const exact = new URLSearchParams({
      track_name: track,
      artist_name: artist,
      album_name: album,
      duration: String(Math.round(duration)),
    });
    const cached = await fetchExternal(`https://lrclib.net/api/get-cached?${exact}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (cached.ok) {
      const exactLyrics = await cached.json();
      if (exactLyrics?.syncedLyrics || exactLyrics?.plainLyrics) return json(res, 200, { ...exactLyrics, source: 'lrclib' });
    }
  }

  const params = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) params.set('album_name', album);
  const response = await fetchExternal(`https://lrclib.net/api/search?${params}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const records = response.ok ? await response.json() : [];
  let best = pickBest(records, { track, artist, album, duration });
  const titles = lyricTitleVariants(track);
  if (!best) {
    for (const title of titles) {
      for (const query of [`${title} ${artist}`, title]) {
        const broad = new URLSearchParams({ q: query });
        const broadResponse = await fetchExternal(`https://lrclib.net/api/search?${broad}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
        if (!broadResponse.ok) continue;
        const broadRecords = await broadResponse.json();
        best = pickBest(broadRecords, { track, artist, album, duration })
          || pickBest(broadRecords, { track, artist, album, duration }, true);
        if (best) break;
      }
      if (best) break;
    }
  }
  if (best) return json(res, 200, { ...best, source: 'lrclib' });

  const artists = [...new Set([artist, artist.replace(/\s+(?:official|oficial|topic)$/i, '').trim()].filter(Boolean))];
  for (const artistName of artists) {
    for (const title of titles) {
      const fallback = await fetchExternal(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(title)}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!fallback.ok) continue;
      const plainLyrics = String((await fallback.json()).lyrics || '').trim();
      if (plainLyrics.length >= 40) return json(res, 200, { plainLyrics, syncedLyrics: '', duration, source: 'lyrics.ovh' });
    }
  }
  json(res, 200, null);
}

function lyricTitleVariants(value) {
  const original = String(value || '').trim();
  const simplified = original
    .replace(/\s*[\[(](?:en\s+vivo|live|acoustic|acústic[oa]|remaster(?:ed)?|version|versión)[^\])]*[\])]/ig, '')
    .replace(/\s+(?:en\s+vivo|live|remaster(?:ed)?)(?:\s+version|\s+versión)?$/ig, '')
    .replace(/\s+/g, ' ').trim();
  return [...new Set([original, simplified].filter(Boolean))];
}

function pickBest(records, wanted, allowTitleOnly = false) {
  if (!Array.isArray(records) || !records.length) return null;
  const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const canonical = value => normalize(value)
    .replace(/\b(feat|ft|featuring|with|con)\b.*$/, '')
    .replace(/\b(official|video|audio|lyrics|lyric|visualizer|remaster(ed)?|version|en vivo|live|acoustic|acustico|acustica)\b.*$/, '')
    .trim();
  const canonicalArtist = value => normalize(value).replace(/\b(official|oficial|topic)\b.*$/, '').trim();
  const wt = canonical(wanted.track);
  const wa = canonicalArtist(wanted.artist);
  const wal = normalize(wanted.album);

  const matches = records
    .filter(record => {
      const candidate = canonical(record.trackName);
      const rawCandidate = normalize(record.trackName);
      if (candidate !== wt && !candidate.includes(wt) && !wt.includes(candidate) && !rawCandidate.includes(wt)) return false;
      const artistMatches = artistsMatch(wa, canonicalArtist(record.artistName));
      if (!artistMatches && (!allowTitleOnly || candidate !== wt)) return false;
      return Boolean(record.syncedLyrics || record.plainLyrics);
    })
    .map(record => {
      let score = 0;
      const ral = normalize(record.albumName);
      if (wal && ral === wal) score += 5;
      const durationDelta = wanted.duration && record.duration ? Math.abs(Number(record.duration) - wanted.duration) : 0;
      if (record.syncedLyrics && (!wanted.duration || !record.duration || durationDelta <= 75)) score += 6;
      if (record.plainLyrics) score += 3;
      if (artistsMatch(wa, canonicalArtist(record.artistName))) score += 5;
      if (wanted.duration && record.duration) score += Math.max(0, 4 - durationDelta / 12);
      return { record, score };
    })
    .sort((a, b) => b.score - a.score);
  return matches[0]?.record || null;
}

function artistsMatch(left, right) {
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const ignored = new Set(['and', 'the', 'feat', 'featuring', 'with']);
  const words = value => new Set(value.split(' ').filter(word => word.length > 2 && !ignored.has(word)));
  const leftWords = words(left);
  const rightWords = words(right);
  const shared = [...leftWords].filter(word => rightWords.has(word)).length;
  return shared >= Math.max(1, Math.ceil(Math.min(leftWords.size, rightWords.size) * .6));
}

async function fetchExternal(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function serveStatic(pathname, res) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) return text(res, 403, 'Forbidden');
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) return text(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function text(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}
function javascript(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

server.listen(PORT, () => {
  console.log(`Lyra is alive at http://localhost:${PORT}`);
});
