#!/usr/bin/env python3
"""geo 全 IP 测试 — 使用 geo_cache.json 中全部 IP 进行完整流水线测试.

用法:
    PYTHONPATH=. python test_all_ips.py          # 正常运行
    PYTHONPATH=. python test_all_ips.py --fresh   # 清除测试缓存后运行
"""

import json
import logging
import os
import sys
import time
from collections import Counter
from pathlib import Path

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# ── 参数 ──────────────────────────────────────────────
CACHE_FILE = Path(__file__).parent / "geo_cache.json"
TEST_CACHE = "/tmp/geo_test_all_cache.json"

if "--fresh" in sys.argv:
    try:
        os.remove(TEST_CACHE)
        print("[info] 已清除测试缓存:", TEST_CACHE)
    except FileNotFoundError:
        pass

# ── 加载 geo_cache 获取所有 IP 及旧数据 ─────────────
with open(CACHE_FILE, "r", encoding="utf-8") as f:
    geo_cache: dict = json.load(f)

all_ips = list(geo_cache.keys())
print(f"\n共 {len(all_ips)} 个 IP 待测试\n")

# ── 为每个 IP 生成标签 (旧国家-旧城市) ───────────────
def make_label(entry: dict) -> str:
    c = entry.get("country", "?")
    city = entry.get("city", "") or entry.get("region", "") or ""
    # 去掉 "市" / "都" 后缀使标签更紧凑
    for suf in ("市", "都"):
        if city.endswith(suf) and len(city) > 2:
            city = city[:-1]
    return f"{c}-{city}" if city else c

# ── 初始化 GeoService ────────────────────────────────
from geo import GeoService  # noqa: E402

svc = GeoService(cache_path=TEST_CACHE)

# ── 运行测试 ─────────────────────────────────────────
SEP = "-" * 150
HDR = (
    f"{'#':<4} {'标签':<20} {'IP':<18} "
    f"{'desc':<55} {'locality':<15} {'street':<20} {'耗时':>6}"
)

print(HDR)
print(SEP)

results = []
total_t0 = time.time()
ok_count = 0
fail_count = 0
slow_count = 0  # > 10s

for idx, ip in enumerate(all_ips, 1):
    old = geo_cache[ip]
    label = make_label(old)

    t0 = time.time()
    try:
        info = svc.lookup(ip)
    except Exception as e:
        info = None
        logging.warning("lookup(%s) 异常: %s", ip, e)
    elapsed = time.time() - t0

    if info:
        ok_count += 1
        if elapsed > 10:
            slow_count += 1
        row = {
            "ip": ip,
            "label": label,
            "desc": info.desc,
            "country": info.country,
            "region": info.region,
            "city": info.city,
            "district": info.district,
            "locality": info.locality,
            "street": info.street,
            "isp": info.isp,
            "lat": info.lat,
            "lon": info.lon,
            "elapsed": round(elapsed, 2),
        }
        results.append(row)
        mark = "⚠️" if elapsed > 10 else "  "
        print(
            f"{idx:<4} {label:<20} {ip:<18} "
            f"{info.desc:<55} {info.locality or '-':<15} "
            f"{info.street or '-':<20} {elapsed:>5.1f}s {mark}"
        )
    else:
        fail_count += 1
        results.append({"ip": ip, "label": label, "desc": "FAIL", "elapsed": round(elapsed, 2)})
        print(f"{idx:<4} {label:<20} {ip:<18} {'❌ 无结果':<55} {'':<15} {'':<20} {elapsed:>5.1f}s")

total_elapsed = time.time() - total_t0

# ── 统计摘要 ─────────────────────────────────────────
print(SEP)
print(f"\n{'='*60}")
print(f" 测试完成: {ok_count} 成功 / {fail_count} 失败 / {len(all_ips)} 总计")
print(f" 总耗时: {total_elapsed:.1f}s  平均: {total_elapsed/len(all_ips):.1f}s/IP")
if slow_count:
    print(f" 慢查询 (>10s): {slow_count} 个")
print(f"{'='*60}")

# ── 质量分析 ─────────────────────────────────────────
print("\n── 质量分析 ──")

# 1. 仍含英文的字段统计
import re

def has_latin(s: str) -> bool:
    """检测字符串是否包含拉丁字母 (排除 ISP / 纯数字)."""
    return bool(re.search(r'[a-zA-Z]{2,}', s or ""))

latin_fields = {"country": [], "region": [], "city": [], "district": [], "locality": [], "street": []}
for r in results:
    if r.get("desc") == "FAIL":
        continue
    for field in latin_fields:
        val = r.get(field, "")
        if has_latin(val):
            latin_fields[field].append((r["ip"], val))

print("\n含拉丁字母的字段:")
for field, items in latin_fields.items():
    if items:
        print(f"  {field}: {len(items)} 个")
        for ip, val in items[:5]:
            print(f"    {ip:<18} → {val}")
        if len(items) > 5:
            print(f"    ... 还有 {len(items)-5} 个")

# 2. 空字段统计
empty_stats = Counter()
for r in results:
    if r.get("desc") == "FAIL":
        continue
    for field in ("district", "locality", "street"):
        if not r.get(field):
            empty_stats[field] += 1

print(f"\n空字段统计 (共 {ok_count} 个成功结果):")
for field in ("district", "locality", "street"):
    cnt = empty_stats.get(field, 0)
    pct = cnt / ok_count * 100 if ok_count else 0
    print(f"  {field:<12}: {cnt:>3} 空 ({pct:.0f}%)")

# 3. 与旧缓存对比变化
print("\n── 与 geo_cache.json 对比 ──")
changed = []
for r in results:
    if r.get("desc") == "FAIL":
        continue
    ip = r["ip"]
    old = geo_cache.get(ip, {})
    diffs = []
    for field in ("country", "region", "city", "district", "isp"):
        old_val = old.get(field, "")
        new_val = r.get(field, "")
        if old_val and new_val and old_val != new_val:
            diffs.append(f"{field}: {old_val!r} → {new_val!r}")
    if diffs:
        changed.append((ip, diffs))

print(f"共 {len(changed)} 个 IP 有字段变化:")
for ip, diffs in changed[:20]:
    print(f"  {ip:<18} {'; '.join(diffs)}")
if len(changed) > 20:
    print(f"  ... 还有 {len(changed)-20} 个")

# ── 保存详细结果到 JSON ──────────────────────────────
RESULT_FILE = "/tmp/geo_test_all_results.json"
with open(RESULT_FILE, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n详细结果已保存到: {RESULT_FILE}")
