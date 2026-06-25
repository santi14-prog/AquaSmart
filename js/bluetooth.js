// Web Bluetooth API handler for Arduino (HM-10 / BLE modules)
// Service UUID and Characteristic UUID used by common BLE Arduino modules

const BLE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BLE_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

let bleDevice = null;
let bleServer = null;
let bleCharacteristic = null;

const BleHandler = {
  isSupported() {
    return 'bluetooth' in navigator;
  },

  async connect() {
    try {
      bleDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'HC' },
          { namePrefix: 'HM' },
          { namePrefix: 'BT' },
          { namePrefix: 'Sprinkler' },
          { namePrefix: 'Arduino' },
          { namePrefix: 'MLT-BT05' },
          { namePrefix: 'JDY' },
          { namePrefix: 'CC41' }
        ],
        optionalServices: [BLE_SERVICE_UUID]
      });

      bleDevice.addEventListener('gattserverdisconnected', () => {
        window.dispatchEvent(new CustomEvent('device-disconnected'));
      });

      bleServer = await bleDevice.gatt.connect();
      const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
      bleCharacteristic = await service.getCharacteristic(BLE_CHAR_UUID);

      const name = bleDevice.name || 'Arduino BLE';
      window.dispatchEvent(new CustomEvent('device-connected', {
        detail: { type: 'bluetooth', name }
      }));
      return true;
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('BLE error:', err);
      }
      return false;
    }
  },

  async disconnect() {
    if (bleDevice && bleDevice.gatt.connected) {
      await bleDevice.gatt.disconnect();
    }
    bleDevice = null;
    bleServer = null;
    bleCharacteristic = null;
  },

  async send(data) {
    if (!bleCharacteristic) return false;
    try {
      const encoder = new TextEncoder();
      await bleCharacteristic.writeValue(encoder.encode(data));
      return true;
    } catch (err) {
      console.error('BLE send error:', err);
      return false;
    }
  },

  isConnected() {
    return bleDevice && bleDevice.gatt && bleDevice.gatt.connected;
  }
};
