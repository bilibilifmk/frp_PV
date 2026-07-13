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

// ── LuaGeocoder ────────────────────────────────────────

// LuaGeocoder 将一个 Lua 脚本包装为正向/逆向地理编码器.
type LuaGeocoder struct {
	name       string
	weight     int
	hasForward bool
	hasReverse bool
	pool       sync.Pool
	script     string
}

// NewGeocoder 从 Lua 源码构造 geocoder.
func NewGeocoder(script string) (*LuaGeocoder, error) {
	L := newState()
	defer L.Close()

	if err := L.DoString(script); err != nil {
		return nil, fmt.Errorf("lua compile: %w", err)
	}

	name := L.GetGlobal("name")
	if name.Type() != lua.LTString {
		return nil, fmt.Errorf("lua: global 'name' must be a string")
	}

	hasForward := L.GetGlobal("forward").Type() == lua.LTFunction
	hasReverse := L.GetGlobal("reverse").Type() == lua.LTFunction
	if !hasForward && !hasReverse {
		return nil, fmt.Errorf("lua: geocoder must define 'forward' and/or 'reverse' function")
	}

	weight := 4
	if w := L.GetGlobal("weight"); w.Type() == lua.LTNumber {
		weight = int(lua.LVAsNumber(w))
	}

	g := &LuaGeocoder{
		name:       lua.LVAsString(name),
		weight:     weight,
		hasForward: hasForward,
		hasReverse: hasReverse,
		script:     script,
	}
	g.pool.New = func() any {
		st := newState()
		if err := st.DoString(script); err != nil {
			return nil
		}
		return st
	}
	return g, nil
}

func (g *LuaGeocoder) Name() string    { return g.name }
func (g *LuaGeocoder) Weight() int     { return g.weight }
func (g *LuaGeocoder) HasForward() bool { return g.hasForward }
func (g *LuaGeocoder) HasReverse() bool { return g.hasReverse }

// Forward 执行 Lua 的 forward(query) → {lat, lon}, err.
func (g *LuaGeocoder) Forward(query string) (float64, float64, error) {
	if !g.hasForward {
		return 0, 0, fmt.Errorf("geocoder[%s]: no forward function", g.name)
	}

	L := g.getState()
	defer g.putState(L)

	fn := L.GetGlobal("forward")
	if err := L.CallByParam(lua.P{
		Fn: fn, NRet: 2, Protect: true,
	}, lua.LString(query)); err != nil {
		return 0, 0, fmt.Errorf("geocoder[%s]: %w", g.name, err)
	}

	ret := L.Get(-2)
	errVal := L.Get(-1)
	L.Pop(2)

	if errVal.Type() == lua.LTString {
		return 0, 0, fmt.Errorf("geocoder[%s]: %s", g.name, lua.LVAsString(errVal))
	}

	tbl, ok := ret.(*lua.LTable)
	if !ok {
		return 0, 0, fmt.Errorf("geocoder[%s]: forward must return table", g.name)
	}

	latV := getNum(tbl, "lat")
	lonV := getNum(tbl, "lon")
	if latV == nil || lonV == nil {
		return 0, 0, fmt.Errorf("geocoder[%s]: forward: missing lat/lon", g.name)
	}
	return *latV, *lonV, nil
}

// Reverse 执行 Lua 的 reverse(lat, lon) → table, err.
func (g *LuaGeocoder) Reverse(lat, lon float64) (*geo.ReverseResult, error) {
	if !g.hasReverse {
		return nil, fmt.Errorf("geocoder[%s]: no reverse function", g.name)
	}

	L := g.getState()
	defer g.putState(L)

	fn := L.GetGlobal("reverse")
	if err := L.CallByParam(lua.P{
		Fn: fn, NRet: 2, Protect: true,
	}, lua.LNumber(lat), lua.LNumber(lon)); err != nil {
		return nil, fmt.Errorf("geocoder[%s]: %w", g.name, err)
	}

	ret := L.Get(-2)
	errVal := L.Get(-1)
	L.Pop(2)

	if errVal.Type() == lua.LTString {
		return nil, fmt.Errorf("geocoder[%s]: %s", g.name, lua.LVAsString(errVal))
	}

	tbl, ok := ret.(*lua.LTable)
	if !ok {
		return nil, fmt.Errorf("geocoder[%s]: reverse must return table", g.name)
	}

	return &geo.ReverseResult{
		Country:  getStr(tbl, "country"),
		Region:   getStr(tbl, "region"),
		City:     getStr(tbl, "city"),
		District: getStr(tbl, "district"),
		Locality: getStr(tbl, "locality"),
		Street:   getStr(tbl, "street"),
	}, nil
}

