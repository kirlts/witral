// Witral - Plugin CLI
// Standalone CLI for plugin management (can be run via npm script)

import { installPlugin, listPlugins } from './plugin-installer.js';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Witral Plugin Manager

Usage:
  npm run plugin:install <type> <name>    Install dependencies for a plugin
  npm run plugin:list [type]              List available plugins

Examples:
  npm run plugin:install ingestor baileys
  npm run plugin:install sync googledrive
  npm run plugin:list
  npm run plugin:list ingestor
  npm run plugin:list sync

Types:
  ingestor  - Messaging platform plugins
  sync      - Cloud synchronization plugins
`);
  process.exit(0);
}

const command = args[0];

if (command === 'install') {
  if (args.length < 3) {
    console.error('Error: Missing arguments. Usage: npm run plugin:install <type> <name>');
    process.exit(1);
  }
  
  const pluginType = args[1] as 'ingestor' | 'sync' | undefined;
  const pluginName = args[2];
  
  if (!pluginType || (pluginType !== 'ingestor' && pluginType !== 'sync')) {
    console.error(`Error: Invalid plugin type "${pluginType}". Must be "ingestor" or "sync".`);
    process.exit(1);
  }
  
  if (!pluginName) {
    console.error('Error: Missing plugin name. Usage: npm run plugin:install <type> <name>');
    process.exit(1);
  }
  
  installPlugin(pluginType, pluginName)
    .then(() => {
      console.log('\n✅ Plugin installation complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    });
} else if (command === 'list') {
  const pluginType = args[1] as 'ingestor' | 'sync' | undefined;
  listPlugins(pluginType);
  process.exit(0);
} else {
  console.error(`Error: Unknown command "${command}". Use "install" or "list".`);
  process.exit(1);
}

