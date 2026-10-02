# 墨页 Markdown 文档转换器

把 Markdown 文件转换成 TXT 和可编辑的 Word 文档。中文界面，支持批量转换、原文编辑、实时预览和自定义 Word 样式模板。

## 使用

在 GitHub Pages 上打开应用，或下载 [离线版 ZIP](downloads/moye-offline.zip)，解压后双击 `墨页转换器（双击打开）.html`。建议使用新版 Edge 或 Chrome。使用应用不需要安装 Python、Node.js 或任何扩展。

1. 点击“添加 Markdown 文件”，或拖入 `.md` / `.markdown` 文件，支持多选。
2. 点击左侧文件名切换文件，可直接编辑原文并查看文档或 TXT 预览。
3. 选择“人物设定卡”或“通用文档”排版，需要时更换 `.docx` 模板。
4. 勾选 TXT、DOCX，点击“转换并下载”。多个结果打包成 ZIP，先解压再打开。

人物卡排版将首个一级标题后的两个普通段落用作副标题和姓名。通用文档不会进行此处理。

## 文件与隐私

- 转换全部在浏览器内进行，没有后台接口、文件上传、统计脚本或远程依赖。在线版首次加载页面需要联网；下载的离线版可直接断网使用。
- 原 Markdown 文件和模板不会被覆盖。编辑内容只在当前页面内保留，关闭前请完成导出。
- 公开版使用独立生成的中性 Word 模板，没有携带原作者的人物文档、页眉、个人路径或文档元数据。
- 自定义模板保留字体、样式、页面设置及页眉页脚，用 Markdown 内容替换正文。模板只在当前页面生效。
- TXT 使用 UTF-8 BOM 和 Windows 换行。中文文件名和同名文件批量导出受到支持。

## 支持范围

支持标题、`**加粗**`、`- ` 无序列表以及以 `|` 开头的 Markdown 表格。不是完整的 Markdown 渲染器：图片、网页链接、公式和代码块没有专门的格式转换。预览用于检查内容与层级，实际字体、页眉页脚和分页以 Word / WPS 为准。

Markdown 必须采用 UTF-8 编码，单个文件最大 2 MB。Word 模板需为标准 `.docx`，最大 20 MB；加密和部分特殊格式不受支持。

## 开发

前端是原生 HTML、CSS、JavaScript，无构建依赖。直接打开 `index.html` 即可使用。以下命令只供维护者使用：

```sh
# 重新生成中性模板和单文件离线版本，Python 3 标准库即可
python scripts/build.py

# 验证转换规则和 ZIP/DOCX 输出，需要 Node.js 24 或更新版本
node tests/converter.test.cjs

# 检查公开包、XML 以及离线文件
python scripts/verify_public.py
```

前端源码位于 `index.html`、`style.css`、`app.js`、`converter.js`。`template.js` 与 `downloads/` 由构建脚本生成。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**，随后向 `main` 分支推送或手动运行工作流即可部署。流程采用 [GitHub Pages 官方工作流方式](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。它只发布前端及离线下载文件，不发布维护脚本和测试目录。
