'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const chartBundle = JSON.parse(fs.readFileSync(path.join(root, 'data', 'charts.json'), 'utf8'));

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
assert(!duplicates.length, `Duplicate HTML ids: ${[...new Set(duplicates)].join(', ')}`);

for (const id of ['entryGate', 'appShell', 'chartList', 'playerOverlay', 'beatStage', 'mediaFallback', 'youtubeSearchLink', 'youtubePlayerShell', 'youtubePlayer', 'translationLanguage', 'previewTimelinePlay']) {
  assert(ids.includes(id), `Missing required UI id: ${id}`);
}

assert(html.includes('styles.css?v=6') && html.includes('app.js?v=6') && html.includes('runtime-config.js?v=6'), 'Public asset versions are not aligned');
assert(app.includes('itunes.apple.com/lookup?'), 'Chart entries are not resolved through exact catalog lookup');
assert(app.includes('googleapis.com/youtube/v3/search'), 'YouTube search fallback is missing');
assert(app.includes('api.mymemory.translated.net/get'), 'Lyrics translation provider is missing');
assert(app.includes("writeStore('lyra:preview-offsets'"), 'Per-track preview alignment is not persisted');
assert(!app.includes("text: 'Esta letra todavía no está disponible.'"), 'A placeholder is still being animated as lyrics');
assert(css.includes('grid-template-columns:repeat(48'), 'The full-width beat stage is missing');
assert(css.includes('.no-lyrics'), 'The no-lyrics visual state is missing');
assert(css.includes('--lyric-hot') && css.includes('.lyric-translation'), 'Artwork-colored translated lyrics styling is missing');
assert(html.includes('data-view="history"'), 'Mobile history navigation is missing');

const markets = Object.entries(chartBundle.charts || {});
assert(markets.length >= 8, 'Expected global plus seven country charts');
for (const [market, items] of markets) {
  assert(Array.isArray(items) && items.length === 10, `${market} must contain exactly 10 chart entries`);
  for (const item of items) {
    assert(item.id && item.name && item.artistName && item.artworkUrl100, `${market} contains incomplete chart metadata`);
    assert(item.catalogCountry, `${market}/${item.id} is missing its source catalog country`);
    if (item.catalogResolved) {
      assert(item.album && item.durationMs && item.trackViewUrl, `${market}/${item.id} has incomplete exact catalog metadata`);
      const linkedId = new URL(item.trackViewUrl).searchParams.get('i');
      assert(linkedId === String(item.id), `${market}/${item.id} links to a different catalog song`);
    }
  }
}

console.log(`Verified ${ids.length} UI ids and ${markets.reduce((sum, [, items]) => sum + items.length, 0)} exact chart entries.`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
