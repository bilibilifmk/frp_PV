package luaprovider

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"frp-pv/internal/geo"

	lua "github.com/yuin/gopher-lua"
)

// ── LuaProvider ────────────────────────────────────────

// LuaProvider 将一个 Lua 脚本包装为 geo.Provider.
type LuaProvider struct {
	name   string
	weight int
	pool   sync.Pool // *lua.LState 池, 并发安全
	script string    // 脚本源码 (用于 pool 新建)
}

// New 从 Lua 源码构造 provider. 编译失败时返回 error.
func New(script string) (*LuaProvider, error) {
	L := newState()
	defer L.Close()

	if err := L.DoString(script); err != nil {
		return nil, fmt.Errorf("lua compile: %w", err)
	}

	name := L.GetGlobal("name")
	if name.Type() != lua.LTString {
		return nil, fmt.Errorf("lua: global 'name' must be a string")
	}
	fn := L.GetGlobal("lookup")
	if fn.Type() != lua.LTFunction {
		return nil, fmt.Errorf("lua: global 'lookup' must be a function")
	}

	weight := 1
	if w := L.GetGlobal("weight"); w.Type() == lua.LTNumber {
		weight = int(lua.LVAsNumber(w))
	}

	p := &LuaProvider{
		name:   lua.LVAsString(name),
		weight: weight,
		script: script,
	}
	p.pool.New = func() any {
		st := newState()
		if err := st.DoString(script); err != nil {
			return nil
		}
		return st
	}
	return p, nil
}

func (p *LuaProvider) Name() string { return p.name }
func (p *LuaProvider) Weight() int  { return p.weight }

// Lookup 执行 Lua 的 lookup(ip) 函数.
func (p *LuaProvider) Lookup(ip string) (*geo.Info, error) {
	L := p.getState()
	defer p.putState(L)

	fn := L.GetGlobal("lookup")
	if err := L.CallByParam(lua.P{
		Fn:      fn,
		NRet:    2,
		Protect: true,
	}, lua.LString(ip)); err != nil {
		return nil, fmt.Errorf("lua[%s]: %w", p.name, err)
	}

	ret := L.Get(-2)
	errVal := L.Get(-1)
	L.Pop(2)

	if errVal.Type() == lua.LTString {
		return nil, fmt.Errorf("lua[%s]: %s", p.name, lua.LVAsString(errVal))
	}
	if ret.Type() == lua.LTNil {
		return nil, fmt.Errorf("lua[%s]: returned nil", p.name)
	}

	tbl, ok := ret.(*lua.LTable)
	if !ok {
		return nil, fmt.Errorf("lua[%s]: expected table, got %s", p.name, ret.Type())
	}

	info := &geo.Info{IP: ip}
	info.Country = getStr(tbl, "country")
	info.Region = getStr(tbl, "region")
	info.City = getStr(tbl, "city")
	info.District = getStr(tbl, "district")
	info.Locality = getStr(tbl, "locality")
	info.Street = getStr(tbl, "street")
	info.ISP = getStr(tbl, "isp")
	if v := getStr(tbl, "ip"); v != "" {
		info.IP = v
	}
	if lat := getNum(tbl, "lat"); lat != nil {
		info.Lat = lat
	}
	if lon := getNum(tbl, "lon"); lon != nil {
		info.Lon = lon
	}

	return info, nil
}

func (p *LuaProvider) getState() *lua.LState {
	v := p.pool.Get()
	if v == nil {
		st := newState()
		_ = st.DoString(p.script)
		return st
	}
	return v.(*lua.LState)
}

func (p *LuaProvider) putState(L *lua.LState) {
	p.pool.Put(L)
}

// ── ProviderScanner ────────────────────────────────────

// ProviderScanner 管理 Lua provider 的扫描、加载和热重载.
type ProviderScanner struct {
	dir       string
	mu        sync.RWMutex
	providers []*LuaProvider
}

// NewProviderScanner 创建扫描器并立即扫描指定目录.
func NewProviderScanner(dir string) (*ProviderScanner, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("provider scanner: mkdir %s: %w", dir, err)
	}
	s := &ProviderScanner{dir: dir}
	s.scan()
	return s, nil
}

// Entries 返回当前已加载的 provider 列表.
func (s *ProviderScanner) Entries() []geo.ProviderEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entries := make([]geo.ProviderEntry, len(s.providers))
	for i, p := range s.providers {
		entries[i] = geo.ProviderEntry{Provider: p, Weight: p.Weight()}
	}
	return entries
}

// Reload 重新扫描目录, 替换全部 Lua provider.
func (s *ProviderScanner) Reload() int { return s.scan() }

// Count 返回当前加载的脚本数量.
func (s *ProviderScanner) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.providers)
}

// Names 返回所有已加载 provider 名称.
func (s *ProviderScanner) Names() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	names := make([]string, len(s.providers))
	for i, p := range s.providers {
		names[i] = fmt.Sprintf("%s (w=%d)", p.Name(), p.Weight())
	}
	return names
}

func (s *ProviderScanner) scan() int {
	files, err := filepath.Glob(filepath.Join(s.dir, "*.lua"))
	if err != nil {
		log.Printf("[LUA] 扫描目录失败 %s: %v", s.dir, err)
		return 0
	}

	var loaded []*LuaProvider
	for _, f := range files {
		name := filepath.Base(f)
		if strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
			continue
		}

		data, err := os.ReadFile(f)
		if err != nil {
			log.Printf("[LUA] 读取 %s 失败: %v", name, err)
			continue
		}

		p, err := New(string(data))
		if err != nil {
			log.Printf("[LUA] 加载 %s 失败: %v", name, err)
			continue
		}

		log.Printf("[LUA] ✓ 加载 %s → %s (weight=%d)", name, p.Name(), p.Weight())
		loaded = append(loaded, p)
	}

	s.mu.Lock()
	s.providers = loaded
	s.mu.Unlock()

	log.Printf("[LUA] 共加载 %d 个脚本 provider (目录: %s)", len(loaded), s.dir)
	return len(loaded)
}

// ── helpers ──

func getStr(tbl *lua.LTable, key string) string {
	v := tbl.RawGetString(key)
	if v.Type() == lua.LTString {
		return lua.LVAsString(v)
	}
	return ""
}

func getNum(tbl *lua.LTable, key string) *float64 {
	v := tbl.RawGetString(key)
	if v.Type() == lua.LTNumber {
		f := float64(lua.LVAsNumber(v))
		return &f
	}
	return nil
}
