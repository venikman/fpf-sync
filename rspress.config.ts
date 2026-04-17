import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@rspress/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, '.site'),
  outDir: path.join(__dirname, 'docs'),
  base: '/fpf-sync/',
  title: 'FPF Reports',
  description: 'Plain-language reporting for the mirrored FPF repository.',
  lang: 'en',
  globalStyles: path.join(__dirname, 'theme', 'styles.css'),
  themeConfig: {
    darkMode: false
  }
});
