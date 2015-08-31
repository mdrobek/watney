package web

import (
	"html/template"
	"log"
	"net/http"
	"mdrobek/watney/mail"
	"sort"
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
	"net/smtp"
	"github.com/gorilla/securecookie"
	"encoding/json"
	"time"
)

type MailWeb struct {
	// The martini package object
	martini   *martini.ClassicMartini
	// All initially parsed html templates
	templates map[string]*template.Template
	// Mail server configuration
	mconf     *conf.MailConf
	// The quit channel for the usermap cleanup go routine
	UserQuitChan chan struct{}
	// Client session cookie and inactive user timeout duration: 30min * 60 sec
	userTimeout float64
	// Whether the app server is run in debugging mode for dev
	debug     bool
}

const TEMPLATE_GROUP_NAME string = "template_group"

func NewWeb(mailConf *conf.MailConf, debug bool) *MailWeb {
	var web *MailWeb = new(MailWeb)
	web.mconf = mailConf
	web.debug = debug
	web.userTimeout = 1800 // 30 minutes

	store := sessions.NewCookieStore(securecookie.GenerateRandomKey(128))
	// 1) Set a maximum age for the client-side cookies
	store.Options(sessions.Options{MaxAge: int(web.userTimeout), })

	web.martini = martini.Classic()
	web.martini.Use(render.Renderer(render.Options{
		Directory: "static/templates",
		Extensions: []string{".html"},
	}))
	web.martini.Use(sessions.Sessions("watneySession", store))
	web.martini.Use(sessionauth.SessionUser(auth.GenerateAnonymousUser))
	sessionauth.RedirectUrl = "/"
	sessionauth.RedirectParam = "new-next"

	// 2) Register a cleanup go routine that checks every x minutes, for outdated users
	web.registerUserCleanup(30)

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
	fmt.Printf("[watney] Invoking Shutdown procedure\n")
	// 1) Shutdown the usermap cleanup go routine
	close(web.UserQuitChan)
	return nil
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
 * @param every Seconds until the user cleanup method is rescheduled
 */
func (web *MailWeb) registerUserCleanup(every int64) {
	ticker := time.NewTicker(time.Duration(every) * time.Second)
	web.UserQuitChan = make(chan struct{})
	go func() {
		for {
			select {
			case <- ticker.C:
				// Check for users, which are older than the given timeout and remove those
				nbrUsersCleaned := auth.CleanUsermap(web.userTimeout)
				if nbrUsersCleaned > 0 {
					fmt.Printf("[watney] Removed user objects from map: %d\n", nbrUsersCleaned)
				}
			case <- web.UserQuitChan:
				ticker.Stop()
				return
			}
		}
	}()
}
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
	web.martini.Post("/", binding.Bind(auth.WatneyUser{}), web.authenticate)

	// Private Handlers
	web.martini.Get("/logout", sessionauth.LoginRequired, web.logout)
	web.martini.Get("/main", sessionauth.LoginRequired, web.main)
	web.martini.Post("/userInfo", sessionauth.LoginRequired, web.userInfo)
	web.martini.Post("/poll", sessionauth.LoginRequired, web.poll)
	web.martini.Post("/mails", sessionauth.LoginRequired, web.mails)
	web.martini.Post("/mailContent", sessionauth.LoginRequired, web.mailContent)
	web.martini.Post("/updateFlags", sessionauth.LoginRequired, web.updateFlags)
	web.martini.Post("/sendMail", sessionauth.LoginRequired, web.sendMail)

	// Static content
	web.martini.Use(martini.Static("static/resources/libs/",
		martini.StaticOptions{Prefix:"/libs/"}))
	web.martini.Use(martini.Static("static/resources/js/",
		martini.StaticOptions{Prefix:"/js/"}))
	web.martini.Use(martini.Static("static/resources/css/",
		martini.StaticOptions{Prefix:"/css/"}))
}

