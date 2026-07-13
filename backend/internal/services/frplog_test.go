package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadFRPLogFiltersAndClassifiesKeyLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "frps.log")
	content := "2026-07-14 10:00:00.000 [I] server started\n" +
		"2026-07-14 10:00:01.000 [I] [proxy.go:100] new proxy [web]\n" +
		"2026-07-14 10:00:02.000 [W] [control.go:20] client login warning\n" +
		"2026-07-14 10:00:03.000 [E] [service.go:30] work connection failed\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, err := ReadFRPLog(path, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 key entries, got %d", len(entries))
	}
	if entries[0].Category != "代理" || entries[1].Level != "warn" || entries[2].Level != "error" {
		t.Fatalf("unexpected classification: %#v", entries)
	}
}

func TestReadFRPLogKeepsLatestLimit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "frps.log")
	content := "[I] new proxy first\n[I] new proxy second\n[I] new proxy third\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	entries, err := ReadFRPLog(path, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].Message != "[I] new proxy second" || entries[1].Message != "[I] new proxy third" {
		t.Fatalf("unexpected latest entries: %#v", entries)
	}
}
