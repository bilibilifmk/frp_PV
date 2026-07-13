package services

import (
	"path/filepath"
	"testing"
	"time"

	"frp-pv/internal/config"
)

func newTestBanManager(t *testing.T) (*BanManager, *config.Manager) {
	t.Helper()
	cfg, err := config.New(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	err = cfg.Update(func(d *config.Data) {
		d.AutoBan.Enabled = true
		d.AutoBan.ThresholdSeconds = 60
		d.AutoBan.ThresholdCount = 2
		d.AutoBan.InitialBanMinutes = 60
		d.AutoBan.MaxBanMinutes = 120
		d.AutoBan.WhitelistIPs = []string{"127.0.0.1"}
		d.AutoBan.WhitelistModules = []string{"trusted"}
	})
	if err != nil {
		t.Fatal(err)
	}
	bm, err := NewBanManager(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { bm.Close(); cfg.Close() })
	return bm, cfg
}

func TestEscalatingBanPersistsStrikesAndCapsDuration(t *testing.T) {
	bm, cfg := newTestBanManager(t)
	first, err := bm.Ban("203.0.113.1")
	if err != nil {
		t.Fatal(err)
	}
	if first.StrikeCount != 1 {
		t.Fatalf("first strike = %d", first.StrikeCount)
	}
	assertDurationNear(t, time.Until(*first.BannedUntil), time.Hour)
	if err := bm.Unban(first.IP); err != nil {
		t.Fatal(err)
	}

	second, err := bm.Ban(first.IP)
	if err != nil {
		t.Fatal(err)
	}
	if second.StrikeCount != 2 {
		t.Fatalf("second strike = %d", second.StrikeCount)
	}
	assertDurationNear(t, time.Until(*second.BannedUntil), 2*time.Hour)
	if err := bm.Unban(first.IP); err != nil {
		t.Fatal(err)
	}

	third, err := bm.Ban(first.IP)
	if err != nil {
		t.Fatal(err)
	}
	assertDurationNear(t, time.Until(*third.BannedUntil), 2*time.Hour)
	records, err := cfg.LoadBans()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || records[0].StrikeCount != 3 {
		t.Fatalf("unexpected persisted record: %+v", records)
	}
}

func TestPermanentAndWhitelists(t *testing.T) {
	bm, cfg := newTestBanManager(t)
	if !bm.IsWhitelisted("127.0.0.1", "anything") || !bm.IsWhitelisted("203.0.113.2", "trusted") {
		t.Fatal("whitelist did not bypass rules")
	}
	if bm.CheckAutoBan("127.0.0.1", "proxy", "US", true) {
		t.Fatal("whitelisted IP was banned")
	}
	if _, err := bm.Ban("127.0.0.1"); err == nil {
		t.Fatal("manual ban constrained a whitelisted IP")
	}
	if err := cfg.Update(func(d *config.Data) { d.AutoBan.PermanentBan = true }); err != nil {
		t.Fatal(err)
	}
	r, err := bm.Ban("203.0.113.3")
	if err != nil {
		t.Fatal(err)
	}
	if !r.Permanent || r.BannedUntil != nil || !bm.IsBanned(r.IP) {
		t.Fatalf("not permanent: %+v", r)
	}
}

func TestEscalationUsesExponentialBackoffAndMaximum(t *testing.T) {
	wants := []int{60, 120, 240, 480, 960, 1440, 1440}
	for i, want := range wants {
		if got := escalatingMinutes(60, 1440, i+1); got != want {
			t.Fatalf("strike %d = %d minutes, want %d", i+1, got, want)
		}
	}
}

func assertDurationNear(t *testing.T, got, want time.Duration) {
	t.Helper()
	if got < want-time.Minute || got > want+time.Minute {
		t.Fatalf("duration %v, want %v", got, want)
	}
}
