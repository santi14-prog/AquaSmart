// AquaSmart - Main Application Controller

// Fallback logging (logger.js overrides these if loaded first)
window._AQLOG = window._AQLOG || ((level, args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  try { fetch('/log', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({level, msg, time:new Date().toLocaleTimeString('pt-PT')}), keepalive:true }).catch(()=>{}); } catch(_){}
});

if (typeof LOG === 'undefined') {
  window.LOG = (...args) => { console.log('[AquaSmart]', ...args); window._AQLOG('LOG', args); };
  window.WARN = (...args) => { console.warn('[AquaSmart]', ...args); window._AQLOG('WARN', args); };
  window.ERR = (...args) => { console.error('[AquaSmart]', ...args); window._AQLOG('ERR', args); };
}

const APP = {
  zones: [],
  nextZoneId: 1,
  schedules: [],
  history: [],
  activeZones: new Set(),
  zoneTimers: {},
  intervalId: null,
  currentConnection: null,
  flowRate: 6,
  waterPrice: 1.5,
  ipmaCityId: null,
  ipmaCityName: '',
  profiles: [],
  currentProfile: 'default',
  chartPeriod: 'week',
  chart: null,
  donut: null,
  weatherChart: null,
  forecast: null,
  viewWeather: null,
  viewLocation: null,
  viewForecast: null,
  viewLocationName: '',
  notifEnabled: true,
  _notifications: [],
  sensorData: { moisture: null, timestamp: null },
  pumpPaused: false,

  // === Init ===
  init() {
    LOG('Inicializando AquaSmart...');
    this._setupLogin();
  },

  _setupLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const passwordInput = document.getElementById('loginPassword');
    const loginBtn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const DEFAULT_PASSWORD = 'aquasmart2026';

    const tryLogin = () => {
      const pass = passwordInput.value;
      if (!pass) return;

      if (pass === DEFAULT_PASSWORD) {
        loginScreen.classList.add('hide');
        setTimeout(() => {
          if (loginScreen.parentNode) loginScreen.parentNode.removeChild(loginScreen);
        }, 400);
        this._startApp();
      } else {
        errorEl.style.display = '';
        passwordInput.value = '';
        passwordInput.focus();
        setTimeout(() => { errorEl.style.display = 'none'; }, 2000);
      }
    };

    loginBtn.onclick = tryLogin;
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryLogin();
    });

    const toggleBtn = document.getElementById('passToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const showing = passwordInput.type === 'text';
        passwordInput.type = showing ? 'password' : 'text';
        toggleBtn.textContent = showing ? 'Mostrar' : 'Ocultar';
      });
    }
  },

  _startApp() {
    LOG('Inicializando AquaSmart...');
    this._migrateOldData();
    this.loadZones();
    this.loadSchedules();
    this.loadHistory();
    this.loadTheme();
    this.loadFlowRate();
    this.loadWaterPrice();
    this.loadIpmaLocation();
    this.loadProfiles();
    this.loadNotifPref();
    this.loadPumpState();
    this.renderZones();
    this.renderSchedules();
    this.renderDashboard();
    this.setupEventListeners();
    this.startScheduleChecker();
    this.updateActiveCount();
    document.querySelector('.schedule-section').style.display = 'none';
    const zs = document.querySelector('.zones-section');
    if (zs) zs.style.display = 'none';
    document.querySelector('.debug-section').style.display = 'none';
    const ws = document.querySelector('.weather-section');
    if (ws) ws.style.display = 'none';
    const hp = document.querySelector('.history-tab-section');
    if (hp) hp.style.display = 'none';
    LOG('Zonas carregadas:', this.zones.length);
    LOG('Horarios carregados:', this.schedules.length);
    LOG('Historico carregado:', this.history.length, 'registos');
    this._showSplash();
    this._requestNotificationPermission();
    setTimeout(() => this.updateDebugBadge(), 2600);

    if (!this.hasLocation()) {
      setTimeout(() => this._showLocationModal(), 2000);
    } else {
      this.fetchWeather();
    }
  },

  _migrateOldData() {
    if (localStorage.getItem('sprinkler_schedules')) localStorage.removeItem('sprinkler_schedules');
    if (localStorage.getItem('sprinkler_zones')) localStorage.removeItem('sprinkler_zones');
  },

  // === Splash ===
  _showSplash() {
    const water = document.getElementById('splashWater');
    // Round droplet: 8 cols x 10 rows, rounded shape
    // 1=edge highlight, 2=mid body, 3=dark core
    const pixels = [
      0,0,0,0,0,0,0,0,
      0,0,0,2,2,0,0,0,
      0,0,1,3,3,1,0,0,
      0,1,3,3,3,3,1,0,
      0,1,3,3,3,3,1,0,
      1,3,3,3,3,3,3,1,
      1,3,3,3,3,3,3,1,
      0,1,3,3,3,3,1,0,
      0,0,2,3,3,2,0,0,
      0,0,0,2,2,0,0,0
    ];
    water.innerHTML = pixels.map((v, i) => {
      if (v === 0) return '<div class="pixel"></div>';
      const cls = v === 1 ? 'c1' : (v === 2 ? 'c2' : 'c3');
      return `<div class="pixel show ${cls}" style="animation-delay:${(i % 16) * 0.03}s"></div>`;
    }).join('');
    requestAnimationFrame(() => {
      water.classList.add('sliding');
    });
    setTimeout(() => {
      const splash = document.getElementById('splash');
      splash.classList.add('hide');
      splash.addEventListener('transitionend', () => {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, { once: true });
    }, 4200);
  },

  _requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        LOG('Notificacoes:', p);
      });
    }
  },

  notify(title, body) {
    if (!this.notifEnabled) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
  },

  // === Theme ===
  loadTheme() {
    const saved = localStorage.getItem('aquasmart_theme');
    if (saved === 'light') document.body.classList.add('light');
    else if (!saved) {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.body.classList.add('light');
      }
    }
  },

  toggleTheme() {
    document.body.classList.toggle('light');
    localStorage.setItem('aquasmart_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  },

  // === Notifications ===
  loadNotifPref() {
    const saved = localStorage.getItem('aquasmart_notif');
    if (saved !== null) this.notifEnabled = saved === 'true';
  },

  saveNotifPref() {
    localStorage.setItem('aquasmart_notif', this.notifEnabled);
  },

  // === Flow Rate ===
  loadFlowRate() {
    const saved = localStorage.getItem('aquasmart_flow');
    if (saved) this.flowRate = parseInt(saved);
  },

  saveFlowRate(rate) {
    this.flowRate = parseInt(rate);
    localStorage.setItem('aquasmart_flow', this.flowRate);
  },

  // === Water Price ===
  loadWaterPrice() {
    const saved = localStorage.getItem('aquasmart_price');
    if (saved) this.waterPrice = parseFloat(saved);
  },

  saveWaterPrice(price) {
    this.waterPrice = parseFloat(price);
    localStorage.setItem('aquasmart_price', this.waterPrice);
  },

  // === IPMA Location ===
  loadIpmaLocation() {
    const savedId = localStorage.getItem('aquasmart_ipma_id');
    const savedName = localStorage.getItem('aquasmart_ipma_name');
    if (savedId) this.ipmaCityId = parseInt(savedId);
    if (savedName) this.ipmaCityName = savedName;
  },

  saveIpmaLocation() {
    localStorage.setItem('aquasmart_ipma_id', this.ipmaCityId);
    localStorage.setItem('aquasmart_ipma_name', this.ipmaCityName);
  },

  hasLocation() {
    return this.ipmaCityId !== null;
  },

  async loadIpmaCities() {
    if (this._ipmaCities) return this._ipmaCities;
    try {
      const resp = await fetch('https://api.ipma.pt/open-data/distrits-islands.json');
      const data = await resp.json();
      this._ipmaCities = data.data || [];
      return this._ipmaCities;
    } catch (_) { return []; }
  },

  async loadIpmaWeatherTypes() {
    if (this._ipmaWeatherTypes) return this._ipmaWeatherTypes;
    try {
      const resp = await fetch('https://api.ipma.pt/open-data/weather-type-classe.json');
      const data = await resp.json();
      this._ipmaWeatherTypes = {};
      (data.data || []).forEach(w => { this._ipmaWeatherTypes[w.idWeatherType] = w.descIdWeatherTypePT; });
      return this._ipmaWeatherTypes;
    } catch (_) { return {}; }
  },

  async _showLocationModal() {
    const cities = await this.loadIpmaCities();
    const modal = document.getElementById('locationModal');
    if (!modal || cities.length === 0) return;
    this._populateCitySelect(cities);
    modal.classList.add('show');
    this._bindLocationEvents(modal);
  },

  _populateCitySelect(cities) {
    const sel = document.getElementById('ipmaCitySelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Escolhe --</option>' +
      cities.sort((a, b) => a.local.localeCompare(b.local)).map(c =>
        `<option value="${c.globalIdLocal}">${c.local}</option>`
      ).join('');
  },

  _bindLocationEvents(modal) {
    document.getElementById('useGeoBtn').onclick = () => this._getGeoLocation(modal);
    document.getElementById('skipLocation').onclick = () => { modal.classList.remove('show'); };

    document.getElementById('ipmaCitySelect')?.addEventListener('change', (e) => {
      const id = parseInt(e.target.value);
      if (!id) return;
      const cities = this._ipmaCities || [];
      const city = cities.find(c => c.globalIdLocal === id);
      if (city) {
        this.ipmaCityId = id;
        this.ipmaCityName = city.local;
        this.saveIpmaLocation();
        modal.classList.remove('show');
        this.fetchWeather();
        this.showToast('Localizacao: ' + city.local);
        LOG('Localizacao IPMA:', city.local, id);
      }
    });

    document.getElementById('ipmaSearchInput')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const cities = this._ipmaCities || [];
      const filtered = cities.filter(c => c.local.toLowerCase().includes(q));
      this._populateCitySelect(filtered);
    });
  },

  _getGeoLocation(modal) {
    if (!navigator.geolocation) { this.showToast('Geolocalizacao nao suportada'); return; }
    document.getElementById('useGeoBtn').textContent = 'A obter...';
    document.getElementById('useGeoBtn').disabled = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const cities = this._ipmaCities || [];
        let best = null, bestDist = Infinity;
        for (const c of cities) {
          const d = Math.hypot(pos.coords.latitude - c.latitude, pos.coords.longitude - c.longitude);
          if (d < bestDist) { bestDist = d; best = c; }
        }
        if (best) {
          this.ipmaCityId = best.globalIdLocal;
          this.ipmaCityName = best.local;
          this.saveIpmaLocation();
          modal.classList.remove('show');
          this.fetchWeather();
          this.showToast('Localizacao: ' + best.local);
          LOG('Geolocalizacao IPMA:', best.local);
        } else {
          document.getElementById('useGeoBtn').textContent = 'Usar Localizacao Atual';
          document.getElementById('useGeoBtn').disabled = false;
          this.showToast('Nenhuma cidade encontrada. Escolhe manualmente.');
        }
      },
      () => {
        document.getElementById('useGeoBtn').textContent = 'Usar Localizacao Atual';
        document.getElementById('useGeoBtn').disabled = false;
        this.showToast('Permissao negada. Escolhe manualmente.');
      },
      { timeout: 10000 }
    );
  },

  // === Profiles ===
  loadProfiles() {
    try {
      const saved = localStorage.getItem('aquasmart_profiles');
      this.profiles = saved ? JSON.parse(saved) : [];
      if (this.profiles.length === 0) {
        this.profiles = [{ name: 'Padrao', schedules: [] }];
        this.saveProfiles();
      }
      const active = localStorage.getItem('aquasmart_active_profile');
      this.currentProfile = active || 'Padrao';
    } catch (_) { this.profiles = [{ name: 'Padrao', schedules: [] }]; }
  },

  saveProfiles() {
    localStorage.setItem('aquasmart_profiles', JSON.stringify(this.profiles));
  },

  switchProfile(name) {
    const profile = this.profiles.find(p => p.name === name);
    if (!profile) return;
    this.saveProfileSchedules(this.currentProfile);
    this.currentProfile = name;
    this.schedules = JSON.parse(JSON.stringify(profile.schedules));
    this.saveSchedules();
    localStorage.setItem('aquasmart_active_profile', name);
    this.renderSchedules();
    this.renderDashboard();
    this.updateProfileSelect();
    this.showToast('Perfil: ' + name);
    LOG('Perfil alterado:', name);
  },

  saveProfileSchedules(name) {
    const profile = this.profiles.find(p => p.name === name);
    if (profile) {
      profile.schedules = JSON.parse(JSON.stringify(this.schedules));
      this.saveProfiles();
    }
  },

  createProfile(name) {
    if (this.profiles.find(p => p.name === name)) {
      this.showToast('Ja existe um perfil com esse nome');
      return false;
    }
    this.saveProfileSchedules(this.currentProfile);
    this.profiles.push({ name, schedules: JSON.parse(JSON.stringify(this.schedules)) });
    this.currentProfile = name;
    localStorage.setItem('aquasmart_active_profile', name);
    this.saveProfiles();
    this.showToast('Perfil criado: ' + name);
    LOG('Perfil criado:', name);
    return true;
  },

  deleteProfile(name) {
    if (this.profiles.length <= 1) {
      this.showToast('Precisas de pelo menos um perfil');
      return;
    }
    this.profiles = this.profiles.filter(p => p.name !== name);
    if (this.currentProfile === name) {
      this.currentProfile = this.profiles[0].name;
      localStorage.setItem('aquasmart_active_profile', this.currentProfile);
      this.schedules = JSON.parse(JSON.stringify(this.profiles[0].schedules));
      this.saveSchedules();
    }
    this.saveProfiles();
    this.renderSchedules();
    this.renderDashboard();
    this.showToast('Perfil apagado: ' + name);
  },

  updateProfileSelect() {
    const sel = document.getElementById('profileSelect');
    if (!sel) return;
    sel.innerHTML = this.profiles.map(p =>
      `<option value="${p.name}" ${p.name === this.currentProfile ? 'selected' : ''}>Perfil: ${p.name}</option>`
    ).join('');
    sel.style.display = this.profiles.length > 1 ? '' : 'none';
  },

  // === Zones ===
  loadZones() {
    this.zones = [{ id: 1, name: 'Bomba', pin: 2 }];
    this.nextZoneId = 2;
  },

  saveZones() {
    localStorage.setItem('aquasmart_zones', JSON.stringify(this.zones));
  },

  // === Zones (simplificado para bomba unica) ===

  // === History ===
  loadHistory() {
    try {
      const saved = localStorage.getItem('aquasmart_history');
      this.history = saved ? JSON.parse(saved) : [];
    } catch (_) { this.history = []; }
  },

  saveHistory() {
    if (this.history.length > 200) {
      this.history = this.history.slice(-200);
    }
    localStorage.setItem('aquasmart_history', JSON.stringify(this.history));
  },

  addHistory(zoneName, action, duration) {
    const now = new Date();
    const waterUsed = duration ? Math.round((duration / 60) * this.flowRate) : 0;
    const humidity = this.sensorData.moisture;
    const temperature = this.weather ? Math.round(this.weather.tempMax) : null;
    const entry = {
      time: now.toISOString(),
      timeStr: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      dateStr: now.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
      zone: zoneName,
      action,
      duration,
      waterUsed,
      humidity,
      temperature
    };
    this.history.push(entry);
    this.saveHistory();
    this.renderHistory();
    this.renderDashboard();
    LOG('Historico:', action, zoneName, duration ? duration + 's' : '', waterUsed + 'L');
  },

  clearHistory() {
    if (!confirm('Apagar todo o historico recente?')) return;
    this.history = [];
    this.saveHistory();
    this.renderHistory();
    this.renderDashboard();
    this.showToast('Historico apagado');
  },

  renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (this.history.length === 0) {
      if (clearBtn) clearBtn.style.display = 'none';
      list.innerHTML = '<p class="empty-state"><span class="empty-icon">&#128221;</span><br>Sem registos</p>';
      return;
    }
    if (clearBtn) clearBtn.style.display = '';
    const recent = [...this.history].reverse().slice(0, 15);
    list.innerHTML = recent.map(h => `
      <div class="history-item">
        <div class="history-info">
          <span class="history-action ${h.action.includes('LIG') ? 'on' : 'off'}">${h.action}</span>
          <span class="history-time">${h.dateStr} ${h.timeStr}</span>
        </div>
        <span class="history-duration">${h.waterUsed ? h.waterUsed + ' L' : ''}</span>
      </div>
    `).join('');
  },

  renderHistoryTab() {
    const container = document.getElementById('historyTabContent');
    if (!container) return;

    const totalWater = this.getWaterTotal();
    const totalCycles = this.getTotalCycles();
    const costTotal = ((totalWater / 1000) * this.waterPrice).toFixed(2);

    let cycles = [];
    const onEntries = this.history.filter(h => h.action.includes('LIG'));
    const offEntries = this.history.filter(h => h.action.includes('DESLIG'));

    for (const onEntry of onEntries) {
      const offEntry = offEntries.find(o =>
        o.zone === onEntry.zone && new Date(o.time) > new Date(onEntry.time)
      );
      if (offEntry) {
        const idx = offEntries.indexOf(offEntry);
        offEntries.splice(idx, 1);
      }
      cycles.push({
        zone: onEntry.zone,
        timeStart: onEntry.time,
        timeEnd: offEntry ? offEntry.time : null,
        dateStartStr: onEntry.dateStr,
        timeStartStr: onEntry.timeStr,
        timeEndStr: offEntry ? offEntry.timeStr : '--',
        duration: onEntry.duration,
        durationStr: onEntry.duration ? this._formatDuration(onEntry.duration) : '--',
        waterUsed: onEntry.waterUsed || 0,
        humidityStart: onEntry.humidity,
        humidityEnd: offEntry ? offEntry.humidity : null,
        tempStart: onEntry.temperature,
        tempEnd: offEntry ? offEntry.temperature : null
      });
    }

    cycles.reverse();

    let html = '';

    html += `<div class="history-summary-cards">
      <div class="summary-card">
        <div class="summary-value">${totalCycles}</div>
        <div class="summary-label">Total Regas</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${totalWater} L</div>
        <div class="summary-label">Agua Total</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${costTotal} €</div>
        <div class="summary-label">Custo Estimado</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${this.zones.length}</div>
        <div class="summary-label">Zonas</div>
      </div>
    </div>`;

    if (cycles.length === 0) {
      html += '<p class="empty-state"><span class="empty-icon">📋</span><br>Nenhuma rega registada</p>';
    } else {
      html += '<div class="history-cycle-list">';
      for (const c of cycles) {
        const humStart = c.humidityStart !== null && c.humidityStart !== undefined ? c.humidityStart + '%' : '--';
        const humEnd = c.humidityEnd !== null && c.humidityEnd !== undefined ? c.humidityEnd + '%' : '--';
        const tmpStart = c.tempStart !== null ? c.tempStart + '°' : '--';
        const tmpEnd = c.tempEnd !== null ? c.tempEnd + '°' : '--';

        html += `
        <div class="history-cycle-item">
          <div class="cycle-header">
            <span class="cycle-zone">💧 ${c.zone}</span>
            <span class="cycle-date">${c.dateStartStr}</span>
          </div>
          <div class="cycle-body">
            <div class="cycle-row">
              <span class="cycle-label">Inicio</span>
              <span class="cycle-val">${c.timeStartStr}</span>
            </div>
            <div class="cycle-row">
              <span class="cycle-label">Fim</span>
              <span class="cycle-val">${c.timeEndStr}</span>
            </div>
            <div class="cycle-row">
              <span class="cycle-label">Duracao</span>
              <span class="cycle-val">${c.durationStr}</span>
            </div>
            <div class="cycle-row">
              <span class="cycle-label">Agua</span>
              <span class="cycle-val water">${c.waterUsed} L</span>
            </div>
            <div class="cycle-row">
              <span class="cycle-label">Humidade</span>
              <span class="cycle-val">${humStart} → ${humEnd}</span>
            </div>
            <div class="cycle-row">
              <span class="cycle-label">Temperatura</span>
              <span class="cycle-val">${tmpStart} → ${tmpEnd}</span>
            </div>
          </div>
        </div>`;
      }
      html += '</div>';
    }

    container.innerHTML = html;
  },

  _formatDuration(seconds) {
    if (seconds < 60) return seconds + 's';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return m + 'min' + (s > 0 ? ' ' + s + 's' : '');
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return h + 'h' + (rm > 0 ? ' ' + rm + 'min' : '');
  },

  // === Water Usage ===
  getWaterToday() {
    const today = new Date().toLocaleDateString('pt-PT');
    let totalSeconds = 0;
    for (const h of this.history) {
      const hDate = new Date(h.time).toLocaleDateString('pt-PT');
      if (hDate === today && h.duration) totalSeconds += h.duration;
    }
    return Math.round((totalSeconds / 60) * this.flowRate);
  },

  getWaterThisMonth() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let totalSeconds = 0;
    for (const h of this.history) {
      const t = new Date(h.time);
      const m = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
      if (m === currentMonth && h.duration) totalSeconds += h.duration;
    }
    return Math.round((totalSeconds / 60) * this.flowRate);
  },

  getWaterCostThisMonth() {
    const liters = this.getWaterThisMonth();
    const m3 = liters / 1000;
    return (m3 * this.waterPrice).toFixed(2);
  },

  getTotalCycles() {
    return this.history.filter(h => h.action.includes('LIG')).length;
  },

  getRegasToday() {
    const today = new Date().toLocaleDateString('pt-PT');
    return this.history.filter(h => {
      const hDate = new Date(h.time).toLocaleDateString('pt-PT');
      return hDate === today && h.action.includes('LIG');
    }).length;
  },

  getGreeting() {
    const h = new Date().getHours();
    if (h < 7) return 'Boa noite, está tudo calmo por aí?';
    if (h < 12) return 'Bom dia, que o jardim floresça!';
    if (h < 15) return 'Boa tarde, está na hora da rega?';
    if (h < 19) return 'Boa tarde, o sol ainda aperta!';
    if (h < 22) return 'Boa noite, o dia já vai longo...';
    return 'Boa noite, amanhã há mais.';
  },

  loadPumpState() {
    const saved = localStorage.getItem('aquasmart_pump');
    if (saved !== null) this.pumpPaused = saved === 'true';
  },

  savePumpState() {
    localStorage.setItem('aquasmart_pump', this.pumpPaused);
  },

  togglePump() {
    this.pumpPaused = !this.pumpPaused;
    this.savePumpState();
    if (this.pumpPaused) {
      this.stopAllSilent();
      this.showToast('Bomba em pausa');
      this.addNotification('Bomba', 'Sistema em pausa', 'warn');
    } else {
      this.showToast('Bomba ativa');
      this.addNotification('Bomba', 'Sistema ativo', 'success');
    }
    this.renderDashboard();
  },

  async stopAllSilent() {
    for (const z of this.zones) {
      this.activeZones.delete(z.id);
      this.zoneTimers[z.id] = 0;
    }
    await this.sendCommand('ALLOFF');
    this.renderZones();
    this.renderDashboard();
    this.updateActiveCount();
  },

  getWaterTotal() {
    let total = 0;
    for (const h of this.history) {
      if (h.waterUsed) total += h.waterUsed;
    }
    return total;
  },

  getWaterByZone() {
    const totals = {};
    for (const z of this.zones) totals[z.name] = 0;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    for (const h of this.history) {
      if (!h.duration) continue;
      if (new Date(h.time) < cutoff) continue;
      if (h.zone in totals) totals[h.zone] += h.duration;
    }
    return totals;
  },

  renderDonut() {
    const canvas = document.getElementById('donutChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (this.donut) this.donut.destroy();

    const zoneData = this.getWaterByZone();
    const entries = Object.entries(zoneData).filter(([, s]) => s > 0);

    const container = document.getElementById('donutContainer');
    if (!container) return;
    if (entries.length === 0) {
      container.querySelector('.donut-legend')?.remove();
      this.donut = null;
      return;
    }

    const colors = ['#22d3ee', '#0891b2', '#60a5fa', '#0e7490', '#3b82f6', '#06b6d4'];
    const labels = entries.map(([n]) => n);
    const data = entries.map(([, s]) => Math.round((s / 60) * this.flowRate));

    this.donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, entries.length),
          borderColor: 'var(--bg-surface)',
          borderWidth: 2,
          hoverBorderColor: 'var(--cyan-400)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2332',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: '#334155',
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} L` }
          }
        }
      }
    });

    let legendEl = container.querySelector('.donut-legend');
    if (!legendEl) {
      legendEl = document.createElement('div');
      legendEl.className = 'donut-legend';
      container.appendChild(legendEl);
    }
    legendEl.innerHTML = entries.map(([n, s], i) =>
      `<span class="donut-legend-item"><span class="donut-legend-dot" style="background:${colors[i]}"></span>${n}: ${Math.round((s / 60) * this.flowRate)} L</span>`
    ).join('');
  },

  // === Charts ===
  getWaterByDay(days) {
    const result = {};
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      result[key] = 0;
    }
    for (const h of this.history) {
      if (!h.duration) continue;
      const t = new Date(h.time);
      const key = t.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      if (key in result) result[key] += h.duration;
    }
    return result;
  },

  getWaterByWeek() {
    const result = {};
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = dayNames[d.getDay()];
      result[key] = 0;
    }
    for (const h of this.history) {
      if (!h.duration) continue;
      const t = new Date(h.time);
      const now2 = new Date();
      const diffDays = Math.floor((now2 - t) / (1000 * 60 * 60 * 24));
      if (diffDays <= 6 && diffDays >= 0) {
        const key = dayNames[t.getDay()];
        if (key in result) result[key] += h.duration;
      }
    }
    return result;
  },

  renderChart() {
    const canvas = document.getElementById('waterChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');

    if (this.chart) this.chart.destroy();

    let data, label;
    if (this.chartPeriod === 'week') {
      const weekData = this.getWaterByWeek();
      data = Object.values(weekData).map(s => Math.round((s / 60) * this.flowRate));
      label = Object.keys(weekData);
    } else if (this.chartPeriod === 'month') {
      const monthData = this.getWaterByDay(30);
      const entries = Object.entries(monthData);
      data = entries.map(([, s]) => Math.round((s / 60) * this.flowRate));
      label = entries.map(([k]) => k);
    } else {
      const qData = this.getWaterByDay(90);
      const entries = Object.entries(qData);
      // Show every 3rd label to avoid clutter
      data = entries.map(([, s]) => Math.round((s / 60) * this.flowRate));
      label = entries.map(([k], i) => i % 7 === 0 ? k : '');
    }

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: label,
        datasets: [{
          label: 'Litros',
          data,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
            gradient.addColorStop(0, 'rgba(6,182,212,0.7)');
            gradient.addColorStop(1, 'rgba(6,182,212,0.1)');
            return gradient;
          },
          borderColor: 'rgba(6,182,212,0.9)',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2332',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: '#334155',
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: { label: ctx => ` ${ctx.parsed.y} L` }
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#64748b', font: { size: 10 }, callback: v => v + ' L' },
            grid: { color: 'rgba(51,65,85,0.2)' },
            beginAtZero: true
          }
        }
      }
    });
  },

  setChartPeriod(period) {
    this.chartPeriod = period;
    this.renderChart();
  },

  // === Weather (IPMA) ===
  async fetchWeather() {
    if (!this.ipmaCityId) return;
    try {
      await this.loadIpmaWeatherTypes();
      const resp = await fetch(`https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${this.ipmaCityId}.json`);
      const data = await resp.json();
      if (data.data && data.data.length > 0) {
        this.forecast = data.data;
        const today = this.forecast[0];
        this.weather = {
          precipitation: today.precipitaProb || 0,
          weatherCode: today.idWeatherType,
          tempMax: parseFloat(today.tMax),
          tempMin: parseFloat(today.tMin)
        };
        this.updateWeatherCard();
        this.updateLocationDisplay();
        this.renderForecastCards();
        this.renderWeatherChart();
        this.updateRecommendation();
        if (this.isRainyDay()) {
          this.addNotification('Chuva prevista', `${Math.round(today.precipitaProb)}% prob em ${this.ipmaCityName}`, 'warn');
        }
        LOG('IPMA:', this.ipmaCityName, today.tMax + '°/' + today.tMin + '°', this.getWeatherDescription(today.idWeatherType));
      }
    } catch (e) {
      WARN('Erro IPMA:', e.message);
      this.weather = null;
      this.updateWeatherCard();
    }
  },

  updateLocationDisplay() {
    const el = document.getElementById('dashLocation');
    if (!el) return;
    if (this.ipmaCityName) {
      el.style.display = '';
      el.textContent = '📍 ' + this.ipmaCityName;
    } else {
      el.style.display = 'none';
    }
  },

  renderWeatherSection() {
    const forecast = this.viewForecast || this.forecast;
    const weather = this.viewWeather || this.weather;
    const locName = this.viewLocationName || this.ipmaCityName;

    if (!weather || !forecast) {
      const wl = document.getElementById('weatherLocation');
      if (wl) wl.textContent = locName || 'Sem localizacao';
      const banner = document.getElementById('locationBanner');
      if (banner) banner.style.display = this.hasLocation() ? 'none' : '';
      return;
    }
    const wl = document.getElementById('weatherLocation');
    const wtl = document.getElementById('weatherTempLarge');
    const wdl = document.getElementById('weatherDescLarge');
    const wp = document.getElementById('weatherPrecip');
    const wmm = document.getElementById('weatherMinMax');
    const wil = document.getElementById('weatherIconLarge');
    if (wl) wl.textContent = locName || 'Localizacao';
    if (wtl) wtl.textContent = Math.round(weather.tempMax) + '°';
    if (wdl) wdl.textContent = this.getWeatherDescription(weather.weatherCode);
    if (wp) wp.textContent = 'Chuva: ' + Math.round(weather.precipitation) + '% prob';
    if (wmm) wmm.textContent = Math.round(weather.tempMin) + '° / ' + Math.round(weather.tempMax) + '°';
    if (wil) wil.textContent = this.getWeatherIcon(weather.weatherCode);

    this.renderForecastCards();
    this.updateRecommendation();
    setTimeout(() => this.renderWeatherChart(), 150);
  },

  renderWeatherInline() {
    const container = document.getElementById('weatherInline');
    if (!container) return;

    const forecast = this.viewForecast || this.forecast;
    const weather = this.viewWeather || this.weather;
    const locName = this.viewLocationName || this.ipmaCityName;

    if (!weather || !forecast || !this.hasLocation()) {
      container.innerHTML = `<div class="weather-inline-empty">
        <span>📡 Sem dados meteorológicos</span>
        <button class="btn btn-sm btn-outline" id="openLocationInlineBtn">Definir localização</button>
      </div>`;
      document.getElementById('openLocationInlineBtn')?.addEventListener('click', () => this._showLocationModal());
      return;
    }

    const rec = this.getRecommendation();
    container.innerHTML = `
      <div class="weather-inline-header">
        <span class="wi-loc">📍 ${locName}</span>
        <span class="wi-temp">${this.getWeatherIcon(weather.weatherCode)} ${Math.round(weather.tempMax)}°</span>
        <span class="wi-desc">${this.getWeatherDescription(weather.weatherCode)}</span>
      </div>
      <div class="weather-inline-details">
        <span>🌡️ ${Math.round(weather.tempMin)}° / ${Math.round(weather.tempMax)}°</span>
        <span>💧 ${Math.round(weather.precipitation)}% chuva</span>
      </div>
      <div class="weather-inline-rec">
        <span class="wi-rec-icon">${rec.icon}</span>
        <div>
          <div class="wi-rec-title">${rec.title}</div>
          <div class="wi-rec-body">${rec.body}</div>
        </div>
      </div>
      <div class="forecast-cards">${(forecast.slice(0, 5)).map((d, i) => {
        const date = new Date(d.forecastDate + 'T00:00:00');
        const day = date.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit' });
        const isToday = i === 0;
        const icon = this.getWeatherIcon(d.idWeatherType);
        return `<div class="forecast-card ${isToday ? 'today' : ''}">
          <span class="fc-day">${isToday ? 'Hoje' : day}</span>
          <span class="fc-icon">${icon}</span>
          <span class="fc-temp">${Math.round(parseFloat(d.tMax))}°</span>
          <span class="fc-temp-lo">${Math.round(parseFloat(d.tMin))}°</span>
          ${d.precipitaProb > 0 ? `<span class="fc-rain">${Math.round(d.precipitaProb)}%</span>` : ''}
        </div>`;
      }).join('')}</div>
    `;
  },

  renderForecastCards() {
    const container = document.getElementById('forecastCards');
    const forecast = this.viewForecast || this.forecast;
    if (!container || !forecast) return;
    container.innerHTML = forecast.slice(0, 7).map((d, i) => {
      const date = new Date(d.forecastDate + 'T00:00:00');
      const day = date.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit' });
      const isToday = i === 0;
      const icon = this.getWeatherIcon(d.idWeatherType);
      return `
        <div class="forecast-card ${isToday ? 'today' : ''}">
          <span class="fc-day">${isToday ? 'Hoje' : day}</span>
          <span class="fc-icon">${icon}</span>
          <span class="fc-temp">${Math.round(parseFloat(d.tMax))}°</span>
          <span class="fc-temp-lo">${Math.round(parseFloat(d.tMin))}°</span>
          ${d.precipitaProb > 0 ? `<span class="fc-rain">${Math.round(d.precipitaProb)}%</span>` : ''}
        </div>
      `;
    }).join('');
  },

  renderWeatherChart() {
    const canvas = document.getElementById('weatherForecastChart');
    const forecast = this.viewForecast || this.forecast;
    if (!canvas || typeof Chart === 'undefined' || !forecast) return;
    const section = document.querySelector('.weather-section');
    if (!section || section.style.display === 'none') return;
    const ctx = canvas.getContext('2d');
    if (this.weatherChart) this.weatherChart.destroy();

    const data = forecast.slice(0, 7);
    const labels = data.map(d => {
      const date = new Date(d.forecastDate + 'T00:00:00');
      return date.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    });
    const precipProb = data.map(d => d.precipitaProb || 0);
    const tempMax = data.map(d => parseFloat(d.tMax));
    const tempMin = data.map(d => parseFloat(d.tMin));

    this.weatherChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Chuva (%)',
            data: precipProb,
            backgroundColor: 'rgba(6,182,212,0.35)',
            borderColor: 'rgba(6,182,212,0.6)',
            borderWidth: 1,
            borderRadius: 5,
            order: 2,
            yAxisID: 'yPrecip'
          },
          {
            type: 'line',
            label: 'Max °C',
            data: tempMax,
            borderColor: '#fb923c',
            backgroundColor: 'rgba(251,146,60,0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#fb923c',
            tension: 0.3,
            order: 1,
            yAxisID: 'yTemp'
          },
          {
            type: 'line',
            label: 'Min °C',
            data: tempMin,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#60a5fa',
            tension: 0.3,
            borderDash: [4, 3],
            order: 1,
            yAxisID: 'yTemp'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', boxWidth: 12, padding: 16, font: { size: 10 }, usePointStyle: true }
          },
          tooltip: { backgroundColor: '#1a2332', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, cornerRadius: 8 }
        },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
          yPrecip: {
            type: 'linear', position: 'left',
            title: { display: true, text: '%', color: '#64748b', font: { size: 9 } },
            ticks: { color: '#64748b', font: { size: 9 }, callback: v => v + '%' },
            grid: { color: 'rgba(51,65,85,0.15)' },
            max: 100, beginAtZero: true
          },
          yTemp: {
            type: 'linear', position: 'right',
            title: { display: true, text: '°C', color: '#64748b', font: { size: 9 } },
            ticks: { color: '#64748b', font: { size: 9 } },
            grid: { display: false },
            beginAtZero: false
          }
        }
      }
    });
  },

  getWeatherDescription(code) {
    if (this._ipmaWeatherTypes && this._ipmaWeatherTypes[code]) return this._ipmaWeatherTypes[code];
    if (code === undefined || code === null) return '--';
    return 'Desconhecido';
  },

  getWeatherIcon(code) {
    if (!code) return '--';
    if (code <= 2) return 'Sol';
    if (code <= 5) return 'Nublado';
    if (code <= 8 || code === 14 || code === 21 || code === 24) return 'Chuva';
    if (code <= 11) return 'Chuva';
    if (code === 12 || code === 13) return 'Neve';
    if (code >= 15 && code <= 17) return 'Trovoada';
    if (code === 18 || code === 19) return 'Neve';
    if (code >= 25 && code <= 27) return 'Chuva';
    return 'Nublado';
  },

  isRainyDay() {
    if (!this.weather) return false;
    return this.weather.precipitation > 70;
  },

  getRecommendation() {
    if (!this.weather) return { icon: '[?]', title: 'Sem dados', body: 'A aguardar dados meteorologicos...' };

    const precipProb = this.weather.precipitation;
    const temp = this.weather.tempMax;
    const soilDry = this.sensorData.moisture !== null && this.sensorData.moisture < 30;

    if (precipProb >= 80) {
      return { icon: '[!]', title: 'Chuva Provavel', body: `${Math.round(precipProb)}% de probabilidade. Considera saltar a rega hoje.` };
    }
    if (precipProb >= 50) {
      return { icon: '[i]', title: 'Risco de Chuva', body: `${Math.round(precipProb)}% de probabilidade. Reduz a duracao das regas.` };
    }
    if (soilDry) {
      return { icon: '[!]', title: 'Solo Seco - Rega Urgente', body: `Sensor indica ${this.sensorData.moisture}% de humidade. Ativa a rega manualmente.` };
    }
    if (temp > 32) {
      return { icon: '[!]', title: 'Onda de Calor', body: `${Math.round(temp)}°C previstos. Rega de manha cedo ou ao fim do dia.` };
    }
    if (temp < 10) {
      return { icon: '[i]', title: 'Tempo Frio', body: `Temperatura baixa (${Math.round(temp)}°C). Reduz a rega, as plantas precisam de menos agua.` };
    }
    return { icon: '[\u2713]', title: 'Condicoes Normais', body: 'Nada a assinalar. Mantem os horarios de rega definidos.' };
  },

  updateRecommendation() {
    const rec = this.getRecommendation();
    const dashText = document.getElementById('dashRecText');
    const dashDetail = document.getElementById('dashRecDetail');
    if (dashText) dashText.textContent = rec.icon + ' ' + rec.title;
    if (dashDetail) dashDetail.textContent = rec.body;
    const recTitle = document.getElementById('recTitle');
    const recBody = document.getElementById('recBody');
    const recIcon = document.getElementById('recIcon');
    if (recTitle) recTitle.textContent = rec.title;
    if (recBody) recBody.textContent = rec.body;
    if (recIcon) recIcon.textContent = rec.icon;
  },

  updateWeatherCard() {
    const el = document.getElementById('dashWeather');
    const sub = document.getElementById('dashWeatherSub');
    if (!el || !sub) return;
    if (this.weather) {
      const desc = this.getWeatherDescription(this.weather.weatherCode);
      const temp = this.weather.tempMax != null ? ` ${Math.round(this.weather.tempMax)}°` : '';
      if (this.isRainyDay()) {
        el.textContent = 'Chuva' + temp;
        sub.textContent = Math.round(this.weather.precipitation) + '% prob - regas suspensas';
      } else {
        el.textContent = desc + temp;
        sub.textContent = Math.round(this.weather.precipitation) + '% prob chuva';
      }
    } else {
      el.textContent = '--';
      sub.textContent = 'sem dados';
    }
    this.updateLocationDisplay();
  },

  async searchLocations(query) {
    if (query.length < 2) { document.getElementById('searchResults').innerHTML = ''; return; }
    await this.loadIpmaCities();
    const cities = this._ipmaCities || [];
    const results = cities.filter(c => c.local.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
    document.getElementById('searchResults').innerHTML = results.map(r =>
      `<div class="search-result-item" data-id="${r.globalIdLocal}" data-name="${r.local}">${r.local}</div>`
    ).join('');
  },

  async selectViewLocation(cityId, name) {
    try {
      const resp = await fetch(`https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${cityId}.json`);
      const data = await resp.json();
      if (data.data) {
        this.viewForecast = data.data;
        this.viewWeather = {
          precipitation: data.data[0].precipitaProb || 0,
          weatherCode: data.data[0].idWeatherType,
          tempMax: parseFloat(data.data[0].tMax),
          tempMin: parseFloat(data.data[0].tMin)
        };
        this.viewLocationName = name;
        this.renderWeatherSection();
        LOG('Tempo IPMA para:', name);
      }
    } catch (e) { WARN('Erro IPMA:', e.message); }
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('weatherSearchInput').value = '';
  },

  // === Calendar ===
  renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const today = new Date();
    const todayIdx = today.getDay();

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - todayIdx + i);
      weekDays.push({
        label: dayNames[d.getDay()],
        date: d.getDate(),
        month: d.getMonth() + 1,
        key: dayNames[d.getDay()],
        isToday: d.toDateString() === today.toDateString()
      });
    }

    grid.innerHTML = weekDays.map(day => {
      const daySchedules = this.schedules.filter(s => s.days.includes(day.key)).sort((a, b) => a.time.localeCompare(b.time));
      const slots = daySchedules.map(s => {
        const zone = this.zones.find(z => z.id === s.zoneId);
        return `<div class="cal-slot">${s.time} ${zone ? zone.name : '--'}</div>`;
      }).join('');
      return `
        <div class="calendar-day ${day.isToday ? 'today' : ''}">
          <span class="cal-day-label">${day.label} ${day.date}/${day.month}</span>
          ${slots || '<span style="color:var(--text-tertiary);font-size:0.55rem">-</span>'}
        </div>
      `;
    }).join('');
  },

  // === Debug Logs ===
  renderDebugLogs() {
    const logEl = document.getElementById('debugLog');
    if (!logEl) return;

    const connected = this.currentConnection && this.currentConnection.isConnected();
    const totalLogs = (window._LOG_BUFFER || []).length;
    const errors = (window._LOG_BUFFER || []).filter(l => l.level === 'ERR').length;
    const warnings = (window._LOG_BUFFER || []).filter(l => l.level === 'WARN').length;

    const statusSection = document.getElementById('debugStatus');
    if (statusSection) {
      statusSection.innerHTML = `
        <div class="debug-status-grid">
          <div class="debug-stat">
            <div class="debug-stat-val">${connected ? '✅' : '❌'}</div>
            <div class="debug-stat-label">Conexao</div>
          </div>
          <div class="debug-stat">
            <div class="debug-stat-val">${this.zones.length}</div>
            <div class="debug-stat-label">Zonas</div>
          </div>
          <div class="debug-stat">
            <div class="debug-stat-val">${this.activeZones.size}</div>
            <div class="debug-stat-label">Ativas</div>
          </div>
          <div class="debug-stat">
            <div class="debug-stat-val">${this.schedules.length}</div>
            <div class="debug-stat-label">Horarios</div>
          </div>
          <div class="debug-stat">
            <div class="debug-stat-val">${this.history.length}</div>
            <div class="debug-stat-label">Registos</div>
          </div>
          <div class="debug-stat">
            <div class="debug-stat-val">${errors}</div>
            <div class="debug-stat-label">Erros</div>
          </div>
        </div>
      `;
    }

    const buffer = window._LOG_BUFFER || [];
    if (buffer.length === 0) {
      logEl.innerHTML = '<p class="empty-state"><span class="empty-icon">&#128187;</span><br>Sem logs</p>';
      return;
    }
    const recent = [...buffer].reverse().slice(0, 100);
    logEl.innerHTML = recent.map(l => {
      const escaped = l.msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const color = l.level === 'ERR' ? 'var(--red-400)' : (l.level === 'WARN' ? 'var(--amber-400)' : 'var(--green-400)');
      return `<div class="log-entry">
        <span class="log-time">${l.time}</span>
        <span class="log-level" style="color:${color}">${l.level === 'ERR' ? 'ERRO' : l.level === 'WARN' ? 'AVISO' : 'INFO'}</span>
        <span class="log-msg">${escaped}</span>
      </div>`;
    }).join('');
  },

  clearLogs() {
    window._LOG_BUFFER = [];
    this.renderDebugLogs();
    this.updateDebugBadge();
    this.showToast('Logs apagados');
  },

  updateDebugBadge() {
    const bell = document.getElementById('bellIcon');
    if (!bell) return;
    if (this._notifications.length > 0) {
      bell.classList.add('has-notif');
    } else {
      bell.classList.remove('has-notif');
    }
  },

  addNotification(title, body, type) {
    this._notifications.unshift({
      title, body,
      time: new Date().toLocaleTimeString('pt-PT'),
      type: type || 'info'
    });
    if (this._notifications.length > 50) this._notifications = this._notifications.slice(0, 50);
    this.updateDebugBadge();
    this.renderNotificationPopup();
  },

  renderNotificationPopup() {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (this._notifications.length === 0) {
      list.innerHTML = '<p class="empty-state" style="padding:24px">Sem notificacoes</p>';
      return;
    }
    const colors = { err: 'var(--red-400)', warn: 'var(--amber-400)', success: 'var(--green-400)', info: 'var(--cyan-400)' };
    list.innerHTML = this._notifications.slice(0, 30).map(n => `
      <div class="notif-item">
        <div class="notif-title" style="color:${colors[n.type] || colors.info}">${n.title}</div>
        <div class="notif-body">${n.body}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    `).join('');
  },

  clearNotifications() {
    this._notifications = [];
    this.updateDebugBadge();
    this.renderNotificationPopup();
  },

  // === Sensor ===
  handleSensorData(moisture) {
    this.sensorData = { moisture, timestamp: new Date().toISOString() };
    const el = document.getElementById('sensorValue');
    const bar = document.getElementById('sensorBarFill');
    if (el) el.textContent = moisture + '%';
    if (bar) bar.style.width = moisture + '%';
    LOG('Sensor humidade:', moisture + '%');
  },

  // === Dashboard ===
  renderDashboard() {
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) greetingEl.textContent = this.getGreeting();

    const humidityEl = document.getElementById('dashHumidity');
    if (humidityEl) {
      humidityEl.textContent = this.sensorData.moisture !== null ? this.sensorData.moisture + '%' : '--';
    }

    const tempEl = document.getElementById('dashTemp');
    if (tempEl) {
      tempEl.textContent = this.weather ? Math.round(this.weather.tempMax) + '°' : '--';
    }

    const nextEl = document.getElementById('dashNextWater');
    const nextZoneEl = document.getElementById('dashNextZone');
    if (nextEl) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
      const today = dayNames[now.getDay()];
      let nextSchedule = null;
      let nextMin = Infinity;

      for (const s of this.schedules) {
        if (!s.days.includes(today)) continue;
        const [h, m] = s.time.split(':').map(Number);
        const sMin = h * 60 + m;
        if (sMin > currentTime && sMin < nextMin) {
          nextMin = sMin;
          nextSchedule = s;
        }
      }
      if (!nextSchedule) {
        for (const s of this.schedules) {
          const [h, m] = s.time.split(':').map(Number);
          const sMin = h * 60 + m;
          if (sMin < nextMin) { nextMin = sMin; nextSchedule = s; }
        }
      }

      if (nextSchedule) {
        const zone = this.zones.find(z => z.id === nextSchedule.zoneId);
        nextEl.textContent = nextSchedule.time;
        if (nextZoneEl) nextZoneEl.textContent = (zone ? zone.name : '') + (this.isRainyDay() ? ' (chuva)' : '');
      } else {
        nextEl.textContent = '--:--';
        if (nextZoneEl) nextZoneEl.textContent = '';
      }
    }

    const waterTodayEl = document.getElementById('dashWaterToday');
    if (waterTodayEl) waterTodayEl.textContent = this.getWaterToday() + ' L';

    const regasTodayEl = document.getElementById('dashRegasToday');
    if (regasTodayEl) regasTodayEl.textContent = this.getRegasToday();

    const pumpBtn = document.getElementById('pumpToggleBtn');
    if (pumpBtn) {
      if (this.pumpPaused) {
        pumpBtn.className = 'pump-btn paused';
        pumpBtn.querySelector('.pump-icon').textContent = '▶️';
        pumpBtn.querySelector('.pump-label').textContent = 'BOMBA EM PAUSA';
        pumpBtn.querySelector('.pump-sublabel').textContent = 'Tocar para ativar';
      } else {
        pumpBtn.className = 'pump-btn on';
        pumpBtn.querySelector('.pump-icon').textContent = '⏸️';
        pumpBtn.querySelector('.pump-label').textContent = 'BOMBA LIGADA';
        pumpBtn.querySelector('.pump-sublabel').textContent = 'Tocar para pausar';
      }
    }

    this.renderHistory();
    this.updateProfileSelect();
  },

  // === Zones ===
  renderZones() {
    return;
  },

  async turnZoneOn(zoneId) {
    const zone = this.zones.find(z => z.id === zoneId);
    if (!zone) return;
    this.activeZones.add(zoneId);
    const duration = 300;
    this.zoneTimers[zoneId] = duration;
    await this.sendCommand(`ON:${zone.pin}:${duration}`);
    if (!this.intervalId) this.startCountdown();
    this.addHistory(zone.name, 'LIGADO', duration);
    this.addNotification(`${zone.name}`, 'Ligado ' + duration + 's', 'success');
    this.renderZones();
    this.renderDashboard();
    this.updateActiveCount();
    this.showToast(`${zone.name} LIGADO`);
    this.notify('AquaSmart', `${zone.name} ligado (${duration}s)`);
  },

  async turnZoneOff(zoneId) {
    const zone = this.zones.find(z => z.id === zoneId);
    if (!zone) return;
    this.activeZones.delete(zoneId);
    this.zoneTimers[zoneId] = 0;
    await this.sendCommand(`OFF:${zone.pin}`);
    this.renderZones();
    this.renderDashboard();
    this.updateActiveCount();
    this.showToast(`${zone.name} DESLIGADO`);
  },

  async stopZone(zoneId) {
    const zone = this.zones.find(z => z.id === zoneId);
    if (!zone) return;
    await this.sendCommand(`OFF:${zone.pin}`);
  },

  async stopAll() {
    if (this.activeZones.size > 0 && !confirm('Parar todas as zonas ativas?')) return;
    for (const z of this.zones) {
      this.activeZones.delete(z.id);
      this.zoneTimers[z.id] = 0;
    }
    await this.sendCommand('ALLOFF');
    this.renderZones();
    this.renderDashboard();
    this.updateActiveCount();
    this.showToast('Todos os aspersores desligados');
    this.addNotification('Paragem', 'Todas as zonas desligadas', 'warn');
    LOG('ALLOFF enviado');
  },

  startCountdown() {
    this.intervalId = setInterval(() => {
      let anyActive = false;
      let anyFinished = false;
      for (const zoneId of Object.keys(this.zoneTimers)) {
        if (this.zoneTimers[zoneId] > 0) {
          this.zoneTimers[zoneId]--;
          anyActive = true;
          if (this.zoneTimers[zoneId] <= 0) {
            anyFinished = true;
            const zone = this.zones.find(z => z.id === parseInt(zoneId));
            this.activeZones.delete(parseInt(zoneId));
            if (zone) {
              this.sendCommand(`OFF:${zone.pin}`);
              this.addHistory(zone.name, 'DESLIGADO (auto)', 0);
              this.addNotification(`${zone.name}`, 'Rega terminou', 'info');
              this.showToast(`${zone.name} terminou`);
              this.notify('AquaSmart', `${zone.name} terminou a rega`);
            }
          }
        }
      }
      if (anyFinished) {
        this.renderZones();
        this.renderDashboard();
      } else {
        this.updateTimers();
      }
      this.updateActiveCount();
      if (!anyActive) { clearInterval(this.intervalId); this.intervalId = null; }
    }, 1000);
  },

  updateTimers() {
    const cards = document.querySelectorAll('.zone-card');
    cards.forEach(card => {
      const zoneId = parseInt(card.dataset.zone);
      const remaining = this.zoneTimers[zoneId] || 0;
      const status = card.querySelector('.zone-status');
      if (status) {
        if (remaining > 0) {
          status.textContent = remaining + 's';
          status.className = 'zone-status running';
          card.classList.add('active', 'running');
        } else if (this.activeZones.has(zoneId)) {
          status.textContent = 'LIG';
          status.className = 'zone-status on';
          card.classList.add('active');
          card.classList.remove('running');
        }
      }
    });
  },

  updateActiveCount() {
    return;
  },

  // === Connection ===
  showConnectionModal() {
    document.getElementById('wifiIpGroup').style.display = 'none';
    document.getElementById('connectionModal').classList.add('show');
  },
  hideConnectionModal() {
    document.getElementById('connectionModal').classList.remove('show');
  },
  async connectVia(handler, extraArg) {
    this.hideConnectionModal();
    try {
      const success = await handler.connect(extraArg);
      if (success) this.currentConnection = handler;
    } catch (err) { ERR('Falha na conexao:', err); }
  },
  async disconnectDevice() {
    if (this.currentConnection) {
      await this.currentConnection.disconnect();
      this.currentConnection = null;
    }
    this.updateConnectionUI();
  },
  updateConnectionUI() {
    const dot = document.getElementById('connectionStatus');
    const label = document.getElementById('connectionLabel');
    if (this.currentConnection && this.currentConnection.isConnected()) {
      dot.className = 'dot on'; label.textContent = 'Conectado';
    } else {
      dot.className = 'dot off'; label.textContent = 'Desconectado';
    }
  },
  async sendCommand(cmd) {
    if (!this.currentConnection || !this.currentConnection.isConnected()) {
      WARN('Nao conectado. Comando ignorado:', cmd);
      return false;
    }
    LOG('Enviando comando:', cmd);
    return await this.currentConnection.send(cmd);
  },

  // === Schedules ===
  loadSchedules() {
    try {
      const saved = localStorage.getItem('aquasmart_schedules');
      this.schedules = saved ? JSON.parse(saved) : [];
    } catch (_) { this.schedules = []; }
  },
  saveSchedules() {
    localStorage.setItem('aquasmart_schedules', JSON.stringify(this.schedules));
    this.saveProfileSchedules(this.currentProfile);
  },
  renderSchedules() {
    const list = document.getElementById('scheduleList');
    if (this.schedules.length === 0) {
      list.innerHTML = '<p class="empty-state"><span class="empty-icon">&#128197;</span><br>Nenhum horario definido</p>';
      return;
    }
    list.innerHTML = this.schedules.map((s, i) => {
      const allDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
      const daysDots = allDays.map(d =>
        `<span class="schedule-day-dot ${s.days.includes(d) ? 'active' : ''}">${d.slice(0,1)}</span>`
      ).join('');
      return `
        <div class="schedule-item">
          <div class="schedule-info">
            <span class="schedule-zone">${s.duration}min</span>
            <span class="schedule-time">&#128339; ${s.time}</span>
            <div class="schedule-days">${daysDots}</div>
          </div>
          <div class="schedule-actions">
            <button class="btn btn-outline edit-schedule" data-index="${i}">Editar</button>
            <button class="btn btn-ghost delete-schedule" data-index="${i}">&#10005;</button>
          </div>
        </div>
      `;
    }).join('');
  },
  addSchedule(zoneId, time, duration, days) {
    this.schedules.push({ zoneId, time, duration, days });
    this.saveSchedules();
    this.renderSchedules();
    this.renderDashboard();
    LOG('Horario adicionado:', zoneId, time, duration + 'min', days);
    this.addNotification('Horario', `Adicionado as ${time}`, 'info');
  },
  deleteSchedule(index) {
    this.schedules.splice(index, 1);
    this.saveSchedules();
    this.renderSchedules();
    this.renderDashboard();
  },
  startScheduleChecker() {
    setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
      const today = dayNames[now.getDay()];

      if (this.isRainyDay()) {
        return;
      }

      if (this.pumpPaused) {
        return;
      }

      for (const schedule of this.schedules) {
        if (schedule.time === currentTime && schedule.days.includes(today)) {
          const zone = this.zones.find(z => z.id === schedule.zoneId);
          if (zone && !this.activeZones.has(zone.id)) {
            this.turnZoneOnWithDuration(zone.id, schedule.duration * 60);
            this.showToast(`Agendado: ${zone.name}`);
            LOG('Horario ativado:', zone.name, schedule.time);
          }
        }
      }
    }, 30000);
  },
  async turnZoneOnWithDuration(zoneId, durationSeconds) {
    const zone = this.zones.find(z => z.id === zoneId);
    if (!zone) return;
    this.activeZones.add(zoneId);
    this.zoneTimers[zoneId] = durationSeconds;
    await this.sendCommand(`ON:${zone.pin}:${durationSeconds}`);
    this.addHistory(zone.name, 'LIGADO (agendado)', durationSeconds);
    this.addNotification(`${zone.name}`, 'Agendado ' + durationSeconds + 's', 'info');
    if (!this.intervalId) this.startCountdown();
    this.renderZones();
    this.renderDashboard();
    this.updateActiveCount();
  },

  // === Export / Import ===
  exportData() {
    const data = {
      version: 2,
      exported: new Date().toISOString(),
      zones: this.zones,
      schedules: this.schedules,
      history: this.history,
      flowRate: this.flowRate,
      waterPrice: this.waterPrice,
      ipmaCityId: this.ipmaCityId, ipmaCityName: this.ipmaCityName,
      profiles: this.profiles,
      currentProfile: this.currentProfile
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aquasmart_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Dados exportados');
    LOG('Export concluido');
  },

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.zones) { this.zones = data.zones; this.nextZoneId = Math.max(...data.zones.map(z => z.id), 0) + 1; }
          if (data.schedules) this.schedules = data.schedules;
          if (data.history) this.history = data.history;
          if (data.flowRate) this.flowRate = data.flowRate;
          if (data.waterPrice) this.waterPrice = data.waterPrice;
          if (data.ipmaCityId) { this.ipmaCityId = data.ipmaCityId; this.ipmaCityName = data.ipmaCityName || ''; this.saveIpmaLocation(); }
          if (data.profiles) this.profiles = data.profiles;
          if (data.currentProfile) this.currentProfile = data.currentProfile;
          this.saveZones();
          this.saveSchedules();
          this.saveHistory();
          this.saveFlowRate(this.flowRate);
          this.saveWaterPrice(this.waterPrice);
          this.saveProfiles();
          localStorage.setItem('aquasmart_active_profile', this.currentProfile);
          this.renderZones();
          this.renderSchedules();
          this.renderDashboard();
          this.updateProfileSelect();
          this.showToast('Dados importados com sucesso');
          LOG('Import concluido:', data.zones?.length, 'zonas,', data.schedules?.length, 'horarios');
        } catch (err) {
          ERR('Erro ao importar:', err);
          this.showToast('Ficheiro invalido');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  // === Toast ===
  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => toast.classList.remove('show'), 800);
  },

  // === Events ===
  setupEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', () => {
      if (this.currentConnection && this.currentConnection.isConnected()) {
        this.disconnectDevice();
      } else {
        this.showConnectionModal();
      }
    });

    // Logo click -> dashboard
    document.getElementById('logoBtn')?.addEventListener('click', () => {
      document.querySelector('.nav-btn[data-tab="dashboard"]').click();
    });

    // Bell click -> toggle notification popup
    document.getElementById('bellIcon')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = document.getElementById('notifPopup');
      popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
      this.renderNotificationPopup();
    });

    // Clear notifications
    document.getElementById('clearNotifsBtn')?.addEventListener('click', () => this.clearNotifications());

    // Close popup on outside click
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('notifPopup');
      if (popup && popup.style.display !== 'none' && !e.target.closest('.bell-wrap')) {
        popup.style.display = 'none';
      }
    });

    // WiFi
    document.getElementById('wifiConnect').addEventListener('click', () => {
      const ipGroup = document.getElementById('wifiIpGroup');
      ipGroup.style.display = 'block';
      const savedIp = WifiHandler.getSavedIp();
      if (savedIp) document.getElementById('wifiIp').value = savedIp;
    });
    document.getElementById('wifiConnectConfirm').addEventListener('click', async () => {
      const ip = document.getElementById('wifiIp').value.trim();
      if (!ip) { this.showToast('Insere o IP do ESP'); return; }
      WifiHandler.saveIp(ip);
      try { await this.connectVia(WifiHandler, ip); }
      catch (_) { this.showToast('Nao foi possivel ligar. Verifica IP e WiFi.'); }
    });

    // Bluetooth
    document.getElementById('btConnect').addEventListener('click', () => {
      if (!BleHandler.isSupported()) { this.showToast('Bluetooth nao suportado neste navegador'); return; }
      this.connectVia(BleHandler);
    });

    // USB Serial
    document.getElementById('serialConnect').addEventListener('click', () => {
      if (!SerialHandler.isSupported()) { this.showToast('USB Serial nao suportado. Usa Chrome/Edge no PC.'); return; }
      this.connectVia(SerialHandler);
    });

    // Demo
    document.getElementById('demoConnect').addEventListener('click', () => {
      this.connectVia(DemoHandler);
      this.showToast('Modo demo - sem hardware');
    });

    document.getElementById('cancelConnect').addEventListener('click', () => this.hideConnectionModal());

    // Pump toggle
    document.getElementById('pumpToggleBtn')?.addEventListener('click', () => this.togglePump());

    // Connection events
    window.addEventListener('device-connected', (e) => {
      this.updateConnectionUI();
      this.showToast(`Conectado: ${e.detail.name}`);
      this.addNotification('Dispositivo', `Conectado via ${e.detail.name}`, 'success');
      LOG('Conectado:', e.detail.name);
    });
    window.addEventListener('device-disconnected', () => {
      this.currentConnection = null;
      this.updateConnectionUI();
      this.showToast('Dispositivo desconectado');
      this.addNotification('Dispositivo', 'Desconectado', 'warn');
      WARN('Dispositivo desconectado');
    });
    window.addEventListener('arduino-data', (e) => {
      const data = e.detail.data;
      LOG('Dados do Arduino:', data);
      if (data.startsWith('DONE:')) {
        const pin = data.split(':')[1];
        const zone = this.zones.find(z => String(z.pin) === pin);
        if (zone) {
          this.activeZones.delete(zone.id);
          this.zoneTimers[zone.id] = 0;
          this.addHistory(zone.name, 'DESLIGADO (hardware)', 0);
          this.addNotification(`${zone.name}`, 'Hardware terminou rega', 'info');
          this.renderZones();
          this.renderDashboard();
          this.updateActiveCount();
          this.showToast(`${zone.name} terminou`);
          this.notify('AquaSmart', `${zone.name} terminou a rega`);
        }
      }
      if (data.startsWith('SENSOR:')) {
        const moisture = parseInt(data.split(':')[1]);
        if (!isNaN(moisture)) {
          this.handleSensorData(moisture);
        }
      }
    });

    // Schedule modal
    document.getElementById('addScheduleBtn').addEventListener('click', () => this.showScheduleModal());
    document.getElementById('saveSchedule').addEventListener('click', () => this.saveNewSchedule());
    document.getElementById('cancelSchedule').addEventListener('click', () => this.hideScheduleModal());
    document.getElementById('scheduleList').addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      if (isNaN(idx)) return;
      if (e.target.classList.contains('delete-schedule')) { this.deleteSchedule(idx); this.showToast('Horario apagado'); }
      else if (e.target.classList.contains('edit-schedule')) this.editSchedule(idx);
    });

    // Bottom nav (5 tabs)
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;

        document.querySelector('.dashboard-section').style.display = 'none';
        const zs = document.querySelector('.zones-section');
        if (zs) zs.style.display = 'none';
        document.querySelector('.schedule-section').style.display = 'none';
        document.querySelector('.debug-section').style.display = 'none';
        const ws = document.querySelector('.weather-section');
        if (ws) ws.style.display = 'none';
        const hp = document.querySelector('.history-tab-section');
        if (hp) hp.style.display = 'none';
        const sp = document.querySelector('.settings-panel');
        if (sp) sp.style.display = 'none';

        if (tab === 'dashboard') {
          document.querySelector('.dashboard-section').style.display = 'block';
          this.renderDashboard();
        } else if (tab === 'schedule') {
          document.querySelector('.schedule-section').style.display = 'block';
          this.renderWeatherInline();
        } else if (tab === 'history') {
          const hps = document.querySelector('.history-tab-section');
          if (hps) hps.style.display = 'block';
          this.renderHistoryTab();
        } else if (tab === 'debug') {
          document.querySelector('.debug-section').style.display = 'block';
          this.renderDebugLogs();
          this.updateDebugBadge();
        } else if (tab === 'settings') {
          this.renderSettings();
        }
      });
    });

    // Weather search
    let searchTimeout;
    document.getElementById('weatherSearchInput')?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => this.searchLocations(e.target.value), 300);
    });
    document.getElementById('searchResults')?.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (!item || !item.dataset.id) return;
      this.selectViewLocation(parseInt(item.dataset.id), item.dataset.name);
    });

    // Clear history
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => this.clearHistory());

    // Clear logs
    document.getElementById('clearLogsBtn')?.addEventListener('click', () => this.clearLogs());

    // Profile select
    document.getElementById('profileSelect')?.addEventListener('change', (e) => {
      this.switchProfile(e.target.value);
    });

    // Log buffer updated
    window.addEventListener('log-updated', () => {
      this.updateDebugBadge();
      const buffer = window._LOG_BUFFER || [];
      const last = buffer[buffer.length - 1];
      if (last && last.level === 'ERR') {
        this.addNotification('Erro', last.msg, 'err');
      }
      if (document.querySelector('.debug-section')?.style.display !== 'none') {
        this.renderDebugLogs();
      }
    });

    // Modal backdrop clicks
    document.getElementById('scheduleModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) this.hideScheduleModal(); });
    document.getElementById('connectionModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) this.hideConnectionModal(); });
  },

  // === Schedule Modal ===
  showScheduleModal() {
    document.getElementById('scheduleTime').value = '06:00';
    document.getElementById('scheduleDuration').value = '10';
    const picker = document.getElementById('daysPicker');
    picker.innerHTML = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map(d =>
      `<button class="day-chip selected" data-day="${d}">${d.slice(0,1)}</button>`
    ).join('');
    picker.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('selected'));
    });
    document.getElementById('scheduleModal').classList.add('show');
  },
  hideScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('show');
  },
  saveNewSchedule() {
    const time = document.getElementById('scheduleTime').value;
    const duration = parseInt(document.getElementById('scheduleDuration').value);
    const days = Array.from(document.querySelectorAll('#daysPicker .day-chip.selected')).map(c => c.dataset.day);
    if (!time) { this.showToast('Define uma hora'); return; }
    if (!duration || duration < 1) { this.showToast('Duracao invalida'); return; }
    if (days.length === 0) { this.showToast('Seleciona pelo menos um dia'); return; }
    this.addSchedule(1, time, duration, days);
    this.hideScheduleModal();
    this.showToast('Horario guardado');
  },
  editSchedule(index) {
    const schedule = this.schedules[index];
    if (!schedule) return;
    document.getElementById('scheduleTime').value = schedule.time;
    document.getElementById('scheduleDuration').value = schedule.duration;
    const picker = document.getElementById('daysPicker');
    picker.innerHTML = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map(d =>
      `<button class="day-chip ${schedule.days.includes(d) ? 'selected' : ''}" data-day="${d}">${d.slice(0,1)}</button>`
    ).join('');
    picker.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('selected'));
    });
    document.getElementById('scheduleModal').classList.add('show');
    const saveBtn = document.getElementById('saveSchedule');
    const oldHandler = saveBtn.onclick;
    saveBtn.onclick = () => {
      const time = document.getElementById('scheduleTime').value;
      const duration = parseInt(document.getElementById('scheduleDuration').value);
      const days = Array.from(document.querySelectorAll('#daysPicker .day-chip.selected')).map(c => c.dataset.day);
      this.schedules[index] = { zoneId: 1, time, duration, days };
      this.saveSchedules();
      this.renderSchedules();
      this.renderDashboard();
      this.hideScheduleModal();
      this.showToast('Horario atualizado');
      saveBtn.onclick = oldHandler;
    };
    document.getElementById('scheduleModal').classList.add('show');
  },

  // === Settings (with CRUD zone management, theme, export/import) ===
  renderSettings() {
    let panel = document.querySelector('.settings-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'settings-panel';
      document.querySelector('main').appendChild(panel);
    }
    panel.style.display = 'block';

    const isLight = document.body.classList.contains('light');

    panel.innerHTML = `
      <div class="section-header"><h2>Definicoes</h2></div>

      <div class="setting-row">
        <div>
          <span class="setting-label">Tema</span>
          <div class="setting-sub">Alternar entre claro e escuro</div>
        </div>
        <input type="checkbox" class="toggle" id="themeToggle" ${isLight ? 'checked' : ''}>
      </div>

      <div class="setting-row">
        <div>
          <span class="setting-label">Notificacoes</span>
          <div class="setting-sub">Alertas quando a rega termina</div>
        </div>
        <input type="checkbox" class="toggle" id="notifToggle" ${this.notifEnabled ? 'checked' : ''}>
      </div>

      <div class="setting-row">
        <div>
          <span class="setting-label">Caudal (L/min)</span>
          <div class="setting-sub">Para estimativa de agua gasta</div>
        </div>
        <input type="number" id="flowRateInput" value="${this.flowRate}" min="1" max="100"
          style="width:70px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--bg-surface);color:var(--text);text-align:center;font-size:0.9rem">
      </div>

      <div class="setting-row">
        <div>
          <span class="setting-label">Preco da Agua (&euro;/m&sup3;)</span>
          <div class="setting-sub">Para estimativa de custos</div>
        </div>
        <input type="number" id="waterPriceInput" value="${this.waterPrice}" min="0.1" max="20" step="0.01"
          style="width:80px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--bg-surface);color:var(--text);text-align:center;font-size:0.9rem">
      </div>

      <div class="setting-row">
        <div>
          <span class="setting-label">Localizacao</span>
          <div class="setting-sub">${this.ipmaCityName || 'Nao definida'}</div>
        </div>
        <button class="btn btn-outline btn-sm" id="updateLocationBtn">Alterar</button>
      </div>

      <div id="locationForm" style="display:none;margin:8px 0;padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="ipmaSettingsSelect" style="flex:1;min-width:150px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--bg-elevated);color:var(--text);font-size:0.85rem">
            <option value="">-- Escolhe --</option>
          </select>
          <button class="btn btn-primary btn-sm" id="saveLocationBtn" style="height:38px">Guardar</button>
        </div>
      </div>

      ${this.sensorData.moisture !== null ? `
      <div class="setting-row">
        <div>
          <span class="setting-label">Sensor de Humidade</span>
          <div class="setting-sub">Leitura do sensor de solo</div>
        </div>
        <div style="text-align:right;min-width:80px">
          <div class="sensor-value" id="sensorValue">${this.sensorData.moisture}%</div>
          <div class="sensor-bar"><div class="sensor-bar-fill" id="sensorBarFill" style="width:${this.sensorData.moisture}%"></div></div>
        </div>
      </div>
      ` : ''}

      <div class="divider" style="margin:16px 0"></div>

      <div class="section-header">
        <h2>Perfis de Rega</h2>
        <button class="btn btn-sm btn-primary" id="addProfileBtn">+ Novo</button>
      </div>

      <div id="profileList" style="margin-bottom:8px">
        ${this.profiles.map(p => `
          <div class="profile-item ${p.name === this.currentProfile ? 'active' : ''}" data-profile="${p.name}">
            <div>
              <div class="profile-name">${p.name} ${p.name === this.currentProfile ? '(ativo)' : ''}</div>
              <div class="profile-desc">${p.schedules.length} horarios</div>
            </div>
            <div style="display:flex;gap:4px">
              ${p.name !== this.currentProfile ? `<button class="btn btn-outline btn-sm activate-profile" data-profile="${p.name}">Ativar</button>` : ''}
              ${this.profiles.length > 1 ? `<button class="btn btn-ghost btn-sm delete-profile" data-profile="${p.name}">&#10005;</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div id="addProfileForm" style="display:none;margin:8px 0;padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="display:flex;gap:8px;align-items:center">
          <input id="newProfileName" placeholder="Nome do perfil" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-xs);background:var(--bg-elevated);color:var(--text);font-size:0.85rem">
          <button class="btn btn-primary btn-sm" id="saveProfileBtn">Criar</button>
          <button class="btn btn-ghost btn-sm" id="cancelProfileBtn">Cancelar</button>
        </div>
      </div>

      <div class="divider" style="margin:20px 0"></div>

      <div class="section-header">
        <h2>Dados</h2>
      </div>
      <div class="export-import-btns">
        <button class="btn btn-outline" id="exportBtn">&#128190; Exportar</button>
        <button class="btn btn-outline" id="importBtn">&#128193; Importar</button>
      </div>

      <p style="text-align:center;color:var(--text-tertiary);margin-top:28px;font-size:0.78rem">
        AquaSmart v2.0<br>Projeto Final de Curso
      </p>
    `;

    this._bindSettingsEvents();
  },

  _bindSettingsEvents() {
    // Notification toggle
    document.getElementById('notifToggle').addEventListener('change', (e) => {
      this.notifEnabled = e.target.checked;
      this.saveNotifPref();
      if (!e.target.checked) {
        this.showToast('Notificacoes desativadas');
      }
    });

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('change', () => this.toggleTheme());
    }

    // Flow rate
    const flowInput = document.getElementById('flowRateInput');
    if (flowInput) {
      flowInput.addEventListener('change', () => {
        this.saveFlowRate(flowInput.value);
        this.renderDashboard();
        this.showToast('Caudal atualizado');
        LOG('Caudal:', flowInput.value, 'L/min');
      });
    }

    // Water price
    const priceInput = document.getElementById('waterPriceInput');
    if (priceInput) {
      priceInput.addEventListener('change', () => {
        this.saveWaterPrice(priceInput.value);
        this.renderDashboard();
        this.showToast('Preco da agua atualizado');
        LOG('Preco agua:', priceInput.value, 'EUR/m3');
      });
    }

    // Location
    const updateLocBtn = document.getElementById('updateLocationBtn');
    const locForm = document.getElementById('locationForm');
    if (updateLocBtn && locForm) {
      updateLocBtn.onclick = async () => {
        const show = locForm.style.display === 'none';
        locForm.style.display = show ? 'block' : 'none';
        if (show) {
          await this.loadIpmaCities();
          const sel = document.getElementById('ipmaSettingsSelect');
          if (sel) {
            sel.innerHTML = '<option value="">-- Escolhe --</option>' +
              (this._ipmaCities || []).sort((a, b) => a.local.localeCompare(b.local)).map(c =>
                `<option value="${c.globalIdLocal}" ${c.globalIdLocal === this.ipmaCityId ? 'selected' : ''}>${c.local}</option>`
              ).join('');
          }
        }
      };
    }
    const saveLocBtn = document.getElementById('saveLocationBtn');
    if (saveLocBtn) {
      saveLocBtn.onclick = () => {
        const sel = document.getElementById('ipmaSettingsSelect');
        const id = parseInt(sel?.value);
        if (!id) { this.showToast('Seleciona uma cidade'); return; }
        const cities = this._ipmaCities || [];
        const city = cities.find(c => c.globalIdLocal === id);
        if (city) {
          this.ipmaCityId = id;
          this.ipmaCityName = city.local;
          this.saveIpmaLocation();
          this.fetchWeather();
          this.showToast('Localizacao atualizada');
          this.renderSettings();
          LOG('Localizacao:', city.local);
        }
      };
    }

    // Profile management
    document.getElementById('addProfileBtn')?.addEventListener('click', () => {
      document.getElementById('addProfileForm').style.display = 'block';
      document.getElementById('addProfileBtn').style.display = 'none';
    });
    document.getElementById('cancelProfileBtn')?.addEventListener('click', () => {
      document.getElementById('addProfileForm').style.display = 'none';
      document.getElementById('addProfileBtn').style.display = '';
      document.getElementById('newProfileName').value = '';
    });
    document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
      const name = document.getElementById('newProfileName').value.trim();
      if (!name) { this.showToast('Insere um nome'); return; }
      if (this.createProfile(name)) {
        document.getElementById('addProfileForm').style.display = 'none';
        document.getElementById('addProfileBtn').style.display = '';
        document.getElementById('newProfileName').value = '';
        this.renderSettings();
      }
    });

    document.getElementById('profileList')?.addEventListener('click', (e) => {
      const profile = e.target.dataset.profile;
      if (!profile) return;
      if (e.target.classList.contains('activate-profile')) {
        this.switchProfile(profile);
        this.renderSettings();
      } else if (e.target.classList.contains('delete-profile')) {
        if (confirm(`Apagar o perfil "${profile}"?`)) {
          this.deleteProfile(profile);
          this.renderSettings();
        }
      }
    });

    // Export / Import
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());
    if (importBtn) importBtn.addEventListener('click', () => this.importData());
  }
};

document.addEventListener('DOMContentLoaded', () => {
  try {
    APP.init();
  } catch (e) {
    console.error('AquaSmart init error:', e);
    document.getElementById('splash')?.classList.add('hide');
    document.body.innerHTML += '<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:red;text-align:center;z-index:9999"><p>Erro ao iniciar a app</p><p style="font-size:0.8rem">' + e.message + '</p></div>';
  }
});
