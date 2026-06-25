// Terminal Logger - sends browser-side logs to the server terminal
// Also buffers logs in memory for the Debug tab

window._LOG_BUFFER = window._LOG_BUFFER || [];

function _pushToBuffer(level, msg, time) {
  window._LOG_BUFFER.push({ level, msg, time });
  if (window._LOG_BUFFER.length > 500) {
    window._LOG_BUFFER = window._LOG_BUFFER.slice(-300);
  }
  window.dispatchEvent(new CustomEvent('log-updated'));
}

const LOG = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const time = new Date().toLocaleTimeString('pt-PT');
  console.log('[AquaSmart]', msg);
  _pushToBuffer('LOG', msg, time);
  _sendToTerminal('LOG', msg);
};

const WARN = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const time = new Date().toLocaleTimeString('pt-PT');
  console.warn('[AquaSmart]', msg);
  _pushToBuffer('WARN', msg, time);
  _sendToTerminal('WARN', msg);
};

const ERR = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const time = new Date().toLocaleTimeString('pt-PT');
  console.error('[AquaSmart]', msg);
  _pushToBuffer('ERR', msg, time);
  _sendToTerminal('ERR', msg);
};

function _sendToTerminal(level, msg) {
  try {
    fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, msg, time: new Date().toLocaleTimeString('pt-PT') }),
      keepalive: true
    }).catch(() => {});
  } catch (_) {}
}
