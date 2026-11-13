#!/bin/sh
# 改完 css/js 之后跑一次：把 site/index.html 里所有 ?v= 换成新版本号。
#
#   ./tools/bump-version.sh            # 用当前时间戳当版本号
#   ./tools/bump-version.sh 20261114a  # 指定版本号
#
# 为什么要这个：GitHub Pages 给静态资源发的是 cache-control: max-age=14400，
# 浏览器 4 小时内不会再问服务器要，改完样式刷新也看不到新效果。
# index.html 本身是 max-age=0, must-revalidate，所以只改 HTML 里的版本号就够了。
set -e
cd "$(dirname "$0")/.."
V="${1:-$(date +%Y%m%d%H%M)}"
python3 - "$V" <<'PY'
import re, sys
v = sys.argv[1]
p = 'site/index.html'
s = open(p, encoding='utf-8').read()
new, n = re.subn(r'\?v=[0-9A-Za-z]+', '?v=' + v, s)
if not n:
    sys.exit('没找到 ?v= 引用，检查一下 site/index.html')
# head 里那行注释也同步，免得注释和实际版本号对不上
new = re.sub(r'（当前 [0-9A-Za-z]+）', '（当前 %s）' % v, new)
open(p, 'w', encoding='utf-8').write(new)
print('已更新 %d 处引用，版本号 = %s' % (n, v))
PY
