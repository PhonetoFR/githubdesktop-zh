const { readFileSync, writeFileSync } = require('fs');
const { NtExecutable, NtExecutableResource, Resource } = require('resedit');

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/inject-version.cjs <exe-path>');
  process.exit(1);
}

const ver = require('../package.json').version;
const parts = ver.replace(/^v/, '').split(/[-.]/);
const major = parseInt(parts[0], 10) || 0;
const minor = parseInt(parts[1], 10) || 0;
const patch = parseInt(parts[2], 10) || 0;
const build = parseInt(parts[3], 10) || 0;

const data = readFileSync(src);
const exe = NtExecutable.from(data);
const res = NtExecutableResource.from(exe);

res.entries = res.entries.filter(function (e) { return e.type !== 16; });

const CHS = 0x0804;
const UNICODE = 1200;

const vi = Resource.VersionInfo.create({
  lang: CHS,
  fixedInfo: {
    fileVersionMS: (major << 16) | minor,
    fileVersionLS: (patch << 16) | build,
    productVersionMS: (major << 16) | minor,
    productVersionLS: (patch << 16) | build,
    fileFlagsMask: 0x3f,
    fileFlags: 0,
    fileOS: 0x40004,
    fileType: 0x1,
    fileSubtype: 0,
    fileDateMS: 0,
    fileDateLS: 0,
  },
  strings: [{
    lang: CHS,
    codepage: UNICODE,
    values: {
      CompanyName: 'GitHub Desktop 汉化',
      ProductName: 'GitHub Desktop 汉化补丁',
      FileDescription: 'GitHub Desktop 一键汉化工具',
      FileVersion: ver,
      ProductVersion: ver,
      LegalCopyright: 'MIT License',
      OriginalFilename: src.split('/').pop(),
      InternalName: 'github-desktop-zh',
    },
  }],
});

vi.outputToResourceEntries(res.entries);
res.outputResource(exe);

const result = exe.generate();
const out = Buffer.from(result);
writeFileSync(src, out);
console.log('  VERSIONINFO injected (' + src.split('/').pop() + '): ' + out.length + ' bytes');
