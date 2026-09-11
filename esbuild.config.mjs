import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const OUT = 'ImgDo';
const MODULE_OUT = path.join(OUT, 'modules', 'image-compress');
const WEBVIEW_OUT = path.join(OUT, 'webview');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyImageCompressWasm() {
  const targets = [
    {
      from: 'node_modules/@jsquash/jpeg/codec',
      to: path.join(MODULE_OUT, 'wasm/jpeg'),
    },
    {
      from: 'node_modules/@jsquash/webp/codec',
      to: path.join(MODULE_OUT, 'wasm/webp'),
    },
    {
      from: 'node_modules/@jsquash/oxipng/codec',
      to: path.join(MODULE_OUT, 'wasm/oxipng'),
    },
  ];

  for (const t of targets) {
    const from = path.join(__dirname, t.from);
    const to = path.join(__dirname, t.to);
    if (!fs.existsSync(from)) {
      continue;
    }
    copyDir(from, to);
  }
}

function copyWebviewAssets() {
  const destDir = path.join(__dirname, WEBVIEW_OUT);
  fs.mkdirSync(destDir, { recursive: true });
  const copies = [
    ['src/shell/styles/base.css', 'base.css'],
    ['src/modules/image-compress/view/styles.css', 'compress.css'],
    ['src/modules/image-ico/view/styles.css', 'ico.css'],
    ['src/modules/image-base64/view/styles.css', 'base64.css'],
  ];
  for (const [fromRel, toName] of copies) {
    fs.copyFileSync(path.join(__dirname, fromRel), path.join(destDir, toName));
  }
}

const shared = {
  bundle: true,
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

const contexts = await Promise.all([
  esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: `${OUT}/extension.js`,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    target: 'node16',
  }),
  esbuild.context({
    ...shared,
    entryPoints: ['src/modules/image-compress/compress/worker.ts'],
    outfile: path.join(MODULE_OUT, 'worker.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node16',
  }),
  esbuild.context({
    ...shared,
    entryPoints: ['src/main.ts'],
    outfile: path.join(WEBVIEW_OUT, 'main.js'),
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
  }),
]);

function prepareModuleAssets() {
  copyImageCompressWasm();
  copyWebviewAssets();
}

prepareModuleAssets();

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('watching...');
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
  prepareModuleAssets();
}