func (web *MailWeb) authenticate(session sessions.Session, postedUser auth.WatneyUser,
		r render.Render, req *http.Request) {
	user := auth.WatneyUser{}

	// 1) Create a new IMAP mail server connection
	if imapCon, err := mail.NewMailCon(web.mconf); nil != err {
		fmt.Printf("Couldn't establish connection to imap mail server: %s\n", err.Error())
		r.HTML(200, "start", map[string]interface{}{
			"FailedLogin" : true,
			"OrigError" : err.Error(),
		})
	} else {
		if _, err := imapCon.Authenticate(postedUser.Username, postedUser.Password); err == nil {
			user.Username = postedUser.Username
			h := fnv.New32a()
			h.Write([]byte(postedUser.Username))
			user.Id = int64(h.Sum32())
			user.SMTPAuth = smtp.PlainAuth("", postedUser.Username, postedUser.Password,
				web.mconf.SMTPAddress)
			user.ImapCon = imapCon
			if err := sessionauth.AuthenticateSession(session, &user); err != nil {
				r.JSON(500, err)
			}
			r.Redirect("/main")
		} else {
			fmt.Println("FAILED!")
			imapCon.Close()
			r.HTML(200, "start", map[string]interface{}{
				"FailedLogin" : true,
				"OrigError" : err.Error(),
			})
		}
	}
}

func (web *MailWeb) welcome(session sessions.Session, r render.Render) {
	session.Clear()
	r.HTML(200, "start", nil)
}

func (web *MailWeb) logout(session sessions.Session, user sessionauth.User, r render.Render) {
	sessionauth.Logout(session, user)
	user.Logout()
	r.HTML(200, "start", nil)
}

func (web *MailWeb) main(r render.Render) {
	r.HTML(200, "base", map[string]interface{}{
		"IsDebug" : web.debug,
	})
}
/**
 * Handler to check, whether new mails have arrived in the meantime.
 */
func (web *MailWeb) poll(r render.Render, user sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = user.(*auth.WatneyUser)
	// 1) Check for authentication status, and only proceed, if successful
	if nil != watneyUser && watneyUser.IsAuthenticated() {
		// 2) Check, whether new mails have arrived since the last poll
		if mailUIDs, err := watneyUser.ImapCon.CheckNewMails(); err != nil {
			// 2a) Check for new mails failed for some reason
			r.JSON(500, map[string]interface{} {
				"error": "Error while checking for new mails",
				"origError": err.Error(),
			})
		} else if len(mailUIDs) > 0 {
			// 2b) If new mails have arrived, load them from the mail server
			mails, err := watneyUser.ImapCon.LoadNMailsFromFolderWithUIDs("/", mailUIDs)
			if err == nil {
				// Reverse the retrieved mail array
				sort.Sort(mail.MailSlice(mails))
				r.JSON(200, mails)
			} else {
				// TODO: If the mail loading failed, the information about the recent mails
				//		 will be lost at that point => counteract
				r.JSON(500, map[string]interface{} {
					"error": "New mails are available, but they couldn't be retrieved",
					"origError": err.Error(),
				})
			}
		} else {
			// 2c) No new mails have arrived
			r.JSON(200, make([]mail.Mail, 0))
		}
	} else {
		fmt.Printf("[watney] User tried to poll for new mails - but IMAP Session has timed out.")
		// 419 - Authentication has timed out
		r.JSON(419, map[string]interface{} {
			"error": "Authentication has expired",
		} )
	}
}

/**
 * Handler to load all mails for a given folder.
 */
func (web *MailWeb) mails(r render.Render, user sessionauth.User, req *http.Request) {
	var (
		mails []mail.Mail = []mail.Mail{}
		watneyUser *auth.WatneyUser = user.(*auth.WatneyUser)
	)
	if nil != watneyUser && watneyUser.IsAuthenticated() {
		switch req.FormValue("mailInformation") {
			case mail.FULL: mails, _ = watneyUser.ImapCon.LoadAllMailsFromFolder(req.FormValue("mailbox"))
			case mail.OVERVIEW: fallthrough
			default: mails, _ = watneyUser.ImapCon.LoadAllMailOverviewsFromFolder(req.FormValue("mailbox"))
		}
		// Reverse the retrieved mail array
		sort.Sort(mail.MailSlice(mails))
		r.JSON(200, mails)
	} else {
		fmt.Printf("[watney] User tried to retrieve mail overview - ",
			" but IMAP Session has timed out.")
		// 419 - Authentication has timed out
		r.JSON(419, map[string]interface{} {
			"error": "Authentication has expired",
		} )
	}
}

