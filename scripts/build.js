const { build, context } = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');

async function run() {
  const options = {
    entryPoints: [path.resolve(__dirname, '../src/unified-remote-card.ts')],
    outfile: path.resolve(__dirname, '../dist/unified-remote-card.js'),
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'esm',
    target: ['es2020'],
    treeShaking: true,
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await build(options);
    console.log('Build complete → dist/unified-remote-card.js');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
