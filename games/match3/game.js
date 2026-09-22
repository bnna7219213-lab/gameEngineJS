// 三消：8x8 棋盘（扁平数组），确定性 RNG 生成/补位（对应 C++ 版 games/match3）。
// 重构为无 DOM 的类。board 为长度 BOARD_W*BOARD_H 的扁平数组（selftest 契约）。
import { Rng } from '../../src/engine/core/math.js';

export const BOARD_W = 8;
export const BOARD_H = 8;
export const GEM_COLORS = [
  [0.88, 0.33, 0.33],
  [0.31, 0.55, 1.0],
  [0.31, 0.75, 0.40],
  [0.88, 0.72, 0.31],
  [0.65, 0.43, 0.88],
];

export class Match3Game {
  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.score = 0; this.moves = 0;
    this.board = null;
    this._newBoard();
  }
  _idx(x, y) { return y * BOARD_W + x; }
  _get(x, y) { return this.board[y * BOARD_W + x]; }
  _set(x, y, v) { this.board[y * BOARD_W + x] = v; }
  _newBoard() {
    const N = BOARD_W, flat = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v;
      do {
        v = this.rng.int(5);
      } while (
        (x >= 2 && flat[y * N + (x - 1)] === v && flat[y * N + (x - 2)] === v) ||
        (y >= 2 && flat[(y - 1) * N + x] === v && flat[(y - 2) * N + x] === v));
      flat.push(v);
    }
    this.board = flat;
  }
  findMatches() {
    const N = BOARD_W, m = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N - 2; x++) {
      const v = this._get(x, y);
      if (v != null && v === this._get(x + 1, y) && v === this._get(x + 2, y)) { m.push(x + ',' + y, (x + 1) + ',' + y, (x + 2) + ',' + y); }
    }
    for (let x = 0; x < N; x++) for (let y = 0; y < N - 2; y++) {
      const v = this._get(x, y);
      if (v != null && v === this._get(x, y + 1) && v === this._get(x, y + 2)) { m.push(x + ',' + y, x + ',' + (y + 1), x + ',' + (y + 2)); }
    }
    return m; // 数组，含 .length
  }
  _resolve() {
    let chain = 0;
    for (;;) {
      const m = this.findMatches();
      if (!m.length) return chain;
      chain++;
      this.score += m.length * 10 * chain;
      for (const k of m) { const [x, y] = k.split(',').map(Number); this._set(x, y, null); }
      for (let x = 0; x < BOARD_W; x++) {
        let write = BOARD_H - 1;
        for (let y = BOARD_H - 1; y >= 0; y--) {
          const v = this._get(x, y);
          if (v != null) { this._set(x, write, v); if (write !== y) this._set(x, y, null); write--; }
        }
        for (; write >= 0; write--) this._set(x, write, this.rng.int(5));
      }
    }
  }
  trySwap(x1, y1, x2, y2) {
    if (Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1) return { ok: false, chain: 0 }; // 仅允许相邻交换
    const va = this._get(x1, y1), vb = this._get(x2, y2);
    this._set(x1, y1, vb); this._set(x2, y2, va);
    if (!this.findMatches().length) { this._set(x1, y1, va); this._set(x2, y2, vb); return { ok: false, chain: 0 }; }
    const chain = this._resolve(); this.moves++; return { ok: true, chain };
  }
  get(x, y) { return this._get(x, y); }
  _wouldMatch(x1, y1, x2, y2) {
    const va = this._get(x1, y1), vb = this._get(x2, y2);
    this._set(x1, y1, vb); this._set(x2, y2, va);
    const ok = this.findMatches().length > 0;
    this._set(x1, y1, va); this._set(x2, y2, vb);
    return ok;
  }
  hasAnyMove() {
    for (let y = 0; y < BOARD_H; y++) for (let x = 0; x < BOARD_W; x++) {
      if (x + 1 < BOARD_W && this._wouldMatch(x, y, x + 1, y)) return true;
      if (y + 1 < BOARD_H && this._wouldMatch(x, y, x, y + 1)) return true;
    }
    return false;
  }
}
