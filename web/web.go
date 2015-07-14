package web

import (
	"html/template"
	"log"
	"net/http"
	"mdrobek/watney/mail"
	"sort"
	"errors"
	"mdrobek/watney/conf"
	"strconv"
	"github.com/go-martini/martini"
	"github.com/martini-contrib/sessions"
	"github.com/martini-contrib/render"
	"github.com/martini-contrib/sessionauth"
	"mdrobek/watney/auth"
	"github.com/martini-contrib/binding"
	"fmt"
	"hash/fnv"
)

type MailWeb struct {
	// The martini package object
	martini   *martini.ClassicMartini
	// All initially parsed html templates
	templates map[string]*template.Template
	// Mail server configuration
	mconf     *conf.MailConf
	// Mail server connection
	imapCon   *mail.MailCon
	// Whether the app server is run in debugging mode for dev
	debug     bool
}

const TEMPLATE_GROUP_NAME string = "template_group"

func NewWeb(mailConf *conf.MailConf, debug bool) *MailWeb {
	var web *MailWeb = new(MailWeb)
	web.mconf = mailConf
	web.debug = debug

	// 1) Create a new IMAP mail server connection
	var err error
	if web.imapCon, err = mail.NewMailCon(web.mconf); nil != err {
		panic("Couldn't establish connection to imap mail server: %s', err")
	}

	store := sessions.NewCookieStore([]byte("secret123"))
	// Default our store to use Session cookies, so we don't leave logged in
	// users roaming around
	store.Options(sessions.Options{MaxAge: 0, })

	web.martini = martini.Classic()
	web.martini.Use(render.Renderer(render.Options{
		Directory: "src/mdrobek/watney/static/templates",
		Extensions: []string{".html"},
	}))
	web.martini.Use(sessions.Sessions("watneySession", store))
	web.martini.Use(sessionauth.SessionUser(auth.GenerateAnonymousUser))
	sessionauth.RedirectUrl = "/"
	sessionauth.RedirectParam = "new-next"

	// x) Define and set all handlers
	web.initHandlers();
	return web
}

func (web *MailWeb) Start(port int) {
	web.martini.RunOnAddr(fmt.Sprintf(":%s", strconv.Itoa(port)))
}

/**
	Closes the IMAP mail server connection
 */
func (web *MailWeb) Close() error {
	if nil != web.imapCon {
		return web.imapCon.Close()
	}
	return errors.New("No imap connection was available to close")
}

/**************************************************************************************************
 ***									Web Handlers											***
 **************************************************************************************************/

//func (web *MailWeb) Headers(w http.ResponseWriter, r *http.Request) {
////	mc, err := mail.NewMailCon(web.mconf)
////	defer mc.Close()
//	var headers mail.HeaderSlice = mail.HeaderSlice{}
////	if nil == err {
//		headers, _ = web.imapCon.LoadMailHeaders()
//		//		mails, _ = mc.LoadNMails(4)
//		// Reverse the retrieved mail array
//		sort.Sort(headers)
////	}
//	jsonRet, err := json.Marshal(headers)
//	if (nil != err) {
//		log.Fatal(err)
//	}
//	w.Write(jsonRet)
//}

/**************************************************************************************************
 ***								Private methods												***
 **************************************************************************************************/
/**
 * @param templateName The name used in the {define} statement in the template .html file.
 * @param data The data map to be injected when parsing the template file.
 */
func (web *MailWeb) renderTemplate(w http.ResponseWriter, templateName string,
data map[string]interface{}) {
	curTmpl, ok := web.templates[TEMPLATE_GROUP_NAME]
	if !ok {
		log.Fatalf("Couldn't find template group for name '%s' in templates map '%s'",
			TEMPLATE_GROUP_NAME, web.templates)
	}
	curTmpl.ExecuteTemplate(w, templateName, data)
}

func (web *MailWeb) initHandlers() {
	// Public Handlers
	web.martini.Get("/", web.welcome)
	web.martini.Post("/", binding.Bind(auth.MyUserModel{}), web.authenticate)

	// Private Handlers
	web.martini.Get("/logout", sessionauth.LoginRequired, web.logout)
	web.martini.Get("/main", sessionauth.LoginRequired, web.main)
	web.martini.Post("/mails", sessionauth.LoginRequired, web.mails)
	web.martini.Post("/mailContent", sessionauth.LoginRequired, web.mailContent)

	// Static content
	web.martini.Use(martini.Static("src/mdrobek/watney/static/resources/libs/",
		martini.StaticOptions{Prefix:"/libs/"}))
	web.martini.Use(martini.Static("src/mdrobek/watney/static/resources/js/",
		martini.StaticOptions{Prefix:"/js/"}))
	web.martini.Use(martini.Static("src/mdrobek/watney/static/resources/css/",
		martini.StaticOptions{Prefix:"/css/"}))
}

func (web *MailWeb) authenticate(session sessions.Session, postedUser auth.MyUserModel,
		r render.Render, req *http.Request) {
	user := auth.MyUserModel{}
	fmt.Println("Checking for given user", postedUser, user, web.mconf)
	if _, err := web.imapCon.Authenticate(postedUser.Username, postedUser.Password); err == nil {
		fmt.Println("AUTHENTICATED!")
		user.Username = postedUser.Username
		h := fnv.New32a()
		h.Write([]byte(postedUser.Username))
		user.Id = int64(h.Sum32())
		user.Login()
		err := sessionauth.AuthenticateSession(session, &user)
		if err != nil {
			r.JSON(500, err)
		}
		r.Redirect("/main")
		return
	} else {
		fmt.Println("FAILED!")
		r.HTML(200, "start", map[string]interface{}{
			"FailedLogin" : true,
			"OrigError" : err.Error(),
		})
		return
	}
}

func (web *MailWeb) welcome(r render.Render) {
	r.HTML(200, "start", nil)
}

func (web *MailWeb) logout(session sessions.Session, user sessionauth.User, r render.Render) {
	fmt.Println("Successful logout of user: ", user)
	sessionauth.Logout(session, user)
	r.HTML(200, "start", nil)
}

func (web *MailWeb) main(r render.Render) {
	r.HTML(200, "base", map[string]interface{}{
		"IsDebug" : web.debug,
	})
}

func (web *MailWeb) mails(r render.Render, req *http.Request) {
	var mails []mail.Mail = []mail.Mail{}
	if web.imapCon.IsAuthenticated() {
		switch req.FormValue("mailInformation") {
			case mail.FULL: mails, _ = web.imapCon.LoadMailsFromFolder(req.FormValue("folder"))
			case mail.OVERVIEW: fallthrough
			default: mails, _ = web.imapCon.LoadMailOverview(req.FormValue("folder"))
		}
		// Reverse the retrieved mail array
		sort.Sort(mail.MailSlice(mails))
		r.JSON(200, mails)
	} else {
		// TODO: return an JSON error cause imap conn is lost
	}
}

func (web *MailWeb) mailContent(r render.Render, req *http.Request) {
	if web.imapCon.IsAuthenticated() {
		uid, _ := strconv.ParseInt(req.FormValue("uid"), 10, 32)
		mailContent, _ := web.imapCon.LoadContentForMail(req.FormValue("folder"), uint32(uid))
		r.JSON(200, mailContent)
	}
}
