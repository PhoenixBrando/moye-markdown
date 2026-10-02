"""Verify that the published package is self-contained and contains no private files."""
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
from xml.etree import ElementTree as E
import base64
import re

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_MARKERS = ("C:/Users/", "C:\\Users\\", "/Users/")
source = (ROOT / "template.js").read_text(encoding="utf-8")
encoded = re.search(r"'([A-Za-z0-9+/=]+)'", source)[1]
with ZipFile(BytesIO(base64.b64decode(encoded))) as template:
    assert template.testzip() is None
    assert not any(name.startswith(("customXml/", "word/header", "word/footer")) for name in template.namelist())
    for name in template.namelist():
        text = template.read(name).decode("utf-8")
        E.fromstring(text)
        assert all(marker not in text for marker in PRIVATE_MARKERS), name
        assert 'TargetMode="External"' not in text

html = (ROOT / "downloads/moye-offline.html").read_text(encoding="utf-8")
assert 'id="offlineDownload"' not in html
assert html.index("const DEFAULT_TEMPLATE_BASE64") < html.index("root.Converter =") < html.index("const $ =")
assert not re.search(r'<(?:script|link)\b[^>]*(?:src|href)="(?!data:)', html)
for name in ("index.html", "style.css", "app.js", "converter.js", "template.js", "README.md", "使用说明.txt", "downloads/moye-offline.html"):
    text = (ROOT / name).read_text(encoding="utf-8")
    assert all(marker not in text for marker in PRIVATE_MARKERS), name
    if name.endswith((".js", ".html")):
        assert not re.search(r'\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(', text), name
with ZipFile(ROOT / "downloads/moye-offline.zip") as package:
    assert package.testzip() is None
    assert set(package.namelist()) == {"墨页转换器（双击打开）.html", "使用说明.txt"}

qa = ROOT / "qa/generated.docx"
if qa.exists():
    with ZipFile(qa) as document:
        assert document.testzip() is None
        for name in document.namelist():
            E.fromstring(document.read(name))
        namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        tree = E.fromstring(document.read("word/document.xml"))
        assert tree.findall(".//w:tbl", namespaces)
        for table in tree.findall(".//w:tbl", namespaces):
            widths = [int(col.get("{" + namespaces["w"] + "}w")) for col in table.find("w:tblGrid", namespaces)]
            assert sum(widths) == 9354
            for row in table.findall("w:tr", namespaces):
                assert len(row.findall("w:tc", namespaces)) == len(widths)
print("PASS: neutral template, private content exclusion, no upload/network code, offline download integrity and valid DOCX XML")
