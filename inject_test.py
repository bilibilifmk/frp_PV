#!/usr/bin/env python3
"""
frp_PV 插件端点注入测试工具

模拟 frp Server Plugin 的 NewUserConn / CloseUserConn 请求,
用内置 IP 数据批量注入, 验证 GEO 查询 + 自动封禁 + 前端展示.

用法:
  python3 inject_test.py                     # 注入全部内置 IP
  python3 inject_test.py -n 10               # 只注入前 10 条
  python3 inject_test.py --close             # 注入后自动发 CloseUserConn
  python3 inject_test.py --delay 0.5         # 每条间隔 0.5 秒
  python3 inject_test.py --host 10.0.0.5     # 指定服务器地址
  python3 inject_test.py --port 5508         # 指定端口
  python3 inject_test.py --ip 1.2.3.4        # 手动注入单个 IP
  python3 inject_test.py --stress 50         # 同一 IP 压测 N 次 (触发自动封禁)
"""

import argparse
import json
import random
import sys
import time
import urllib.request
import urllib.error

# ── 内置测试数据 ────────────────────────────────────────
# (IP, 模块名, 预期地区描述)
TEST_DATA = [
    # 中国
    ("39.103.162.98",    "Debian",    "中国 北京 阿里云"),
    ("39.100.79.4",      "win",       "中国 北京 阿里云"),
    ("111.203.147.104",  "Debian",    "中国 北京 联通"),
    ("111.7.96.151",     "obs",       "中国 北京/郑州 移动"),
    ("150.255.46.71",    "Debian",    "中国 海南 联通"),
    ("101.133.135.162",  "Qinglong",  "中国 上海 阿里云"),
    ("114.114.114.114",  "dns-test",  "中国 南京 电信"),
    ("223.5.5.5",        "dns-test",  "中国 杭州 阿里"),
    # 美国
    ("3.151.241.153",    "obs",       "美国 Ohio AWS"),
    ("207.46.13.7",      "obs",       "美国 Washington Azure"),
    ("198.235.24.159",   "obs",       "美国 California GCP"),
    ("170.9.231.192",    "obs",       "美国 Illinois Oracle"),
    ("64.62.156.24",     "obs",       "美国 California Hurricane Electric"),
    ("8.8.8.8",          "dns-test",  "美国 Google DNS"),
    ("1.1.1.1",          "dns-test",  "澳大利亚 Cloudflare"),
    # 英国
    ("87.236.176.74",    "Debian",    "英国 Leeds Driftnet"),
    ("185.247.137.109",  "Debian",    "英国 Leeds Driftnet"),
    ("35.203.211.22",    "MAC-Mini",  "英国 London GCP"),
    # 欧洲其他
    ("185.177.72.46",    "obs",       "法国 巴黎 Bucklog"),
    ("77.90.185.18",     "Debian",    "德国 巴伐利亚"),
    ("89.248.164.165",   "obs",       "荷兰 阿姆斯特丹"),
    ("192.109.200.221",  "obs",       "荷兰 Pfcloud"),
    ("87.121.84.85",     "Debian",    "荷兰 VPSVAULT"),
    ("149.86.227.60",    "obs",       "波兰 华沙 Mevspace"),
    # 亚太
    ("188.166.181.194",  "obs",       "新加坡 DigitalOcean"),
    ("178.128.30.185",   "obs",       "新加坡 DigitalOcean"),
    ("203.101.186.242",  "obs",       "巴基斯坦 Lahore"),
    # 特殊
    ("127.0.0.1",        "loopback",  "本地回环"),
]


def send_plugin_request(host: str, port: int, op: str, ip: str, proxy: str,
                        remote_port: int = 0) -> tuple[dict, int]:
    """发送一个模拟 frp plugin 请求, 返回 (响应, 使用的远程端口)."""
    if remote_port == 0:
        remote_port = random.randint(10000, 65535)
    url = f"http://{host}:{port}/frp-plugin?op={op}"
    body = json.dumps({
        "content": {
            "proxy_name": proxy,
            "remote_addr": f"{ip}:{remote_port}",
        }
    }).encode()

    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data, remote_port
    except urllib.error.HTTPError as e:
        return {"error": e.code, "msg": e.read().decode()}, remote_port
    except Exception as e:
        return {"error": str(e)}, remote_port


