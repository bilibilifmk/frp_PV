package luaprovider

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	lua "github.com/yuin/gopher-lua"
)

var httpClient = &http.Client{Timeout: 5 * time.Second}

// libDir 共享 Lua 库目录 (scripts/lib/), 由 SetLibDir 设置.
var libDir string

// libCache 缓存 lib/*.lua 源码, key=去掉 .lua 后缀的文件名, value=源码.
// 每个 Lua VM 创建时执行全部 lib, 返回值注册为同名全局变量.
var libCache map[string]string

// SetLibDir 设置 Lua 共享库目录, 须在首次 newState 前调用.
// 扫描目录下所有 .lua 文件并缓存到内存.
func SetLibDir(dir string) {
	libDir = dir
	files, err := filepath.Glob(filepath.Join(dir, "*.lua"))
	if err != nil || len(files) == 0 {
		log.Printf("[LUA] lib 目录为空或不存在: %s", dir)
		return
	}
	cache := make(map[string]string, len(files))
	for _, f := range files {
		base := filepath.Base(f)
		if strings.HasPrefix(base, "_") || strings.HasPrefix(base, ".") {
			continue
		}
		data, err := os.ReadFile(f)
		if err != nil {
			log.Printf("[LUA] ⚠️ 读取 %s 失败: %v", base, err)
			continue
		}
		// 模块名 = 文件名去 .lua 后缀
		modName := strings.TrimSuffix(base, ".lua")
		cache[modName] = string(data)
		log.Printf("[LUA] ✓ lib/%s 已缓存 (%d bytes)", base, len(data))
	}
	libCache = cache
}

// newState 创建预加载了 stdlib 的 Lua VM.
func newState() *lua.LState {
	L := lua.NewState(lua.Options{SkipOpenLibs: false})
	registerHTTP(L)
	registerJSON(L)
	registerRegex(L)
	loadLibModules(L)
	return L
}

// ═══════════════════════════════════════════════════════════
//  http 模块
//
//   resp = http.get(url)
//   resp = http.get(url, {["User-Agent"]="curl/7.0"})
//   resp = http.post(url, body, {["Content-Type"]="application/json"})
//
//   resp.status  -- number (HTTP 状态码)
//   resp.body    -- string
// ═══════════════════════════════════════════════════════════

func registerHTTP(L *lua.LState) {
	mod := L.NewTable()
	L.SetField(mod, "get", L.NewFunction(luaHTTPGet))
	L.SetField(mod, "post", L.NewFunction(luaHTTPPost))
	L.SetField(mod, "url_encode", L.NewFunction(luaURLEncode))
	L.SetGlobal("http", mod)
}

// luaURLEncode: http.url_encode(s) → 对字符串做 URL percent-encoding.
func luaURLEncode(L *lua.LState) int {
	s := L.CheckString(1)
	L.Push(lua.LString(url.QueryEscape(s)))
	return 1
}

func luaHTTPGet(L *lua.LState) int {
	url := L.CheckString(1)
	headers := optTable(L, 2)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(err.Error()))
		return 2
	}
	req.Header.Set("User-Agent", "frp-pv-lua/1.0")
	applyHeaders(req, headers)

	return doRequest(L, req)
}

func luaHTTPPost(L *lua.LState) int {
	url := L.CheckString(1)
	body := L.OptString(2, "")
	headers := optTable(L, 3)

	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(err.Error()))
		return 2
	}
	req.Header.Set("User-Agent", "frp-pv-lua/1.0")
	req.Header.Set("Content-Type", "application/json")
	applyHeaders(req, headers)

	return doRequest(L, req)
}

func doRequest(L *lua.LState, req *http.Request) int {
	resp, err := httpClient.Do(req)
	if err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(err.Error()))
		return 2
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	tbl := L.NewTable()
	L.SetField(tbl, "status", lua.LNumber(resp.StatusCode))
	L.SetField(tbl, "body", lua.LString(string(data)))
	L.Push(tbl)
	L.Push(lua.LNil)
	return 2
}

func applyHeaders(req *http.Request, tbl *lua.LTable) {
	if tbl == nil {
		return
	}
	tbl.ForEach(func(k, v lua.LValue) {
		if ks, ok := k.(lua.LString); ok {
			req.Header.Set(string(ks), lua.LVAsString(v))
		}
	})
}

func optTable(L *lua.LState, n int) *lua.LTable {
	v := L.Get(n)
	if tbl, ok := v.(*lua.LTable); ok {
		return tbl
	}
	return nil
}

// ═══════════════════════════════════════════════════════════
//  json 模块
//
//   data = json.decode(str) → Lua table
//   str  = json.encode(table) → JSON string
// ═══════════════════════════════════════════════════════════

func registerJSON(L *lua.LState) {
	mod := L.NewTable()
	L.SetField(mod, "decode", L.NewFunction(luaJSONDecode))
	L.SetField(mod, "encode", L.NewFunction(luaJSONEncode))
	L.SetGlobal("json", mod)
}

