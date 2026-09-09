import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

export async function backupOriginalsToZip(
  projectRoot: string,
  files: Array<{ absolutePath: string; relativePath: string }>
): Promise<string> {
  const backupDir = path.join(projectRoot, '.backup');
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = formatStamp(new Date());
  const zipName = `images-${stamp}.zip`;
  const zipPath = path.join(backupDir, zipName);

  const zip = new JSZip();
  for (const f of files) {
    const data = fs.readFileSync(f.absolutePath);
    const entry = f.relativePath.split(path.sep).join('/');
    zip.file(entry, data);
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(zipPath, content);
  return zipPath;
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
