package auth

import (
	"github.com/martini-contrib/sessionauth"
	"fmt"
	"net/smtp"
	"mdrobek/watney/mail"
	"errors"
	"time"
)

// MyUserModel can be any struct that represents a user in my system
type WatneyUser struct {
	Id            int64			`form:"id" db:"id"`
	// Currently has to be the email address used for the SMTP server
	Username      string		`form:"name" db:"username"`
	// Is always empty, after the authentication step has been finished
	Password      string		`form:"password" db:"password"`
	// Authentication object for the SMTP service
	SMTPAuth      smtp.Auth		`form:"-" db:"-"`
	// Mail server connection
	ImapCon       *mail.MailCon	`form:"-" db:"-"`
	// Whether the user is already authenticated or not
	authenticated bool   		`form:"-" db:"-"`
	// The last time this user called a backend method
	lastSeen time.Time   		`form:"-" db:"-"`
}

// int64 -> *WatneyUser
var usermap ConcurrentMap = New()

// GetAnonymousUser should generate an anonymous user model
// for all sessions. This should be an unauthenticated 0 value struct.
func GenerateAnonymousUser() sessionauth.User {
	return &WatneyUser{}
}

// Login will perform any actions that are required to make a user model
// officially authenticated.
func (u *WatneyUser) Login() {
	usermap.Set(u.Id, u)
	u.authenticated = true
}

// Logout will preform any actions that are required to completely
// logout a user.
func (u *WatneyUser) Logout() {
	if u.ImapCon.IsAuthenticated() {
		u.ImapCon.Close()
	}
	usermap.Remove(u.Id)
	u.authenticated = false
}

func (u *WatneyUser) IsAuthenticated() bool {
	return u.authenticated
}

func (u *WatneyUser) UniqueId() interface{} {
	return u.Id
}

// GetById will populate a user object from a database model with
// a matching id.
func (u *WatneyUser) GetById(id interface{}) error {
	if wUser, ok := usermap.Get(id.(int64)); !ok {
		return errors.New(fmt.Sprintf("User for id '%s' not logged in", id));
	} else {
		// 1) Reset the last access time of the current user to avoid automatic logout
		wUser.lastSeen = time.Now()
		// 2) Populate the copy of the user object
		u.Username = wUser.Username
		u.ImapCon = wUser.ImapCon
		u.authenticated = wUser.authenticated
		u.SMTPAuth = wUser.SMTPAuth
		u.Id = wUser.Id
		u.lastSeen = wUser.lastSeen
		return nil
	}
}

func (u *WatneyUser) String() string {
	return fmt.Sprintf("{%s, %s, %s, %b, %s, %s}", u.Id, u.Username, u.Password,
		u.authenticated, u.ImapCon, u.lastSeen.String())
}


/**
 * Runs through the map of all currently logged in users and checks, which of those are outdated
 * compared to a timeout counter. (This might occur, whenever users are not properly logging out)
 * @param timeout Timeout since 'lastSeen' in seconds, to flag a user as outdated and remove him
 *				  from the usermap.
 * @return the number of removed users
 */
func CleanUsermap(timeout float64) int {
	// 1) Collect all outdated user keys
	var outdated []int64 = make([]int64, 0)
	for entry := range usermap.IterBuffered() {
		if time.Since(entry.Val.lastSeen).Seconds() > timeout {
			// 1a) Call the user logout method to deal with all open connections
			entry.Val.Logout()
			// 1b) Add the user to the remove array
			outdated = append(outdated, entry.Key)
		}
	}
	// 2) Remove outdated users from usermap
	for _, toRemove := range outdated {
		usermap.Remove(toRemove)
	}
	return len(outdated)
}