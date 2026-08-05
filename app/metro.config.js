const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `core/` lives outside this project, so Metro will not watch or resolve it by
// default. Both the app and the server import it, which is the point — the
// floor rules have one implementation, not two.
config.watchFolders = [path.resolve(__dirname, '../core')];

module.exports = config;
