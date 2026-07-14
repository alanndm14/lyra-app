'use strict';

const fs = require('fs');
const path = require('path');

const output = path.join(__dirname, '..', 'runtime-config.js');
const youtubeApiKey = String(process.env.YOUTUBE_API_KEY || '').trim();

if (!youtubeApiKey) {
  throw new Error('YOUTUBE_API_KEY is required to build the production runtime config.');
}

fs.writeFileSync(
  output,
  `window.LYRA_CONFIG = Object.freeze(${JSON.stringify({ youtubeApiKey })});\n`,
  'utf8'
);

console.log('Production runtime config created.');
