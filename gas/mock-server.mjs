// Локальная имитация Google Apps Script для разработки без Google.
// Запуск: node gas/mock-server.mjs  →  NEXT_PUBLIC_GAS_API_URL=http://localhost:8787/exec
// Данные живут в памяти (и в gas/.mock-db.json). Фото отдаются с /thumbnail?id=…
import http from 'node:http'; import fs from 'node:fs'; import vm from 'node:vm'; import crypto from 'node:crypto';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DB = path.join(dir, '.mock-db.json');
const state = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { sheets: {}, props: {}, files: {} };
const save = () => fs.writeFileSync(DB, JSON.stringify(state));

const cell = v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
function sheet(name) {
  const data = state.sheets[name];
  const ensure = (r, c) => { while (data.length < r) data.push([]); data.forEach(row => { while (row.length < c) row.push(''); }); };
  const width = () => Math.max(0, ...data.map(r => { let n = r.length; while (n && (r[n - 1] === '' || r[n - 1] == null)) n--; return n; }));
  const height = () => { let n = data.length; while (n && data[n - 1].every(v => v === '' || v == null)) n--; return n; };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { ensure(r + nr - 1, c + nc - 1); return data.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)); },
    setValues: vals => { ensure(r + nr - 1, c + nc - 1); vals.forEach((row, i) => row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = cell(v); })); return range(r, c, nr, nc); },
    setValue: v => { ensure(r, c); data[r - 1][c - 1] = cell(v); return range(r, c); },
    setFontWeight: () => range(r, c, nr, nc),
  });
  return {
    getName: () => name, getLastRow: height, getLastColumn: width, getRange: range, setFrozenRows: () => {},
    getDataRange: () => { const h = height(), w = width(); return { getValues: () => h && w ? range(1, 1, h, w).getValues() : [] }; },
  };
}
const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
const folder = (id, name) => ({
  getId: () => id, getName: () => name, isTrashed: () => false,
  getFoldersByName: n => iter(Object.entries(state.files).filter(([, f]) => f.folder && f.name === n).map(([fid]) => folder(fid, n))),
  createFolder: n => { const fid = 'folder_' + crypto.randomUUID().slice(0, 8); state.files[fid] = { folder: true, name: n }; return folder(fid, n); },
  createFile: blob => { const fid = crypto.randomUUID().replace(/-/g, ''); state.files[fid] = { mime: blob.mime, b64: Buffer.from(blob.bytes).toString('base64'), shared: false };
    return { getId: () => fid, setSharing: () => { state.files[fid].shared = true; } }; },
});
const sandbox = {
  console, Logger: { log: console.log },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getId: () => 'mock-spreadsheet',
      getSheetByName: n => (state.sheets[n] ? sheet(n) : null),
      insertSheet: n => { state.sheets[n] = []; return sheet(n); },
    }),
    flush: () => save(), getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }),
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
    getFileById: () => ({ getParents: () => iter([]) }), getRootFolder: () => folder('root', 'My Drive'),
    getFolderById: id => { if (!state.files[id]) throw new Error('not found'); return folder(id, state.files[id].name); },
  },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => [...Buffer.from(s, 'base64')],
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => state.props[k] ?? null, setProperty: (k, v) => { state.props[k] = String(v); } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; } }) },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (url.pathname === '/thumbnail') {
    const f = state.files[url.searchParams.get('id')];
    if (!f || f.folder) { res.writeHead(404, cors); return res.end(); }
    res.writeHead(200, { ...cors, 'Content-Type': f.mime }); return res.end(Buffer.from(f.b64, 'base64'));
  }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const out = req.method === 'POST'
      ? sandbox.doPost({ postData: { contents: body.replaceAll(`http://localhost:${PORT}/thumbnail`, 'https://drive.google.com/thumbnail'), type: req.headers['content-type'] } })
      : sandbox.doGet({ parameter: Object.fromEntries(url.searchParams) });
    save();
    // Как настоящий GAS: подменяем ссылки Диска на локальные, чтобы фото показывались офлайн
    const content = out.content.replaceAll('https://drive.google.com/thumbnail', `http://localhost:${PORT}/thumbnail`);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(content);
  });
}).listen(PORT, () => console.log(`GAS mock → http://localhost:${PORT}/exec`));