def main():
    parser = argparse.ArgumentParser(description="frp_PV 插件端点注入测试工具")
    parser.add_argument("-n", "--num", type=int, default=0, help="只注入前 N 条 (0=全部)")
    parser.add_argument("--host", default="127.0.0.1", help="服务器地址 (默认 127.0.0.1)")
    parser.add_argument("--port", type=int, default=5508, help="服务器端口 (默认 5508)")
    parser.add_argument("--delay", type=float, default=0.1, help="每条间隔秒数 (默认 0.1)")
    parser.add_argument("--close", action="store_true", help="注入后发送 CloseUserConn")
    parser.add_argument("--close-delay", type=float, default=2.0, help="Close 延迟秒数 (默认 2)")
    parser.add_argument("--ip", default="", help="手动注入单个 IP")
    parser.add_argument("--proxy", default="test", help="手动注入时的 proxy 名 (默认 test)")
    parser.add_argument("--stress", type=int, default=0, help="对单个 IP 压测 N 次 (配合 --ip)")
    parser.add_argument("--quiet", action="store_true", help="静默模式, 只输出统计")
    args = parser.parse_args()

    target = f"{args.host}:{args.port}"

    # ── 单 IP 模式 ──
    if args.ip:
        if args.stress > 0:
            print(f"🔥 压测模式: {args.ip} → {target}, {args.stress} 次")
            rejected = 0
            for i in range(args.stress):
                resp, _ = send_plugin_request(args.host, args.port, "NewUserConn", args.ip, args.proxy)
                is_rejected = resp.get("reject", False)
                if is_rejected:
                    rejected += 1
                if not args.quiet:
                    status = "❌ 拒绝" if is_rejected else "✅ 放行"
                    print(f"  [{i+1}/{args.stress}] {status}  {resp}")
                time.sleep(args.delay)
            print(f"\n📊 结果: {args.stress} 次请求, {rejected} 次被拒, "
                  f"{args.stress - rejected} 次放行")
            return

        print(f"📡 注入: {args.ip} → {target}")
        resp, used_port = send_plugin_request(args.host, args.port, "NewUserConn", args.ip, args.proxy)
        status = "❌ 拒绝" if resp.get("reject") else "✅ 放行"
        print(f"  {status}  {resp}")

        if args.close:
            time.sleep(args.close_delay)
            resp, _ = send_plugin_request(args.host, args.port, "CloseUserConn", args.ip, args.proxy, remote_port=used_port)
            print(f"  🔌 断开  {resp}")
        return

    # ── 批量模式 (内置数据) ──
    entries = TEST_DATA
    if args.num > 0:
        entries = entries[:args.num]

    total = len(entries)
    rejected = 0
    print(f"📡 批量注入: {total} 条 → {target}  (间隔 {args.delay}s)\n")

    close_queue = []

    for i, (ip, module, desc) in enumerate(entries, 1):
        resp, used_port = send_plugin_request(args.host, args.port, "NewUserConn", ip, module)
        is_rejected = resp.get("reject", False)
        if is_rejected:
            rejected += 1

        if not args.quiet:
            status = "❌" if is_rejected else "✅"
            print(f"  {status} [{i}/{total}] {ip:>18s}  {module:<12s}  {desc}")

        if args.close:
            close_queue.append((ip, module, used_port))

        time.sleep(args.delay)

    print(f"\n📊 注入完成: {total} 条, {rejected} 被拒, {total - rejected} 放行")

    # ── 批量断开 ──
    if args.close and close_queue:
        print(f"\n⏳ 等待 {args.close_delay}s 后发送断开...")
        time.sleep(args.close_delay)
        for ip, module, rport in close_queue:
            send_plugin_request(args.host, args.port, "CloseUserConn", ip, module, remote_port=rport)
        print(f"🔌 已断开 {len(close_queue)} 条连接")


if __name__ == "__main__":
    main()
