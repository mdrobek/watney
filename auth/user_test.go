package auth

import (
	"testing"
	"time"
)

func TestRemoveOfOutdatedUsers(t *testing.T) {
	// Add 3 users to the map, 2 are supposedly outdated
	var timeout float64 = 10
	usermap.Set(0, &WatneyUser{ lastSeen: time.Now().Add(-11*time.Second) } )
	usermap.Set(1, &WatneyUser{ lastSeen: time.Now().Add(-9*time.Second) } )
	usermap.Set(2, &WatneyUser{ lastSeen: time.Now().Add(-12*time.Second) } )
	if CleanUsermap(timeout) != 2 && usermap.Count() != 1 {
		t.Error("Expected 2 items to be removed from the usermap => 1 item should have remained")
	}
}

