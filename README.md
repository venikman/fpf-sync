# fpf-sync

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.3. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Yandex Disk → Auto‑PR Sync

This repo can automatically watch a Yandex Disk public share and open a PR when the file changes.

- Workflow: `.github/workflows/yadisk-sync.yml` (runs every 30 minutes and on manual dispatch)
- Script: `scripts/yadisk-sync.mjs` (downloads a file from a Yandex public link)

Configure via repository Variables (Settings → Variables → Actions) or use the defaults:

- `YANDEX_PUBLIC_URL`: Public share URL (defaults to `https://disk.yandex.ru/d/N2xaJZWo-hhFYw`).
- `YANDEX_PUBLIC_PATH` (optional): Path of the file within the share (use when the link points to a folder).
- `YANDEX_TARGET_NAME` (optional): File name to pick from a folder share when `YANDEX_PUBLIC_PATH` is a directory.
- `YANDEX_DEST_FILENAME` (optional): Override the filename saved into the repo.

Downloaded files are saved under `yadisk/`. The workflow uses `peter-evans/create-pull-request` to open/update PRs only when changes are detected.

Run locally (Bun):

```bash
bun scripts/yadisk-sync.mjs \
  --public-url "https://disk.yandex.ru/d/N2xaJZWo-hhFYw" \
  # If the share is a folder, either specify a file path:
  # --public-path "/Folder/file.ext" \
  # or specify a file name to pick from that folder:
  # --target-name "file.ext" \
  --dest-path "yadisk" \
  # --dest-filename "desired-name.ext"
```

Notes:

- Yandex Disk does not expose webhooks for public shares; this uses periodic polling via GitHub Actions.
- Increase frequency by adjusting the cron in `.github/workflows/yadisk-sync.yml` (GitHub schedules are best‑effort and not real‑time).
