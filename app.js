(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    filter: 'all',
    results: [],
    currentTrack: null,
    lyrics: [],
    plainLyrics: '',
    lyricDuration: 0,
    lyricTime: 0,
    lyricTimer: null,
    lyricPlaying: false,
    fontScale: 1,
    lyricMode: 'cinematic',
    activeLyricIndex: -1,
    lyricElements: [],
    syncAnchor: 0,
    audioSync: false,
    searchController: null,
    lyricsController: null,
    lyricsCache: new Map(),
    lyricsMessageTimer: null,
    backgroundReady: false,
    lyricsReady: false,
    cinemaEnded: false,
    returnToResults: false,
    motion: localStorage.getItem('lyra:motion') !== 'off',
    favorites: readStore('lyra:favorites', []),
    history: readStore('lyra:history', []),
    themeIndex: Math.max(0, Math.min(4, Number(localStorage.getItem('lyra:theme')) || 0)),
    currentView: 'discover',
  };

  const themes = [
    ['#ff4ecd', '#8e6cff', '#25d9ff', '#eaff5f', 'NEÓN'],
    ['#ff6d3a', '#ffcf48', '#ff3f8b', '#8dffdc', 'SOLAR'],
    ['#24e4ff', '#2156ff', '#9f5cff', '#72ffbd', 'CÓSMICO'],
    ['#f0ff6e', '#3affbd', '#06a7ff', '#ff71df', 'ÁCIDO'],
    ['#ff9a9e', '#fad0c4', '#cbb7ff', '#8ee7f1', 'SUEÑO'],
  ];

  const els = {
    searchOverlay: $('#searchOverlay'),
    playerOverlay: $('#playerOverlay'),
    searchInput: $('#searchInput'),
    searchForm: $('#searchForm'),
    resultsGrid: $('#resultsGrid'),
    resultEmpty: $('#resultEmpty'),
    loadingState: $('#loadingState'),
    resultsTitle: $('#resultsTitle'),
    resultsEyebrow: $('#resultsEyebrow'),
    resultsCount: $('#resultsCount'),
    lyricsContent: $('#lyricsContent'),
    lyricsLoading: $('#lyricsLoading'),
    lyricsViewport: $('#lyricsViewport'),
    lyricTimeline: $('#lyricTimeline'),
    lyricScrubber: $('#lyricScrubber'),
    lyricTime: $('#lyricTime'),
    lyricPlay: $('#lyricPlay'),
    audio: $('#audioPreview'),
    previewPlayer: $('#previewPlayer'),
    previewFill: $('#previewFill'),
    previewTime: $('#previewTime'),
    previewDuration: $('#previewDuration'),
    previewLabel: $('#previewLabel'),
    favoriteBtn: $('#favoriteBtn'),
    toast: $('#toast'),
    favoritesGrid: $('#favoritesGrid'),
    historyGrid: $('#historyGrid'),
    favoritesEmpty: $('#favoritesEmpty'),
    historyEmpty: $('#historyEmpty'),
    lyricEcho: $('#lyricEcho'),
    lyricTotal: $('#lyricTotal'),
    syncState: $('#syncState'),
    entryGate: $('#entryGate'),
    environmentPanel: $('#environmentPanel'),
    environmentBackdrop: $('#environmentBackdrop'),
    chartList: $('#chartList'),
    beatStage: $('#beatStage'),
    cinemaLoader: $('#cinemaLoader'),
    cinemaLoaderText: $('#cinemaLoaderText'),
    endCredits: $('#endCredits'),
  };

  init();

  function init() {
    bindEvents();
    initParticles();
    initTilt();
    initMagnetic();
    initCarouselDrag();
    initEntry();
    initDiscovery();
    initBeatStage();
    setMotion(state.motion);
    renderLibraries();
    setTheme(themes[state.themeIndex] || themes[0]);
    loadChart('global');
    registerServiceWorker();
  }

  function bindEvents() {
    $('#searchTrigger').addEventListener('click', openSearch);
    $('#heroSearchBtn').addEventListener('click', openSearch);
    $('#mobileSearch').addEventListener('click', openSearch);
    $('#mobileEnvironment').addEventListener('click', openEnvironment);
    $('#demoBtn').addEventListener('click', openDemoTrack);
    $('#enterLyra').addEventListener('click', enterApp);
    $('#surpriseBtn').addEventListener('click', surpriseMe);
    $('#vibeShuffle').addEventListener('click', cycleTheme);
    $('#themeCycle').addEventListener('click', openEnvironment);
    $('#environmentClose').addEventListener('click', closeEnvironment);
    els.environmentBackdrop.addEventListener('click', closeEnvironment);
    $('#motionToggle').addEventListener('click', () => setMotion(!state.motion));
    $('#openAllMoods').addEventListener('click', () => runSearch('popular music'));

    $$('[data-close-search]').forEach(el => el.addEventListener('click', closeSearch));
    $('#playerClose').addEventListener('click', returnFromPlayer);
    $('.player-backdrop').addEventListener('click', returnFromPlayer);
    $('#replayExperience').addEventListener('click', replayExperience);

    $('#homeSearchForm').addEventListener('submit', event => {
      event.preventDefault();
      const query = $('#homeSearchInput').value.trim();
      if (query) runSearch(query);
    });

    els.searchForm.addEventListener('submit', event => {
      event.preventDefault();
      const query = els.searchInput.value.trim();
      if (query) searchMusic(query);
    });

    $$('.search-suggestions [data-query], .quick-card[data-query], .mood-tile[data-query], .search-prompts [data-query]').forEach(button => {
      button.addEventListener('click', () => runSearch(button.dataset.query));
    });

    $$('.environment-presets [data-theme]').forEach(button => {
      button.addEventListener('click', () => selectEnvironment(Number(button.dataset.theme)));
    });

    $$('#countryTabs [data-country]').forEach(button => {
      button.addEventListener('click', () => {
        $$('#countryTabs [data-country]').forEach(item => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', String(active));
        });
        loadChart(button.dataset.country);
      });
    });

    $$('.filter-tabs button').forEach((button, index) => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        $$('.filter-tabs button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        const indicator = $('.tab-indicator');
        const tabWidth = button.offsetWidth;
        indicator.style.width = `${tabWidth}px`;
        indicator.style.transform = `translateX(${button.offsetLeft - 5}px)`;
        if (els.searchInput.value.trim()) searchMusic(els.searchInput.value.trim());
      });
    });

    $$('.palette-row button').forEach((button, i) => {
      button.addEventListener('click', () => {
        const chosen = themes[i % themes.length];
        setTheme(chosen);
      });
    });

    $$('[data-view]').forEach(button => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    $('#previewPlay').addEventListener('click', togglePreview);
    els.audio.addEventListener('timeupdate', updatePreviewProgress);
    els.audio.addEventListener('loadedmetadata', updatePreviewProgress);
    els.audio.addEventListener('play', beginAudioSync);
    els.audio.addEventListener('pause', () => {
      els.previewPlayer.classList.remove('playing');
      state.audioSync = false;
      if (!state.lyricPlaying && els.playerOverlay.classList.contains('open') && !state.cinemaEnded) {
        els.playerOverlay.classList.remove('playing');
        els.playerOverlay.classList.add('paused');
      }
      if (!els.audio.ended) els.syncState.innerHTML = '<i></i> ALINEACIÓN PAUSADA';
    });
    els.audio.addEventListener('ended', endAudioSync);
    els.audio.addEventListener('error', () => {
      if (state.currentTrack?.previewUrl) showToast('Este fragmento no está disponible en tu región.');
    });

    els.favoriteBtn.addEventListener('click', toggleFavorite);
    $('#copyLyricsBtn').addEventListener('click', copyLyrics);
    els.lyricPlay.addEventListener('click', toggleLyricPlayback);
    els.lyricScrubber.addEventListener('input', () => {
      const value = Number(els.lyricScrubber.value);
      state.lyricTime = state.lyricDuration * value / 100;
      if (!els.audio.paused) state.syncAnchor = state.lyricTime - els.audio.currentTime;
      updateLyricUI(true);
    });
    $('#focusToggle').addEventListener('click', event => {
      event.currentTarget.classList.toggle('active');
      els.lyricsContent.classList.toggle('focus-mode');
    });
    $('#fontPlus').addEventListener('click', () => changeFont(.08));
    $('#fontMinus').addEventListener('click', () => changeFont(-.08));

    $$('.control-pill').forEach(button => {
      button.addEventListener('click', () => {
        $$('.control-pill').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        state.lyricMode = button.dataset.mode;
        els.playerOverlay.classList.toggle('cinema-active', state.lyricMode === 'cinematic');
        els.lyricsContent.classList.toggle('full-mode', state.lyricMode === 'full');
        els.lyricsContent.classList.toggle('flow-mode', state.lyricMode === 'flow');
        els.lyricsContent.classList.toggle('cinematic-mode', state.lyricMode === 'cinematic');
        els.lyricEcho.hidden = state.lyricMode !== 'cinematic';
        updateLyricUI(true);
      });
    });

    document.addEventListener('keydown', event => {
      if (!els.entryGate.hidden) {
        if (event.key === 'Enter') enterApp();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
      if (event.key === 'Escape') {
        if (els.environmentPanel.classList.contains('open')) closeEnvironment();
        else if (els.playerOverlay.classList.contains('open')) returnFromPlayer();
        else closeSearch();
      }
      if (event.code === 'Space' && els.playerOverlay.classList.contains('open') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        event.preventDefault();
        toggleLyricPlayback();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopLyricPlayback();
    });
  }

  function initEntry() {
    document.body.classList.add('entry-open');
    els.entryGate.setAttribute('aria-hidden', 'false');
  }

  function enterApp() {
    if (els.entryGate.classList.contains('leaving')) return;
    els.entryGate.classList.add('leaving');
    document.body.classList.add('entering-app');
    setTimeout(() => {
      els.entryGate.hidden = true;
      els.entryGate.setAttribute('aria-hidden', 'true');
      $('#appShell').inert = false;
      $('#appShell').setAttribute('aria-hidden', 'false');
      document.body.classList.remove('entry-open', 'entering-app');
      document.body.classList.add('app-entered');
      if (matchMedia('(pointer:fine)').matches) $('#homeSearchInput').focus({ preventScroll: true });
    }, state.motion ? 1050 : 20);
  }

  function initDiscovery() {
    const questions = [
      '¿Qué quieres escuchar hoy?',
      '¿A qué suena tu mood?',
      '¿Qué canción te encuentra hoy?',
      '¿Cómo se siente este momento?',
      '¿Qué quieres convertir en una escena?',
      '¿Qué letra necesitas ahora?',
    ];
    const seed = Math.abs(new Date().getDate() + performance.now() | 0);
    $('#discoveryQuestion').textContent = questions[seed % questions.length];
  }

  function initBeatStage() {
    els.beatStage.innerHTML = Array.from({ length: 36 }, (_, index) => `<i style="--i:${index};--beat:.12"></i>`).join('');
  }

  function openEnvironment() {
    els.environmentPanel.classList.add('open');
    els.environmentPanel.setAttribute('aria-hidden', 'false');
    els.environmentBackdrop.classList.add('open');
  }

  function closeEnvironment() {
    els.environmentPanel.classList.remove('open');
    els.environmentPanel.setAttribute('aria-hidden', 'true');
    els.environmentBackdrop.classList.remove('open');
  }

  function selectEnvironment(index) {
    state.themeIndex = Math.max(0, Math.min(themes.length - 1, index));
    localStorage.setItem('lyra:theme', String(state.themeIndex));
    setTheme(themes[state.themeIndex]);
    $$('.environment-presets [data-theme]').forEach(button => button.classList.toggle('active', Number(button.dataset.theme) === state.themeIndex));
    setTimeout(closeEnvironment, 260);
  }

  async function loadChart(country) {
    state.chartCountry = country;
    els.chartList.innerHTML = '<div class="chart-loading"><i></i><span>Sintonizando el chart…</span></div>';
    try {
      if (!state.chartsData) {
        const response = await fetch('./data/charts.json');
        if (!response.ok) throw new Error(`Chart bundle failed ${response.status}`);
        state.chartsData = await response.json();
      }
      const items = state.chartsData.charts?.[country] || [];
      if (!items.length) throw new Error(`Chart unavailable for ${country}`);
      renderChart(items);
    } catch (error) {
      console.error(error);
      els.chartList.innerHTML = '<div class="chart-error"><strong>El chart está fuera del aire.</strong><span>La búsqueda sigue disponible.</span></div>';
    }
  }

  function renderChart(items) {
    els.chartList.innerHTML = '';
    items.slice(0, 10).forEach((item, index) => {
      const row = document.createElement('button');
      row.className = 'chart-row';
      row.innerHTML = `
        <span class="chart-rank">${String(index + 1).padStart(2, '0')}</span>
        <img src="${escapeAttr(upscaleArtwork(item.artworkUrl100, 300))}" alt="Portada de ${escapeAttr(item.name)}" loading="lazy">
        <span class="chart-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.artistName)}</small></span>
        <span class="chart-genre">${escapeHtml(item.genres?.[0]?.name || 'Música')}</span>
        <span class="chart-open">VER LETRA <b>↗</b></span>`;
      row.addEventListener('click', () => openChartTrack(item, row));
      els.chartList.appendChild(row);
    });
  }

  async function openChartTrack(item, row) {
    if (row.classList.contains('resolving')) return;
    row.classList.add('resolving');
    try {
      const catalogCountry = state.chartCountry === 'global' ? 'us' : (state.chartCountry || 'mx');
      const params = new URLSearchParams({ term: `${item.name} ${item.artistName}`, media: 'music', entity: 'song', limit: '10', country: catalogCountry.toUpperCase() });
      const response = await fetch(`https://itunes.apple.com/search?${params}`);
      if (!response.ok) throw new Error(`Catalog failed ${response.status}`);
      const records = (await response.json()).results || [];
      const wantedTitle = normalizeText(item.name);
      const wantedArtist = normalizeText(item.artistName);
      const best = records.sort((a, b) => {
        const score = record => (normalizeText(record.trackName) === wantedTitle ? 8 : 0) + (normalizeText(record.artistName).includes(wantedArtist) ? 6 : 0);
        return score(b) - score(a);
      })[0];
      const track = best ? normalizeAppleTrack(best) : {
        id: item.id,
        title: item.name,
        artist: item.artistName,
        album: item.name,
        artworkUrl: item.artworkUrl100,
        trackViewUrl: item.url,
        genre: item.genres?.[0]?.name || '',
        releaseDate: item.releaseDate || '',
        previewUrl: '', durationMs: 0,
      };
      row.classList.remove('resolving');
      selectTrack(track, row);
    } catch (error) {
      console.error(error);
      showToast('No pude abrir esta entrada del chart.');
      row.classList.remove('resolving');
    }
  }

  function openSearch(focus = true) {
    els.searchOverlay.classList.add('open');
    els.searchOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (focus) setTimeout(() => els.searchInput.focus(), 250);
  }

  function closeSearch() {
    els.searchOverlay.classList.remove('open');
    els.searchOverlay.setAttribute('aria-hidden', 'true');
    if (!els.playerOverlay.classList.contains('open')) document.body.style.overflow = '';
  }

  function openPlayer(sourceElement = null) {
    els.playerOverlay.classList.remove('closing', 'playing', 'paused', 'ended', 'background-ready', 'lyrics-ready');
    els.playerOverlay.classList.add('phase-loading');
    els.playerOverlay.classList.toggle('cinema-active', state.lyricMode === 'cinematic');
    els.endCredits.setAttribute('aria-hidden', 'true');
    els.playerOverlay.classList.add('open');
    els.playerOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (sourceElement) animateTrackPortal(state.currentTrack, sourceElement);
  }

  function closePlayer() {
    els.playerOverlay.classList.add('closing');
    els.playerOverlay.setAttribute('aria-hidden', 'true');
    stopLyricPlayback(false);
    els.audio.pause();
    state.audioSync = false;
    els.previewPlayer.classList.remove('playing');
    setTheme(themes[state.themeIndex] || themes[0]);
    setTimeout(() => {
      els.playerOverlay.classList.remove('open', 'closing', 'playing', 'paused', 'ended', 'phase-loading', 'background-ready', 'lyrics-ready');
      document.body.style.overflow = '';
    }, state.motion ? 520 : 0);
  }

  function returnFromPlayer() {
    if (!els.playerOverlay.classList.contains('open')) return;
    const hasResults = state.returnToResults && state.results.length > 0;
    closePlayer();
    setTimeout(() => {
      if (hasResults) openSearch(false);
      else switchView(state.currentView || 'discover');
    }, state.motion ? 540 : 10);
  }

  function animateTrackPortal(track, sourceElement) {
    const rect = sourceElement.getBoundingClientRect();
    const portal = document.createElement('div');
    portal.className = 'track-portal';
    portal.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    portal.innerHTML = `<img src="${escapeAttr(upscaleArtwork(track.artworkUrl, 600))}" alt=""><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span>`;
    document.body.appendChild(portal);
    requestAnimationFrame(() => portal.classList.add('traveling'));
    setTimeout(() => portal.remove(), state.motion ? 880 : 0);
  }

  function runSearch(query) {
    openSearch();
    els.searchInput.value = query;
    setTimeout(() => searchMusic(query), 180);
  }

  async function searchMusic(query) {
    state.searchController?.abort();
    state.searchController = new AbortController();
    const controller = state.searchController;
    setLoading(true);
    els.resultsTitle.textContent = `“${query}”`;
    els.resultsEyebrow.textContent = state.filter === 'all' ? 'RESULTADOS VIVOS' : `FILTRO · ${filterLabel(state.filter)}`;

    try {
      let results;
      if (hasLocalApi()) {
        const params = new URLSearchParams({ q: query, filter: state.filter, limit: '24' });
        const response = await fetch(`./api/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search failed ${response.status}`);
        const data = await response.json();
        results = Array.isArray(data.results) ? data.results : [];
      } else {
        results = await directAppleSearch(query, controller.signal);
      }
      state.results = results;
      renderResults(state.results);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      try {
        const direct = await directAppleSearch(query, controller.signal);
        state.results = direct;
        renderResults(direct);
      } catch (fallbackError) {
        if (fallbackError.name === 'AbortError') return;
        console.error(fallbackError);
        renderResults([]);
        showToast('El catálogo no respondió. Revisa tu conexión e inténtalo otra vez.');
      }
    } finally {
      if (state.searchController === controller) setLoading(false);
    }
  }

  async function directAppleSearch(query, signal) {
    const attribute = state.filter === 'artist' ? 'artistTerm' : state.filter === 'album' ? 'albumTerm' : state.filter === 'song' ? 'songTerm' : '';
    const params = new URLSearchParams({ term: query, media: 'music', entity: 'song', limit: '24', country: 'MX' });
    if (attribute) params.set('attribute', attribute);
    const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal });
    if (!response.ok) throw new Error(`Apple catalog failed ${response.status}`);
    const data = await response.json();
    return (data.results || []).map(normalizeAppleTrack);
  }

  function renderResults(results) {
    els.resultsGrid.innerHTML = '';
    els.resultEmpty.hidden = results.length > 0;
    els.resultsCount.textContent = results.length ? `${results.length} coincidencias` : 'Sin coincidencias';
    $('#searchCount').textContent = results.length || '∞';

    results.forEach((track, index) => {
      const card = document.createElement('button');
      card.className = 'result-card tilt-card';
      card.style.animationDelay = `${Math.min(index * 30, 300)}ms`;
      card.innerHTML = `
        <div class="result-art">
          <img src="${escapeAttr(upscaleArtwork(track.artworkUrl))}" alt="Portada de ${escapeHtml(track.album || track.title)}" loading="lazy" />
          <span class="result-type">${state.filter === 'album' ? 'ÁLBUM' : state.filter === 'artist' ? 'ARTISTA' : 'CANCIÓN'}</span>
          <span class="result-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
        </div>
        <span class="result-copy">
          <strong>${escapeHtml(track.title)}</strong>
          <span>${escapeHtml(track.artist)}</span>
          <small>${escapeHtml(track.album || 'Álbum desconocido')}</small>
        </span>`;
      card.addEventListener('click', () => selectTrack(track, card));
      els.resultsGrid.appendChild(card);
    });
    initTilt(els.resultsGrid);
  }

  async function selectTrack(track, sourceElement = null) {
    state.lyricsController?.abort();
    state.lyricsController = new AbortController();
    const controller = state.lyricsController;
    stopLyricPlayback();
    els.audio.pause();
    state.currentTrack = track;
    state.lyrics = [];
    state.plainLyrics = '';
    state.lyricTime = 0;
    state.activeLyricIndex = -1;
    state.audioSync = false;
    state.syncAnchor = 0;
    state.returnToResults = els.searchOverlay.classList.contains('open');
    state.backgroundReady = false;
    state.lyricsReady = false;
    state.cinemaEnded = false;
    updateFavoriteButton();
    renderTrackMeta(track);
    applyTrackTheme(track).finally(() => {
      if (state.currentTrack !== track) return;
      state.backgroundReady = true;
      els.playerOverlay.classList.add('background-ready');
      els.cinemaLoaderText.textContent = 'La escena encontró su luz';
      revealCinemaWhenReady();
    });
    closeSearch();
    openPlayer(sourceElement);
    els.lyricsLoading.hidden = false;
    $('.lyrics-loading p').textContent = 'Escuchando las palabras…';
    clearTimeout(state.lyricsMessageTimer);
    state.lyricsMessageTimer = setTimeout(() => {
      if (state.lyricsController === controller && !els.lyricsLoading.hidden) {
        $('.lyrics-loading p').textContent = 'Afinando la versión exacta de esta canción…';
      }
    }, 6500);
    els.lyricsContent.innerHTML = '';
    $('#lyricsBadge').innerHTML = '<i></i> BUSCANDO LETRAS';
    els.cinemaLoaderText.textContent = 'Preparando la escena…';

    addToHistory(track);

    const cacheKey = trackId(track);
    if (state.lyricsCache.has(cacheKey)) {
      consumeLyrics(state.lyricsCache.get(cacheKey));
      return;
    }

    try {
      const params = new URLSearchParams({
        track: track.title,
        artist: track.artist,
        album: track.album || '',
        duration: String(Math.round((track.durationMs || 0) / 1000)),
      });
      let data;
      if (hasLocalApi()) {
        const response = await fetch(`./api/lyrics?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Proxy lyrics request failed');
        data = await response.json();
      } else {
        data = await directLyricsSearch(track, controller.signal);
      }
      if (state.lyricsController === controller) {
        state.lyricsCache.set(cacheKey, data);
        consumeLyrics(data);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      try {
        const data = await directLyricsSearch(track, controller.signal);
        if (state.lyricsController === controller) {
          state.lyricsCache.set(cacheKey, data);
          consumeLyrics(data);
        }
      } catch (fallbackError) {
        if (fallbackError.name === 'AbortError') return;
        console.error(fallbackError);
        if (state.lyricsController === controller) consumeLyrics(null);
      }
    }
  }

  function consumeLyrics(data) {
    clearTimeout(state.lyricsMessageTimer);
    els.lyricsLoading.hidden = true;
    if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
      $('#lyricsBadge').innerHTML = '<i style="background:#ff786e;box-shadow:0 0 10px #ff786e"></i> SIN LETRA DISPONIBLE';
      state.plainLyrics = '';
      state.lyrics = [
        { time: 0, text: 'Esta letra todavía no está disponible.' },
        { time: 4, text: 'Prueba otra versión de la canción' },
        { time: 8, text: 'o vuelve a buscarla por artista y álbum.' },
      ];
      state.lyricDuration = 13;
      $('#lyricsKicker').textContent = 'SIN LETRA · MODO AMBIENTE';
      $('#lyricsHeading').textContent = 'La portada todavía puede contar una historia.';
      renderLyrics();
      state.lyricsReady = true;
      revealCinemaWhenReady();
      return;
    }

    $('#lyricsBadge').innerHTML = `<i></i> ${data.syncedLyrics ? 'LETRA SINCRONIZADA' : 'LETRA COMPLETA'}`;
    $('#lyricsKicker').textContent = data.syncedLyrics ? 'TIEMPOS LRC · ESCENA CINÉTICA' : 'LETRA COMPLETA · RITMO ESTIMADO';
    $('#lyricsHeading').textContent = data.syncedLyrics ? 'Cada línea entra exactamente a tiempo.' : 'Lyra convierte el texto en un pulso visual.';
    state.plainLyrics = data.plainLyrics || stripLrc(data.syncedLyrics || '');
    state.lyrics = data.syncedLyrics ? parseLrc(data.syncedLyrics) : plainToTimed(data.plainLyrics || '');
    state.lyricDuration = Math.max(
      state.lyrics.at(-1)?.time + 5 || 0,
      Number(data.duration || 0),
      Math.round((state.currentTrack?.durationMs || 0) / 1000),
      30
    );
    renderLyrics();
    state.lyricsReady = true;
    revealCinemaWhenReady();
  }

  function revealCinemaWhenReady() {
    if (!state.backgroundReady || !state.lyricsReady) return;
    setTimeout(() => {
      if (!els.playerOverlay.classList.contains('open')) return;
      els.playerOverlay.classList.remove('phase-loading');
      els.playerOverlay.classList.add('lyrics-ready', 'paused');
      els.cinemaLoaderText.textContent = 'Escena lista';
    }, state.motion ? 620 : 0);
  }

  async function directLyricsSearch(track, signal) {
    const duration = Math.round((track.durationMs || 0) / 1000);
    if (track.album && duration) {
      const exact = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist,
        album_name: track.album,
        duration: String(duration),
      });
      const cached = await fetch(`https://lrclib.net/api/get-cached?${exact}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (cached.ok) return cached.json();
      if (cached.status !== 404) throw new Error(`Lyrics cache failed ${cached.status}`);
    }
    const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
    if (track.album) params.set('album_name', track.album);
    const response = await fetch(`https://lrclib.net/api/search?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Lyrics provider failed ${response.status}`);
    return pickBestLyrics(await response.json(), track);
  }

  function renderTrackMeta(track) {
    const artwork = $('#playerArtwork');
    artwork.crossOrigin = 'anonymous';
    artwork.src = upscaleArtwork(track.artworkUrl, 900);
    artwork.alt = `Portada de ${track.album || track.title}`;
    $('#playerTitle').textContent = track.title;
    $('#playerArtist').textContent = track.artist;
    $('#playerAlbum').textContent = track.album ? track.album.toUpperCase() : 'SINGLE';
    $('#playerYear').textContent = track.releaseDate ? String(track.releaseDate).slice(0, 4) : '—';
    $('#playerGenre').textContent = track.genre || 'Música';
    $('#playerDuration').textContent = track.durationMs ? formatTime(track.durationMs / 1000) : '—:—';
    $('#endTrackTitle').textContent = `${track.title} · ${track.artist}`;
    const external = $('#externalLink');
    external.href = track.trackViewUrl || '#';
    external.hidden = !track.trackViewUrl || track.trackViewUrl === '#';
    els.audio.pause();
    els.audio.removeAttribute('src');
    if (track.previewUrl) els.audio.src = track.previewUrl;
    els.audio.load();
    $('#previewPlayer').style.display = track.previewUrl ? 'flex' : 'none';
    els.previewFill.style.width = '0%';
    els.previewTime.textContent = '0:00';
    els.previewDuration.textContent = '0:30';
    els.previewLabel.textContent = 'FRAGMENTO · TOCA UNA LÍNEA PARA ALINEAR';
    els.syncState.innerHTML = '<i></i> PULSO VISUAL';
  }

  function renderLyrics() {
    els.lyricsContent.innerHTML = '';
    state.lyricElements = [];
    state.activeLyricIndex = -1;
    els.lyricsContent.classList.toggle('full-mode', state.lyricMode === 'full');
    els.lyricsContent.classList.toggle('flow-mode', state.lyricMode === 'flow');
    els.lyricsContent.classList.toggle('cinematic-mode', state.lyricMode === 'cinematic');
    state.lyrics.forEach((line, index) => {
      const button = document.createElement('button');
      button.className = 'lyric-line';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', line.text || 'Pausa musical');
      const words = String(line.text || '♪').split(/\s+/).filter(Boolean);
      button.innerHTML = words.map((word, wordIndex) =>
        `<span class="lyric-token" style="--token:${wordIndex};--tokens:${words.length}">${escapeHtml(word)}</span>`
      ).join('');
      button.addEventListener('click', () => {
        state.lyricTime = line.time;
        if (!els.audio.paused) {
          state.syncAnchor = line.time - els.audio.currentTime;
          state.audioSync = true;
          els.syncState.innerHTML = '<i></i> ALINEACIÓN ACTIVA';
          els.previewLabel.textContent = 'FRAGMENTO · ALINEACIÓN ACTIVA';
          showToast('Letra alineada desde esta línea');
        }
        updateLyricUI(true);
      });
      els.lyricsContent.appendChild(button);
      state.lyricElements.push(button);
    });
    els.lyricScrubber.value = '0';
    els.lyricScrubber.style.setProperty('--progress', '0%');
    els.lyricTotal.textContent = `/ ${formatTime(state.lyricDuration)}`;
    updateLyricUI(true);
  }

  function parseLrc(lrc) {
    const lines = [];
    for (const raw of String(lrc).split(/\r?\n/)) {
      const matches = [...raw.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
      const text = raw.replace(/\[[^\]]+\]/g, '').trim();
      matches.forEach(match => {
        lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: text || '♪' });
      });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function plainToTimed(plain) {
    const lines = String(plain).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const estimatedDuration = Math.max(30, Math.round((state.currentTrack?.durationMs || 180000) / 1000));
    const step = estimatedDuration / Math.max(lines.length, 1);
    return lines.map((text, index) => ({ time: index * step, text }));
  }

  function updateLyricUI(forceScroll = false) {
    if (!state.lyrics.length) return;
    let activeIndex = 0;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (state.lyrics[i].time <= state.lyricTime) activeIndex = i;
      else break;
    }

    if (activeIndex !== state.activeLyricIndex) {
      state.lyricElements.forEach((line, index) => {
        line.classList.toggle('active', index === activeIndex);
        line.classList.toggle('past', index < activeIndex);
        line.classList.toggle('upcoming', index > activeIndex);
      });
      state.activeLyricIndex = activeIndex;
      const current = state.lyrics[activeIndex]?.text || '♪';
      const next = state.lyrics[activeIndex + 1]?.text || '';
      els.lyricEcho.innerHTML = `<strong>${escapeHtml(current)}</strong>${next ? `<span>${escapeHtml(next)}</span>` : ''}`;
    }

    const nextTime = state.lyrics[activeIndex + 1]?.time || Math.min(state.lyricDuration, state.lyrics[activeIndex].time + 5);
    const lineSpan = Math.max(.4, nextTime - state.lyrics[activeIndex].time);
    const lineProgress = Math.max(0, Math.min(1, (state.lyricTime - state.lyrics[activeIndex].time) / lineSpan));
    const activeLine = state.lyricElements[activeIndex];
    if (activeLine) {
      const tokens = $$('.lyric-token', activeLine);
      tokens.forEach((token, index) => {
        const tokenStart = index / Math.max(tokens.length, 1);
        const tokenEnd = (index + 1) / Math.max(tokens.length, 1);
        const progress = Math.max(0, Math.min(1, (lineProgress - tokenStart) / Math.max(tokenEnd - tokenStart, .01)));
        token.style.setProperty('--fill', `${progress * 100}%`);
        token.classList.toggle('sung', progress >= .98);
        token.classList.toggle('singing', progress > 0 && progress < .98);
      });
      activeLine.style.setProperty('--line-progress', lineProgress.toFixed(3));
    }

    const active = state.lyricElements[activeIndex];
    if (active && (forceScroll || state.lyricPlaying || state.audioSync) && state.lyricMode === 'flow') {
      const target = active.offsetTop - els.lyricsViewport.clientHeight / 2 + active.offsetHeight / 2;
      els.lyricsViewport.scrollTo({ top: Math.max(0, target), behavior: state.motion ? 'smooth' : 'auto' });
    }

    const progress = state.lyricDuration ? Math.min(100, state.lyricTime / state.lyricDuration * 100) : 0;
    els.lyricScrubber.value = String(progress);
    els.lyricScrubber.style.setProperty('--progress', `${progress}%`);
    els.lyricTime.textContent = formatTime(state.lyricTime);
    updateBeatVisual(state.lyricTime);

    if (state.lyricTime >= state.lyricDuration && state.lyricPlaying) finishCinema();
  }

  function toggleLyricPlayback() {
    if (state.cinemaEnded) return replayExperience();
    state.lyricPlaying ? stopLyricPlayback(true) : startLyricPlayback();
  }

  function startLyricPlayback() {
    if (!state.lyrics.length) return;
    if (!els.audio.paused) els.audio.pause();
    if (state.lyricTime >= state.lyricDuration) state.lyricTime = 0;
    state.lyricPlaying = true;
    state.audioSync = false;
    state.cinemaEnded = false;
    els.playerOverlay.classList.remove('paused', 'ended', 'phase-loading');
    els.playerOverlay.classList.add('playing');
    els.endCredits.setAttribute('aria-hidden', 'true');
    els.syncState.innerHTML = '<i></i> PULSO VISUAL';
    els.lyricTimeline.classList.add('playing');
    let previous = performance.now();
    const tick = now => {
      if (!state.lyricPlaying) return;
      state.lyricTime += (now - previous) / 1000;
      previous = now;
      updateLyricUI();
      state.lyricTimer = requestAnimationFrame(tick);
    };
    state.lyricTimer = requestAnimationFrame(tick);
  }

  function stopLyricPlayback(presentPause = true) {
    state.lyricPlaying = false;
    els.lyricTimeline.classList.remove('playing');
    if (state.lyricTimer) cancelAnimationFrame(state.lyricTimer);
    state.lyricTimer = null;
    if (presentPause && els.playerOverlay.classList.contains('open') && !state.cinemaEnded) {
      els.playerOverlay.classList.remove('playing');
      els.playerOverlay.classList.add('paused');
    }
  }

  function finishCinema() {
    stopLyricPlayback(false);
    state.cinemaEnded = true;
    state.lyricTime = state.lyricDuration;
    els.playerOverlay.classList.remove('playing', 'paused');
    els.playerOverlay.classList.add('ended');
    els.endCredits.setAttribute('aria-hidden', 'false');
    setTheme(themes[state.themeIndex] || themes[0]);
    updateLyricUI(false);
  }

  function replayExperience() {
    state.cinemaEnded = false;
    state.lyricTime = 0;
    state.activeLyricIndex = -1;
    els.playerOverlay.classList.remove('ended');
    els.playerOverlay.classList.add('paused');
    els.endCredits.setAttribute('aria-hidden', 'true');
    applyTrackTheme(state.currentTrack);
    updateLyricUI(true);
    setTimeout(startLyricPlayback, state.motion ? 420 : 0);
  }

  function updateBeatVisual(time) {
    if (!els.beatStage || (!state.lyricPlaying && els.audio.paused)) return;
    if (state.audioAnalyser && state.audioData && !els.audio.paused) state.audioAnalyser.getByteFrequencyData(state.audioData);
    const audioEnergy = els.audio.paused ? 0 : .18 + Math.abs(Math.sin(els.audio.currentTime * 5.6)) * .58;
    $$('#beatStage i').forEach((bar, index) => {
      const wave = Math.abs(Math.sin(time * (2.1 + index % 5 * .13) + index * .72));
      const kick = Math.pow(Math.max(0, Math.sin(time * 3.25 - index * .08)), 6);
      const liveBin = state.audioData?.length ? state.audioData[Math.floor(index / 36 * state.audioData.length)] / 255 : 0;
      const energy = Math.min(1, .08 + wave * .24 + kick * .62 + audioEnergy * .2 + liveBin * .72);
      bar.style.setProperty('--beat', energy.toFixed(3));
    });
  }

  async function ensureAudioAnalyser() {
    try {
      if (state.audioContext) {
        if (state.audioContext.state === 'suspended') await state.audioContext.resume();
        return;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      state.audioContext = new AudioContextClass();
      const source = state.audioContext.createMediaElementSource(els.audio);
      state.audioAnalyser = state.audioContext.createAnalyser();
      state.audioAnalyser.fftSize = 128;
      state.audioAnalyser.smoothingTimeConstant = .76;
      state.audioData = new Uint8Array(state.audioAnalyser.frequencyBinCount);
      source.connect(state.audioAnalyser);
      state.audioAnalyser.connect(state.audioContext.destination);
    } catch {
      state.audioContext = null;
      state.audioAnalyser = null;
      state.audioData = null;
    }
  }

  function togglePreview() {
    if (!state.currentTrack?.previewUrl) return;
    if (els.audio.paused) {
      stopLyricPlayback();
      state.syncAnchor = state.lyricTime - els.audio.currentTime;
      els.audio.play().then(() => els.previewPlayer.classList.add('playing')).catch(() => showToast('El navegador bloqueó el audio. Toca otra vez.'));
    } else {
      els.audio.pause();
      els.previewPlayer.classList.remove('playing');
    }
  }

  function updatePreviewProgress() {
    const duration = els.audio.duration || 30;
    const progress = Math.min(100, els.audio.currentTime / duration * 100);
    els.previewFill.style.width = `${progress}%`;
    els.previewTime.textContent = formatTime(els.audio.currentTime);
    els.previewDuration.textContent = formatTime(duration);
    if (!els.audio.paused && state.audioSync) {
      state.lyricTime = Math.max(0, Math.min(state.lyricDuration, state.syncAnchor + els.audio.currentTime));
      updateLyricUI();
    }
  }

  function beginAudioSync() {
    ensureAudioAnalyser();
    state.audioSync = true;
    els.playerOverlay.classList.remove('paused');
    els.playerOverlay.classList.add('playing');
    state.syncAnchor = state.lyricTime - els.audio.currentTime;
    els.previewPlayer.classList.add('playing');
    els.syncState.innerHTML = '<i></i> FRAGMENTO EN VIVO';
  }

  function endAudioSync() {
    state.audioSync = false;
    els.previewPlayer.classList.remove('playing');
    if (!state.lyricPlaying && !state.cinemaEnded) {
      els.playerOverlay.classList.remove('playing');
      els.playerOverlay.classList.add('paused');
    }
    els.syncState.innerHTML = '<i></i> PULSO VISUAL';
    els.previewLabel.textContent = 'FRAGMENTO · TOCA UNA LÍNEA PARA ALINEAR';
  }

  async function applyTrackTheme(track) {
    const fallback = paletteFromString(`${track.title}${track.artist}${track.album}`);
    setPlayerPalette(fallback, track.artworkUrl);
    const image = $('#playerArtwork');
    try {
      if (!image.complete) await Promise.race([
        new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        }),
        new Promise(resolve => setTimeout(resolve, 3800)),
      ]);
      const palette = extractArtworkPalette(image);
      if (state.currentTrack === track && palette) setPlayerPalette(palette, track.artworkUrl);
    } catch {
      // Cross-origin or unavailable artwork: the deterministic fallback remains active.
    }
  }

  function setPlayerPalette(palette, artworkUrl = '') {
    document.documentElement.style.setProperty('--accent', palette[0]);
    document.documentElement.style.setProperty('--accent-2', palette[1]);
    document.documentElement.style.setProperty('--accent-3', palette[2]);
    els.playerOverlay.style.setProperty('--player-a', palette[0]);
    els.playerOverlay.style.setProperty('--player-b', palette[1]);
    els.playerOverlay.style.setProperty('--player-c', palette[2]);
    const art = upscaleArtwork(artworkUrl, 900);
    els.playerOverlay.style.setProperty('--player-art', art ? `url("${String(art).replace(/["\\]/g, '\\$&')}")` : 'none');
    const themeColor = toHexColor(palette[1]) || '#090810';
    $('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }

  function extractArtworkPalette(image) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 36;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 36, 36);
    const data = context.getImageData(0, 0, 36, 36).data;
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 220) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const light = (max + min) / 510;
      const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
      if (light < .08 || light > .94 || saturation < .12) continue;
      const hue = rgbHue(r, g, b);
      const key = Math.round(hue / 32) % 12;
      const weight = .3 + saturation * 1.5 + (1 - Math.abs(light - .52)) * .5;
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, weight: 0, score: 0 };
      bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
      bucket.weight += weight; bucket.score += weight;
      buckets.set(key, bucket);
    }
    const colors = [...buckets.values()].sort((a, b) => b.score - a.score).slice(0, 3)
      .map(bucket => {
        const rgb = [bucket.r, bucket.g, bucket.b].map(value => Math.round(value / bucket.weight));
        return boostRgb(rgb);
      });
    if (!colors.length) return null;
    while (colors.length < 3) colors.push(rotateRgb(colors[0], colors.length * 58));
    return colors.map(rgb => `rgb(${rgb.join(' ')})`);
  }

  function rgbHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  function boostRgb([r, g, b]) {
    const max = Math.max(r, g, b);
    const lift = max < 155 ? 155 / Math.max(max, 1) : 1;
    return [r, g, b].map(value => Math.min(255, Math.round(value * lift + 12)));
  }

  function rotateRgb(rgb, degrees) {
    const [r, g, b] = rgb;
    const hue = (rgbHue(r, g, b) + degrees) % 360;
    return hslToRgb(hue / 360, .78, .62);
  }

  function hslToRgb(h, s, l) {
    const hueToRgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)].map(v => Math.round(v * 255));
  }

  function toHexColor(value) {
    const match = String(value).match(/rgb\((\d+)\D+(\d+)\D+(\d+)/i);
    return match ? `#${[match[1], match[2], match[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')}` : null;
  }

  function paletteFromString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return [`hsl(${hue} 92% 63%)`, `hsl(${(hue + 56) % 360} 90% 65%)`, `hsl(${(hue + 135) % 360} 92% 62%)`];
  }

  function setTheme(theme) {
    document.documentElement.style.setProperty('--accent', theme[0]);
    document.documentElement.style.setProperty('--accent-2', theme[1]);
    document.documentElement.style.setProperty('--accent-3', theme[2]);
    document.documentElement.style.setProperty('--lime', theme[3]);
    $('meta[name="theme-color"]')?.setAttribute('content', theme[1]);
    if ($('#moodLabel')) $('#moodLabel').textContent = theme[4];
    $$('.environment-presets [data-theme]').forEach(button => button.classList.toggle('active', Number(button.dataset.theme) === state.themeIndex));
  }

  function cycleTheme() {
    state.themeIndex = (state.themeIndex + 1) % themes.length;
    localStorage.setItem('lyra:theme', String(state.themeIndex));
    setTheme(themes[state.themeIndex]);
    $('#moodOrb').animate([{ transform: 'scale(.88) rotate(-10deg)' }, { transform: 'scale(1.08) rotate(6deg)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  function setMotion(enabled) {
    state.motion = enabled;
    localStorage.setItem('lyra:motion', enabled ? 'on' : 'off');
    document.body.classList.toggle('reduce-motion', !enabled);
    $('.mini-switch').classList.toggle('on', enabled);
    window.dispatchEvent(new CustomEvent('lyra:motion', { detail: enabled }));
  }

  function openDemoTrack() {
    const art = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900">
        <defs>
          <radialGradient id="g" cx="28%" cy="22%" r="90%">
            <stop offset="0" stop-color="#fff58f"/>
            <stop offset=".25" stop-color="#ff4ecd"/>
            <stop offset=".62" stop-color="#6336e8"/>
            <stop offset="1" stop-color="#071326"/>
          </radialGradient>
          <filter id="b"><feGaussianBlur stdDeviation="24"/></filter>
        </defs>
        <rect width="900" height="900" fill="url(#g)"/>
        <circle cx="660" cy="240" r="230" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>
        <circle cx="660" cy="240" r="170" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="35"/>
        <path d="M-80 690C180 420 350 960 650 640S980 470 1030 660" fill="none" stroke="#68efff" stroke-width="85" stroke-linecap="round" opacity=".66" filter="url(#b)"/>
        <text x="70" y="690" fill="white" font-family="Arial,sans-serif" font-size="118" font-weight="800" letter-spacing="-7">ALIVE</text>
        <text x="78" y="750" fill="white" fill-opacity=".75" font-family="Arial,sans-serif" font-size="25" letter-spacing="8">LYRA ORIGINAL DEMO</text>
      </svg>`)} `;
    const demoTrack = {
      id: 'lyra-original-alive',
      title: 'Alive in Color',
      artist: 'Lyra Original',
      album: 'A Screen That Sings',
      artworkUrl: art.trim(),
      previewUrl: '',
      durationMs: 52000,
      trackViewUrl: '#',
    };
    state.currentTrack = demoTrack;
    state.lyrics = [];
    state.plainLyrics = [
      'The room was quiet until the colors learned my name',
      'A violet rhythm crossed the glass and woke the frame',
      'Every word became a pulse, every pause became a light',
      'I did not only hear the song — I watched it come alive',
      'Let the letters lose their gravity',
      'Let the silence bloom in blue',
      'There is a universe inside a melody',
      'And tonight it opens up for you',
    ].join('\n');
    renderTrackMeta(demoTrack);
    applyTrackTheme(demoTrack);
    updateFavoriteButton();
    openPlayer();
    els.lyricsLoading.hidden = true;
    $('#lyricsBadge').innerHTML = '<i></i> DEMO ORIGINAL SINCRONIZADA';
    state.lyrics = [
      { time: 0, text: 'The room was quiet' },
      { time: 4, text: 'until the colors learned my name' },
      { time: 9, text: 'A violet rhythm crossed the glass' },
      { time: 14, text: 'and woke the frame' },
      { time: 18, text: 'Every word became a pulse' },
      { time: 23, text: 'every pause became a light' },
      { time: 28, text: 'I did not only hear the song' },
      { time: 34, text: 'I watched it come alive' },
      { time: 39, text: 'Let the letters lose their gravity' },
      { time: 44, text: 'There is a universe inside a melody' },
      { time: 49, text: 'and tonight it opens up for you' },
    ];
    state.lyricDuration = 54;
    renderLyrics();
    addToHistory(demoTrack);
    setTimeout(startLyricPlayback, 450);
  }

  function surpriseMe() {
    const choices = ['Michael Jackson Smooth Criminal', 'Daft Punk Get Lucky', 'Adele Hello', 'Queen Somebody To Love', 'Coldplay Adventure of a Lifetime', 'Billie Eilish bad guy'];
    runSearch(choices[Math.floor(Math.random() * choices.length)]);
  }

  function switchView(view) {
    state.currentView = view;
    $$('.view').forEach(section => section.classList.remove('active-view'));
    $(`#${view}View`)?.classList.add('active-view');
    $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if (view !== 'discover') renderLibraries();
  }

  function toggleFavorite() {
    if (!state.currentTrack) return;
    const id = trackId(state.currentTrack);
    const index = state.favorites.findIndex(track => trackId(track) === id);
    if (index >= 0) {
      state.favorites.splice(index, 1);
      showToast('Eliminada de favoritos');
    } else {
      state.favorites.unshift(state.currentTrack);
      state.favorites = state.favorites.slice(0, 40);
      showToast('Guardada en favoritos ♡');
    }
    writeStore('lyra:favorites', state.favorites);
    updateFavoriteButton();
    renderLibraries();
  }

  function updateFavoriteButton() {
    const isFavorite = state.currentTrack && state.favorites.some(track => trackId(track) === trackId(state.currentTrack));
    els.favoriteBtn.classList.toggle('active', Boolean(isFavorite));
  }

  function addToHistory(track) {
    const id = trackId(track);
    state.history = [track, ...state.history.filter(item => trackId(item) !== id)].slice(0, 30);
    writeStore('lyra:history', state.history);
    renderLibraries();
  }

  function renderLibraries() {
    renderLibrary(state.favorites, els.favoritesGrid, els.favoritesEmpty, true);
    renderLibrary(state.history, els.historyGrid, els.historyEmpty, false);
  }

  function renderLibrary(items, grid, empty, canRemove) {
    grid.innerHTML = '';
    empty.style.display = items.length ? 'none' : 'grid';
    items.forEach(track => {
      const card = document.createElement('article');
      card.className = 'library-card';
      card.innerHTML = `
        <img src="${escapeAttr(upscaleArtwork(track.artworkUrl, 600))}" alt="${escapeAttr(track.album || track.title)}" loading="lazy">
        ${canRemove ? '<button aria-label="Quitar de favoritos">×</button>' : ''}
        <div class="library-card-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div>`;
      card.addEventListener('click', event => {
        if (event.target.closest('button')) return;
        selectTrack(track, card);
      });
      const remove = $('button', card);
      if (remove) remove.addEventListener('click', () => {
        state.favorites = state.favorites.filter(item => trackId(item) !== trackId(track));
        writeStore('lyra:favorites', state.favorites);
        renderLibraries();
      });
      grid.appendChild(card);
    });
  }

  async function copyLyrics() {
    const text = state.plainLyrics || state.lyrics.map(line => line.text).join('\n');
    if (!text) return showToast('No hay letra para copiar.');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Letra copiada al portapapeles');
    } catch {
      showToast('No se pudo copiar en este navegador.');
    }
  }

  function changeFont(delta) {
    state.fontScale = Math.max(.78, Math.min(1.34, state.fontScale + delta));
    document.documentElement.style.setProperty('--font-scale', state.fontScale.toFixed(2));
  }

  function setLoading(loading) {
    els.loadingState.hidden = !loading;
    els.resultEmpty.hidden = loading || state.results.length > 0;
    if (loading) els.resultsGrid.innerHTML = '';
  }

  function showToast(message) {
    $('span', els.toast).textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  function filterLabel(value) {
    return ({ song: 'CANCIÓN', artist: 'ARTISTA', album: 'ÁLBUM' })[value] || 'TODO';
  }

  function normalizeAppleTrack(item) {
    return {
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
    };
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function pickBestLyrics(records, track) {
    if (!Array.isArray(records) || !records.length) return null;
    const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').trim();
    const wantedTitle = normalize(track.title);
    const wantedArtist = normalize(track.artist);
    return records.sort((a, b) => {
      const score = record => {
        let value = 0;
        if (normalize(record.trackName) === wantedTitle) value += 5;
        if (normalize(record.artistName).includes(wantedArtist) || wantedArtist.includes(normalize(record.artistName))) value += 4;
        if (record.syncedLyrics) value += 2;
        if (record.plainLyrics) value += 1;
        return value;
      };
      return score(b) - score(a);
    })[0];
  }

  function trackId(track) { return String(track.id || `${track.artist}|${track.title}|${track.album}`).toLowerCase(); }
  function hasLocalApi() { return ['localhost', '127.0.0.1', '::1'].includes(location.hostname); }
  function upscaleArtwork(url, size = 700) { return String(url || '').replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`); }
  function stripLrc(value) { return String(value).replace(/\[[^\]]+\]/g, '').replace(/^\s+|\s+$/gm, '').trim(); }
  function formatTime(seconds) { const s = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }
  function escapeAttr(value) { return escapeHtml(value); }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function initTilt(root = document) {
    if (!state.motion && root !== document) return;
    $$('.tilt-card', root).forEach(card => {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = '1';
      card.addEventListener('pointermove', event => {
        if (!state.motion || window.innerWidth < 820) return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = `perspective(900px) rotateX(${y * -5}deg) rotateY(${x * 7}deg) translateY(-3px)`;
      });
      card.addEventListener('pointerleave', () => card.style.transform = '');
    });
  }

  function initMagnetic() {
    $$('.magnetic').forEach(button => {
      button.addEventListener('pointermove', event => {
        if (!state.motion || window.innerWidth < 820) return;
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        button.style.transform = `translate(${x * .08}px,${y * .08}px)`;
      });
      button.addEventListener('pointerleave', () => button.style.transform = '');
    });
  }

  function initCarouselDrag() {
    const carousel = $('#quickCarousel');
    let down = false, startX = 0, startScroll = 0;
    carousel.addEventListener('pointerdown', event => {
      down = true; startX = event.clientX; startScroll = carousel.scrollLeft; carousel.setPointerCapture(event.pointerId);
    });
    carousel.addEventListener('pointermove', event => { if (down) carousel.scrollLeft = startScroll - (event.clientX - startX); });
    carousel.addEventListener('pointerup', () => down = false);
    carousel.addEventListener('pointercancel', () => down = false);
  }

  function initParticles() {
    const canvas = $('#particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: Math.min(55, Math.round(innerWidth / 28)) }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: Math.random() * 1.3 + .25,
        vx: (Math.random() - .5) * .14,
        vy: (Math.random() - .5) * .14,
        a: Math.random() * .5 + .1,
      }));
    };
    let frame = null;
    const draw = () => {
      frame = null;
      if (!state.motion || document.hidden) return;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = innerWidth; if (p.x > innerWidth) p.x = 0;
        if (p.y < 0) p.y = innerHeight; if (p.y > innerHeight) p.y = 0;
        ctx.beginPath(); ctx.fillStyle = `rgba(255,255,255,${p.a})`; ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    const start = () => {
      if (state.motion && !document.hidden && !frame) frame = requestAnimationFrame(draw);
      if (!state.motion) ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    resize();
    addEventListener('resize', resize, { passive: true });
    addEventListener('lyra:motion', start);
    document.addEventListener('visibilitychange', start);
    start();
  }
})();
