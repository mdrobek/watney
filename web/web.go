package web

import (
	"encoding/json"
	"fmt"
	"github.com/go-martini/martini"
	"github.com/gorilla/securecookie"
	"github.com/martini-contrib/binding"
	"github.com/martini-contrib/render"
	"github.com/martini-contrib/sessionauth"
	"github.com/martini-contrib/sessions"
	"hash/fnv"
	"html/template"
	"log"
	"mdrobek/watney/auth"
	"mdrobek/watney/conf"
	"mdrobek/watney/mail"
	"net/http"
	"net/smtp"
	"sort"
	"strconv"
	"time"
)

type MailWeb struct {
	// The martini package object
	martini *martini.ClassicMartini
	// All initially parsed html templates
	templates map[string]*template.Template
	// Mail server configuration
	mconf *conf.MailConf
	// The quit channel for the usermap cleanup go routine
	UserQuitChan chan struct{}
	// Client session cookie and inactive user timeout duration: 30min * 60 sec
	userTimeout float64
	// Whether the app server is run in debugging mode for dev
	debug bool
}

const TEMPLATE_GROUP_NAME string = "template_group"

func NewWeb(mailConf *conf.MailConf, debug bool) *MailWeb {
	var web *MailWeb = new(MailWeb)
	web.mconf = mailConf
	web.debug = debug
	web.userTimeout = 86400 // 1 day

	store := sessions.NewCookieStore(securecookie.GenerateRandomKey(128))
	// 1) Set a maximum age for the client-side cookies (forces a session timeout afterwards)
	store.Options(sessions.Options{MaxAge: int(web.userTimeout)})

	web.martini = martini.Classic()
	web.martini.Use(render.Renderer(render.Options{
		Directory:  "static/templates",
		Extensions: []string{".html"},
	}))
	web.martini.Use(sessions.Sessions("watneySession", store))
	web.martini.Use(sessionauth.SessionUser(auth.GenerateAnonymousUser))
	sessionauth.RedirectUrl = "/sessionTimeout"
	sessionauth.RedirectParam = "next"

	// 2) Register a cleanup go routine that checks every x minutes, for outdated users, which
	//	  simply left the page without logging out
	web.registerUserCleanup(30)

	// x) Define and set all handlers
	web.initHandlers()
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
			case <-ticker.C:
				// Check for users, which are older than the given timeout and remove those
				nbrUsersCleaned := auth.CleanUsermap(web.userTimeout)
				if nbrUsersCleaned > 0 {
					fmt.Printf("[watney] Removed user objects from map: %d\n", nbrUsersCleaned)
				}
			case <-web.UserQuitChan:
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
	// Reserved for martini sessionauth forwarding, in case the session timed out
	web.martini.Get("/sessionTimeout", web.timeout)

	// Private Handlers
	web.martini.Get("/logout", sessionauth.LoginRequired, web.logout)
	web.martini.Get("/main", sessionauth.LoginRequired, web.main)

	web.martini.Post("/mailContent", sessionauth.LoginRequired, web.mailContent)
	web.martini.Post("/mails", sessionauth.LoginRequired, web.mails)
	web.martini.Post("/poll", sessionauth.LoginRequired, web.poll)
	web.martini.Post("/sendMail", sessionauth.LoginRequired, web.sendMail)
	web.martini.Post("/moveMail", sessionauth.LoginRequired, web.moveMail)
	web.martini.Post("/trashMail", sessionauth.LoginRequired, web.trashMail)
	web.martini.Post("/updateFlags", sessionauth.LoginRequired, web.updateFlags)
	web.martini.Post("/userInfo", sessionauth.LoginRequired, web.userInfo)

	// Static content
	web.martini.Use(martini.Static("static/resources/libs/",
		martini.StaticOptions{Prefix: "/libs/"}))
	web.martini.Use(martini.Static("static/resources/js/",
		martini.StaticOptions{Prefix: "/js/"}))
	web.martini.Use(martini.Static("static/resources/css/",
		martini.StaticOptions{Prefix: "/css/"}))
}

/**************************************************************************************************
 ***								Web Handlers												***
 **************************************************************************************************/
func (web *MailWeb) timeout(session sessions.Session, r render.Render, req *http.Request) {
	params := req.URL.Query()
	redirect := params.Get(sessionauth.RedirectParam)
	params.Del(sessionauth.RedirectParam)
	switch {
	// Redirect all GET method calls to the welcome page
	case redirect == "/":
	case redirect == "/main":
		r.Redirect("/")
	// Return JSON error code for all POST methods
	default:
		r.JSON(419, map[string]interface{}{
			"error": "Session has expired",
		})
	}
}