func luaJSONDecode(L *lua.LState) int {
	str := L.CheckString(1)
	var v any
	if err := json.Unmarshal([]byte(str), &v); err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(err.Error()))
		return 2
	}
	L.Push(goToLua(L, v))
	L.Push(lua.LNil)
	return 2
}

func luaJSONEncode(L *lua.LState) int {
	v := L.Get(1)
	goVal := luaToGo(v)
	data, err := json.Marshal(goVal)
	if err != nil {
		L.Push(lua.LNil)
		L.Push(lua.LString(err.Error()))
		return 2
	}
	L.Push(lua.LString(string(data)))
	L.Push(lua.LNil)
	return 2
}

// goToLua 递归转换 Go 值 → Lua 值.
func goToLua(L *lua.LState, v any) lua.LValue {
	switch val := v.(type) {
	case nil:
		return lua.LNil
	case bool:
		return lua.LBool(val)
	case float64:
		return lua.LNumber(val)
	case string:
		return lua.LString(val)
	case []any:
		tbl := L.NewTable()
		for _, item := range val {
			tbl.Append(goToLua(L, item))
		}
		return tbl
	case map[string]any:
		tbl := L.NewTable()
		for k, item := range val {
			L.SetField(tbl, k, goToLua(L, item))
		}
		return tbl
	default:
		return lua.LString(fmt.Sprintf("%v", val))
	}
}

// luaToGo 递归转换 Lua 值 → Go 值.
func luaToGo(v lua.LValue) any {
	switch val := v.(type) {
	case *lua.LNilType:
		return nil
	case lua.LBool:
		return bool(val)
	case lua.LNumber:
		return float64(val)
	case lua.LString:
		return string(val)
	case *lua.LTable:
		// 判断是 array 还是 map
		maxN := val.MaxN()
		if maxN > 0 {
			arr := make([]any, 0, maxN)
			for i := 1; i <= maxN; i++ {
				arr = append(arr, luaToGo(val.RawGetInt(i)))
			}
			return arr
		}
		m := make(map[string]any)
		val.ForEach(func(k, v lua.LValue) {
			if ks, ok := k.(lua.LString); ok {
				m[string(ks)] = luaToGo(v)
			}
		})
		return m
	default:
		return fmt.Sprintf("%v", val)
	}
}

// ═══════════════════════════════════════════════════════════
//  re 模块 (正则)
//
//   matches = re.match(pattern, str)  → table of captures or nil
//   result  = re.find(pattern, str)   → matched string or nil
//   result  = re.replace(pattern, str, repl)
// ═══════════════════════════════════════════════════════════

func registerRegex(L *lua.LState) {
	mod := L.NewTable()
	L.SetField(mod, "match", L.NewFunction(luaReMatch))
	L.SetField(mod, "find", L.NewFunction(luaReFind))
	L.SetField(mod, "replace", L.NewFunction(luaReReplace))
	L.SetGlobal("re", mod)
}

func luaReMatch(L *lua.LState) int {
	pattern := L.CheckString(1)
	str := L.CheckString(2)
	re, err := regexp.Compile(pattern)
	if err != nil {
		L.Push(lua.LNil)
		return 1
	}
	m := re.FindStringSubmatch(str)
	if m == nil {
		L.Push(lua.LNil)
		return 1
	}
	tbl := L.NewTable()
	for _, s := range m {
		tbl.Append(lua.LString(s))
	}
	L.Push(tbl)
	return 1
}

func luaReFind(L *lua.LState) int {
	pattern := L.CheckString(1)
	str := L.CheckString(2)
	re, err := regexp.Compile(pattern)
	if err != nil {
		L.Push(lua.LNil)
		return 1
	}
	found := re.FindString(str)
	if found == "" {
		L.Push(lua.LNil)
		return 1
	}
	L.Push(lua.LString(found))
	return 1
}

func luaReReplace(L *lua.LState) int {
	pattern := L.CheckString(1)
	str := L.CheckString(2)
	repl := L.CheckString(3)
	re, err := regexp.Compile(pattern)
	if err != nil {
		L.Push(lua.LString(str))
		return 1
	}
	L.Push(lua.LString(re.ReplaceAllString(str, repl)))
	return 1
}

// ═══════════════════════════════════════════════════════════
//  lib 模块 (纯 Lua, 从 scripts/lib/*.lua 自动加载)
//
//  每个 .lua 文件 return 的 table 注册为同名全局变量:
//   scripts/lib/translate.lua → 全局 translate
//   scripts/lib/utils.lua     → 全局 utils
// ═══════════════════════════════════════════════════════════

func loadLibModules(L *lua.LState) {
	for modName, src := range libCache {
		if err := L.DoString(src); err != nil {
			log.Printf("[LUA] ⚠️ 执行 lib/%s.lua 失败: %v", modName, err)
			continue
		}
		ret := L.Get(-1)
		L.Pop(1)
		if ret.Type() == lua.LTTable {
			L.SetGlobal(modName, ret)
		}
	}
}
