// WebSocket 传输（Q2 / D19）：与 LoopbackTransport 同接口（send/onRecv），
// 走浏览器 WebSocket 或 Node ws 兼容层（Node 测试用注入式 socket，零依赖红线 C）。
// 设计：transport 本身不感知协议；Replicator 的 delta/snapshot 消息原样透传。
// Node 回环测试：注入 fakeSocketPair（内存双工），不依赖真实网络。

// WebSocketTransport：包装一个「已连接」的 WebSocket 实例（浏览器 WebSocket / Node 注入 socket）。
// socket 约定：{ send(data), close(), addEventListener('message'|'close', fn) } 或 onmessage/onclose 属性。
export class WebSocketTransport {
  constructor(socket, { binary = false } = {}) {
    if (!socket) throw new Error('WebSocketTransport: 需要 socket 实例');
    this.socket = socket;
    this.binary = binary;
    this._handlers = [];
    this._closed = false;
    const onMsg = (ev) => {
      const data = ev && ev.data !== undefined ? ev.data : ev;
      let msg = data;
      if (typeof data === 'string') {
        try { msg = JSON.parse(data); } catch (_) { msg = data; } // 非 JSON 字符串原样透传
      }
      for (const h of this._handlers) { try { h(msg); } catch (_) {} }
    };
    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('message', onMsg);
      socket.addEventListener('close', () => { this._closed = true; });
      socket.addEventListener('error', () => { this._closed = true; });
    } else {
      socket.onmessage = onMsg;
      socket.onclose = () => { this._closed = true; };
    }
  }
  get open() { return !this._closed && (this.socket.readyState === undefined || this.socket.readyState === 1); }
  send(msg) {
    if (!this.open) return false; // 静默丢弃（重连由上层会话管理），不抛错（红线 E）
    const data = (typeof msg === 'string' || this.binary) ? msg : JSON.stringify(msg);
    this.socket.send(data);
    return true;
  }
  onRecv(fn) { this._handlers.push(fn); return () => { const i = this._handlers.indexOf(fn); if (i >= 0) this._handlers.splice(i, 1); }; }
  close() { this._closed = true; try { this.socket.close(); } catch (_) {} }
}

// 连接管理：带自动重连的会话（对标 Unity NetworkClient）。
// connectFn: () => Promise<socket>（浏览器: new WebSocket(url)；Node 测试: 返回 fake socket）
export class NetSession {
  constructor({ connectFn, onMsg = null, onStateChange = null, retryMs = 500, maxRetry = 10 } = {}) {
    if (typeof connectFn !== 'function') throw new Error('NetSession: 需要 connectFn');
    this._connectFn = connectFn;
    this._onMsg = onMsg;
    this._onStateChange = onStateChange || (() => {});
    this.retryMs = retryMs;
    this.maxRetry = maxRetry;
    this.transport = null;
    this.state = 'disconnected'; // disconnected | connecting | connected
    this._retryCount = 0;
    this._stopped = false;
  }
  async connect() {
    if (this._stopped) return false;
    this._setState('connecting');
    try {
      const socket = await this._connectFn();
      this.transport = new WebSocketTransport(socket);
      this.transport.onRecv((m) => { if (this._onMsg) this._onMsg(m); });
      this._retryCount = 0;
      this._setState('connected');
      return true;
    } catch (e) {
      this.transport = null;
      this._setState('disconnected');
      if (this._retryCount < this.maxRetry) {
        this._retryCount++;
        await new Promise(r => setTimeout(r, this.retryMs));
        return this.connect();
      }
      return false;
    }
  }
  send(msg) { return this.transport ? this.transport.send(msg) : false; }
  disconnect() { this._stopped = true; if (this.transport) this.transport.close(); this._setState('disconnected'); }
  _setState(s) { this.state = s; this._onStateChange(s); }
}

// Node 回环测试用的内存双工 socket 对（零依赖，模拟 WebSocket 语义）。
// 返回 [socketA, socketB]：A.send → B 的 message 监听；反之亦然。
export function fakeSocketPair() {
  const mk = () => {
    const s = {
      readyState: 1,
      _listeners: {},
      addEventListener(type, fn) { (s._listeners[type] = s._listeners[type] || []).push(fn); },
      removeEventListener(type, fn) { const l = s._listeners[type]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
      _peer: null,
      send(data) {
        if (!s._peer) throw new Error('fakeSocket: 对端未连接');
        // 异步派发（模拟网络）
        queueMicrotask(() => {
          const ls = s._peer._listeners.message || [];
          for (const fn of ls) fn({ data });
        });
      },
      close() { s.readyState = 3; const ls = s._listeners.close || []; for (const fn of ls) fn({}); },
    };
    return s;
  };
  const a = mk(), b = mk();
  a._peer = b; b._peer = a;
  return [a, b];
}
