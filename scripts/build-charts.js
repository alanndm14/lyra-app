'use strict';

const fs = require('fs');
const path = require('path');

const countries = ['mx', 'us', 'es', 'ar', 'co', 'gb', 'jp'];
const output = path.join(__dirname, '..', 'data', 'charts.json');

async function build() {
  const previous = readPreviousCharts();
  const charts = {};
  for (const country of countries) {
    try {
      const url = `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/10/songs.json`;
      const data = await fetchJsonWithRetry(url, { headers: { 'User-Agent': 'LyraCharts/2.1' } });
      const feedItems = (data.feed?.results || []).slice(0, 10).map(item => ({
        id: item.id,
        name: item.name,
        artistName: item.artistName,
        artworkUrl100: item.artworkUrl100,
        url: item.url,
        catalogCountry: country,
        releaseDate: item.releaseDate,
        genres: item.genres?.slice(0, 2).map(genre => ({ name: genre.name })) || [],
      }));
      if (feedItems.length !== 10) throw new Error(`${country}: incomplete feed`);
      charts[country] = await hydrateCatalog(country, feedItems, previous?.charts?.[country]);
    } catch (error) {
      const fallback = previous?.charts?.[country];
      if (!Array.isArray(fallback) || fallback.length !== 10) throw error;
      console.warn(`Chart ${country} kept the previous verified snapshot: ${error.message}`);
      charts[country] = fallback;
    }
  }

  const globalScores = new Map();
  for (const country of countries) {
    charts[country].forEach((item, index) => {
      const current = globalScores.get(item.id) || { item, score: 0, markets: 0 };
      current.score += 10 - index;
      current.markets += 1;
      globalScores.set(item.id, current);
    });
  }
  charts.global = [...globalScores.values()]
    .sort((a, b) => b.markets - a.markets || b.score - a.score)
    .slice(0, 10)
    .map(({ item }) => item);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ updatedAt: new Date().toISOString(), charts }, null, 2));
  console.log(`Built ${Object.keys(charts).length} charts at ${output}`);
}

async function hydrateCatalog(country, items, previousItems = []) {
  const ids = items.map(item => item.id).filter(Boolean).join(',');
  if (!ids) return items;
  const previousById = new Map((previousItems || []).map(item => [String(item.id), item]));
  try {
    const params = new URLSearchParams({ id: ids, country: country.toUpperCase(), entity: 'song' });
    const payload = await fetchJsonWithRetry(`https://itunes.apple.com/lookup?${params}`, {
      headers: { 'User-Agent': 'LyraCharts/2.1' },
    });
    const byId = new Map((payload.results || [])
      .filter(record => record.wrapperType === 'track' && record.kind === 'song')
      .map(record => [String(record.trackId), record]));
    return items.map(item => {
      const record = byId.get(String(item.id));
      if (!record) return previousById.get(String(item.id)) || item;
      return {
        ...item,
        name: record.trackName || item.name,
        artistName: record.artistName || item.artistName,
        album: record.collectionName || '',
        artworkUrl100: record.artworkUrl100 || item.artworkUrl100,
        previewUrl: record.previewUrl || '',
        durationMs: Number(record.trackTimeMillis || 0),
        trackViewUrl: record.trackViewUrl || item.url,
        genre: record.primaryGenreName || item.genres?.[0]?.name || '',
        releaseDate: record.releaseDate || item.releaseDate || '',
        catalogResolved: true,
      };
    });
  } catch (error) {
    console.warn(`Chart ${country} kept its exact feed metadata: ${error.message}`);
    return items.map(item => previousById.get(String(item.id)) || item);
  }
}

function readPreviousCharts() {
  try {
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`${new URL(url).hostname}: ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 700));
    }
  }
  throw lastError;
}

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
