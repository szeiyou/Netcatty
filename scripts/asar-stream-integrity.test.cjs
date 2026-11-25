const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const test = require('node:test');
const asar = require('@electron/asar');
const temp = require('../electron/bridges/tempDirBridge.cjs');
test('ASAR streams hash transformed bytes even when a same-named source file exists', async () => {
  const root = temp.getTempFilePath('asar-stream-integrity-' + process.pid);
  fs.mkdirSync(root, {recursive:true});
  try {
    const file = path.join(root,'app.asar');
    const bytes = Buffer.from('{"version":"1.1.91-bg.1"}');
    const tail = Buffer.from('tail bytes');
    await asar.createPackageFromStreams(file, [['package.json',bytes],['tail.txt',tail]].map(([name,data]) => ({
      path:name,type:'file',stat:{mode:0o644,size:data.length},unpacked:false,
      streamGenerator:()=>Readable.from([data]),
    })));
    assert.deepEqual(asar.extractFile(file,'package.json'), bytes);
    assert.deepEqual(asar.extractFile(file,'tail.txt'), tail);
    assert.equal(asar.statFile(file,'package.json').integrity.hash, createHash('sha256').update(bytes).digest('hex'));
  } finally { asar.uncacheAll(); fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
});
