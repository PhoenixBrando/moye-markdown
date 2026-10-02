/* All conversion happens locally. No network requests or external libraries. */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const WIDTH_HINTS = { '项目|设定': [2000, 7350], '人物|设定': [2000, 7350], '年份|年龄|经历': [1600, 1400, 6350], '时间|事件|对她的影响': [1600, 3200, 4550] };
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : (n >>> 1);
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function joinBytes(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }
  function zip(entries) {
    const chunks = [], central = [];
    let offset = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const [name, data] of entries) {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data;
      const nameBytes = encoder.encode(name), crc = crc32(bytes);
      const head = new Uint8Array(30), h = new DataView(head.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, nameBytes.length, true);
      chunks.push(head, nameBytes, bytes);
      const center = new Uint8Array(46), c = new DataView(center.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, nameBytes.length, true); c.setUint32(42, offset, true);
      central.push(center, nameBytes); offset += head.length + nameBytes.length + bytes.length;
    }
    const directory = joinBytes(central), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
    e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
    return joinBytes([...chunks, directory, end]);
  }
  async function unzip(bytes) {
    if (bytes.length > 20 * 1024 * 1024) throw new Error('Word 模板不能超过 20 MB。');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
      if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
    }
    if (end < 0) throw new Error('这不是有效的 DOCX 文件，或文件已经损坏。');
    const count = view.getUint16(end + 10, true);
    let position = view.getUint32(end + 16, true), totalSize = 0;
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count === 65535 || count > 2048) throw new Error('这个模板的压缩格式不受支持，请用 Word 另存为普通 DOCX。');
    const entries = [];
    try {
      for (let i = 0; i < count; i++) {
        if (view.getUint32(position, true) !== 0x02014b50) throw new Error('Word 模板的文件目录已损坏。');
        const flags = view.getUint16(position + 8, true), method = view.getUint16(position + 10, true);
        const crc = view.getUint32(position + 16, true), size = view.getUint32(position + 20, true), fullSize = view.getUint32(position + 24, true);
        const nameLen = view.getUint16(position + 28, true), extraLen = view.getUint16(position + 30, true), commentLen = view.getUint16(position + 32, true);
        const start = view.getUint32(position + 42, true);
        const name = decoder.decode(bytes.slice(position + 46, position + 46 + nameLen));
        totalSize += fullSize;
        if (fullSize > 16 * 1024 * 1024 || totalSize > 64 * 1024 * 1024) throw new Error('模板解压后过大，请使用内容较少的 Word 样式模板。');
        if (flags & 1) throw new Error('暂不支持加密模板，请先在 Word 中取消密码。');
        if (view.getUint32(start, true) !== 0x04034b50) throw new Error('Word 模板已损坏。');
        const dataStart = start + 30 + view.getUint16(start + 26, true) + view.getUint16(start + 28, true);
        if (dataStart + size > bytes.length) throw new Error('Word 模板的文件内容不完整。');
        let data = bytes.slice(dataStart, dataStart + size);
        if (method === 8) {
          let stream;
          try { stream = new DecompressionStream('deflate-raw'); }
          catch { throw new Error('当前浏览器无法读取压缩模板，请用新版 Edge 或 Chrome 打开应用。'); }
          const reader = new Blob([data]).stream().pipeThrough(stream).getReader(), pieces = [];
          let length = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > fullSize) { await reader.cancel(); throw new Error('模板压缩内容的大小不匹配。'); }
            pieces.push(value);
          }
          data = joinBytes(pieces);
        } else if (method !== 0) throw new Error('模板使用了不支持的压缩格式，请用 Word 重新保存。');
        if (data.length !== fullSize || crc32(data) !== crc) throw new Error('模板内容校验失败，请重新选择未损坏的文件。');
        entries.push([name, data]); position += 46 + nameLen + extraLen + commentLen;
      }
    } catch (err) {
      if (err instanceof RangeError) throw new Error('Word 模板的数据不完整。');
      throw err;
    }
    if (new Set(entries.map(e => e[0])).size !== entries.length) throw new Error('模板包含重复的文件条目，请重新保存。');
    return entries;
  }
  function mdToTxt(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      let s = lines[i].trim();
      if (/^\|[\s\-|:]+\|$/.test(s)) continue;
      if (s.startsWith('|')) { out.push(s.replace(/^\|+|\|+$/g, '').split('|').map(c => c.trim()).join('｜')); continue; }
      s = s.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');
      if (s.startsWith('- ')) {
        out.push('• ' + s.slice(2));
        if (!(i + 1 < lines.length && lines[i + 1].trim() === '')) out.push('');
      } else out.push(s);
    }
    return out.join('\n').replace(/^\n+|\n+$/g, '') + '\n';
  }
  function parse(md, layout = 'card') {
    const lines = md.replace(/\r\n/g, '\n').split('\n'), blocks = [];
    let titleDone = false, cardStage = 0;
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if (!s) continue;
      if (s.startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          const row = lines[i].trim();
          if (!/^\|[\s\-|:]+\|$/.test(row)) rows.push(row.replace(/^\|+|\|+$/g, '').split('|').map(c => c.trim()));
          i++;
        }
        i--;
        if (rows.length) {
          const ncol = rows.reduce((max, row) => Math.max(max, row.length), 0);
          rows.forEach(row => { while (row.length < ncol) row.push(''); });
          blocks.push({ type: 'table', rows });
        }
        cardStage = 0; continue;
      }
      const heading = s.match(/^(#{1,6})\s+(.*)$/);
      if (heading && heading[1].length === 1 && !titleDone) {
        blocks.push({ type: 'title', text: heading[2] }); titleDone = true; cardStage = layout === 'card' ? 1 : 0; continue;
      }
      if (cardStage && !heading && !s.startsWith('- ')) {
        blocks.push({ type: cardStage === 1 ? 'subtitle' : 'name', text: s });
        cardStage = cardStage === 1 ? 2 : 0; continue;
      }
      cardStage = 0;
      if (heading) blocks.push({ type: 'heading', level: Math.min(5, Math.max(1, heading[1].length - 1)), text: heading[2] });
      else if (/^\*\*[^*]+\*\*$/.test(s)) blocks.push({ type: 'heading', level: 3, text: s.slice(2, -2) });
      else if (s.startsWith('- ')) blocks.push({ type: 'bullet', text: s.slice(2) });
      else blocks.push({ type: 'paragraph', text: s });
    }
    return blocks;
  }
  function escapeXml(value) {
    return Array.from(String(value)).filter(c => { const cp = c.codePointAt(0); return cp === 9 || cp === 10 || cp === 13 || (cp >= 32 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff); }).join('').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function inlineParts(text) {
    return text.split(/(\*\*.+?\*\*)/g).filter(Boolean).map(s => ({ text: s.startsWith('**') && s.endsWith('**') && s.length > 4 ? s.slice(2, -2) : s, bold: s.startsWith('**') && s.endsWith('**') && s.length > 4 }));
  }
  function runs(text, { bold = false, size = null, noBold = false } = {}) {
    return inlineParts(text).map(part => {
      const props = (!noBold && (bold || part.bold) ? '<w:b/>' : '') + (size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '');
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(part.text)}</w:t></w:r>`;
    }).join('');
  }
  function validateXml(text) {
    if (typeof DOMParser !== 'undefined') {
      const xml = new DOMParser().parseFromString(text, 'application/xml');
      if (xml.getElementsByTagName('parsererror').length) throw new Error('模板内部 XML 损坏，请用 Word 重新保存。');
    }
  }
  function templateInfo(entries) {
    const map = new Map(entries);
    if (!map.has('word/document.xml') || !map.has('[Content_Types].xml') || !map.has('word/styles.xml')) throw new Error('请选择标准 .docx 文件，不能使用 .doc 或 .dotx。');
    const document = decoder.decode(map.get('word/document.xml')), styles = decoder.decode(map.get('word/styles.xml'));
    validateXml(document); validateXml(styles);
    if (!document.includes(W) || !/<w:body(?:\s[^>]*)?>/.test(document)) throw new Error('暂不支持此模板的 Word XML 格式，请用 Word 另存为标准 DOCX。');
    const body = document.match(/<w:body(?:\s[^>]*)?>([\s\S]*?)<\/w:body>/);
    if (!body) throw new Error('模板中没有有效的文档正文。');
    const sections = Array.from(body[1].matchAll(/<w:sectPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:sectPr>)/g));
    const lastSection = sections.at(-1);
    const section = lastSection && !body[1].slice(lastSection.index + lastSection[0].length).trim() ? lastSection[0] : '';
    const availableStyles = new Map();
    for (const match of styles.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
      const id = (match[1].match(/\bw:styleId="([^"]+)"/) || [])[1];
      const name = (match[2].match(/<w:name\b[^>]*w:val="([^"]+)"/) || [])[1];
      if (id) { availableStyles.set(id.toLowerCase(), id); if (name) availableStyles.set(name.toLowerCase().replace(/\s/g, ''), id); }
    }
    const resolve = name => availableStyles.get(name.toLowerCase().replace(/\s/g, '')) || availableStyles.get('normal') || '';
    const pageWidth = Number((section.match(/<w:pgSz\b[^>]*w:w="(\d+)"/) || [])[1] || 11906);
    const margins = (section.match(/<w:pgMar\b[^>]*>/) || [''])[0];
    const left = Number((margins.match(/w:left="(\d+)"/) || [])[1] || 1276), right = Number((margins.match(/w:right="(\d+)"/) || [])[1] || 1276);
    const gutter = Number((margins.match(/w:gutter="(\d+)"/) || [])[1] || 0);
    return { document, section, resolve, hasBullet: availableStyles.has('listbullet'), width: Math.max(1440, pageWidth - left - right - gutter) };
  }
  function makeDocx(md, entries, layout = 'card') {
    const info = templateInfo(entries);
    const paragraph = (text, style, options = {}) => {
      const styleId = info.resolve(style);
      const props = (styleId ? `<w:pStyle w:val="${escapeXml(styleId)}"/>` : '') + (options.props || '');
      return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs(text, options)}</w:p>`;
    };
    const body = parse(md, layout).map(block => {
      if (block.type === 'title') return paragraph(block.text, 'Title');
      if (block.type === 'subtitle') return paragraph(block.text, 'Subtitle');
      if (block.type === 'name') return paragraph(block.text, 'Normal', { size: 28, noBold: true });
      if (block.type === 'heading') return paragraph(block.text, 'Heading' + block.level);
      if (block.type === 'bullet') return paragraph((info.hasBullet ? '' : '• ') + block.text, info.hasBullet ? 'ListBullet' : 'Normal');
      if (block.type === 'paragraph') return paragraph(block.text, 'Normal');
      const hints = WIDTH_HINTS[block.rows[0].join('|')] || block.rows[0].map(() => 1);
      const sum = hints.reduce((a, b) => a + b, 0);
      const widths = hints.map(hint => Math.floor(hint / sum * info.width));
      widths[widths.length - 1] += info.width - widths.reduce((a, b) => a + b, 0);
      const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>`).join('');
      const margins = [['top', 80], ['bottom', 80], ['left', 105], ['right', 105]].map(([edge, width]) => `<w:${edge} w:w="${width}" w:type="dxa"/>`).join('');
      const rows = block.rows.map((row, ri) => `<w:tr><w:trPr><w:cantSplit/>${ri === 0 ? '<w:tblHeader/>' : ''}</w:trPr>${row.map((text, ci) => `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/>${ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EDF0"/>' : ''}</w:tcPr>${paragraph(text, 'Normal', { bold: ri === 0, props: `<w:ind w:firstLine="0"/><w:spacing w:after="0" w:line="276" w:lineRule="auto"/>${ri === 0 ? '<w:keepNext/>' : ''}` })}</w:tc>`).join('')}</w:tr>`).join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="${info.width}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar>${margins}</w:tblCellMar><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
    }).join('');
    const document = info.document.replace(/<w:body(?:\s[^>]*)?>[\s\S]*?<\/w:body>/, () => `<w:body>${body}${info.section}</w:body>`);
    const result = entries.map(([name, data]) => [name, name === 'word/document.xml' ? encoder.encode(document) : data]);
    return zip(result);
  }
  function txtBytes(md) { return encoder.encode('\ufeff' + mdToTxt(md).replace(/\n/g, '\r\n')); }
  function safeName(name) {
    let result = name.replace(/\.(?:md|markdown)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim() || '未命名文档';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
    return result;
  }
  root.Converter = { zip, unzip, crc32, mdToTxt, txtBytes, parse, inlineParts, escapeXml, makeDocx, templateInfo, safeName };
  if (typeof module !== 'undefined') module.exports = root.Converter;
})(globalThis);
