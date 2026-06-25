// WiFi handler - communicates with ESP8266/ESP32 via HTTP REST API
// ESP endpoints:
//   GET  /on?pin=2&duration=300
//   GET  /off?pin=2
//   GET  /alloff
//   GET  /status  -> returns JSON: {"pins":[0,1,0,0],"timers":[0,300,0,0]}

let wifiBaseUrl = '';
let wifiPollInterval = null;
let savedIp = '';

const WifiHandler = {
  isSupported() {
    return true; // works everywhere
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

      // Start polling for status updates
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

      if (data === 'ALLOFF') {
        url = `${wifiBaseUrl}/alloff`;
      } else if (parts[0] === 'ON' && parts.length === 3) {
        url = `${wifiBaseUrl}/on?pin=${parts[1]}&duration=${parts[2]}`;
      } else if (parts[0] === 'OFF' && parts.length === 2) {
        url = `${wifiBaseUrl}/off?pin=${parts[1]}`;
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
