(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const youtubeApiKey = String(window.LYRA_CONFIG?.youtubeApiKey || '').trim();

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
    previewOffset: null,
    previewOffsets: readStore('lyra:preview-offsets', {}),
    youtubePlayer: null,
    youtubeReady: false,
    youtubeSyncFrame: null,
    youtubeDuration: 0,
    youtubeTimeScale: 1,
    youtubeMatches: readStore('lyra:youtube-matches', {}),
    youtubeLookupPending: false,
    youtubeLookupTrackId: '',
    youtubeLookupToken: null,
    youtubeController: null,
    translationLanguage: localStorage.getItem('lyra:translation-language') || '',
    translationCache: readStore('lyra:translations', {}),
    translationController: null,
    translationRetryTimer: null,
    translationRetryCount: 0,
    searchController: null,
    lyricsController: null,
    lyricsCache: new Map(),
    lyricsMessageTimer: null,
    backgroundReady: false,
    lyricsReady: false,
    hasLyrics: false,
    cinemaEnded: false,
    cinemaSequenceReady: false,
    cinemaSequenceTimers: [],
    beatFrame: null,
    beatBars: [],
    beatPaintAt: 0,
    returnToResults: false,
    motion: localStorage.getItem('lyra:motion') !== 'off',
    favorites: readStore('lyra:favorites', []),
    history: readStore('lyra:history', []),
    themeIndex: Math.max(0, Math.min(4, Number(localStorage.getItem('lyra:theme')) || 0)),
    currentView: 'discover',
    performanceLite: false,
    visualFps: 36,
    browserTranslators: new Map(),
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
    previewTimelinePlay: $('#previewTimelinePlay'),
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
    mediaFallback: $('#mediaFallback'),
    youtubeSearchLink: $('#youtubeSearchLink'),
    youtubePlayerShell: $('#youtubePlayerShell'),
    youtubeState: $('#youtubeState'),
    youtubeToggle: $('#youtubeToggle'),
    translationLanguage: $('#translationLanguage'),
    cinemaIntro: $('#cinemaIntro'),
  };

  init();

  function init() {
    bindEvents();
    initPerformanceProfile();
    initParticles();
    initTilt();
    initMagnetic();
    initCarouselDrag();
    initEntry();
    initDiscovery();
    initBeatStage();
    els.translationLanguage.value = state.translationLanguage;
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
    els.translationLanguage.addEventListener('change', () => {
      state.translationLanguage = els.translationLanguage.value;
      state.translationRetryCount = 0;
      clearTimeout(state.translationRetryTimer);
      localStorage.setItem('lyra:translation-language', state.translationLanguage);
      translateCurrentLyrics();
    });

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
    els.previewTimelinePlay.addEventListener('click', togglePreview);
    els.youtubeToggle.addEventListener('click', toggleYouTubeVideo);
    els.audio.addEventListener('timeupdate', updatePreviewProgress);
    els.audio.addEventListener('loadedmetadata', updatePreviewProgress);
    els.audio.addEventListener('play', beginAudioSync);
    els.audio.addEventListener('pause', () => {
      stopBeatLoop();
      els.previewPlayer.classList.remove('playing');
      els.previewTimelinePlay.classList.remove('playing');
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
      if (state.youtubeReady && state.youtubePlayer?.seekTo && state.currentTrack?.youtubeVideoId) {
        state.youtubePlayer.seekTo(lyricToVideoTime(state.lyricTime), true);
      }
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
      if (!document.hidden) return;
      try { state.youtubePlayer?.pauseVideo?.(); } catch { /* embedded player may still be preparing */ }
      if (!els.audio.paused) els.audio.pause();
      stopLyricPlayback();
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
    const barCount = state.performanceLite ? 18 : 48;
    els.beatStage.innerHTML = Array.from({ length: barCount }, (_, index) => `<i style="--i:${index};--beat:.12"></i>`).join('');
    els.beatStage.style.setProperty('--beat-columns', String(barCount));
    state.beatBars = $$('#beatStage i');
  }

  function initPerformanceProfile() {
    const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 900;
    const largeCanvas = innerWidth * innerHeight >= 1500000;
    const constrainedHardware = Number(navigator.deviceMemory || 8) <= 4 || Number(navigator.hardwareConcurrency || 8) <= 4;
    setPerformanceLite(mobile || largeCanvas || constrainedHardware);
  }

  function setPerformanceLite(enabled) {
    state.performanceLite = Boolean(enabled);
    state.visualFps = state.performanceLite ? 24 : 36;
    document.body.classList.toggle('performance-lite', state.performanceLite);
    window.dispatchEvent(new CustomEvent('lyra:performance', { detail: state.performanceLite }));
  }

  function monitorFrameHealth() {
    if (state.performanceLite || !matchMedia('(pointer:fine)').matches) return;
    let previous = performance.now();
    let samples = 0;
    let slowFrames = 0;
    const sample = now => {
      if (!els.playerOverlay.classList.contains('open') || samples >= 90) {
        if (samples >= 60 && slowFrames / samples > .16) {
          setPerformanceLite(true);
          initBeatStage();
        }
        return;
      }
      const elapsed = now - previous;
      previous = now;
      if (elapsed > 27) slowFrames += 1;
      samples += 1;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
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
      const catalogCountry = item.catalogCountry || (state.chartCountry === 'global' ? 'us' : state.chartCountry) || 'mx';
      let exact = null;
      if (!item.catalogResolved) {
        const params = new URLSearchParams({ id: String(item.id), country: catalogCountry.toUpperCase(), entity: 'song' });
        const response = await fetchWithDeadline(`https://itunes.apple.com/lookup?${params}`, {}, 7000);
        if (response.ok) {
          const records = (await response.json()).results || [];
          exact = records.find(record => String(record.trackId) === String(item.id) && record.kind === 'song') || null;
        }
      }
      const track = exact ? normalizeAppleTrack(exact) : {
        id: item.id,
        title: item.name,
        artist: item.artistName,
        album: item.album || '',
        artworkUrl: item.artworkUrl100,
        trackViewUrl: item.trackViewUrl || item.url,
        genre: item.genre || item.genres?.[0]?.name || '',
        releaseDate: item.releaseDate || '',
        previewUrl: item.previewUrl || '',
        durationMs: Number(item.durationMs || 0),
      };
      selectTrack(track, row);
    } catch (error) {
      console.error(error);
      showToast('No pude consultar esta entrada exacta del chart.');
    } finally {
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
    clearCinemaSequence();
    els.playerOverlay.classList.remove('closing', 'playing', 'paused', 'ended', 'background-ready', 'lyrics-ready', 'no-lyrics', 'intro-presenting', 'intro-metadata', 'intro-syncing', 'intro-ready');
    els.playerOverlay.classList.add('phase-loading', 'phase-black');
    els.playerOverlay.classList.toggle('cinema-active', state.lyricMode === 'cinematic');
    els.endCredits.setAttribute('aria-hidden', 'true');
    els.playerOverlay.classList.add('open');
    els.playerOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    monitorFrameHealth();
    startCinemaSequence();
  }

  function closePlayer() {
    els.playerOverlay.classList.add('closing');
    els.playerOverlay.setAttribute('aria-hidden', 'true');
    stopLyricPlayback(false);
    els.audio.pause();
    state.audioContext?.suspend?.().catch?.(() => {});
    stopYouTubeSync();
    destroyYouTubePlayer();
    clearCinemaSequence();
    state.youtubeReady = false;
    state.audioSync = false;
    els.previewPlayer.classList.remove('playing');
    setTheme(themes[state.themeIndex] || themes[0]);
    setTimeout(() => {
      els.playerOverlay.classList.remove('open', 'closing', 'playing', 'paused', 'ended', 'phase-loading', 'phase-black', 'intro-presenting', 'intro-metadata', 'intro-syncing', 'intro-ready', 'background-ready', 'lyrics-ready');
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

  function clearCinemaSequence() {
    state.cinemaSequenceTimers.forEach(clearTimeout);
    state.cinemaSequenceTimers = [];
    state.cinemaSequenceReady = false;
  }

  function startCinemaSequence() {
    clearCinemaSequence();
    const overlay = els.playerOverlay;
    const schedule = (delay, callback) => {
      const timer = setTimeout(() => {
        if (!overlay.classList.contains('open')) return;
        callback();
      }, state.motion ? delay : Math.min(delay, 40));
      state.cinemaSequenceTimers.push(timer);
    };
    schedule(620, () => overlay.classList.add('intro-presenting'));
    schedule(1550, () => {
      overlay.classList.remove('phase-black', 'intro-presenting');
      overlay.classList.add('intro-metadata');
    });
    schedule(2350, () => {
      overlay.classList.remove('intro-metadata');
      overlay.classList.add('intro-syncing');
      els.cinemaLoaderText.textContent = 'Sincronizando letra y escena...';
    });
    schedule(3200, () => {
      overlay.classList.remove('intro-syncing');
      overlay.classList.add('intro-ready');
      state.cinemaSequenceReady = true;
      revealCinemaWhenReady();
    });
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
      const apple = await Promise.allSettled([searchAppleCatalogs(query, controller.signal)]);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const appleResults = apple[0].status === 'fulfilled' ? apple[0].value : [];
      let youtubeResults = [];
      let youtubeError = null;
      if (needsYouTubeFallback(appleResults, query)) {
        try { youtubeResults = await searchYouTube(query, controller.signal); }
        catch (error) { youtubeError = error; }
      }
      const results = mergeSearchResults(
        appleResults,
        youtubeResults,
        query
      );
      if (!results.length && apple[0].status === 'rejected' && youtubeError) {
        throw apple[0].reason || youtubeError || new Error('Search providers failed');
      }
      state.results = results;
      renderResults(state.results);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      try {
        const direct = await searchAppleCatalogs(query, controller.signal);
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
    const response = await fetchWithDeadline(`https://itunes.apple.com/search?${params}`, { signal }, 8000);
    if (!response.ok) throw new Error(`Apple catalog failed ${response.status}`);
    const data = await response.json();
    return (data.results || []).map(normalizeAppleTrack);
  }

  async function searchAppleCatalogs(query, signal) {
    const attribute = state.filter === 'artist' ? 'artistTerm' : state.filter === 'album' ? 'albumTerm' : state.filter === 'song' ? 'songTerm' : '';
    const markets = ['MX', 'US', 'ES'];
    const settled = await Promise.allSettled(markets.map(async country => {
      const params = new URLSearchParams({ term: query, media: 'music', entity: 'song', limit: '24', country });
      if (attribute) params.set('attribute', attribute);
      const response = await fetchWithDeadline(`https://itunes.apple.com/search?${params}`, { signal }, 8000);
      if (!response.ok) throw new Error(`Apple ${country} failed ${response.status}`);
      return ((await response.json()).results || []).map(item => ({ ...normalizeAppleTrack(item), source: 'apple' }));
    }));
    const byId = new Map();
    settled.forEach(result => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach(track => byId.set(trackId(track), track));
    });
    return [...byId.values()];
  }

  async function searchYouTube(query, signal, force = false) {
    if (!youtubeApiKey || (!force && state.filter === 'album')) return [];
    const requestOptions = youtubeRequestOptions(signal);
    const searchParams = new URLSearchParams({
      part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true',
      maxResults: '12', q: query, key: youtubeApiKey,
    });
    const response = await fetchWithDeadline(`https://www.googleapis.com/youtube/v3/search?${searchParams}`, requestOptions, 9000);
    if (!response.ok) throw new Error(`YouTube search failed ${response.status}`);
    const items = (await response.json()).items || [];
    const ids = items.map(item => item.id?.videoId).filter(Boolean);
    if (!ids.length) return [];
    try {
      const detailParams = new URLSearchParams({ part: 'snippet,contentDetails,status', id: ids.join(','), key: youtubeApiKey });
      const detailResponse = await fetchWithDeadline(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, requestOptions, 9000);
      if (!detailResponse.ok) throw new Error(`YouTube details failed ${detailResponse.status}`);
      const detailed = ((await detailResponse.json()).items || [])
        .filter(item => item.status?.embeddable !== false)
        .map(normalizeYouTubeTrack);
      if (detailed.length) return detailed;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      console.warn('YouTube details unavailable; using search results', error);
    }
    return items.map(normalizeYouTubeTrack).filter(track => track.youtubeVideoId);
  }

  function youtubeRequestOptions(signal) {
    return {
      signal,
      referrer: new URL('./', location.href).href,
      referrerPolicy: 'unsafe-url',
    };
  }

  function normalizeYouTubeTrack(item) {
    const snippet = item.snippet || {};
    const videoId = typeof item.id === 'string' ? item.id : item.id?.videoId || '';
    const rawTitle = decodeEntities(snippet.title || 'Video musical');
    const cleanTitle = rawTitle
      .replace(/\s*[|｜].*$/, '')
      .replace(/\s*[\[(][^\])]*(official|video|audio|lyric|visuali[sz]er|4k|hd)[^\])]*[\])]/ig, '')
      .replace(/\s+/g, ' ').trim();
    const split = cleanTitle.match(/^(.{2,80}?)\s[-–—]\s(.+)$/);
    const artist = split ? split[1].trim() : decodeEntities(snippet.channelTitle || 'YouTube');
    const title = split ? split[2].trim() : cleanTitle;
    const thumbnails = snippet.thumbnails || {};
    const artwork = thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';
    return {
      id: `youtube:${videoId}`,
      title,
      artist,
      album: 'YouTube',
      artworkUrl: artwork,
      previewUrl: '',
      durationMs: parseIsoDuration(item.contentDetails?.duration) * 1000,
      trackViewUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      releaseDate: snippet.publishedAt || '',
      genre: 'Video musical',
      youtubeVideoId: videoId,
      source: 'youtube',
    };
  }

  function mergeSearchResults(apple, youtube, query) {
    const queryTokens = normalizeSearchText(query).split(' ').filter(token => token.length > 1);
    const scored = [...apple, ...youtube].map(track => {
      const haystack = normalizeSearchText(`${track.title} ${track.artist} ${track.album || ''}`);
      const title = normalizeSearchText(track.title);
      const allTokens = queryTokens.length && queryTokens.every(token => haystack.includes(token));
      const score = (allTokens ? 100 : 0) + queryTokens.filter(token => haystack.includes(token)).length * 12
        + (title === normalizeSearchText(query) ? 35 : 0);
      return { track, score };
    });
    const seen = new Set();
    return scored.sort((a, b) => b.score - a.score).filter(({ track }) => {
      const signature = normalizeSearchText(`${track.title}|${track.artist}`);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    }).slice(0, 30).map(({ track }) => track);
  }

  function needsYouTubeFallback(results, query) {
    if (!youtubeApiKey || state.filter === 'album') return false;
    const tokens = normalizeSearchText(query).split(' ').filter(token => token.length > 1);
    if (!tokens.length) return false;
    const strongMatches = results.filter(track => {
      const haystack = normalizeSearchText(`${track.title} ${track.artist}`);
      return tokens.every(token => haystack.includes(token));
    });
    return strongMatches.length < 3;
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
          <span class="result-type">${track.source === 'youtube' ? 'YOUTUBE' : state.filter === 'album' ? 'ÁLBUM' : state.filter === 'artist' ? 'ARTISTA' : 'APPLE'}</span>
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
    state.youtubeController?.abort();
    state.youtubeController = null;
    state.lyricsController = new AbortController();
    const controller = state.lyricsController;
    stopLyricPlayback();
    els.audio.pause();
    state.currentTrack = track;
    state.lyricMode = 'cinematic';
    $$('.control-pill').forEach(button => button.classList.toggle('active', button.dataset.mode === 'cinematic'));
    state.lyrics = [];
    state.plainLyrics = '';
    state.lyricTime = 0;
    state.activeLyricIndex = -1;
    state.audioSync = false;
    state.syncAnchor = 0;
    state.previewOffset = Number.isFinite(Number(state.previewOffsets[trackId(track)]))
      ? Number(state.previewOffsets[trackId(track)])
      : null;
    state.returnToResults = els.searchOverlay.classList.contains('open');
    state.backgroundReady = false;
    state.lyricsReady = false;
    state.hasLyrics = false;
    state.cinemaEnded = false;
    state.youtubeDuration = 0;
    state.youtubeTimeScale = 1;
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
    if (!track.youtubeVideoId && youtubeApiKey) enrichCurrentTrackWithYouTube(track);
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
      state.hasLyrics = false;
      state.plainLyrics = '';
      state.lyrics = [];
      state.lyricElements = [];
      state.lyricDuration = Number(state.currentTrack?.durationMs || 0) / 1000;
      state.lyricTime = 0;
      els.lyricsContent.innerHTML = '';
      els.lyricEcho.innerHTML = '';
      els.playerOverlay.classList.add('no-lyrics');
      els.lyricPlay.disabled = true;
      els.lyricScrubber.disabled = true;
      $('#copyLyricsBtn').disabled = true;
      els.lyricTime.textContent = '0:00';
      els.lyricTotal.textContent = state.lyricDuration ? `/ ${formatTime(state.lyricDuration)}` : '/ —:—';
      $('#lyricsKicker').textContent = 'SIN LETRA · MODO AMBIENTE';
      $('#lyricsHeading').textContent = 'La portada y el pulso toman la escena.';
      state.lyricsReady = true;
      refreshYouTubeTiming();
      revealCinemaWhenReady();
      return;
    }

    state.hasLyrics = true;
    els.playerOverlay.classList.remove('no-lyrics');
    els.lyricPlay.disabled = false;
    els.lyricScrubber.disabled = false;
    $('#copyLyricsBtn').disabled = false;
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
    refreshYouTubeTiming();
    revealCinemaWhenReady();
  }

  function revealCinemaWhenReady() {
    if (!state.backgroundReady || !state.lyricsReady || !state.cinemaSequenceReady) return;
    setTimeout(() => {
      if (!els.playerOverlay.classList.contains('open')) return;
      els.playerOverlay.classList.remove('phase-loading');
      els.playerOverlay.classList.add('lyrics-ready', 'paused');
      els.cinemaLoaderText.textContent = 'Escena lista';
    }, state.motion ? 620 : 0);
  }

  async function directLyricsSearch(track, signal) {
    const duration = Math.round((track.durationMs || 0) / 1000);
    const meaningfulAlbum = track.album && track.album !== 'YouTube' ? track.album : '';
    if (meaningfulAlbum && duration) {
      const exact = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist,
        album_name: meaningfulAlbum,
        duration: String(duration),
      });
      const cached = await fetchWithDeadline(`https://lrclib.net/api/get-cached?${exact}`, {
        signal,
        headers: { Accept: 'application/json' },
      }, 7500);
      if (cached.ok) return cached.json();
      if (cached.status !== 404) throw new Error(`Lyrics cache failed ${cached.status}`);
    }
    const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
    if (meaningfulAlbum) params.set('album_name', meaningfulAlbum);
    const response = await fetchWithDeadline(`https://lrclib.net/api/search?${params}`, {
      signal,
      headers: { Accept: 'application/json' },
    }, 7500);
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
    external.href = track.youtubeTrackViewUrl || track.trackViewUrl || '#';
    external.hidden = !(track.youtubeTrackViewUrl || track.trackViewUrl) || (track.youtubeTrackViewUrl || track.trackViewUrl) === '#';
    els.audio.pause();
    els.audio.removeAttribute('src');
    if (track.previewUrl) els.audio.src = track.previewUrl;
    els.audio.load();
    destroyYouTubePlayer();
    const hasPreview = Boolean(track.previewUrl);
    const hasYouTube = Boolean(track.youtubeVideoId);
    const hasVideoSlot = hasYouTube || Boolean(youtubeApiKey);
    els.playerOverlay.classList.toggle('has-youtube', hasVideoSlot);
    $('#previewPlayer').style.display = hasPreview ? 'flex' : 'none';
    els.previewTimelinePlay.hidden = !hasPreview;
    els.youtubeToggle.hidden = false;
    setYouTubeControlState(hasYouTube ? 'ready' : youtubeApiKey ? 'searching' : 'external');
    els.youtubePlayerShell.hidden = !hasVideoSlot;
    els.mediaFallback.hidden = hasPreview || hasVideoSlot;
    if (hasYouTube) {
      renderYouTubeEmbed(track.youtubeVideoId, track.title, track.artist);
      mountYouTubePlayer(track.youtubeVideoId);
    }
    els.youtubeSearchLink.href = `https://www.youtube.com/results?${new URLSearchParams({ search_query: `${track.title} ${track.artist} official audio` })}`;
    els.previewFill.style.width = '0%';
    els.previewTime.textContent = '0:00';
    els.previewDuration.textContent = '0:30';
    els.previewLabel.textContent = state.previewOffset === null
      ? 'FRAGMENTO · TOCA LA LÍNEA QUE ESCUCHAS'
      : 'FRAGMENTO · ALINEACIÓN GUARDADA';
    els.syncState.innerHTML = '<i></i> PULSO VISUAL';
  }

  async function enrichCurrentTrackWithYouTube(track, isRetry = false) {
    if (state.currentTrack !== track) return;
    const lookupId = trackId(track);
    if (state.youtubeLookupPending && state.youtubeLookupTrackId === lookupId) return;
    state.youtubeController?.abort();
    const controller = new AbortController();
    state.youtubeController = controller;
    const lookupToken = {};
    state.youtubeLookupPending = true;
    state.youtubeLookupTrackId = lookupId;
    state.youtubeLookupToken = lookupToken;
    setYouTubeControlState('searching');
    const fallbackCopy = $('b', els.mediaFallback);
    if (fallbackCopy) fallbackCopy.textContent = 'Buscando reproducción disponible…';
    try {
      if (isRetry) delete state.youtubeMatches[trackId(track)];
      let cached = state.youtubeMatches[trackId(track)];
      if (cached?.durationMs && track.durationMs && Math.abs(Number(cached.durationMs) - Number(track.durationMs)) > 35000) {
        delete state.youtubeMatches[trackId(track)];
        cached = null;
      }
      if (cached?.videoId) {
        Object.assign(track, {
          youtubeVideoId: cached.videoId,
          youtubeTrackViewUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(cached.videoId)}`,
          youtubeDurationMs: Number(cached.durationMs || 0),
          durationMs: track.durationMs || Number(cached.durationMs || 0),
          source: `${track.source || 'catalog'}+youtube`,
        });
        if (state.currentTrack === track) showYouTubeForTrack(track);
        return;
      }
      const candidates = await searchYouTube(`${track.title} ${track.artist} official audio`, controller.signal, true);
      const rankedMatches = mergeSearchResults([], candidates, `${track.title} ${track.artist}`);
      const targetDuration = Number(track.durationMs || 0);
      const match = targetDuration
        ? rankedMatches.find(candidate => candidate.durationMs && Math.abs(candidate.durationMs - targetDuration) <= 22000) || rankedMatches[0]
        : rankedMatches[0];
      if (!match) throw new Error('No embeddable YouTube match');
      if (state.currentTrack !== track) return;
      Object.assign(track, {
        youtubeVideoId: match.youtubeVideoId,
        youtubeTrackViewUrl: match.trackViewUrl,
        youtubeDurationMs: Number(match.durationMs || 0),
        durationMs: track.durationMs || match.durationMs,
        source: `${track.source || 'catalog'}+youtube`,
      });
      state.youtubeMatches[trackId(track)] = { videoId: match.youtubeVideoId, durationMs: match.durationMs || 0 };
      writeStore('lyra:youtube-matches', state.youtubeMatches);
      showYouTubeForTrack(track);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('YouTube fallback unavailable', error);
        els.youtubeState.textContent = 'YOUTUBE · NO SE PUDO CARGAR · TOCA REINTENTAR';
        setYouTubeControlState('error');
      }
    } finally {
      if (state.youtubeLookupToken === lookupToken) {
        state.youtubeLookupPending = false;
        state.youtubeLookupTrackId = '';
        state.youtubeLookupToken = null;
      }
      if (state.youtubeController === controller) state.youtubeController = null;
      if (fallbackCopy) fallbackCopy.textContent = 'Sin fragmento en este catálogo';
    }
  }

  function showYouTubeForTrack(track) {
    if (state.currentTrack !== track || !track.youtubeVideoId) return;
    destroyYouTubePlayer();
    els.playerOverlay.classList.add('has-youtube');
    els.youtubePlayerShell.hidden = false;
    setYouTubeControlState('ready');
    els.mediaFallback.hidden = true;
    const external = $('#externalLink');
    external.href = track.youtubeTrackViewUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(track.youtubeVideoId)}`;
    external.hidden = false;
    renderYouTubeEmbed(track.youtubeVideoId, track.title, track.artist);
    mountYouTubePlayer(track.youtubeVideoId);
  }

  function renderYouTubeEmbed(videoId, title = 'Video musical', artist = '') {
    const current = $('#youtubePlayer');
    if (!current || current.tagName === 'IFRAME') return;
    const params = new URLSearchParams({
      enablejsapi: '1', playsinline: '1', controls: '1', rel: '0', modestbranding: '1', origin: location.origin,
    });
    const iframe = document.createElement('iframe');
    iframe.id = 'youtubePlayer';
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params}`;
    iframe.title = `${title} · ${artist}`.replace(/\s·\s$/, '');
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    current.replaceWith(iframe);
  }

  function setYouTubeControlState(controlState) {
    const labels = {
      searching: 'BUSCANDO VIDEO',
      ready: 'VIDEO + LETRA',
      playing: 'VIDEO + LETRA',
      error: 'REINTENTAR VIDEO',
      native: 'VIDEO EN PANTALLA',
      external: 'ABRIR YOUTUBE',
    };
    els.youtubeToggle.hidden = false;
    els.youtubeToggle.dataset.state = controlState;
    els.youtubeToggle.classList.toggle('searching', controlState === 'searching');
    els.youtubeToggle.classList.toggle('error', controlState === 'error' || controlState === 'external');
    els.youtubeToggle.classList.toggle('playing', controlState === 'playing');
    els.youtubePlayerShell.classList.toggle('pending', controlState === 'searching');
    els.youtubePlayerShell.classList.toggle('lookup-error', controlState === 'error');
    const label = $('span', els.youtubeToggle);
    if (label) label.textContent = labels[controlState] || 'VIDEO';
  }

  let youtubeApiPromise = null;

  function ensureYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (youtubeApiPromise) return youtubeApiPromise;
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('YouTube player API failed'));
      document.head.appendChild(script);
      setTimeout(() => reject(new Error('YouTube player API timeout')), 12000);
    });
    return youtubeApiPromise;
  }

  async function mountYouTubePlayer(videoId) {
    els.youtubeState.textContent = 'YOUTUBE · PREPARANDO REPRODUCTOR';
    try {
      const YT = await ensureYouTubeApi();
      if (state.currentTrack?.youtubeVideoId !== videoId || !els.youtubePlayerShell.isConnected) return;
      state.youtubePlayer = new YT.Player('youtubePlayer', {
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => {
            state.youtubeReady = true;
            refreshYouTubeTiming();
            if (state.lyricTime > .15) state.youtubePlayer?.seekTo?.(lyricToVideoTime(state.lyricTime), true);
            els.youtubeState.textContent = 'YOUTUBE · LISTO';
            setYouTubeControlState('ready');
            setUnifiedPlaybackState(false, 'Reproducir video y letra');
          },
          onStateChange: onYouTubeStateChange,
          onError: () => {
            state.youtubeReady = false;
            setUnifiedPlaybackState(false, 'Reintentar video dentro de Lyra');
            els.youtubeState.textContent = 'YOUTUBE · VIDEO BLOQUEADO O NO DISPONIBLE';
            setYouTubeControlState('error');
          },
        },
      });
    } catch (error) {
      console.error(error);
      state.youtubeReady = false;
      setUnifiedPlaybackState(false, 'Usar controles del video');
      els.youtubeState.textContent = 'YOUTUBE · CONTROLES DEL VIDEO DISPONIBLES';
      setYouTubeControlState('native');
    }
  }

  function onYouTubeStateChange(event) {
    const playing = event.data === window.YT?.PlayerState?.PLAYING;
    const paused = event.data === window.YT?.PlayerState?.PAUSED;
    const ended = event.data === window.YT?.PlayerState?.ENDED;
    if (playing) {
      if (!els.audio.paused) els.audio.pause();
      stopLyricPlayback(false);
      setUnifiedPlaybackState(true, 'Pausar video y letra');
      setYouTubeControlState('playing');
      els.youtubeState.textContent = 'YOUTUBE · SINCRONIZANDO';
      els.playerOverlay.classList.remove('paused');
      els.playerOverlay.classList.add('playing');
      startYouTubeSync();
    } else if (paused) {
      stopYouTubeSync();
      setUnifiedPlaybackState(false, 'Reproducir video y letra');
      setYouTubeControlState('ready');
      els.youtubeState.textContent = 'YOUTUBE · PAUSA';
      if (!state.cinemaEnded && !state.lyricPlaying) els.playerOverlay.classList.add('paused');
    } else if (ended) {
      stopYouTubeSync();
      setUnifiedPlaybackState(false, 'Reproducir video y letra');
      setYouTubeControlState('ready');
      if (state.hasLyrics) finishCinema();
      else els.youtubeState.textContent = 'YOUTUBE · TERMINÓ';
    }
  }

  function toggleYouTubeVideo() {
    const controlState = els.youtubeToggle.dataset.state;
    if (controlState === 'error') {
      const track = state.currentTrack;
      if (!track || !youtubeApiKey) return;
      destroyYouTubePlayer();
      delete state.youtubeMatches[trackId(track)];
      delete track.youtubeVideoId;
      delete track.youtubeTrackViewUrl;
      writeStore('lyra:youtube-matches', state.youtubeMatches);
      enrichCurrentTrackWithYouTube(track, true);
      showToast('Buscando otro video insertable…');
      return;
    }
    const player = state.youtubePlayer;
    if (!player?.getPlayerState) {
      if (controlState === 'external') {
        window.open(state.currentTrack?.youtubeTrackViewUrl || els.youtubeSearchLink.href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (state.youtubeLookupPending) {
        showToast('Buscando el video oficial…');
        return;
      }
      if (controlState === 'native') {
        showToast('Usa los controles visibles dentro del video.');
        return;
      }
      if (state.currentTrack && youtubeApiKey) {
        enrichCurrentTrackWithYouTube(state.currentTrack, true);
        showToast('Reintentando la búsqueda del video…');
        return;
      }
      window.open(els.youtubeSearchLink.href, '_blank', 'noopener,noreferrer');
      return;
    }
    const playing = player.getPlayerState() === window.YT?.PlayerState?.PLAYING;
    try {
      if (playing) player.pauseVideo();
      else player.playVideo();
    } catch {
      showToast('No fue posible controlar este video.');
    }
  }

  function setUnifiedPlaybackState(playing, label) {
    els.lyricTimeline.classList.toggle('playing', playing);
    els.lyricPlay.setAttribute('aria-label', label);
    els.lyricPlay.title = label;
  }

  function startYouTubeSync() {
    stopYouTubeSync();
    const tick = () => {
      const player = state.youtubePlayer;
      if (!player?.getCurrentTime) return;
      const currentTime = Number(player.getCurrentTime()) || 0;
      refreshYouTubeTiming();
      const activeVideoId = player.getVideoData?.()?.video_id || '';
      const isRequestedVideo = activeVideoId === state.currentTrack?.youtubeVideoId;
      if (!isRequestedVideo) {
        state.audioSync = false;
        els.youtubeState.textContent = 'YOUTUBE · ESPERANDO AL VIDEO';
      } else if (state.hasLyrics && currentTime > .15) {
        state.audioSync = true;
        els.youtubeState.textContent = 'YOUTUBE · LETRA SINCRONIZADA';
        state.lyricTime = videoToLyricTime(currentTime);
        updateLyricUI();
      }
      state.youtubeSyncFrame = setTimeout(tick, visualFrameDelay());
    };
    state.youtubeSyncFrame = setTimeout(tick, visualFrameDelay());
  }

  function stopYouTubeSync() {
    if (state.youtubeSyncFrame) clearTimeout(state.youtubeSyncFrame);
    state.youtubeSyncFrame = null;
    state.audioSync = false;
  }

  function refreshYouTubeTiming() {
    const duration = Number(state.youtubePlayer?.getDuration?.()) || Number(state.currentTrack?.youtubeDurationMs || 0) / 1000;
    if (duration < 10) return;
    state.youtubeDuration = duration;
    const lyricDuration = Number(state.lyricDuration || 0);
    state.youtubeTimeScale = lyricDuration >= 10
      ? Math.max(.75, Math.min(1.25, lyricDuration / duration))
      : 1;
  }

  function videoToLyricTime(videoTime) {
    return Math.max(0, Math.min(state.lyricDuration, Number(videoTime || 0) * state.youtubeTimeScale));
  }

  function lyricToVideoTime(lyricTime) {
    const scale = state.youtubeTimeScale || 1;
    return Math.max(0, Math.min(state.youtubeDuration || Infinity, Number(lyricTime || 0) / scale));
  }

  function visualFrameDelay() {
    return Math.round(1000 / Math.max(1, state.visualFps));
  }

  function destroyYouTubePlayer() {
    stopYouTubeSync();
    try { state.youtubePlayer?.destroy?.(); } catch { /* player may still be initializing */ }
    state.youtubePlayer = null;
    state.youtubeReady = false;
    const host = $('#youtubePlayer');
    if (!host || host.tagName === 'IFRAME') {
      const replacement = document.createElement('div');
      replacement.id = 'youtubePlayer';
      if (host) host.replaceWith(replacement);
      else els.youtubePlayerShell?.prepend(replacement);
    }
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
      button.innerHTML = `${words.map((word, wordIndex) =>
        `<span class="lyric-token" style="--token:${wordIndex};--tokens:${words.length}">${escapeHtml(word)}</span>`
      ).join(' ')}<small class="lyric-translation" hidden></small>`;
      button.addEventListener('click', () => {
        state.lyricTime = line.time;
        if (!els.audio.paused) {
          state.previewOffset = Math.max(0, line.time - els.audio.currentTime);
          state.syncAnchor = state.previewOffset;
          state.audioSync = true;
          state.previewOffsets[trackId(state.currentTrack)] = state.previewOffset;
          writeStore('lyra:preview-offsets', state.previewOffsets);
          els.syncState.innerHTML = '<i></i> ALINEACIÓN GUARDADA';
          els.previewLabel.textContent = 'FRAGMENTO · ALINEACIÓN GUARDADA';
          showToast('Alineación guardada para este fragmento');
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
    translateCurrentLyrics();
  }

  async function translateCurrentLyrics() {
    state.translationController?.abort();
    const language = state.translationLanguage;
    const nodes = state.lyricElements.map(line => $('.lyric-translation', line));
    if (!language || !state.lyrics.length) {
      nodes.forEach(node => { if (node) { node.hidden = true; node.textContent = ''; } });
      setTranslationState('TRADUCIR', false);
      return;
    }

    const controller = new AbortController();
    state.translationController = controller;
    const cacheKey = `${trackId(state.currentTrack)}|${language}`;
    let translations = state.translationCache[cacheKey];
    setTranslationState('TRADUCIENDO', true);
    try {
      if (!Array.isArray(translations) || translations.length !== state.lyrics.length) {
        translations = await translateLines(state.lyrics.map(line => line.text), language, controller.signal);
        if (controller.signal.aborted) return;
        state.translationCache[cacheKey] = translations;
        const recent = Object.entries(state.translationCache).slice(-20);
        state.translationCache = Object.fromEntries(recent);
        writeStore('lyra:translations', state.translationCache);
      }
      if (state.translationLanguage !== language || state.translationController !== controller) return;
      translations.forEach((translation, index) => {
        const node = nodes[index];
        if (!node) return;
        node.textContent = translation ? `(${translation})` : '';
        node.hidden = !translation;
      });
      state.translationRetryCount = 0;
      setTranslationState('TRADUCIDA', false);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        if (state.translationRetryCount < 2 && state.translationLanguage === language) {
          state.translationRetryCount += 1;
          setTranslationState('RECONECTANDO', true);
          clearTimeout(state.translationRetryTimer);
          state.translationRetryTimer = setTimeout(() => translateCurrentLyrics(), 2500 * state.translationRetryCount);
        } else {
          setTranslationState('REINTENTAR', false);
        }
        showToast('La traducción no respondió. La letra original sigue disponible.');
      }
    } finally {
      if (state.translationController === controller) {
        els.translationLanguage.parentElement.classList.remove('translating');
        els.translationLanguage.parentElement.removeAttribute('aria-busy');
      }
    }
  }

  function setTranslationState(label, busy) {
    const control = els.translationLanguage.parentElement;
    const status = $('span', control);
    if (status) status.textContent = label;
    control.classList.toggle('translating', busy);
    control.setAttribute('aria-busy', String(busy));
    els.translationLanguage.disabled = false;
  }

  async function translateLines(lines, language, signal) {
    const translations = new Array(lines.length).fill('');
    const batches = [];
    let current = [];
    let length = 0;
    lines.forEach((text, index) => {
      const addition = String(text || '').length + (current.length ? 22 : 0);
      if (current.length && length + addition > 420) {
        batches.push(current);
        current = [];
        length = 0;
      }
      current.push({ text: String(text || ''), index });
      length += addition;
    });
    if (current.length) batches.push(current);

    for (const batch of batches) {
      const marker = '[[[LYRA_BREAK]]]';
      const joined = batch.map(item => item.text).join(`\n${marker}\n`);
      const translated = await requestTranslation(joined, language, signal);
      const normalized = String(translated).replace(/<br\s*\/?\s*>/gi, '\n');
      let parts = normalized.split(new RegExp(`\\s*\\[\\[\\[LYRA_BREAK\\]\\]\\]\\s*`, 'i'));
      if (parts.length !== batch.length) parts = normalized.split(/\r?\n/).filter(Boolean);
      if (parts.length === batch.length) {
        batch.forEach((item, index) => { translations[item.index] = parts[index].trim(); });
      } else {
        for (const item of batch) {
          translations[item.index] = String(await requestTranslation(item.text, language, signal)).trim();
        }
      }
    }
    return translations;
  }

  async function requestTranslation(text, language, signal) {
    if (!String(text || '').trim()) return '';
    try {
      const localTranslation = await withTimeout(requestBrowserTranslation(text, language, signal), 4500, signal);
      if (localTranslation) return localTranslation;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      console.info('Local translation unavailable; using network fallback', error);
    }

    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await requestNetworkTranslation(text, language, signal);
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        lastError = error;
        if (attempt < 2) await abortableDelay(450 * (attempt + 1), signal);
      }
    }
    throw lastError || new Error('Translation unavailable');
  }

  async function requestBrowserTranslation(text, language, signal) {
    if (!window.Translator?.create || !window.LanguageDetector?.create) return '';
    const detector = await window.LanguageDetector.create();
    const detected = await detector.detect(String(text).slice(0, 1200));
    detector.destroy?.();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const sourceLanguage = detected?.[0]?.detectedLanguage;
    if (!sourceLanguage || sourceLanguage === 'und') return '';
    if (sourceLanguage === language) return String(text);
    const key = `${sourceLanguage}|${language}`;
    let translator = state.browserTranslators.get(key);
    if (!translator) {
      translator = await window.Translator.create({ sourceLanguage, targetLanguage: language });
      state.browserTranslators.set(key, translator);
    }
    const translated = await translator.translate(String(text));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return String(translated || '').trim();
  }

  function abortableDelay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  function withTimeout(promise, ms, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        callback(value);
      };
      const abort = () => finish(reject, new DOMException('Aborted', 'AbortError'));
      timer = setTimeout(() => finish(reject, new Error('Local translator timeout')), ms);
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

  async function requestNetworkTranslation(text, language, signal) {
    try {
      const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: language, dt: 't', q: text });
      const response = await fetchWithDeadline(`https://translate.googleapis.com/translate_a/single?${params}`, { signal }, 9000);
      if (!response.ok) throw new Error(`Primary translation failed ${response.status}`);
      const data = await response.json();
      const translated = Array.isArray(data?.[0]) ? data[0].map(part => part?.[0] || '').join('') : '';
      if (translated.trim()) return translated;
      throw new Error('Primary translation returned no text');
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      console.info('Primary translation unavailable; using secondary provider', error);
      return requestMyMemoryTranslation(text, language, signal);
    }
  }

  async function requestMyMemoryTranslation(text, language, signal) {
    if (!text.trim() || text.trim() === '♪') return '';
    const params = new URLSearchParams({ q: text, langpair: `autodetect|${language}` });
    const response = await fetchWithDeadline(`https://api.mymemory.translated.net/get?${params}`, { signal }, 10000);
    if (!response.ok) throw new Error(`Translation failed ${response.status}`);
    const data = await response.json();
    if (Number(data.responseStatus || 200) >= 400) throw new Error(data.responseDetails || 'Translation rejected');
    return decodeEntities(data.responseData?.translatedText || '');
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

    const lineChanged = activeIndex !== state.activeLyricIndex;
    if (lineChanged) {
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
    if (active && (forceScroll || lineChanged) && state.lyricMode === 'flow') {
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
    if (state.currentTrack?.youtubeVideoId) {
      if (!state.youtubeReady || !state.youtubePlayer?.getPlayerState) {
        const videoState = els.youtubeToggle.dataset.state;
        if (videoState === 'external' || videoState === 'error') toggleYouTubeVideo();
        else showToast('El video se está preparando dentro de Lyra…');
        return;
      }
      toggleYouTubeVideo();
      return;
    }
    if (state.youtubeLookupPending) {
      showToast('Buscando el video para sincronizarlo con la letra…');
      return;
    }
    if (!state.hasLyrics) {
      if (state.currentTrack?.previewUrl) togglePreview();
      else showToast('Esta edición no tiene letra ni fragmento disponible.');
      return;
    }
    state.lyricPlaying ? stopLyricPlayback(true) : startLyricPlayback();
  }

  function startLyricPlayback() {
    if (!state.lyrics.length) return;
    if (!els.audio.paused) els.audio.pause();
    try { state.youtubePlayer?.pauseVideo?.(); } catch { /* YouTube may still be preparing */ }
    if (state.lyricTime >= state.lyricDuration) state.lyricTime = 0;
    state.lyricPlaying = true;
    state.audioSync = false;
    state.cinemaEnded = false;
    els.playerOverlay.classList.remove('paused', 'ended', 'phase-loading');
    els.playerOverlay.classList.add('playing');
    els.endCredits.setAttribute('aria-hidden', 'true');
    els.syncState.innerHTML = '<i></i> PULSO VISUAL';
    els.lyricTimeline.classList.add('playing');
    els.lyricPlay.setAttribute('aria-label', 'Pausar animación de letra');
    let previous = performance.now();
    const tick = now => {
      if (!state.lyricPlaying) return;
      state.lyricTime += (now - previous) / 1000;
      previous = now;
      updateLyricUI();
      state.lyricTimer = setTimeout(() => tick(performance.now()), visualFrameDelay());
    };
    state.lyricTimer = setTimeout(() => tick(performance.now()), visualFrameDelay());
  }

  function stopLyricPlayback(presentPause = true) {
    state.lyricPlaying = false;
    els.lyricTimeline.classList.remove('playing');
    els.lyricPlay.setAttribute('aria-label', 'Reproducir animación de letra');
    if (state.lyricTimer) clearTimeout(state.lyricTimer);
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
    setTimeout(() => {
      if (state.youtubeReady && state.youtubePlayer?.seekTo) {
        state.youtubePlayer.seekTo(0, true);
        state.youtubePlayer.playVideo?.();
      } else {
        startLyricPlayback();
      }
    }, state.motion ? 420 : 0);
  }

  function updateBeatVisual(time) {
    const youtubePlaying = state.youtubePlayer?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
    if (!els.beatStage || (!state.lyricPlaying && els.audio.paused && !youtubePlaying)) return;
    const now = performance.now();
    if (now - state.beatPaintAt < visualFrameDelay() * .9) return;
    state.beatPaintAt = now;
    if (state.audioAnalyser && state.audioData && !els.audio.paused) state.audioAnalyser.getByteFrequencyData(state.audioData);
    const audioEnergy = els.audio.paused ? 0 : .18 + Math.abs(Math.sin(els.audio.currentTime * 5.6)) * .58;
    const bars = state.beatBars;
    bars.forEach((bar, index) => {
      const wave = Math.abs(Math.sin(time * (2.1 + index % 5 * .13) + index * .72));
      const kick = Math.pow(Math.max(0, Math.sin(time * 3.25 - index * .08)), 6);
      const liveBin = state.audioData?.length ? state.audioData[Math.min(state.audioData.length - 1, Math.floor(index / bars.length * state.audioData.length))] / 255 : 0;
      const energy = Math.min(1, .08 + wave * .24 + kick * .62 + audioEnergy * .2 + liveBin * .72);
      bar.style.setProperty('--beat', energy.toFixed(3));
    });
  }

  function startBeatLoop() {
    stopBeatLoop();
    const tick = () => {
      if (els.audio.paused) return;
      updateBeatVisual(els.audio.currentTime);
      state.beatFrame = setTimeout(tick, visualFrameDelay());
    };
    state.beatFrame = setTimeout(tick, visualFrameDelay());
  }

  function stopBeatLoop() {
    if (state.beatFrame) clearTimeout(state.beatFrame);
    state.beatFrame = null;
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
      try { state.youtubePlayer?.pauseVideo?.(); } catch { /* player may still be preparing */ }
      stopLyricPlayback(false);
      state.audioSync = state.hasLyrics && state.previewOffset !== null;
      state.syncAnchor = state.previewOffset ?? 0;
      if (state.hasLyrics && state.previewOffset === null) {
        els.previewLabel.textContent = 'FRAGMENTO · TOCA LA LÍNEA QUE ESCUCHAS';
        els.syncState.innerHTML = '<i></i> ESPERANDO ALINEACIÓN';
        showToast('El fragmento no informa en qué segundo empieza. Toca la línea que escuchas una vez.');
      }
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
    state.audioSync = state.hasLyrics && state.previewOffset !== null;
    state.syncAnchor = state.previewOffset ?? 0;
    startBeatLoop();
    els.playerOverlay.classList.remove('paused');
    els.playerOverlay.classList.add('playing');
    els.previewPlayer.classList.add('playing');
    els.previewTimelinePlay.classList.add('playing');
    els.syncState.innerHTML = state.audioSync
      ? '<i></i> FRAGMENTO SINCRONIZADO'
      : '<i></i> TOCA LA LÍNEA QUE ESCUCHAS';
  }

  function endAudioSync() {
    stopBeatLoop();
    state.audioContext?.suspend?.().catch?.(() => {});
    state.audioSync = false;
    els.previewPlayer.classList.remove('playing');
    els.previewTimelinePlay.classList.remove('playing');
    if (!state.lyricPlaying && !state.cinemaEnded) {
      els.playerOverlay.classList.remove('playing');
      els.playerOverlay.classList.add('paused');
    }
    els.syncState.innerHTML = '<i></i> PULSO VISUAL';
    els.previewLabel.textContent = state.previewOffset === null
      ? 'FRAGMENTO · TOCA LA LÍNEA QUE ESCUCHAS'
      : 'FRAGMENTO · ALINEACIÓN GUARDADA';
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
    els.playerOverlay.style.setProperty('--lyric-hot', palette[0]);
    els.playerOverlay.style.setProperty('--lyric-soft', palette[1]);
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
      source: 'apple',
    };
  }

  function normalizeSearchText(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function decodeEntities(value) {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = String(value || '');
    return textArea.value;
  }

  function parseIsoDuration(value) {
    const match = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return 0;
    return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function pickBestLyrics(records, track) {
    if (!Array.isArray(records) || !records.length) return null;
    const wantedTitle = canonicalTitle(track.title);
    const wantedArtist = normalizeText(track.artist);
    const wantedDuration = Number(track.durationMs || 0) / 1000;
    const candidates = records.filter(record => {
      const candidateTitle = canonicalTitle(record.trackName);
      const rawCandidateTitle = normalizeText(record.trackName);
      if (candidateTitle !== wantedTitle && !candidateTitle.includes(wantedTitle) && !wantedTitle.includes(candidateTitle) && !rawCandidateTitle.includes(wantedTitle)) return false;
      if (!artistsMatch(wantedArtist, normalizeText(record.artistName))) return false;
      if (wantedDuration && record.duration && Math.abs(Number(record.duration) - wantedDuration) > 18) return false;
      return Boolean(record.syncedLyrics || record.plainLyrics);
    });
    if (!candidates.length) return null;
    return candidates.sort((a, b) => {
      const score = record => {
        let value = 0;
        if (record.syncedLyrics) value += 2;
        if (record.plainLyrics) value += 1;
        if (normalizeText(record.albumName) === normalizeText(track.album)) value += 3;
        if (wantedDuration && record.duration) value += Math.max(0, 3 - Math.abs(Number(record.duration) - wantedDuration) / 6);
        return value;
      };
      return score(b) - score(a);
    })[0];
  }

  function artistsMatch(left, right) {
    if (!left || !right) return false;
    if (left === right || left.includes(right) || right.includes(left)) return true;
    const ignored = new Set(['and', 'the', 'feat', 'featuring', 'with']);
    const leftWords = new Set(left.split(' ').filter(word => word.length > 2 && !ignored.has(word)));
    const rightWords = new Set(right.split(' ').filter(word => word.length > 2 && !ignored.has(word)));
    const shared = [...leftWords].filter(word => rightWords.has(word)).length;
    return shared >= Math.max(1, Math.ceil(Math.min(leftWords.size, rightWords.size) * .6));
  }

  function canonicalTitle(value) {
    return normalizeText(value)
      .replace(/\b(feat|ft|featuring|with|con)\b.*$/, '')
      .replace(/\b(official|video|audio|lyrics|lyric|visualizer|remaster(ed)?|version)\b.*$/, '')
      .trim();
  }

  function trackId(track) { return String(track.id || `${track.artist}|${track.title}|${track.album}`).toLowerCase(); }
  async function fetchWithDeadline(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    const relayAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) relayAbort();
    else externalSignal?.addEventListener('abort', relayAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new Error(`Request timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', relayAbort);
    }
  }
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
      const dpr = state.performanceLite ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: state.performanceLite ? 0 : Math.min(55, Math.round(innerWidth / 28)) }, () => ({
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
      if (!state.motion || state.performanceLite || document.hidden) return;
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
      if (state.motion && !state.performanceLite && !document.hidden && !frame) frame = requestAnimationFrame(draw);
      if (!state.motion || state.performanceLite) ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    resize();
    addEventListener('resize', resize, { passive: true });
    addEventListener('lyra:motion', start);
    addEventListener('lyra:performance', () => { resize(); start(); });
    document.addEventListener('visibilitychange', start);
    start();
  }
})();
