package auth

import (
	"github.com/martini-contrib/sessionauth"
	"fmt"
	"net/smtp"
	"mdrobek/watney/mail"
	"errors"
)

// MyUserModel can be any struct that represents a user in my system
type WatneyUser struct {
	Id            int64			`form:"id" db:"id"`
	Username      string		`form:"name" db:"username"`
	// Is always empty, after the authentication step has been finished
	Password      string		`form:"password" db:"password"`
	SMTPAuth      smtp.Auth		`form:"-" db:"-"`
	// Mail server connection
	ImapCon       *mail.MailCon	`form:"-" db:"-"`
	authenticated bool   		`form:"-" db:"-"`
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
		u.Username = wUser.Username
		u.ImapCon = wUser.ImapCon
		u.authenticated = wUser.authenticated
		u.SMTPAuth = wUser.SMTPAuth
		u.Id = wUser.Id
		return nil
	}
}

func (u *WatneyUser) String() string {
	return fmt.Sprintf("{%s, %s, %s, %b, %s}", u.Id, u.Username, u.Password, u.authenticated, u.ImapCon)
}
