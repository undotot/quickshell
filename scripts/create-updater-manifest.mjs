import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const version = packageJson.version;
const tag = process.env.GITHUB_REF_NAME || `v${version}`;
const repository = process.env.GITHUB_REPOSITORY || 'undotot/quickshell';
const outputDirectory = resolve(process.env.UPDATER_OUTPUT_DIR || 'release-assets');

async function findBundleDirectory() {
  const configuredDirectory = process.env.UPDATER_BUNDLE_DIRECTORY;
  if (configuredDirectory) {
    return resolve(configuredDirectory);
  }

  const targetDirectory = resolve('src-tauri/target');
  const candidates = [resolve(targetDirectory, 'release/bundle/nsis')];

  try {
    const entries = await readdir(targetDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'release') {
        candidates.push(resolve(targetDirectory, entry.name, 'release/bundle/nsis'));
      }
    }
  } catch {
    // The validation below reports a clearer error if the target directory is absent.
  }

  for (const candidate of candidates) {
    try {
      const candidateStats = await stat(candidate);
      if (candidateStats.isDirectory()) {
        return candidate;
      }
    } catch {
      // Try the next supported Tauri target layout.
    }
  }

  throw new Error(`找不到 NSIS 更新包目录，已检查：${candidates.join(', ')}`);
}

const bundleDirectory = await findBundleDirectory();
const bundleFiles = await readdir(bundleDirectory);
const bundleName = bundleFiles.find((fileName) => fileName.endsWith('.nsis.zip'));

if (!bundleName) {
  throw new Error(`找不到 NSIS 更新包：${bundleDirectory}`);
}

const signatureName = `${bundleName}.sig`;
if (!bundleFiles.includes(signatureName)) {
  throw new Error(`找不到更新包签名：${resolve(bundleDirectory, signatureName)}`);
}

const signature = (await readFile(resolve(bundleDirectory, signatureName), 'utf8')).trim();
const manifest = {
  version,
  notes: process.env.RELEASE_NOTES || `QuickShell ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(bundleName)}`,
      signature,
    },
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, 'latest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`已生成更新清单：${resolve(outputDirectory, 'latest.json')}`);
