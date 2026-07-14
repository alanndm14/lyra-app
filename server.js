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

  const response = await fetch(`https://itunes.apple.com/search?${params}`, { headers: { 'User-Agent': UA } });
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
  const album = (url.searchParams.get('album') || '').trim();
  const duration = Number(url.searchParams.get('duration') || 0);
  if (!track || !artist) return json(res, 400, { error: 'Missing track or artist' });

  if (album && duration) {
    const exact = new URLSearchParams({
      track_name: track,
      artist_name: artist,
      album_name: album,
      duration: String(Math.round(duration)),
    });
    const cached = await fetch(`https://lrclib.net/api/get-cached?${exact}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (cached.ok) return json(res, 200, await cached.json());
    if (cached.status !== 404) return json(res, cached.status, { error: 'Lyrics provider unavailable' });
  }

  const params = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) params.set('album_name', album);
  const response = await fetch(`https://lrclib.net/api/search?${params}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) return json(res, response.status, { error: 'Lyrics provider unavailable' });
  const records = await response.json();
  const best = pickBest(records, { track, artist, album, duration });
  json(res, 200, best || null);
}

function pickBest(records, wanted) {
  if (!Array.isArray(records) || !records.length) return null;
  const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const wt = normalize(wanted.track);
  const wa = normalize(wanted.artist);
  const wal = normalize(wanted.album);

  return records
    .map(record => {
      let score = 0;
      const rt = normalize(record.trackName);
      const ra = normalize(record.artistName);
      const ral = normalize(record.albumName);
      if (rt === wt) score += 9;
      else if (rt.includes(wt) || wt.includes(rt)) score += 4;
      if (ra === wa) score += 8;
      else if (ra.includes(wa) || wa.includes(ra)) score += 4;
      if (wal && ral === wal) score += 5;
      else if (wal && (ral.includes(wal) || wal.includes(ral))) score += 2;
      if (record.syncedLyrics) score += 3;
      if (record.plainLyrics) score += 1;
      if (wanted.duration && record.duration) score += Math.max(0, 3 - Math.abs(Number(record.duration) - wanted.duration) / 8);
      return { record, score };
    })
    .sort((a, b) => b.score - a.score)[0].record;
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

server.listen(PORT, () => {
  console.log(`Lyra is alive at http://localhost:${PORT}`);
});
