package handler

import (
	"reflect"
	"strings"
	"testing"

	"github.com/jeanluca/w2pp-openwyd/tmserver/internal/protocol"
	"github.com/jeanluca/w2pp-openwyd/tmserver/internal/world"
)

// TestFormatGuildList pins the legacy SendGuildList packing (SendFunc.cpp:1367):
// trailing space after every name, flush only once a line has reached 70 bytes.
func TestFormatGuildList(t *testing.T) {
	long := strings.Repeat("a", 12) // 13 bytes per name with the space
	tests := []struct {
		name  string
		names []string
		want  []string
	}{
		{"empty", nil, nil},
		{"single", []string{"Hero"}, []string{"Hero "}},
		{"two fit one line", []string{"Hero", "HeroB"}, []string{"Hero HeroB "}},
		// 5 names = 65 bytes (<70) so the 6th is still appended (78 bytes) and
		// only the 7th triggers the flush: lines may exceed 70, never split a name.
		{"flush after reaching 70", []string{long, long, long, long, long, long, long},
			[]string{strings.Repeat(long+" ", 6), long + " "}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatGuildList(tt.names); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("formatGuildList(%v) = %q, want %q", tt.names, got, tt.want)
			}
		})
	}
}

// TestGuildListCommand: /guild answers a guild member with a message panel that
// lists the online members, and stays silent for a player without a guild.
func TestGuildListCommand(t *testing.T) {
	db := newDB()
	db.loads = map[int64]world.CharacterState{
		7: {Slot: 0, Name: "Hero", X: 5, Y: 5, HP: 1000, MaxHP: 1000, Clan: 1, GuildID: 5},
	}
	addr, stop, _ := startServerClock(t, db)
	defer stop()
	a := enterWorldAs(t, addr, "tester")
	defer a.Close()
	drainRaw(t, a)

	whisperFrame(t, a, "guild", "")
	payload, _ := readUntil(t, a, protocol.MsgMessagePanel)
	// cstr trims trailing spaces, which would hide the legacy per-name separator.
	got := string(payload)
	if i := indexByte(payload, 0); i >= 0 {
		got = string(payload[:i])
	}
	if got != "Hero " {
		t.Fatalf("/guild panel = %q, want %q", got, "Hero ")
	}
}
