/*

*/
package main

import (
	"mdrobek/watney/conf"
	"mdrobek/watney/web"
	"mdrobek/watney/auth"
	"strconv"
	"fmt"
	"net/http"
	"github.com/go-martini/martini"
	"github.com/martini-contrib/sessionauth"
	"github.com/martini-contrib/sessions"
	"github.com/martini-contrib/render"
	"github.com/martini-contrib/binding"
)

func main() {
	conf, err := conf.ReadConfig("src/mdrobek/watney/conf/unionwork.ini")
	if nil != err {
		panic(err)
	}

	web := web.NewWeb(&conf.Mail, conf.Web.Debug)
	defer web.Close()

	store := sessions.NewCookieStore([]byte("secret123"))

	m := martini.Classic()
	m.Use(render.Renderer())

	// Default our store to use Session cookies, so we don't leave logged in
	// users roaming around
	store.Options(sessions.Options{
		MaxAge: 0,
	})
	m.Use(sessions.Sessions("my_session", store))
	m.Use(sessionauth.SessionUser(auth.GenerateAnonymousUser))
	sessionauth.RedirectUrl = "/"
	sessionauth.RedirectParam = "new-next"


	// Public Handlers
	m.Get("/", web.Welcome)
	m.Post("/", binding.Bind(auth.MyUserModel{}),
		func(session sessions.Session, postedUser auth.MyUserModel, r render.Render, req *http.Request) {
		// You should verify credentials against a database or some other mechanism at this point.
		// Then you can authenticate this session.
		user := auth.MyUserModel{}
		fmt.Println("Checking for given user", postedUser, user, conf)
		if conf.Mail.Username == postedUser.Username && conf.Mail.Passwd == postedUser.Password {
			fmt.Println("AUTHENTICATED!")
			err := sessionauth.AuthenticateSession(session, &user)
			if err != nil {
				r.JSON(500, err)
			}

//			params := req.URL.Query()
//			redirect := params.Get(sessionauth.RedirectParam)
			r.Redirect("/main")
			return
		} else {
			fmt.Println("FAILED!")
			r.Redirect(sessionauth.RedirectUrl)
			return
		}
	})

	// Private Handlers
	m.Get("/main", sessionauth.LoginRequired, web.Main)
	m.Post("/mails", sessionauth.LoginRequired, web.Mails)
	m.Post("/mailContent", sessionauth.LoginRequired, web.MailContent)

	// Middleware Handler chain
	// Static content
	m.Use(martini.Static("src/mdrobek/watney/static/resources/libs/",
		martini.StaticOptions{Prefix:"/libs/"}))
	m.Use(martini.Static("src/mdrobek/watney/static/resources/js/",
		martini.StaticOptions{Prefix:"/js/"}))
	m.Use(martini.Static("src/mdrobek/watney/static/resources/css/",
		martini.StaticOptions{Prefix:"/css/"}))

	m.RunOnAddr(fmt.Sprintf(":%s", strconv.Itoa(conf.Web.Port)))
}
