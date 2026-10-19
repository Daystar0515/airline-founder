"""把 game/ 打包成單一 HTML 檔：
- dist/airline-founder.html：完整網頁，可直接雙擊開啟或放進 Electron。
- dist/artifact.html：給 claude.ai 線上試玩用（不含 doctype／html／body 外殼）。"""
import re, sys, pathlib
root = pathlib.Path(sys.argv[1])
g = root / 'game'
src = (g / 'index.html').read_text(encoding='utf-8')
def part(name):
    return re.search(rf'<!--BUNDLE:{name}-->(.*?)<!--/BUNDLE:{name}-->', src, re.S).group(1)
head = part('HEAD').replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (g / 'style.css').read_text(encoding='utf-8') + '\n</style>')
scripts = ''
for m in re.finditer(r'<script src="([^"]+)"></script>', part('SCRIPTS')):
    js = (g / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    scripts += f'<script>\n{js}\n</script>\n'
body = part('BODY')
out = root / 'dist'
out.mkdir(exist_ok=True)
(out / 'artifact.html').write_text(head + body + scripts, encoding='utf-8')
full = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '</head>\n<body>\n' + body + scripts + '</body>\n</html>\n')
(out / 'airline-founder.html').write_text(full, encoding='utf-8')
import shutil
if (g / 'tiles').exists():
    shutil.rmtree(out / 'tiles', ignore_errors=True)
    shutil.copytree(g / 'tiles', out / 'tiles')
# v1.0：dist/ 本身就是可以直接放上 GitHub Pages 的網站（index.html、可加到主畫面的 manifest、離線快取、圖示）
(out / 'index.html').write_text(full, encoding='utf-8')
for f in ('manifest.webmanifest', 'sw.js'):
    shutil.copy(g / f, out / f)
shutil.rmtree(out / 'icons', ignore_errors=True)
shutil.copytree(g / 'icons', out / 'icons')
print('bundled', round(len(full.encode()) / 1024), 'KB')
