export function fileUrlToPath(url: string): string | null {
  try {
    if (url.startsWith('file://')) {
      const u = new URL(url);
      let p = decodeURIComponent(u.pathname);
      // Windows: /C:/...
      if (/^\/[A-Za-z]:\//.test(p)) {
        p = p.slice(1);
      }
      return p;
    }
  } catch {
    // ignore
  }
  return null;
}

export function extractDropFolderPath(dt: DataTransfer): string | null {
  const mimeCandidates = [
    'application/vnd.code.uri-list',
    'text/uri-list',
    'text/plain',
  ];
  for (const mime of mimeCandidates) {
    const raw = dt.getData(mime);
    if (!raw) {
      continue;
    }
    const first = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith('#'));
    if (!first) {
      continue;
    }
    const fromUrl = fileUrlToPath(first);
    if (fromUrl) {
      return fromUrl;
    }
    if (first.startsWith('/') || /^[A-Za-z]:[\\/]/.test(first)) {
      return first;
    }
  }

  if (dt.files?.length) {
    const file = dt.files[0] as File & { path?: string };
    if (file.path) {
      return file.path;
    }
  }

  // Electron / Chromium items
  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') {
        continue;
      }
      const f = item.getAsFile() as (File & { path?: string }) | null;
      if (f?.path) {
        return f.path;
      }
    }
  }

  return null;
}
