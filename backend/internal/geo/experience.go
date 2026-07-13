package geo

import (
	"strings"
	"sync"
)

// ── 经验分追踪器 ───────────────────────────────────────
//
// 设计原则:
//   - 每次查询结束后, 将每个 provider 的回答与最终投票结论对比
//   - 国家一致 → +1 分, 城市一致 → +2 分 (城市更难判断, 给更多权重)
//   - 用滑动窗口 (最近 expWindow 次查询), 避免古早数据污染
//   - 最终乘数范围 [expFloor, expCeil], 保守调节
//   - 不到 expMinSamples 次时返回 1.0, 不干预 (冷启动保护)
//
// 关于反馈环问题:
//   经验分只做 ±20% 微调, 静态 weight 仍然是主导因素.
//   即使一个 provider 被压低, 它的 weight 基数不变, 仍然能参与投票.
//   因此不会出现 "一旦被压低就永远爬不起来" 的恶性循环.

const (
	expWindow     = 200 // 滑动窗口大小: 只看最近 N 次查询
	expMinSamples = 10  // 最低样本量: 不够时不干预
	expFloor      = 0.8 // 乘数下限
	expCeil        = 1.2 // 乘数上限
	expCountryPts = 1   // 国家一致得分
	expCityPts    = 2   // 城市一致得分
	expMaxPts     = expCountryPts + expCityPts // 单次满分
)

// expTracker 跟踪每个 provider 的经验分 (滑动窗口).
type expTracker struct {
	mu      sync.RWMutex
	history map[string]*ringBuf // provider name → 环形缓冲区
}

// ringBuf 定长环形缓冲, 存放最近 N 次得分.
type ringBuf struct {
	buf  [expWindow]float32 // 每次得分 (归一化到 0~1)
	pos  int                // 下一个写入位置
	size int                // 已写入数量 (≤ expWindow)
}

func newExpTracker() *expTracker {
	return &expTracker{
		history: make(map[string]*ringBuf),
	}
}

// multiplier 返回 provider 的经验分乘数 [expFloor, expCeil].
// 样本不足时返回 1.0.
func (t *expTracker) multiplier(name string) float64 {
	// 去除 geocoder 后缀, 让 "nominatim-rev" 和 "nominatim-fwd" 共享经验
	base := stripGeoSuffix(name)

	t.mu.RLock()
	rb, ok := t.history[base]
	t.mu.RUnlock()

	if !ok || rb.size < expMinSamples {
		return 1.0
	}

	avg := rb.average()
	// 线性映射: avg 0.0 → expFloor, avg 1.0 → expCeil
	m := expFloor + (expCeil-expFloor)*float64(avg)
	return m
}

// feedback 用投票结论反馈每个 provider 的得分.
func (t *expTracker) feedback(results []providerResult, merged *Info) {
	if merged == nil {
		return
	}
	mergedCountry := normAdmin(strings.TrimSpace(merged.Country))
	mergedCity := normAdmin(strings.TrimSpace(merged.City))

	t.mu.Lock()
	defer t.mu.Unlock()

	for _, r := range results {
		pts := 0
		// 国家对比
		if mergedCountry != "" {
			rc := normAdmin(strings.TrimSpace(r.info.Country))
			if rc == mergedCountry {
				pts += expCountryPts
			}
		}
		// 城市对比
		if mergedCity != "" {
			rc := normAdmin(strings.TrimSpace(r.info.City))
			if rc == mergedCity {
				pts += expCityPts
			}
		}

		// 归一化到 [0, 1]
		score := float32(pts) / float32(expMaxPts)

		base := stripGeoSuffix(r.name)
		rb, ok := t.history[base]
		if !ok {
			rb = &ringBuf{}
			t.history[base] = rb
		}
		rb.push(score)
	}
}

// push 写入一条得分.
func (rb *ringBuf) push(score float32) {
	rb.buf[rb.pos] = score
	rb.pos = (rb.pos + 1) % expWindow
	if rb.size < expWindow {
		rb.size++
	}
}

// average 计算当前窗口的平均分.
func (rb *ringBuf) average() float32 {
	if rb.size == 0 {
		return 0.5 // 无数据时取中间值
	}
	var sum float32
	for i := 0; i < rb.size; i++ {
		sum += rb.buf[i]
	}
	return sum / float32(rb.size)
}

// stripGeoSuffix 去除 geocoder 方向后缀, 让同一 geocoder 的正/逆共享经验.
func stripGeoSuffix(name string) string {
	name = strings.TrimSuffix(name, "-rev")
	name = strings.TrimSuffix(name, "-fwd")
	return name
}
