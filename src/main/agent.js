// Bridge to crucible-agent (Swift helper) — macOS only.
// Spawns the helper, parses its JSON-line events, and exposes a
// request/response API for commands (ocr, share).
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const EventEmitter = require('events');
const { app } = require('electron');

class Agent extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.ready = false;
    this.listening = false;
    this._pending = [];
  }

  binaryPath() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'bin', 'crucible-agent');
    }
    return path.join(app.getAppPath(), 'build', 'crucible-agent');
  }

  // compile from source in dev if the binary is missing
  ensureBinary() {
    const bin = this.binaryPath();
    if (fs.existsSync(bin)) return bin;
    if (app.isPackaged) return null;
    const src = path.join(app.getAppPath(), 'swift', 'crucible-agent.swift');
    if (!fs.existsSync(src)) return null;
    try {
      execFileSync('swiftc', ['-O', '-o', bin, src], { stdio: 'pipe', timeout: 120000 });
      return bin;
    } catch {
      return null;
    }
  }

  start() {
    if (process.platform !== 'darwin' || this.proc) return;
    const bin = this.ensureBinary();
    if (!bin) {
      this.emit('error', 'crucible-agent binary not found');
      return;
    }
    this.proc = spawn(bin, []);
    let buf = '';
    this.proc.stdout.on('data', (d) => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try { this._onEvent(JSON.parse(line)); } catch { /* malformed line */ }
      }
    });
    this.proc.on('exit', () => {
      this.proc = null; this.ready = false; this.listening = false;
      this.emit('exit');
    });
    this.proc.on('error', (e) => this.emit('error', e.message));
  }

  _onEvent(ev) {
    if (ev.event === 'ready') {
      this.ready = true;
      this.inputMonitoring = !!ev.inputMonitoring;
    } else if (ev.event === 'listening') {
      this.listening = true;
    } else if (ev.event === 'result' || ev.event === 'error') {
      const p = this._pending.shift();
      if (p) {
        if (ev.ok === false || ev.event === 'error') p.reject(new Error(ev.message || 'agent error'));
        else p.resolve(ev);
      }
    }
    this.emit('event', ev);
    this.emit(ev.event, ev);
  }

  send(obj) {
    if (!this.proc) return;
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  request(obj, timeout = 30000) {
    return new Promise((resolve, reject) => {
      this._pending.push({ resolve, reject });
      this.send(obj);
      setTimeout(() => {
        const i = this._pending.findIndex((p) => p.resolve === resolve);
        if (i >= 0) { this._pending.splice(i, 1); reject(new Error('agent timeout')); }
      }, timeout);
    });
  }

  async ocr(file) {
    const r = await this.request({ cmd: 'ocr', file });
    return r.text || '';
  }

  async share(files, service) {
    return this.request({ cmd: 'share', files, service });
  }

  stop() {
    try { this.send({ cmd: 'quit' }); } catch { /* already gone */ }
    this.proc = null;
  }
}

module.exports = new Agent();
