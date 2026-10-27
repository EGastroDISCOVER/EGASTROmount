// ============================================================
//  sync-bus.js — EGastro Unified Sync Bus
//  Comunicazione cross-window tra EGastro DISCOVER e EGASTRO Mount
//  Transport: BroadcastChannel (primario) + localStorage (fallback)
//  API:  SyncBus.send(tipo, dati)   /   SyncBus.on(tipo, handler)
// ============================================================
(function (global) {
  'use strict';

  const VERSION        = 1;
  const CHANNEL_NAME   = 'egastro_sync_v' + VERSION;
  const LS_KEY         = 'egastro_sync_v' + VERSION;
  const PING_INTERVAL  = 3000;
  const PEER_TIMEOUT   = 9000;
  const SEND_THROTTLE  = 20;

  // Riconosce in automatico quale app sta girando
  const path  = (location.pathname || '').toLowerCase();
  const title = (document.title || '').toLowerCase();
  const APP_ID = (path.indexOf('mount') >= 0 || title.indexOf('mount') >= 0)
    ? 'mount'
    : 'observatory';

  let bc = null;
  try { bc = new BroadcastChannel(CHANNEL_NAME); } catch (e) { bc = null; }

  const listeners = new Map();
  const peer = { alive: false, id: null, lastSeen: 0, helloBackAt: 0 };

  function _makeMsg(type, data) {
    return {
      v: VERSION, type,
      data: data || null,
      from: APP_ID,
      ts: Date.now(),
      id: Math.random().toString(36).slice(2)
    };
  }

  function _dispatch(msg) {
    if (!msg || !msg.type || !msg.from) return;
    if (msg.from === APP_ID) return; // ignore echo
    peer.alive = true;
    peer.id = msg.from;
    peer.lastSeen = Date.now();

    if (msg.type === 'ping')  { send('pong'); return; }
    if (msg.type === 'pong')  { return; }
    if (msg.type === 'hello') {
      const now = Date.now();
      if (now - peer.helloBackAt > 400) {
        peer.helloBackAt = now;
        setTimeout(() => send('hello'), 40);
      }
      return;
    }

    const hs = listeners.get(msg.type);
    if (hs) hs.forEach(fn => {
      try { fn(msg.data, msg); } catch (e) {
        console.error('[SyncBus] listener "' + msg.type + '":', e);
      }
    });
    const any = listeners.get('*');
    if (any) any.forEach(fn => { try { fn(msg.data, msg); } catch (e) {} });
  }

  let _last = 0;
  function send(type, data) {
    const now = Date.now();
    if (now - _last < SEND_THROTTLE) {
      setTimeout(() => send(type, data), SEND_THROTTLE);
      return;
    }
    _last = now;
    const msg = _makeMsg(type, data);
    if (bc) {
      try { bc.postMessage(msg); } catch (e) {}
    } else {
      try {
        msg.nonce = Math.random();
        localStorage.setItem(LS_KEY, JSON.stringify(msg));
      } catch (e) {}
    }
  }

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
    return function off() {
      const arr = listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  if (bc) {
    bc.onmessage = ev => _dispatch(ev.data);
  } else {
    global.addEventListener('storage', ev => {
      if (ev.key !== LS_KEY || !ev.newValue) return;
      try { _dispatch(JSON.parse(ev.newValue)); } catch (e) {}
    });
  }

  let pingTimer = null;
  function start() {
    if (pingTimer) return;
    send('hello');
    pingTimer = setInterval(() => {
      send('ping');
      if (Date.now() - peer.lastSeen > PEER_TIMEOUT) peer.alive = false;
    }, PING_INTERVAL);
  }
  function stop() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (bc) { try { bc.close(); } catch (e) {} }
  }

  global.SyncBus = {
    appId: APP_ID,
    version: VERSION,
    transport: bc ? 'broadcast' : 'localStorage',
    send, on, start, stop,
    isPeerAlive: () => peer.alive,
    getPeerId:  () => peer.id
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 150);
  } else {
    global.addEventListener('load', () => setTimeout(start, 150));
  }
})(window);