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

for (const id of ['entryGate', 'appShell', 'chartList', 'playerOverlay', 'beatStage', 'cinemaIntro', 'mediaFallback', 'youtubeSearchLink', 'youtubePlayerShell', 'youtubePlayer', 'youtubeToggle', 'translationLanguage', 'previewTimelinePlay']) {
  assert(ids.includes(id), `Missing required UI id: ${id}`);
}

assert(html.includes('styles.css?v=14') && html.includes('app.js?v=14') && html.includes('runtime-config.js?v=14'), 'Public asset versions are not aligned');
assert(app.includes(".join(' ')}<small class=\"lyric-translation\""), 'Lyric words are rendered without explicit spaces');
assert(app.includes('itunes.apple.com/lookup?'), 'Chart entries are not resolved through exact catalog lookup');
assert(app.includes('googleapis.com/youtube/v3/search'), 'YouTube search fallback is missing');
assert(app.includes('if (!track.youtubeVideoId && youtubeApiKey) enrichCurrentTrackWithYouTube'), 'YouTube is not enriched for regular catalog songs');
assert(css.includes('.youtube-timeline-toggle') && css.includes('right:160px'), 'YouTube control or collision-safe lyric header is missing');
assert(!/id="youtubeToggle"[^>]*\shidden/.test(html), 'The YouTube status control is hidden by default');
assert(app.includes('setYouTubeControlState') && app.includes('initPerformanceProfile()'), 'Visible YouTube status or adaptive performance is missing');
assert(css.includes('body.performance-lite .player-stage::before'), 'Desktop performance profile styles are missing');
assert(app.includes('state.youtubeController?.abort()') && app.includes("setYouTubeControlState('error')"), 'YouTube retry isolation or in-app recovery is missing');
assert(css.includes('.player-overlay.cinema-active .track-panel { min-height:0; }'), 'Mobile cinema cards can still inherit full-screen minimum height');
assert(app.includes('renderYouTubeEmbed(track.youtubeVideoId') && app.includes('seekTo(lyricToVideoTime(state.lyricTime), true)'), 'Embedded YouTube transport is not unified with lyrics');
assert(app.includes("referrerPolicy: 'unsafe-url'") && app.includes("new URL('./', location.href).href"), 'YouTube requests do not preserve the allowed GitHub Pages referrer');
assert(app.includes('const hasVideoSlot = hasYouTube || Boolean(youtubeApiKey)') && css.includes('.youtube-player-shell.pending::before'), 'Persistent embedded video slot is missing');
assert(app.includes("const marker = '[[[LYRA_BREAK]]]'" ) && app.includes("setTranslationState('TRADUCIENDO'"), 'Reliable translation batching or status is missing');
assert(app.includes('api.mymemory.translated.net/get'), 'Lyrics translation provider is missing');
assert(app.includes('translate.googleapis.com/translate_a/single') && app.includes('requestMyMemoryTranslation'), 'Translation provider failover is missing');
assert(app.includes("writeStore('lyra:preview-offsets'"), 'Per-track preview alignment is not persisted');
assert(!app.includes("text: 'Esta letra todavía no está disponible.'"), 'A placeholder is still being animated as lyrics');
assert(css.includes('repeat(var(--beat-columns,48)') && app.includes('state.performanceLite ? 18 : 48'), 'Adaptive full-width beat stage is missing');
assert(css.includes('.no-lyrics'), 'The no-lyrics visual state is missing');
assert(css.includes('--lyric-hot') && css.includes('.lyric-translation'), 'Artwork-colored translated lyrics styling is missing');
assert(html.includes('data-view="history"'), 'Mobile history navigation is missing');
assert(app.includes('state.visualFps = state.performanceLite ? 24 : 36') && app.includes('setTimeout(tick, visualFrameDelay())'), 'Playback rendering is not frame-capped');
assert(app.includes("const mobile = matchMedia('(pointer:coarse)')") && css.includes('body.performance-lite #particleCanvas'), 'Mobile performance profile is not automatic');
assert(app.includes('videoToLyricTime(currentTime)') && app.includes('lyricToVideoTime(state.lyricTime)'), 'Video and lyric duration mapping is missing');
assert(app.includes('requestBrowserTranslation') && app.includes('requestNetworkTranslation') && app.includes('translationRetryCount'), 'Translation fallbacks are incomplete');
assert(css.includes('.player-overlay.intro-presenting .cinema-intro') && app.includes('startCinemaSequence()'), 'Cinematic entry sequence is missing');
assert(!css.includes('.control-pill:not([data-mode="cinematic"]) { display:none; }'), 'Mobile lyric modes are still hidden');
assert(app.includes("if (state.filter === 'album') return searchAppleAlbumTracks") && app.includes("entity: 'album', limit: '12'"), 'Album filter does not resolve real albums');
assert(app.includes("mode === 'artist' ? ['artistTerm']") && app.includes('passesSearchMode(track, query, mode)'), 'Artist filter is not isolated from other search fields');
assert(app.includes("mode === 'song' ? ['songTerm', '']") && app.includes('modeMatchScore(track, query, mode)'), 'Song filter does not prioritize titles');
assert(app.includes("entity: 'song',") && app.includes('albumsByMarket'), 'Album tracks are not loaded from the selected collections');

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