func (g *LuaGeocoder) getState() *lua.LState {
	v := g.pool.Get()
	if v == nil {
		st := newState()
		_ = st.DoString(g.script)
		return st
	}
	return v.(*lua.LState)
}

func (g *LuaGeocoder) putState(L *lua.LState) {
	g.pool.Put(L)
}

// ── GeocoderScanner ────────────────────────────────────

// GeocoderScanner 管理 Lua geocoder 的扫描、加载和热重载.
type GeocoderScanner struct {
	dir       string
	mu        sync.RWMutex
	geocoders []*LuaGeocoder
}

// NewGeocoderScanner 创建扫描器并立即扫描指定目录.
func NewGeocoderScanner(dir string) (*GeocoderScanner, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("geocoder scanner: mkdir %s: %w", dir, err)
	}
	s := &GeocoderScanner{dir: dir}
	s.scan()
	return s, nil
}

// ForwardEntries 返回支持正向编码的 geocoder 列表.
func (s *GeocoderScanner) ForwardEntries() []geo.ForwardEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var entries []geo.ForwardEntry
	for _, g := range s.geocoders {
		if g.HasForward() {
			entries = append(entries, geo.ForwardEntry{Geocoder: g, Weight: g.Weight()})
		}
	}
	return entries
}

// ReverseEntries 返回支持逆向编码的 geocoder 列表.
func (s *GeocoderScanner) ReverseEntries() []geo.ReverseEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var entries []geo.ReverseEntry
	for _, g := range s.geocoders {
		if g.HasReverse() {
			entries = append(entries, geo.ReverseEntry{Geocoder: g, Weight: g.Weight()})
		}
	}
	return entries
}

// Reload 重新扫描目录.
func (s *GeocoderScanner) Reload() int { return s.scan() }

// Count 返回加载的 geocoder 数.
func (s *GeocoderScanner) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.geocoders)
}

// Names 返回所有 geocoder 名称.
func (s *GeocoderScanner) Names() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	names := make([]string, len(s.geocoders))
	for i, g := range s.geocoders {
		caps := "fwd+rev"
		if !g.HasForward() {
			caps = "rev"
		} else if !g.HasReverse() {
			caps = "fwd"
		}
		names[i] = fmt.Sprintf("%s (%s)", g.Name(), caps)
	}
	return names
}

func (s *GeocoderScanner) scan() int {
	files, err := filepath.Glob(filepath.Join(s.dir, "*.lua"))
	if err != nil {
		log.Printf("[GEOCODER] 扫描目录失败 %s: %v", s.dir, err)
		return 0
	}

	var loaded []*LuaGeocoder
	for _, f := range files {
		name := filepath.Base(f)
		if strings.HasPrefix(name, "_") || strings.HasPrefix(name, ".") {
			continue
		}

		data, err := os.ReadFile(f)
		if err != nil {
			log.Printf("[GEOCODER] 读取 %s 失败: %v", name, err)
			continue
		}

		g, err := NewGeocoder(string(data))
		if err != nil {
			log.Printf("[GEOCODER] 加载 %s 失败: %v", name, err)
			continue
		}

		caps := "fwd+rev"
		if !g.HasForward() {
			caps = "rev"
		} else if !g.HasReverse() {
			caps = "fwd"
		}
		log.Printf("[GEOCODER] ✓ 加载 %s → %s (%s)", name, g.Name(), caps)
		loaded = append(loaded, g)
	}

	s.mu.Lock()
	s.geocoders = loaded
	s.mu.Unlock()

	log.Printf("[GEOCODER] 共加载 %d 个脚本 geocoder (目录: %s)", len(loaded), s.dir)
	return len(loaded)
}
