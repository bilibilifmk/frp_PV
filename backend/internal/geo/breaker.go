package geo

import (
	"log"
	"sync"
	"time"
)

// ── 熔断器状态 ─────────────────────────────────────────

type breakerState int

const (
	bsClosed   breakerState = iota // 正常
	bsOpen                         // 熔断 (拒绝请求)
	bsHalfOpen                     // 冷却后半开探测
)

// Breaker 轻量级熔断器: 连续失败 → 自动熔断 → 冷却后半开探测.
type Breaker struct {
	name        string
	maxFails    int
	cooldown    time.Duration
	mu          sync.Mutex
	state       breakerState
	failCount   int
	lastFailAt  time.Time
}

// NewBreaker 创建熔断器.
func NewBreaker(name string, maxFails int, cooldown time.Duration) *Breaker {
	return &Breaker{
		name:     name,
		maxFails: maxFails,
		cooldown: cooldown,
	}
}

// Allow 返回当前是否允许请求通过.
func (b *Breaker) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case bsClosed, bsHalfOpen:
		return true
	case bsOpen:
		if time.Since(b.lastFailAt) >= b.cooldown {
			b.state = bsHalfOpen
			return true
		}
		return false
	}
	return true
}

// RecordSuccess 记录成功.
func (b *Breaker) RecordSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.failCount > 0 || b.state != bsClosed {
		old := b.state
		b.failCount = 0
		b.state = bsClosed
		if old != bsClosed {
			log.Printf("[GEO] %s 熔断恢复", b.name)
		}
	}
}

// RecordFailure 记录失败.
func (b *Breaker) RecordFailure() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failCount++
	b.lastFailAt = time.Now()
	if b.failCount >= b.maxFails && b.state != bsOpen {
		b.state = bsOpen
		log.Printf("[GEO] %s 熔断触发, 连续失败 %d 次, %v 后恢复", b.name, b.failCount, b.cooldown)
	}
}
