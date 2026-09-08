// 分级日志：E/W/I/D/V，可挂接 sink（用于 smoke 捕获）。
export const Log = {
  level: 2,
  sink: null,
  _out(lvl, tag, msg) {
    if (lvl > this.level) return;
    const line = `[${['E', 'W', 'I', 'D', 'V'][lvl]}] ${tag}: ${msg}`;
    if (typeof console !== 'undefined') (console[['error', 'warn', 'log', 'log', 'log'][lvl]] || console.log)(line);
    if (this.sink) this.sink(line);
  },
  error(t, m) { this._out(0, t, m); },
  warn(t, m) { this._out(1, t, m); },
  info(t, m) { this._out(2, t, m); },
  debug(t, m) { this._out(3, t, m); },
  verbose(t, m) { this._out(4, t, m); },
};
