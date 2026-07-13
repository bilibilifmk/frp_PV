package services

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
)

const maxFRPLogTailBytes int64 = 256 * 1024

var ansiEscape = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

// FRPLogEntry 是从 frps/frpc 文本日志中提取的关键事件。
type FRPLogEntry struct {
	Time     string `json:"time"`
	Level    string `json:"level"`
	Category string `json:"category"`
	Message  string `json:"message"`
}

// ReadFRPLog 从文件尾部读取有限数据并保留关键行。
func ReadFRPLog(path string, limit int) ([]FRPLogEntry, error) {
	if limit < 1 {
		limit = 80
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("无法读取 FRP 日志: %w", err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, fmt.Errorf("无法获取 FRP 日志状态: %w", err)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("FRP 日志路径不是普通文件")
	}
	start := info.Size() - maxFRPLogTailBytes
	if start < 0 {
		start = 0
	}
	if _, err := f.Seek(start, 0); err != nil {
		return nil, fmt.Errorf("无法定位 FRP 日志: %w", err)
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	if start > 0 {
		// 起始位置通常位于一行中间，丢弃这段残缺内容。
		scanner.Scan()
	}
	entries := make([]FRPLogEntry, 0, limit)
	for scanner.Scan() {
		if entry, ok := parseFRPLogLine(scanner.Text()); ok {
			entries = append(entries, entry)
			if len(entries) > limit {
				copy(entries, entries[len(entries)-limit:])
				entries = entries[:limit]
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("读取 FRP 日志失败: %w", err)
	}
	return entries, nil
}

func parseFRPLogLine(raw string) (FRPLogEntry, bool) {
	line := strings.TrimSpace(ansiEscape.ReplaceAllString(raw, ""))
	if line == "" {
		return FRPLogEntry{}, false
	}
	lower := strings.ToLower(line)
	level := "info"
	category := ""

	switch {
	case strings.Contains(lower, "[e]") || strings.Contains(lower, "error") || strings.Contains(lower, "failed") || strings.Contains(lower, "fail to"):
		level, category = "error", "错误"
	case strings.Contains(lower, "[w]") || strings.Contains(lower, "warning") || strings.Contains(lower, "warn"):
		level, category = "warn", "警告"
	case strings.Contains(lower, "disconnect") || strings.Contains(lower, "closed") || strings.Contains(lower, "close connection") || strings.Contains(lower, "exit"):
		category = "断开"
	case strings.Contains(lower, "login") || strings.Contains(lower, "new connection") || strings.Contains(lower, "join connection") || strings.Contains(lower, "work connection"):
		category = "连接"
	case strings.Contains(lower, "proxy") || strings.Contains(lower, "visitor"):
		category = "代理"
	default:
		return FRPLogEntry{}, false
	}

	timestamp := ""
	if len(line) >= 19 && line[4] == '-' && line[7] == '-' {
		timestamp = line[:19]
	}
	if len(line) > 1200 {
		line = line[:1200] + "…"
	}
	return FRPLogEntry{Time: timestamp, Level: level, Category: category, Message: line}, true
}
