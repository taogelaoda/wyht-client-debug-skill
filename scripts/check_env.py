#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""客户端环境自检（只读）。

判断这台机器上的 CEF 医生客户端当前处于哪种状态，供调试技能在启动前分流：
  install   安装态（售前装机未完成，宿主会强制加载安装向导，--url 失效）
  frontend  已装，接口经医院前置机代理到外网
  direct    已装，直连云端

同时从包目录名（如 WYHT--3.1.1--x64--…）解析版本，打印壳形态与启动语义：
  ≥3.0.0 → C++ 原生 CEF；<3.0.0 → C# 壳
  ≥3.1.0 → 支持冷/热启动（单实例转发参数）；更早的版本每次启动都是全新实例

用法：
  python check_env.py --dir "D:\\WYHT--3.1.1--x64--20261021_102251--医保凭证"
  python check_env.py --db  "...\\config.db"

退出码：0=direct  2=install  3=frontend  4=读取失败
"""
import argparse
import ipaddress
import os
import re
import sqlite3
import sys
import urllib.parse

KEYS = ('IsFirstRun', 'ServerUrl', 'HospitalId', 'ClientType', 'HospitalUserName')
TABLE = 'iu_Hrball_exe'
PRIVATE_SUFFIXES = ('.local', '.lan', '.internal', '.corp')
VERSION_RE = re.compile(r'(\d+)\.(\d+)\.(\d+)')


def resolve_db(argv_dir, argv_db):
    """定位 config.db：显式参数优先，其次在客户端目录下找。"""
    if argv_db:
        return argv_db
    if argv_dir:
        return os.path.join(argv_dir, 'config.db')
    return os.path.join(os.getcwd(), 'config.db')


def read_config(db_path):
    """以只读 URI 打开配置库，返回 {key: value}；文件不存在或不可读时抛异常。"""
    uri = 'file:%s?mode=ro' % db_path.replace('\\', '/')
    conn = sqlite3.connect(uri, uri=True, timeout=3)
    try:
        rows = conn.execute(
            "select key, value from %s where key in (%s)" % (TABLE, ','.join('?' * len(KEYS))),
            KEYS,
        ).fetchall()
    finally:
        conn.close()
    return {k: v for k, v in rows}


def is_private_host(host):
    """判定是否内网地址：IP 私网段、localhost、单段主机名或内网后缀。"""
    if not host:
        return False
    host = host.lower()
    if host == 'localhost' or host.endswith(PRIVATE_SUFFIXES):
        return True
    # 不带点的主机名（如 hisserver）视作内网机器名
    if '.' not in host:
        return not host.replace('-', '').isdigit()
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


def detect_version(*paths):
    """从包目录名里取版本号（如 WYHT--3.1.1--x64--…），返回 (major, minor, patch) 或 None。"""
    for path in paths:
        if not path:
            continue
        m = VERSION_RE.search(os.path.basename(os.path.abspath(path)))
        if m:
            return tuple(int(x) for x in m.groups())
    return None


def version_note(ver):
    """按版本给出壳形态与启动语义：≥3.0 为 C++，冷/热启动只有 ≥3.1.0 才有。"""
    if ver is None:
        return '版本未识别（目录名里没有 x.y.z）——请人工确认：≥3.0 为 C++ 壳，<3.0 为 C# 壳；冷/热启动只有 ≥3.1.0 才有'
    major, minor, _ = ver
    shell = 'C++ 原生 CEF' if major >= 3 else 'C# 壳（CefSharp 系）'
    hot = (major, minor) >= (3, 1)  # 3.0.x 仍是纯单实例冷启动
    start = '冷/热启动可用' if hot else '只有冷启动（每次启动都是全新实例，没有参数转发）'
    return '%s · %s · %s' % ('.'.join(str(x) for x in ver), shell, start)


def classify(cfg):
    """按 IsFirstRun + ServerUrl 归类，返回 (状态, 说明)。"""
    raw_first = cfg.get('IsFirstRun')
    # 宿主读配置的默认值是 true：键缺失同样算安装态，不能当已装
    is_first = True if raw_first is None else str(raw_first).strip().lower() in ('true', '1')

    server_url = (cfg.get('ServerUrl') or '').strip()
    if is_first:
        shown = '缺失（按 true 处理）' if raw_first is None else raw_first
        return 'install', 'IsFirstRun=%s → 安装态：宿主强制加载 file:///html/InitForm.html，--url 被忽略' % shown
    if not server_url:
        return 'install', 'IsFirstRun=false 但 ServerUrl 为空 → 配置被清，等同安装态'
    host = urllib.parse.urlsplit(server_url).hostname or ''
    if is_private_host(host):
        return 'frontend', 'ServerUrl 主机 %s 属内网 → 接口经医院前置机代理到外网' % host
    return 'direct', 'ServerUrl 主机 %s 为公网 → 直连云端' % host


def main():
    parser = argparse.ArgumentParser(description='医生客户端环境自检（只读）')
    parser.add_argument('--dir', help='客户端目录（其下有 config.db）')
    parser.add_argument('--db', help='直接指定 config.db 路径')
    args = parser.parse_args()

    db_path = resolve_db(args.dir, args.db)
    if not os.path.exists(db_path):
        print('ERROR: 未找到 config.db: %s' % db_path)
        return 4
    try:
        cfg = read_config(db_path)
    except Exception as exc:  # 库被独占、schema 不符等
        print('ERROR: 读取失败: %s' % exc)
        return 4

    print('config.db = %s' % db_path)
    print('版本: %s' % version_note(detect_version(args.dir, os.path.dirname(db_path))))
    for key in KEYS:
        print('  %-17s = %s' % (key, cfg.get(key, '<缺失>')))
    # ServerUrl 里的 iuWorkStation 会在启动时被替换为 iuPublicClientServer，两种写法都能通
    status, reason = classify(cfg)
    print('判定: %s —— %s' % (status, reason))
    print('摘要: 环境=%s · ServerUrl=%s · HospitalId=%s' % (
        status, cfg.get('ServerUrl') or '<空>', cfg.get('HospitalId') or '<空>'))
    return {'direct': 0, 'install': 2, 'frontend': 3}[status]


if __name__ == '__main__':
    sys.exit(main())
