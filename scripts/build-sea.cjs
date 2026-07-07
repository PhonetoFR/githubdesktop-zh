// Build Node.js SEA (Single Executable Application) for Windows
const { execSync } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } = require('fs');
const path = require('path');

const ver = require('../package.json').version;
const nodeVer = 'v20.19.6';
const arch = 'win-x64';
const buildDir = path.join(__dirname, '..', 'build');
const nodeExeSrc = path.join(buildDir, `node-${nodeVer}-${arch}`, 'node.exe');
const outExe = path.join(buildDir, `patch-v${ver}-sea.exe`);
const blobPath = path.join(__dirname, '..', 'sea-prep.blob');
const configPath = path.join(__dirname, '..', 'sea-config.json');

function sh(cmd, opts) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}
mkdirSync(buildDir, { recursive: true });

// 1. Download Windows node.exe if needed
if (!existsSync(nodeExeSrc)) {
  console.log(`Downloading Node.js ${nodeVer} Windows binary...`);
  const zip = path.join(buildDir, 'node-win.zip');
  sh(`curl -L -o "${zip}" "https://nodejs.org/dist/${nodeVer}/node-${nodeVer}-${arch}.zip"`, { timeout: 180000 });
  sh(`unzip -o "${zip}" "node-${nodeVer}-${arch}/node.exe" -d "${buildDir}"`, { timeout: 30000 });
}

// 2. Ensure blob is generated with matching Node version
console.log('Generating SEA blob...');
let nodeBin = process.execPath;
if (process.version !== nodeVer) {
  const linuxDir = path.join('/tmp', `node-${nodeVer}-linux-x64`);
  const linuxNode = path.join(linuxDir, 'bin', 'node');
  if (!existsSync(linuxNode)) {
    console.log(`Downloading Node.js ${nodeVer} Linux binary for blob gen...`);
    sh(`curl -L -o /tmp/node-linux.tar.xz "https://nodejs.org/dist/${nodeVer}/node-${nodeVer}-linux-x64.tar.xz"`, { timeout: 180000 });
    sh(`tar -xJf /tmp/node-linux.tar.xz -C /tmp/`, { timeout: 30000 });
  }
  nodeBin = linuxNode;
}
sh(`"${nodeBin}" --experimental-sea-config "${configPath}"`, { timeout: 60000 });

// 3. Inject blob
console.log('Injecting SEA blob...');
copyFileSync(nodeExeSrc, outExe);
sh(`npx postject "${outExe}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`, { timeout: 60000 });

// 4. Add VERSIONINFO + clear corrupted signature
console.log('Adding VERSIONINFO...');
const { NtExecutable, NtExecutableResource, Resource } = require('resedit');
const data = readFileSync(outExe);
const exe = NtExecutable.from(data, { ignoreCert: true });
const res = NtExecutableResource.from(exe);

res.entries = res.entries.filter(e => e.type !== 16);

const CHS = 0x0804;
const UNICODE = 1200;
const [a,b,c,d] = [...ver.replace(/^v/,'').split(/[-.]/),0,0,0,0];
const vi = Resource.VersionInfo.create({
  lang: CHS,
  fixedInfo: {
    fileVersionMS: ((+a||0) << 16) | (+b||0),
    fileVersionLS: ((+c||0) << 16) | (+d||0),
    productVersionMS: ((+a||0) << 16) | (+b||0),
    productVersionLS: ((+c||0) << 16) | (+d||0),
    fileFlagsMask: 0x3f, fileFlags: 0, fileOS: 0x40004, fileType: 0x1,
    fileSubtype: 0, fileDateMS: 0, fileDateLS: 0,
  },
  strings: [{ lang: CHS, codepage: UNICODE, values: {
    CompanyName: 'GitHub Desktop 汉化',
    ProductName: 'GitHub Desktop 汉化补丁',
    FileDescription: 'GitHub Desktop 一键汉化工具 (SEA)',
    FileVersion: ver, ProductVersion: ver,
    LegalCopyright: 'MIT License',
    OriginalFilename: outExe.split('/').pop(),
    InternalName: 'github-desktop-zh',
  }}],
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
exe._dda.set(4, { virtualAddress: 0, size: 0 });

const out = Buffer.from(exe.generate());
writeFileSync(outExe, out);
console.log(`Done: ${outExe} (${out.length} bytes)`);
