'use strict';

const fs = require('fs');
const path = require('path');

const countries = ['mx', 'us', 'es', 'ar', 'co', 'gb', 'jp'];
const output = path.join(__dirname, '..', 'data', 'charts.json');

async function build() {
  const charts = {};
  await Promise.all(countries.map(async country => {
    const url = `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/10/songs.json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'LyraCharts/2.0' } });
    if (!response.ok) throw new Error(`${country}: ${response.status}`);
    const data = await response.json();
    charts[country] = (data.feed?.results || []).slice(0, 10).map(item => ({
      id: item.id,
      name: item.name,
      artistName: item.artistName,
      artworkUrl100: item.artworkUrl100,
      url: item.url,
      releaseDate: item.releaseDate,
      genres: item.genres?.slice(0, 2).map(genre => ({ name: genre.name })) || [],
    }));
  }));

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

build().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
