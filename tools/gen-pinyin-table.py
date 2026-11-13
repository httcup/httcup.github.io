#!/usr/bin/env python3
"""
生成 js/xh-py.js：拼音数据（首字母 + 全拼）共用一份表。

设计
----
表由三部分组成，目的是让「首字母搜索」和「全拼搜索」复用同一份数据，
同时把体积压到 40KB 以内（要支持全拼并不需要几百 KB 的映射表）：

    syl    音节表，约 410 个无声调音节（"a" / "ai" / "zhang" …）
    chars  6813 个汉字，顺序固定（GB2312 全覆盖 + 站点数据里的生僻字）
    idx    每个汉字 2 位 base36，指向 syl 的下标

运行时用 chars[i] → syl[parseInt(idx.substr(i*2,2), 36)] 还原；
首字母取音节的第一个字母，全拼就是音节本身。

用法
----
    pip3 install pypinyin
    python3 tools/gen-pinyin-table.py                       # 覆盖 site/js/xh-py.js
    python3 tools/gen-pinyin-table.py --out /tmp/xh-py.js   # 写到别处

什么时候要重跑
--------------
  - 新增的书签标题里有表外的生僻字（那个字不会贡献拼音，其余字照常匹配）
  - 想换 pypinyin 版本或调整多音字策略（默认取第一个读音）
"""

import argparse
import json
import os
import sys

from pypinyin import Style, lazy_pinyin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = os.path.join(ROOT, 'site', 'json', 'pintree.json')
DEFAULT_OUT = os.path.join(ROOT, 'site', 'js', 'xh-py.js')

HEADER = """/* ==========================================================================
   拼音数据（汉字 → 音节），首字母与全拼共用这一份
   --------------------------------------------------------------------------
   {count} 个汉字 = GB2312 全覆盖（6763）+ 站点标题里的生僻字（{extra}）
   音节表 {syllables} 个，逐字索引 2 位 base36。

   重新生成：python3 tools/gen-pinyin-table.py
   文件没加载成功时，xh-home.js 退化为「不支持拼音搜索」，中文/网址搜索照常。
   ========================================================================== */
window.__XH_PY = {{
  syl: {syl},
  chars: "{chars}",
  idx: "{idx}"
}};
"""


def gb2312_hanzi():
    """GB2312 一、二级汉字共 6763 个，覆盖现代汉语 99% 以上。"""
    out = set()
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode('gb2312')
            except UnicodeDecodeError:
                continue
            if '\u4e00' <= ch <= '\u9fa5':
                out.add(ch)
    return out


def data_hanzi(node, acc):
    for ch in node.get('title') or '':
        if '\u4e00' <= ch <= '\u9fa5':
            acc.add(ch)
    for child in node.get('children') or []:
        data_hanzi(child, acc)
    return acc


def base36(n, width=2):
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    if n == 0:
        s = '0'
    else:
        s = ''
        while n:
            n, r = divmod(n, 36)
            s = digits[r] + s
    return s.rjust(width, '0')


def syllable_of(ch):
    """取第一个读音；标点/非汉字返回空串。"""
    py = lazy_pinyin(ch, style=Style.NORMAL, errors='ignore')
    if len(py) == 1 and py[0].isalpha():
        return py[0].lower()
    return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default=DEFAULT_DATA)
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()

    data = json.load(open(args.data, encoding='utf-8'))
    root = data[0] if isinstance(data, list) else data

    base = gb2312_hanzi()
    extra = data_hanzi(root, set()) - base
    chars = sorted(base | extra)

    syllables = ['']
    syl_index = {'': 0}
    idx_parts = []
    for ch in chars:
        s = syllable_of(ch)
        if s not in syl_index:
            syl_index[s] = len(syllables)
            syllables.append(s)
        idx_parts.append(base36(syl_index[s]))

    if len(syllables) > 36 * 36:
        sys.exit('音节表超过 1296，2 位 base36 装不下')

    syl_js = '[' + ','.join('"%s"' % s for s in syllables) + ']'
    js = HEADER.format(
        count=len(chars),
        extra=len(extra),
        syllables=len(syllables) - 1,
        syl=syl_js,
        chars=''.join(chars),
        idx=''.join(idx_parts),
    )
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(js)

    size = len(js.encode('utf-8'))
    unknown = sum(1 for c in chars if syllable_of(c) == '')
    print('写成 %s：%d 字 / %d 音节 / %d 字节（未知读音 %d 字）'
          % (args.out, len(chars), len(syllables) - 1, size, unknown), file=sys.stderr)


if __name__ == '__main__':
    main()