func (web *MailWeb) authenticate(session sessions.Session, postedUser auth.WatneyUser,
	r render.Render, req *http.Request) {
	// 1) Create a new IMAP mail server connection
	if imapCon, err := mail.NewMailCon(web.mconf); nil != err {
		fmt.Printf("Couldn't establish connection to imap mail server: %s\n", err.Error())
		r.HTML(200, "start", map[string]interface{}{
			"FailedLogin": true,
			"OrigError":   err.Error(),
		})
	} else {
		if _, err := imapCon.Authenticate(postedUser.Username, postedUser.Password); err == nil {
			var user auth.WatneyUser = auth.WatneyUser{
				Username: postedUser.Username,
				SMTPAuth: smtp.PlainAuth("", postedUser.Username, postedUser.Password,
					web.mconf.SMTPAddress),
				ImapCon: imapCon,
			}
			h := fnv.New32a()
			h.Write([]byte(postedUser.Username))
			user.Id = int64(h.Sum32())
			if err := sessionauth.AuthenticateSession(session, &user); err != nil {
				r.HTML(200, "start", map[string]interface{}{
					"FailedLogin": true,
					"OrigError":   err.Error(),
				})
			}
			r.Redirect("/main")
		} else {
			fmt.Println("FAILED!")
			imapCon.Close()
			r.HTML(200, "start", map[string]interface{}{
				"FailedLogin": true,
				"OrigError":   err.Error(),
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
	r.Redirect("/")
}

func (web *MailWeb) main(r render.Render) {
	r.HTML(200, "base", map[string]interface{}{
		"IsDebug": web.debug,
	})
}

/**
 * Handler to check, whether new mails have arrived in the meantime.
 */
func (web *MailWeb) poll(r render.Render, user sessionauth.User, session sessions.Session,
	req *http.Request) {
	var watneyUser *auth.WatneyUser = user.(*auth.WatneyUser)
	// 1) Check for authentication status, and return if no user is given or not authenticated
	if nil == watneyUser || !watneyUser.IsAuthenticated() {
		web.notifyAuthTimeout(r, "Poll for new mails")
		return
	}
	// 2) Check, whether new mails have arrived since the last poll
	// recentMails[0] -> nbr of new mails | recentMails[1] - last sequence number in mail list
	if newMailSeqNbrs, err := watneyUser.ImapCon.CheckNewMails(); err != nil {
		// 2a) Check for new mails failed for some reason
		web.notifyError(r, 500, fmt.Sprintf("Error while checking for new mails"), err.Error())
	} else if len(newMailSeqNbrs) > 0 {
		// 2b) If new mails have arrived, load them from the mail server
		if mails, err := watneyUser.ImapCon.LoadNMailsFromFolderWithSeqNbrs("/", newMailSeqNbrs); err == nil {
			// If the number of loaded mails is not equal to the number of new mail UIDs, send error
			if len(newMailSeqNbrs) != len(mails) {
				web.notifyError(r, 500,
					fmt.Sprintf("New mails are available, but they couldn't be retrieved"),
					fmt.Sprintf("Expected %d mail(s), but could only load %d mail(s)",
						len(newMailSeqNbrs), len(mails)))
				return
			}
			// Reverse the retrieved mail array
			sort.Sort(mail.MailSlice(mails))
			// Return the mails as json
			r.JSON(200, mails)
			return
		}
		// TODO: If the mail loading failed, the information about the recent mails
		//		 will be lost at that point => counteract
		web.notifyError(r, 500,
			fmt.Sprintf("New mails are available, but they couldn't be retrieved"), err.Error())
		return
	}
	// 3) No new mails have arrived
	r.JSON(200, make([]mail.Mail, 0))
}

/**
 * Handler to load all mails for a given folder.
 */
func (web *MailWeb) mails(r render.Render, user sessionauth.User, req *http.Request) {
	var (
		mails      []mail.Mail      = []mail.Mail{}
		watneyUser *auth.WatneyUser = user.(*auth.WatneyUser)
	)
	if nil != watneyUser && watneyUser.IsAuthenticated() {
		switch req.FormValue("mailInformation") {
		case mail.FULL:
			mails, _ = watneyUser.ImapCon.LoadAllMailsFromFolder(req.FormValue("mailbox"))
		case mail.OVERVIEW:
			fallthrough
		default:
			mails, _ = watneyUser.ImapCon.LoadAllMailOverviewsFromFolder(req.FormValue("mailbox"))
		}
		// Reverse the retrieved mail array
		sort.Sort(mail.MailSlice(mails))
		r.JSON(200, mails)
	} else {
		web.notifyAuthTimeout(r, "Retrieve mail overview")
	}
}

func (web *MailWeb) mailContent(r render.Render, user sessionauth.User, req *http.Request) {
	var (
		watneyUser *auth.WatneyUser = user.(*auth.WatneyUser)
		mail       mail.Mail
		err        error
	)
	if !watneyUser.ImapCon.IsAuthenticated() {
		web.notifyAuthTimeout(r, "Retrieve content for mail")
		return
	}
	uid, _ := strconv.ParseInt(req.FormValue("uid"), 10, 32)
	if mail, err = watneyUser.ImapCon.LoadMailFromFolderWithUID(req.FormValue("folder"),
		uint32(uid)); err != nil {
		web.notifyError(r, 500,
			fmt.Sprintf("Loading content for mail (%d, %s) failed", uid, req.FormValue("folder")),
			err.Error())
		return
	}
	r.JSON(200, mail.Content)
}

func (web *MailWeb) sendMail(r render.Render, curUser sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		var subject, from, body string
		subject = req.FormValue("subject")
		from = req.FormValue("from")
		to := []string{req.FormValue("to")}
		body = req.FormValue("body")
		//		fmt.Printf("%s -> %s : %s\n%s", from, to, subject, body)
		err := watneyUser.ImapCon.SendMail(watneyUser.SMTPAuth, from, to, subject, body)
		if err != nil {
			web.notifyError(r, 200,
				fmt.Sprintf("Mail couldn't be sent to '%s'", to), err.Error())
		} else {
			r.JSON(200, nil)
		}
	} else {
		web.notifyAuthTimeout(r, "Send mail")
	}
}

func (web *MailWeb) moveMail(r render.Render, curUser sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		var (
			uid          string = req.FormValue("uid")
			origFolder   string = req.FormValue("origFolder")
			targetFolder string = req.FormValue("targetFolder")
		)
		if newUID, err := watneyUser.ImapCon.MoveMail(uid, origFolder, targetFolder); err != nil {
			web.notifyError(r, 500, fmt.Sprintf("Mail (%s) couldn't be moved", uid), err.Error())
		} else {
			r.JSON(200, map[string]interface{}{
				"newUID": newUID,
			})
		}
	} else {
		web.notifyAuthTimeout(r, "Move mail")
	}
}

func (web *MailWeb) trashMail(r render.Render, curUser sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		var (
			uid        string = req.FormValue("uid")
			origFolder string = req.FormValue("folder")
		)
		if trashedUID, err := watneyUser.ImapCon.TrashMail(uid, origFolder); err != nil {
			web.notifyError(r, 200, fmt.Sprintf("Mail (%s) couldn't be trashed", uid), err.Error())
		} else {
			r.JSON(200, map[string]interface{}{
				"trashedUID": trashedUID,
			})
		}
	} else {
		web.notifyAuthTimeout(r, fmt.Sprintf("Trash mail"))
	}
}

func (web *MailWeb) userInfo(r render.Render, curUser sessionauth.User, req *http.Request) {
	var watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
	if watneyUser.ImapCon.IsAuthenticated() {
		r.JSON(200, map[string]interface{}{
			"email": watneyUser.Username,
		})
	} else {
		web.notifyAuthTimeout(r, "Request User information")
	}
}

func (web *MailWeb) updateFlags(r render.Render, curUser sessionauth.User, req *http.Request) {
	var (
		watneyUser *auth.WatneyUser = curUser.(*auth.WatneyUser)
		folder     string
		uid        string
		addFlags   bool
		flags      mail.Flags
		err        error
	)
	if watneyUser.ImapCon.IsAuthenticated() {
		// 1) Get the folder
		folder = req.FormValue("folder")
		// 2) Check the UID
		if _, err := strconv.ParseInt(req.FormValue("uid"), 10, 32); err != nil {
			web.notifyError(r, 200,
				fmt.Sprintf("Given UID '%s' is not a valid ID", req.FormValue("uid")), err.Error())
			return
		} else {
			uid = req.FormValue("uid")
		}
		// 3) Check the add/remove form value
		if addFlags, err = strconv.ParseBool(req.FormValue("add")); err != nil {
			web.notifyError(r, 200,
				fmt.Sprintf("Couldn't parse string '%s' into bool", req.FormValue("add")),
				err.Error())
			return
		}
		// 4) Check the flags
		if err = json.Unmarshal([]byte(req.FormValue("flags")), &flags); err != nil {
			fmt.Println("error:", err)
			r.Error(500)
			return
		}
		if err = watneyUser.ImapCon.UpdateMailFlags(folder, uid, &flags, addFlags); err != nil {
			web.notifyError(r, 500, fmt.Sprintf("Error while performing UpdateMailFlags"), err.Error())
		} else {
			r.Status(200)
		}
	} else {
		web.notifyAuthTimeout(r, "Request mail flag update")
	}
}

/**************************************************************************************************
 ***							Web return notifications									    ***
 **************************************************************************************************/
/**
 * Logs that the session has timed out while the user tried to perform the 'origAction' and
 * writes an error to the JSON render response.
 * @param r The render object from the martini.contrib project
 * @param origAction The action the caller tried to perform.
 */
func (web *MailWeb) notifyAuthTimeout(r render.Render, origAction string) {
	fmt.Printf("[watney] IMAP Session timed out, while User tried to: %s", origAction)
	// 419 - Authentication has timed out
	r.JSON(419, map[string]interface{}{"error": "Authentication has expired"})
}

/**
 * Logs that the session has timed out while the user tried to perform the 'origAction' and
 * writes an error to the JSON render response.
 * @param r The render object from the martini.contrib project
 * @param status The HTTP request return status (e.g., 500, 5xx)
 * @param desc The description of the occurring problem.
 * @param origError What caused the occurring problem?
 */
func (web *MailWeb) notifyError(r render.Render, status int, desc, origError string) {
	fmt.Printf("[watney] Notifying user about the following problem: \n\tError: %s\n\t"+
		"Original error: %s", desc, origError)
	r.JSON(status, map[string]interface{}{
		"error":   desc,
		"origErr": origError,
	})
}
