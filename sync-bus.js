/* EGASTRO SYNC BUS v3 - versione affidabile con leader election */
(function (global) {
  'use strict';
  const VERSION = 3;
  const CHANNEL_NAME = 'egastro_sync_v' + VERSION;
  const LS_KEY = 'egastro_sync_v' + VERSION;
  const LEADER_KEY = 'egastro_leader_v' + VERSION;
  const PING_INTERVAL = 2000;
  const PEER_TIMEOUT = 12000;
  const LEADER_TTL = 6000;
  const LEADER_RENEW = 3000;

  function detectAppId() {
    const meta = document.querySelector('meta[name="app-id"]');
    if (meta && meta.content) {
      const v = String(meta.content).trim().toLowerCase();
      if (v === 'mount' || v === 'observatory') return v;
    }
    if (document.getElementById('dpad-grid')) return 'mount';
    return 'observatory';
  }
  const APP_ID = detectAppId();
  const INSTANCE_ID = APP_ID + '-' + Math.random().toString(36).slice(2, 8);

  let bc = null;
  try { bc = new BroadcastChannel(CHANNEL_NAME); } catch (e) { bc = null; }

  const listeners = new Map();
  const pendingAcks = new Map();
  const peer = { alive: false, id: null, lastSeen: 0, helloBackAt: 0 };
  let outStateVersion = 0;
  const inStateVersions = new Map();

  function _makeMsg(type, data, id) {
    return { v: VERSION, type, data: data || null, from: APP_ID,
             instance: INSTANCE_ID, ts: Date.now(),
             id: id || (Math.random().toString(36).slice(2) + Date.now().toString(36)) };
  }

  function _dispatch(msg) {
    if (!msg || !msg.type || !msg.from) return;
    if (msg.from === APP_ID) return;
    peer.alive = true; peer.id = msg.from; peer.lastSeen = Date.now();
    if (msg.type === 'ping') { send('pong'); return; }
    if (msg.type === 'pong') return;
    if (msg.type === 'hello') {
      const now = Date.now();
      if (now - peer.helloBackAt > 300) {
        peer.helloBackAt = now;
        setTimeout(() => send('hello'), 30 + Math.random() * 50);
      }
      return;
    }
    if (msg.type === 'ack') {
      const p = pendingAcks.get(msg.data && msg.data.id);
      if (p) { clearTimeout(p.timer); pendingAcks.delete(msg.data.id); p.resolve(true); }
      return;
    }
    // anti-riordino
    if (msg.data && Number.isFinite(msg.data.__v)) {
      const last = inStateVersions.get(msg.from) || 0;
      if (msg.data.__v <= last) return;
      inStateVersions.set(msg.from, msg.data.__v);
    }
    // risposta ACK automatica
    if (msg.data && msg.data.__needAck && msg.data.__ackId) {
      send('ack', { id: msg.data.__ackId });
    }
    const hs = listeners.get(msg.type);
    if (hs) hs.forEach(fn => { try { fn(msg.data, msg); } catch (e) { console.error('[SyncBus] ' + msg.type, e); } });
    const any = listeners.get('*');
    if (any) any.forEach(fn => { try { fn(msg.data, msg); } catch (e) {} });
  }

  let _lastSend = 0;
  function _rawSend(msg) {
    if (bc) { try { bc.postMessage(msg); } catch (e) {} }
    else { try { msg.nonce = Math.random(); localStorage.setItem(LS_KEY, JSON.stringify(msg)); } catch (e) {} }
  }
  function send(type, data) {
    const now = Date.now();
    if (now - _lastSend < 16) { setTimeout(() => send(type, data), 16); return; }
    _lastSend = now;
    if (data && data.__isState) data.__v = ++outStateVersion;
    _rawSend(_makeMsg(type, data));
  }
  function sendWithAck(type, data, timeoutMs) {
    return new Promise((resolve) => {
      const ackId = 'ack-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const payload = Object.assign({}, data || {}, { __needAck: true, __ackId: ackId });
      const msg = _makeMsg(type, payload);
      const timer = setTimeout(() => { pendingAcks.delete(ackId); resolve(false); }, timeoutMs || 4000);
      pendingAcks.set(ackId, { resolve, timer });
      _rawSend(msg);
    });
  }
  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
    return function off() { const arr = listeners.get(type); if (!arr) return; const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); };
  }

  // Leader election (solo per satellite)
  function _getLeaderRec() { try { return JSON.parse(localStorage.getItem(LEADER_KEY) || 'null'); } catch (e) { return null; } }
  function _setLeaderRec() { try { localStorage.setItem(LEADER_KEY, JSON.stringify({ instance: INSTANCE_ID, app: APP_ID, expiresAt: Date.now() + LEADER_TTL })); } catch (e) {} }
  function isLeader() {
    if (APP_ID !== 'mount') return false;
    const rec = _getLeaderRec();
    return !!(rec && rec.instance === INSTANCE_ID && rec.expiresAt > Date.now());
  }
  function requestLeader() {
    if (APP_ID !== 'mount') return false;
    const rec = _getLeaderRec();
    if (!rec || rec.expiresAt <= Date.now()) { _setLeaderRec(); return true; }
    return rec.instance === INSTANCE_ID;
  }
  let leaderTimer = null;
  function _startLeaderRenewal() {
    if (APP_ID !== 'mount' || leaderTimer) return;
    requestLeader();
    leaderTimer = setInterval(() => { if (isLeader()) _setLeaderRec(); }, LEADER_RENEW);
  }
  function _stopLeaderRenewal() {
    if (leaderTimer) { clearInterval(leaderTimer); leaderTimer = null; }
    try { const rec = _getLeaderRec(); if (rec && rec.instance === INSTANCE_ID) localStorage.removeItem(LEADER_KEY); } catch (e) {}
  }

  if (bc) bc.onmessage = ev => _dispatch(ev.data);
  else global.addEventListener('storage', ev => { if (ev.key !== LS_KEY || !ev.newValue) return; try { _dispatch(JSON.parse(ev.newValue)); } catch (e) {} });

  let pingTimer = null;
  function start() {
    if (pingTimer) return;
    [100, 300, 700, 1500].forEach(ms => setTimeout(() => send('hello'), ms));
    _startLeaderRenewal();
    pingTimer = setInterval(() => {
      send('ping');
      if (Date.now() - peer.lastSeen > PEER_TIMEOUT) {
        if (peer.alive) {
          peer.alive = false;
          const hs = listeners.get('peer_offline');
          if (hs) hs.forEach(fn => { try { fn(); } catch (e) {} });
        }
      }
    }, PING_INTERVAL);
  }
  function stop() { if (pingTimer) clearInterval(pingTimer); pingTimer = null; _stopLeaderRenewal(); if (bc) try { bc.close(); } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { peer.helloBackAt = 0; send('hello'); } });
  global.addEventListener('focus', () => send('hello'));
  global.addEventListener('beforeunload', stop);

  global.SyncBus = {
    version: VERSION, appId: APP_ID, instanceId: INSTANCE_ID,
    isSatellite: APP_ID === 'mount',
    transport: bc ? 'broadcast' : 'localStorage',
    send, sendWithAck, on, start, stop,
    isLeader, requestLeader,
    isPeerAlive: () => peer.alive,
    getPeerId: () => peer.id,
    getAppId: () => APP_ID
  };
  console.log('[SyncBus v' + VERSION + '] ' + APP_ID + ' / ' + INSTANCE_ID);
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(start, 100);
  else global.addEventListener('load', () => setTimeout(start, 100));
})(window);