const fs = require('node:fs');
const value = process.env.KICK_GO_SERVER || '';
if (value) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw Error('KICK_GO_SERVER must be a public HTTPS server URL'); }
fs.writeFileSync('web/config.js', `window.KICK_GO_SERVER = ${JSON.stringify(value)};\n`);
