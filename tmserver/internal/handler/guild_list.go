package handler

import "github.com/jeanluca/w2pp-openwyd/tmserver/internal/world"

// guildListMaxLine is the legacy SendGuildList line threshold (SendFunc.cpp:1377,
// max_size = 70): a line is flushed once it has reached this length, BEFORE the
// next name is appended, so a flushed line can end slightly past 70.
const guildListMaxLine = 70

// formatGuildList packs member names into client message lines exactly like the
// legacy SendGuildList (SendFunc.cpp:1367-1408): every name is followed by one
// space (including the last), and the pending line is flushed when it has
// already reached guildListMaxLine bytes. Names are never split across lines.
func formatGuildList(names []string) []string {
	var lines []string
	cur := ""
	for _, name := range names {
		if len(cur) >= guildListMaxLine {
			lines = append(lines, cur)
			cur = ""
		}
		cur += name + " "
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	return lines
}

// sendGuildList implements /guild (_MSG_MessageWhisper.cpp:793 → SendGuildList):
// it lists the in-play members of the caller's guild, in player-index order and
// including the caller. It is silent for a player without a guild (legacy returns
// when MOB.Guild <= 0). docs/game.md used to describe this as "shows the guild
// index"; the legacy source lists the online member names instead.
func (d *Dispatcher) sendGuildList(w *world.World, s *world.Session) {
	e := w.Entity(s.Conn)
	if e == nil || e.Guild == 0 {
		return
	}
	var names []string
	// exclude = -1 matches no conn, so the caller is included like in the legacy scan.
	w.ForEachPlaying(-1, func(_ *world.Session, te *world.Entity) {
		if te.Guild == e.Guild {
			names = append(names, te.Name)
		}
	})
	for _, line := range formatGuildList(names) {
		d.sendClientMessage(w, s, line)
	}
}
