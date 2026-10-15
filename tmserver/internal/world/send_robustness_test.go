package world

import (
	"testing"

	"github.com/jeanluca/w2pp-openwyd/tmserver/internal/protocol"
)

// TestSendNilSession: a handler may keep using a session the loop has already
// shed (queue full / disconnect). Send/SendTo must ignore it instead of
// panicking the single world goroutine, which would disconnect every player.
func TestSendNilSession(t *testing.T) {
	t.Helper()
	w := New(Config{}, nil, nil, nil)
	w.Send(nil, protocol.MsgAction, nil)
	w.SendTo(nil, protocol.Header{Type: protocol.MsgAction}, nil)
}

// TestDefaultOutBufferAbsorbsBurst: one loop tick can queue hundreds of frames
// for a single session (login/teleport into a crowded area sends one CreateMob
// per visible entity) before the writer goroutine runs. A healthy client must
// survive that burst; only a truly stuck one (queue genuinely full) is shed.
func TestDefaultOutBufferAbsorbsBurst(t *testing.T) {
	w := New(Config{}, nil, nil, nil)
	if w.cfg.OutBuffer != defaultOutBuffer {
		t.Fatalf("default OutBuffer = %d, want %d", w.cfg.OutBuffer, defaultOutBuffer)
	}
	s := &Session{Conn: 1, out: make(chan outFrame, w.cfg.OutBuffer), closeCh: make(chan struct{})}
	w.sessions[1] = s
	const burst = 300 // far above the old 64 cap, nobody is draining s.out
	for i := 0; i < burst; i++ {
		w.Send(s, protocol.MsgCreateMob, nil)
	}
	if w.sessions[1] != s {
		t.Fatalf("session was dropped after a %d-frame burst", burst)
	}
	if got := len(s.out); got != burst {
		t.Fatalf("queued %d frames, want %d", got, burst)
	}
}

// TestStuckClientStillShed: raising the buffer must not remove the safety net —
// a client that never drains eventually fills the queue and is dropped so it
// cannot stall the world.
func TestStuckClientStillShed(t *testing.T) {
	w := New(Config{OutBuffer: 4}, nil, nil, nil)
	s := &Session{Conn: 1, out: make(chan outFrame, 4), closeCh: make(chan struct{})}
	w.sessions[1] = s
	for i := 0; i < 10; i++ {
		w.Send(s, protocol.MsgAction, nil)
	}
	if w.sessions[1] != nil {
		t.Fatal("stuck client was not shed once its queue filled")
	}
}
