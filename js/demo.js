// Demo mode - simulates Arduino for testing without hardware
// Works with any pin numbers defined by the user

let demoPins = {};
let demoTimers = {};
let demoInterval = null;

const DemoHandler = {
  isSupported() {
    return true;
  },

  async connect() {
    window.dispatchEvent(new CustomEvent('device-connected', {
      detail: { type: 'demo', name: 'Modo Demo (Simulado)' }
    }));

    demoInterval = setInterval(() => {
      for (const pin of Object.keys(demoTimers)) {
        if (demoTimers[pin] > 0) {
          demoTimers[pin]--;
          if (demoTimers[pin] <= 0) {
            demoPins[pin] = false;
            window.dispatchEvent(new CustomEvent('arduino-data', {
              detail: { data: `DONE:${pin}` }
            }));
          }
        }
      }
    }, 1000);

    return true;
  },

  disconnect() {
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
    demoPins = {};
    demoTimers = {};
  },

  send(data) {
    const parts = data.split(':');

    if (data === 'ALLOFF') {
      for (const pin of Object.keys(demoPins)) {
        demoPins[pin] = false;
        demoTimers[pin] = 0;
      }
      console.log('[DEMO] ALLOFF');

    } else if (parts[0] === 'ON' && parts.length === 3) {
      const pin = parts[1];
      const duration = parseInt(parts[2]);
      demoPins[pin] = true;
      demoTimers[pin] = duration;
      console.log(`[DEMO] ON Pino ${pin} durante ${duration}s`);

    } else if (parts[0] === 'OFF' && parts.length === 2) {
      const pin = parts[1];
      demoPins[pin] = false;
      demoTimers[pin] = 0;
      console.log(`[DEMO] OFF Pino ${pin}`);
    }

    return Promise.resolve(true);
  },

  isConnected() {
    return true;
  }
};
