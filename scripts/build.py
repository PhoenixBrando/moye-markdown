"""Build a public Word style template and a portable offline app. No dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED
from io import BytesIO
from xml.etree import ElementTree as E
import base64
import re

ROOT = Path(__file__).resolve().parents[1]
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P = "http://schemas.openxmlformats.org/package/2006/relationships"
HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

def style(style_id, size, before=0, after=120, bold=False, color="000000", extra=""):
    props = f'<w:spacing w:before="{before}" w:after="{after}"/>' + extra
    run = f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:color w:val="{color}"/>' + ('<w:b/>' if bold else '')
    return f'<w:style w:type="paragraph" w:styleId="{style_id}"><w:name w:val="{style_id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>{props}</w:pPr><w:rPr>{run}</w:rPr></w:style>'

def template():
    styles = HEAD + f'<w:styles xmlns:w="{W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    styles += '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    styles += style("Title", 48, after=180)
    styles += style("Subtitle", 26, after=180, color="61758A")
    for level, size in enumerate((32, 28, 24, 23, 22), start=1):
        styles += style(f"Heading{level}", size, before=220, after=140, bold=True, extra=f'<w:keepNext/><w:keepLines/><w:outlineLvl w:val="{level-1}"/>')
    styles += style("ListBullet", 22, after=100, extra='<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') + '</w:styles>'
    section = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1219" w:right="1276" w:bottom="1162" w:left="1276" w:header="482" w:footer="510" w:gutter="0"/></w:sectPr>'
    document = HEAD + f'<w:document xmlns:w="{W}" xmlns:r="{R}"><w:body><w:p/>{section}</w:body></w:document>'
    numbering = HEAD + f'<w:numbering xmlns:w="{W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'
    content_types = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
    root_rels = HEAD + f'<Relationships xmlns="{P}"><Relationship Id="rId1" Type="{R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    document_rels = HEAD + f'<Relationships xmlns="{P}"><Relationship Id="rId1" Type="{R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="{R}/numbering" Target="numbering.xml"/></Relationships>'
    core = HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Markdown document</dc:title></cp:coreProperties>'
    entries = {"[Content_Types].xml":content_types, "_rels/.rels":root_rels, "word/document.xml":document, "word/_rels/document.xml.rels":document_rels, "word/styles.xml":styles, "word/numbering.xml":numbering, "docProps/core.xml":core}
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_STORED) as archive:
        for name, text in entries.items():
            E.fromstring(text)
            archive.writestr(name, text.encode("utf-8"))
    (ROOT / "template.js").write_text("// Neutral public Word template, generated without user documents.\nconst DEFAULT_TEMPLATE_BASE64 = '" + base64.b64encode(output.getvalue()).decode("ascii") + "';\n", encoding="utf-8")

def offline():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<a\b[^>]*id="offlineDownload"[^>]*>[\s\S]*?</a>', '', html)
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (ROOT / "style.css").read_text(encoding="utf-8") + '\n</style>')
    for name in ("template.js", "converter.js", "app.js"):
        source = (ROOT / name).read_text(encoding="utf-8").replace('</script', '<\\/script')
        html = html.replace(f'<script src="{name}" defer></script>', '')
        html = html.replace('</body>', '<script>\n' + source + '\n</script>\n</body>')
    downloads = ROOT / "downloads"
    downloads.mkdir(exist_ok=True)
    target = downloads / "moye-offline.html"
    target.write_text(html, encoding="utf-8")
    with ZipFile(downloads / "moye-offline.zip", "w", compression=ZIP_DEFLATED) as archive:
        archive.write(target, "墨页转换器（双击打开）.html")
        archive.write(ROOT / "使用说明.txt", "使用说明.txt")
    print(f"Offline application built: {target.stat().st_size} bytes")

if __name__ == "__main__":
    template()
    offline()
