// Web Serial API handler for Arduino USB connection (desktop Chrome/Edge)

let serialPort = null;
let serialWriter = null;
let serialReader = null;
let serialReadLoop = null;

const SerialHandler = {
  isSupported() {
    return 'serial' in navigator;
  },

  async connect() {
    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });

      serialWriter = serialPort.writable.getWriter();
      serialReader = serialPort.readable.getReader();

      serialPort.addEventListener('disconnect', () => {
        window.dispatchEvent(new CustomEvent('device-disconnected'));
      });

      const info = serialPort.getInfo();
      const name = `USB (${info.usbVendorId || 'Arduino'})`;

      window.dispatchEvent(new CustomEvent('device-connected', {
        detail: { type: 'serial', name }
      }));

      serialReadLoop = this._readLoop();
      return true;
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('Serial error:', err);
      }
      return false;
    }
  },

  async _readLoop() {
    try {
      while (serialReader) {
        const { value, done } = await serialReader.read();
        if (done) break;
        if (value) {
          const text = new TextDecoder().decode(value);
          window.dispatchEvent(new CustomEvent('arduino-data', {
            detail: { data: text.trim() }
          }));
        }
      }
    } catch (err) {
      // port closed
    }
  },

  async disconnect() {
    if (serialReadLoop) {
      serialReadLoop = null;
    }
    try { serialReader?.cancel(); } catch (_) {}
    try { serialReader?.releaseLock(); } catch (_) {}
    try { serialWriter?.close(); } catch (_) {}
    try { serialWriter?.releaseLock(); } catch (_) {}
    try { await serialPort?.close(); } catch (_) {}
    serialPort = null;
    serialWriter = null;
    serialReader = null;
  },

  async send(data) {
    if (!serialWriter) return false;
    try {
      const encoder = new TextEncoder();
      await serialWriter.write(encoder.encode(data + '\n'));
      return true;
    } catch (err) {
      console.error('Serial send error:', err);
      return false;
    }
  },

  isConnected() {
    return serialPort && serialPort.readable !== null;
  }
};