func (web *MailWeb) mailContent(r render.Render, user sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = user.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		uid, _ := strconv.ParseInt(req.FormValue("uid"), 10, 32)
		mailContent, _ := watneyUser.ImapCon.LoadContentForMailFromFolder(req.FormValue("folder"), uint32(uid))
		r.JSON(200, mailContent)
	} else {
		fmt.Printf("[watney] User tried to retrieve content of mail - ",
			" but IMAP Session has timed out.")
		// 419 - Authentication has timed out
		r.JSON(419, map[string]interface{} {
			"error": "Authentication has expired",
		} )
	}
}

func (web *MailWeb) sendMail(r render.Render, curUser sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		var subject, from, body string
		subject = req.FormValue("subject")
		from = req.FormValue("from")
		to := []string{req.FormValue("to")}
		body = req.FormValue("body")
		fmt.Printf("%s -> %s : %s\n%s", from, to, subject, body)
		err := watneyUser.ImapCon.SendMail(watneyUser.SMTPAuth, from, to, subject, body)
		if err != nil {
			fmt.Printf("[watney][ERROR] Error while sending mail: %s", err.Error())
			r.JSON(200, map[string]interface{} {
				"error": "Mail couldn't be sent",
				"sendMailError": err.Error(),
			})
		} else {
			r.JSON(200, nil)
		}
	} else {
		fmt.Printf("[watney] User tried to send mail - but IMAP Session has timed out.")
		// 419 - Authentication has timed out
		r.JSON(419, map[string]interface{}{
			"error": "Authentication has expired",
		})
	}
}

func (web *MailWeb) userInfo(r render.Render, curUser sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		r.JSON(200, map[string]interface{} {
			"email" : watneyUser.Username,
		})
	} else {
		fmt.Printf("[watney] Request for User information - but IMAP Session has timed out.")
		// 419 - Authentication has timed out
		r.JSON(419, map[string]interface{}{
			"error": "Authentication has expired",
		})
	}
}

func (web *MailWeb) updateFlags(r render.Render, curUser sessionauth.User, req *http.Request) {
	var (
		watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
		folder string
		uid string
		addFlags bool
		flags mail.Flags
		err error
	)
	if watneyUser.ImapCon.IsAuthenticated() {
		// 1) Get the folder
		folder = req.FormValue("folder")
		// 2) Check the UID
		if _, err := strconv.ParseInt(req.FormValue("uid"), 10, 32); err != nil {
			r.JSON(200, map[string]interface{} {
				"error" : fmt.Sprintf("Given UID '%s' is not a valid ID", req.FormValue("uid")),
				"origErr": err.Error(),
			})
			return
		} else {
			uid = req.FormValue("uid")
		}
		// 3) Check the add/remove form value
		if addFlags, err = strconv.ParseBool(req.FormValue("add")); err != nil {
			r.JSON(200, map[string]interface{} {
				"error" : fmt.Sprintf("Couldn't parse string '%s' into bool", req.FormValue("add")),
				"origErr": err.Error(),
			})
			return
		}
		// 4) Check the flags
		if err = json.Unmarshal([]byte(req.FormValue("flags")), &flags); err != nil {
			fmt.Println("error:", err)
			r.Error(500)
			return
		}
		if err = watneyUser.ImapCon.UpdateMailFlags(folder, uid, &flags, addFlags); err != nil {
			r.JSON(500, map[string]interface{} {
				"error" : fmt.Sprintf("Error while performing UpdateMailFlags"),
				"origErr": err.Error(),
			})
		} else {
			r.Status(200)
		}
	} else {
		fmt.Printf("[watney] Request for mail flag update - but IMAP Session has timed out.")
		// 419 - Authentication has timed out
		r.JSON(419, map[string]interface{}{
			"error": "Authentication has expired",
		})
	}

}
