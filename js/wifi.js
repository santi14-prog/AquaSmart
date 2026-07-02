// WiFi handler - communicates with ESP8266 simplified (bomba unica)
// ESP endpoints:
//   GET  /on?duration=300
//   GET  /off
//   GET  /status  -> JSON: {"bomba":1,"timer":120}
//   GET  /sensor  -> JSON: {"humidade":65}

let wifiBaseUrl = '';
let wifiPollInterval = null;
let savedIp = '';

const WifiHandler = {
  isSupported() {
    return true;
  },

  async connect(ip) {
    const addr = ip || savedIp || '192.168.4.1';
    const base = `http://${addr}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const resp = await fetch(`${base}/status`, {
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeout);

      if (!resp.ok) throw new Error('No response');

      wifiBaseUrl = base;
      savedIp = addr;

      this._startPolling();

      window.dispatchEvent(new CustomEvent('device-connected', {
        detail: { type: 'wifi', name: `ESP @ ${addr}` }
      }));
      return true;
    } catch (err) {
      console.error('WiFi connect error:', err);
      throw err;
    }
  },

  _startPolling() {
    this._stopPolling();
    wifiPollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`${wifiBaseUrl}/status`, { mode: 'cors' });
        const data = await resp.json();
        window.dispatchEvent(new CustomEvent('arduino-data', {
          detail: { data: JSON.stringify(data) }
        }));
      } catch (_) {}
    }, 3000);
  },

  _stopPolling() {
    if (wifiPollInterval) {
      clearInterval(wifiPollInterval);
      wifiPollInterval = null;
    }
  },

  async disconnect() {
    this._stopPolling();
    wifiBaseUrl = '';
  },

  async send(data) {
    if (!wifiBaseUrl) return false;
    try {
      const parts = data.split(':');
      let url = '';

      if (data === 'ALLOFF' || parts[0] === 'OFF') {
        url = `${wifiBaseUrl}/off`;
      } else if (parts[0] === 'ON' && parts.length >= 2) {
        const duration = parts[2] || 300;
        url = `${wifiBaseUrl}/on?duration=${duration}`;
      } else {
        return false;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      await fetch(url, { signal: controller.signal, mode: 'cors' });
      clearTimeout(timeout);
      return true;
    } catch (err) {
      console.error('WiFi send error:', err);
      return false;
    }
  },

  async fetchSensor() {
    if (!wifiBaseUrl) return null;
    try {
      const resp = await fetch(`${wifiBaseUrl}/sensor`, { mode: 'cors' });
      return await resp.json();
    } catch (_) {
      return null;
    }
  },

  isConnected() {
    return wifiBaseUrl !== '';
  },

  getSavedIp() {
    return localStorage.getItem('sprinkler_esp_ip') || '';
  },

  saveIp(ip) {
    localStorage.setItem('sprinkler_esp_ip', ip);
    savedIp = ip;
  }
};
