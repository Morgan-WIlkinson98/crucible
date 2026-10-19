// File actions registry — the third wheel (Ctrl/Alt).
const IS_WIN = process.platform === 'win32';

const ACTIONS = [
  { id: 'copy-to',    label: 'Copy to…',          icon: 'copy' },
  { id: 'move-to',    label: 'Move to…',          icon: 'move' },
  { id: 'copy-path',  label: 'Copy path',         icon: 'path' },
  { id: 'reveal',     label: IS_WIN ? 'Reveal in Explorer' : 'Reveal in Finder', icon: 'reveal' },
  { id: 'terminal',   label: 'Open Terminal here', icon: 'terminal' },
  { id: 'duplicate',  label: 'Duplicate',         icon: 'duplicate' },
  { id: 'float',      label: 'Float preview',     icon: 'float' },
  { id: 'trash',      label: 'Move to Trash',     icon: 'trash' },
  { id: 'airdrop',    label: 'AirDrop…',          icon: 'airdrop', platforms: ['darwin'] },
  { id: 'share',      label: 'Share…',            icon: 'share', platforms: ['darwin'] },
];

function actionsFor(platform = process.platform) {
  return ACTIONS.filter((a) => !a.platforms || a.platforms.includes(platform));
}

module.exports = { ACTIONS, actionsFor };
