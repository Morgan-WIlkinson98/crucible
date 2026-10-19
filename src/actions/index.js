// Action engine — the third wheel. Host capabilities (clipboard, dialogs,
// share sheet) are injected by main.js.
const path = require('path');
const fs = require('fs');
const { outPath } = require('../converters/util');

let _helpers = {};
function setHelpers(h) { _helpers = h || {}; }

async function runAction(id, paths, ctx = {}) {
  switch (id) {
    case 'copy-to': case 'move-to': {
      const dir = await _helpers.pickFolder?.();
      if (!dir) return { outputs: [], errors: [] };
      const outs = [];
      for (const p of paths) {
        let target = path.join(dir, path.basename(p));
        let i = 2;
        while (fs.existsSync(target)) {
          const e = path.extname(p);
          target = path.join(dir, `${path.basename(p, e)} (${i})${e}`);
          i++;
        }
        if (id === 'copy-to') {
          fs.cpSync(p, target, { recursive: true });
        } else {
          fs.renameSync(p, target);
        }
        outs.push(target);
      }
      return { outputs: outs, errors: [] };
    }
    case 'copy-path':
      _helpers.copyToClipboard?.(paths.join('\n'));
      return { outputs: paths, errors: [] };
    case 'reveal':
      paths.forEach((p) => _helpers.reveal?.(p));
      return { outputs: paths, errors: [] };
    case 'terminal':
      _helpers.openTerminal?.(path.dirname(paths[0]));
      return { outputs: paths, errors: [] };
    case 'duplicate': {
      const outs = paths.map((p) => {
        const e = path.extname(p);
        const dst = outPath(p, e.slice(1), { suffix: ' copy' });
        fs.cpSync(p, dst, { recursive: true });
        return dst;
      });
      return { outputs: outs, errors: [] };
    }
    case 'float':
      paths.forEach((p) => _helpers.floatPreview?.(p));
      return { outputs: paths, errors: [] };
    case 'trash': {
      const errors = [];
      for (const p of paths) {
        try { await _helpers.trash?.(p); } catch (e) { errors.push({ file: p, error: e.message }); }
      }
      return { outputs: [], errors };
    }
    case 'airdrop':
      await _helpers.share?.(paths, { service: 'airdrop' });
      return { outputs: paths, errors: [] };
    case 'share':
      await _helpers.share?.(paths, {});
      return { outputs: paths, errors: [] };
    default:
      throw new Error(`Unknown action: ${id}`);
  }
}

module.exports = { runAction, setHelpers };
