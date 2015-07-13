package auth

import (
	"github.com/martini-contrib/sessionauth"
	"fmt"
)

// MyUserModel can be any struct that represents a user in my system
type MyUserModel struct {
	Id            int64  `form:"id" db:"id"`
	Username      string `form:"name" db:"username"`
	Password      string `form:"password" db:"password"`
	authenticated bool   `form:"-" db:"-"`
}

// GetAnonymousUser should generate an anonymous user model
// for all sessions. This should be an unauthenticated 0 value struct.
func GenerateAnonymousUser() sessionauth.User {
	return &MyUserModel{}
}

// Login will preform any actions that are required to make a user model
// officially authenticated.
func (u *MyUserModel) Login() {
	// Update last login time
	// Add to logged-in user's list
	// etc ...
	u.authenticated = true
}

// Logout will preform any actions that are required to completely
// logout a user.
func (u *MyUserModel) Logout() {
	// Remove from logged-in user's list
	// etc ...
	u.authenticated = false
}

func (u *MyUserModel) IsAuthenticated() bool {
	return u.authenticated
}

func (u *MyUserModel) UniqueId() interface{} {
	return u.Id
}

// GetById will populate a user object from a database model with
// a matching id.
func (u *MyUserModel) GetById(id interface{}) error {
	// Todo!
	return nil
}

func (u *MyUserModel) String() string {
	return fmt.Sprintf("{%s, %s, %s, %b}", u.Id, u.Username, u.Password, u.authenticated)
}
