'use strict';
const $ = id => document.getElementById(id);
const example = `# 人物设定档案

人物设定卡（示例）

艾琳 · 维尔

这是一份演示文档。你可以直接修改，也可以导入自己的 Markdown 文件。

## 一、基本档案

| 项目 | 设定 |
| --- | --- |
| 姓名 | 艾琳 · 维尔 |
| 身份 | 一位年轻的档案整理员 |
| 特点 | 观察敏锐，习惯记录细节 |

## 二、人物特征

- **性格：** 温和、独立，对未知的事物抱有好奇。
- **习惯：** 随身携带一本深蓝色笔记本。

### 故事起点

一封没有署名的信，打破了平静的日常。
`;
let nextId = 1;
let files = [{ id: nextId++, name: '人物设定卡（示例）.md', content: example, example: true }];
let selectedId = files[0].id, view = 'document', customTemplate = null, templatePromise = null, busy = false;
function current() { return files.find(f => f.id === selectedId); }
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function renderFiles() {
  $('fileList').replaceChildren(); $('fileCount').textContent = files.length;
  for (const file of files) {
    const row = document.createElement('div'); row.className = 'file-item' + (file.id === selectedId ? ' active' : '');
    const select = document.createElement('button'); select.className = 'file-select'; select.title = file.name;
    select.setAttribute('aria-pressed', String(file.id === selectedId));
    const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = 'MD';
    const meta = document.createElement('span'); meta.className = 'file-meta';
    const title = document.createElement('strong'); title.textContent = file.name;
    const sub = document.createElement('small'); sub.textContent = `${file.content.length.toLocaleString()} 字符${file.example ? ' · 示例' : ''}`;
    meta.append(title, sub); select.append(icon, meta);
    select.addEventListener('click', () => { selectedId = file.id; renderAll(); });
    const remove = document.createElement('button'); remove.className = 'remove-file'; remove.textContent = '×';
    remove.title = '移除此文件'; remove.setAttribute('aria-label', `移除 ${file.name}`);
    remove.addEventListener('click', () => {
      const index = files.indexOf(file); files.splice(index, 1);
      if (file.id === selectedId) selectedId = files[Math.min(index, files.length - 1)]?.id ?? null;
      renderAll(); status('文件已从待转换列表移除，电脑上的原文件不会删除。');
    });
    row.append(select, remove); $('fileList').append(row);
  }
}
function inline(text) {
  const fragment = document.createDocumentFragment();
  for (const part of Converter.inlineParts(text)) {
    if (part.bold) { const strong = document.createElement('strong'); strong.textContent = part.text; fragment.append(strong); }
    else fragment.append(document.createTextNode(part.text));
  }
  return fragment;
}
function renderPreview() {
  const file = current(); $('preview').replaceChildren();
  $('charCount').textContent = (file?.content.length || 0).toLocaleString() + ' 字符';
  if (!file || !file.content.trim()) {
    const p = document.createElement('p'); p.textContent = '添加文件或输入内容后，预览会显示在这里。'; p.style.color = '#8797aa'; $('preview').append(p); return;
  }
  if (view === 'txt') { const pre = document.createElement('pre'); pre.textContent = Converter.mdToTxt(file.content); $('preview').append(pre); return; }
  for (const block of Converter.parse(file.content, $('layoutSelect').value)) {
    if (block.type === 'table') {
      const wrap = document.createElement('div'); wrap.className = 'table-wrap'; const table = document.createElement('table');
      block.rows.forEach((row, ri) => {
        const tr = document.createElement('tr');
        for (const text of row) { const cell = document.createElement(ri === 0 ? 'th' : 'td'); cell.append(inline(text)); tr.append(cell); }
        table.append(tr);
      });
      wrap.append(table); $('preview').append(wrap); continue;
    }
    if (block.type === 'bullet') {
      let list = $('preview').lastElementChild;
      if (!list || list.tagName !== 'UL') { list = document.createElement('ul'); $('preview').append(list); }
      const li = document.createElement('li'); li.append(inline(block.text)); list.append(li); continue;
    }
    const tag = block.type === 'title' ? 'h1' : block.type === 'heading' ? 'h' + Math.min(6, block.level + 1) : 'p';
    const element = document.createElement(tag);
    if (block.type === 'subtitle') element.className = 'subtitle';
    if (block.type === 'name') element.className = 'name-line';
    element.append(inline(block.text)); $('preview').append(element);
  }
}
function updateSummary() {
  const count = $('batchAll').checked ? files.length : Number(Boolean(current()));
  const formats = Number($('formatTxt').checked) + Number($('formatDocx').checked);
  $('exportSummary').textContent = `${count} 个文件 · ${formats} 种格式`;
  $('exportHint').textContent = count * formats > 1 ? '结果打包为 ZIP，原文件不会被覆盖。' : '直接下载所选格式，原文件不会被覆盖。';
  $('exportButton').disabled = busy || !count || !formats;
}
function renderAll() {
  const file = current(); $('editor').value = file?.content || ''; $('editor').disabled = !file;
  $('currentName').textContent = file?.name || '还没有文件'; $('renameButton').disabled = !file;
  renderFiles(); renderPreview(); updateSummary();
}
$('editor').addEventListener('input', () => {
  const file = current(); if (!file) return;
  file.content = $('editor').value; file.example = false; renderPreview(); renderFiles(); status('');
});
$('newButton').addEventListener('click', () => {
  const names = new Set(files.map(f => f.name)); let n = 1;
  while (names.has(`未命名文档 ${n}.md`)) n++;
  const file = { id: nextId++, name: `未命名文档 ${n}.md`, content: '' };
  files.push(file); selectedId = file.id; renderAll(); $('editor').focus(); status('可以粘贴或输入 Markdown 内容。');
});
async function importFiles(fileObjects) {
  const imported = [], errors = [];
  for (const file of Array.from(fileObjects)) {
    if (!/\.(md|markdown)$/i.test(file.name)) { errors.push(`${file.name}：请选择 .md 或 .markdown 文件`); continue; }
    if (file.size > 2 * 1024 * 1024) { errors.push(`${file.name}：单个 Markdown 文件不能超过 2 MB`); continue; }
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (!text.trim()) { errors.push(`${file.name}：文件没有内容`); continue; }
      imported.push({ id: nextId++, name: file.name, content: text.replace(/^\ufeff/, '') });
    } catch { errors.push(`${file.name}：无法读取，请将文件保存为 UTF-8 编码后重试`); }
  }
  if (imported.length) {
    files = files.filter(file => !file.example); files.push(...imported); selectedId = imported[0].id; renderAll();
  }
  status([imported.length ? `已添加 ${imported.length} 个文件。` : '', ...errors].filter(Boolean).join(' '), Boolean(errors.length));
}
$('dropzone').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => { await importFiles(e.target.files); e.target.value = ''; });
// Prevent the browser from navigating away when files are dropped elsewhere.
document.addEventListener('dragover', e => { e.preventDefault(); });
document.addEventListener('drop', e => { e.preventDefault(); });
$('dropzone').addEventListener('dragover', () => $('dropzone').classList.add('dragging'));
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', async e => { $('dropzone').classList.remove('dragging'); await importFiles(e.dataTransfer.files); });
function setView(next) {
  view = next;
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
  $('preview').setAttribute('aria-labelledby', view === 'document' ? 'tabDocument' : 'tabTxt'); renderPreview();
}
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
  button.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const next = event.key === 'Home' ? 'document' : event.key === 'End' ? 'txt' : view === 'document' ? 'txt' : 'document';
      setView(next); $(next === 'document' ? 'tabDocument' : 'tabTxt').focus();
    }
  });
});
$('layoutSelect').addEventListener('change', () => {
  $('layoutHint').textContent = $('layoutSelect').value === 'card' ? '首个标题后的两段用作副标题和姓名。' : '按普通标题、段落和列表排版。'; renderPreview();
});
function getDefaultTemplate() {
  if (!templatePromise) templatePromise = Converter.unzip(Uint8Array.from(atob(DEFAULT_TEMPLATE_BASE64), c => c.charCodeAt(0)));
  return templatePromise;
}
$('templateButton').addEventListener('click', () => $('templateInput').click());
$('templateInput').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (!/\.docx$/i.test(file.name)) throw new Error('请选择 .docx 格式的 Word 模板。');
    if (file.size > 20 * 1024 * 1024) throw new Error('Word 模板不能超过 20 MB。');
    status('正在读取 Word 样式模板…');
    const entries = await Converter.unzip(new Uint8Array(await file.arrayBuffer())); Converter.templateInfo(entries);
    customTemplate = entries; $('templateName').textContent = file.name; $('templateName').title = file.name; $('templateReset').hidden = false;
    status('模板已更换。导出时会保留它的样式与页面设置，正文使用当前 Markdown 内容。');
  } catch (error) { status('模板未更换：' + error.message, true); }
});
$('templateReset').addEventListener('click', () => {
  customTemplate = null; $('templateName').textContent = '内置排版模板'; $('templateName').title = '公开版中性排版模板'; $('templateReset').hidden = true; status('已恢复内置排版模板。');
});
['formatTxt', 'formatDocx', 'batchAll'].forEach(id => $(id).addEventListener('change', updateSummary));
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('exportButton').addEventListener('click', async () => {
  if (busy) return;
  const targets = ($('batchAll').checked ? files : [current()]).filter(Boolean).map(file => ({ ...file }));
  const txt = $('formatTxt').checked, docx = $('formatDocx').checked, layout = $('layoutSelect').value;
  if (!targets.length || (!txt && !docx)) return;
  const empty = targets.find(file => !file.content.trim());
  if (empty) { status(`“${empty.name}”没有内容。请输入文字或移除这个文件后重试。`, true); return; }
  if (targets.some(file => new TextEncoder().encode(file.content).length > 2 * 1024 * 1024)) { status('单个 Markdown 文件不能超过 2 MB，请缩短内容后重试。', true); return; }
  busy = true; updateSummary(); status('正在转换，请稍候…');
  try {
    const template = docx ? (customTemplate || await getDefaultTemplate()) : null;
    const outputs = [], names = new Set();
    for (let i = 0; i < targets.length; i++) {
      const file = targets[i]; const base = Converter.safeName(file.name); let name = base, number = 2;
      while (names.has(name.toLowerCase())) name = `${base} (${number++})`;
      names.add(name.toLowerCase());
      if (txt) outputs.push([name + '.txt', Converter.txtBytes(file.content)]);
      if (docx) outputs.push([name + '.docx', Converter.makeDocx(file.content, template, layout)]);
      status(`已转换 ${i + 1} / ${targets.length} 个文件…`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (outputs.length === 1) download(outputs[0][1], outputs[0][0], txt ? 'text/plain;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    else download(Converter.zip(outputs), targets.length === 1 ? Converter.safeName(targets[0].name) + '（转换结果）.zip' : 'Markdown转换结果.zip', 'application/zip');
    status(`转换完成，已发起下载：${targets.length} 个文件，${outputs.length} 个结果。请查看浏览器下载记录${outputs.length > 1 ? '，解压 ZIP 后即可使用' : ''}。`);
  } catch (error) { status('转换失败：' + error.message, true); }
  finally { busy = false; updateSummary(); }
});
$('helpButton').addEventListener('click', () => { $('helpPanel').hidden = !$('helpPanel').hidden; $('helpButton').setAttribute('aria-expanded', String(!$('helpPanel').hidden)); });
$('renameButton').addEventListener('click', () => { if (!current()) return; $('renameInput').value = Converter.safeName(current().name); $('renameDialog').showModal(); $('renameInput').select(); });
$('cancelRename').addEventListener('click', () => $('renameDialog').close());
$('renameForm').addEventListener('submit', event => {
  event.preventDefault(); if (!current()) { $('renameDialog').close(); return; }
  current().name = Converter.safeName($('renameInput').value) + '.md'; $('renameDialog').close(); renderAll(); status('名称已更新，电脑上的原文件不会重命名。');
});
renderAll();
