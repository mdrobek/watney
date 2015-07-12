package web

import (
	"html/template"
	"log"
	"net/http"
	"path/filepath"
	"mdrobek/watney/mail"
	"sort"
	"encoding/json"
	"errors"
	"mdrobek/watney/conf"
	"strconv"
)

type MailWeb struct {
	// All initially parsed html templates
	templates map[string]*template.Template
	// Mail server configuration
	mconf *conf.MailConf
	// Mail server connection
	imapCon *mail.MailCon
	// Whether the app server is run in debugging mode for dev
	debug bool
}

func NewWeb(mailConf *conf.MailConf, debug bool) *MailWeb {
	var web *MailWeb = new(MailWeb)
	web.mconf = mailConf
	web.debug = debug

	var err error
	web.imapCon, err = mail.NewMailCon(web.mconf)
	if nil != err {
		panic("Couldn't establish connection to imap mail server: %s', err")
	}

	// init the map
	if nil == web.templates {
		web.templates = make(map[string]*template.Template)
	}

	strTmpls, err := filepath.Glob("src/mdrobek/watney/static/templates/*.html")
	if nil != err {
		log.Fatalf("Couldn't find templates: %s", err)
	}

	log.Print(strTmpls)
	web.templates["main"] = template.Must(template.ParseFiles(strTmpls...))

//	for _, curTmpl := range strTmpls {
//		web.templates[filepath.Base(curTmpl)] = template.Must(
//			template.ParseFiles(curTmpl))
//	}

	return web
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
 ***									Web methods												***
 **************************************************************************************************/
func (web *MailWeb) Root(w http.ResponseWriter, r *http.Request) {
	web.renderTemplate(w, "main", map[string]interface{}{
		"IsDebug" : web.debug,
	})
}

func (web *MailWeb) Mails(w http.ResponseWriter, r *http.Request) {
	mc, err := mail.NewMailCon(web.mconf)
	defer mc.Close()
	var mails []mail.Mail = []mail.Mail{}
	if nil == err {
		switch r.FormValue("mailInformation") {
		case mail.FULL: mails, _ = mc.LoadMailsFromFolder(r.FormValue("folder"))
		case mail.OVERVIEW: fallthrough
		default: mails, _ = mc.LoadMailOverview(r.FormValue("folder"))
		}
		// Reverse the retrieved mail array
		sort.Sort(mail.MailSlice(mails))
	}
	jsonRet, err := json.Marshal(mails)
	if (nil != err) {
		log.Fatal(err)
	}
	w.Write(jsonRet)
}

func (web *MailWeb) MailContent(w http.ResponseWriter, r *http.Request) {
	mc, err := mail.NewMailCon(web.mconf)
	defer mc.Close()
	var mailContent string
	if nil == err {
		uid, _ := strconv.ParseUint(r.FormValue("uid"), 10, 32)
		mailContent, _ = mc.LoadContentForMail(uid)
	}
	jsonRet, err := json.Marshal(mailContent)
	if (nil != err) {
		log.Fatal(err)
	}
	w.Write(jsonRet)
}

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

func (web *MailWeb) renderTemplate(w http.ResponseWriter, name string, data map[string]interface{}) {
	curTmpl, ok := web.templates[name]
	if !ok {
		log.Fatalf("Couldn't load template for name '%s' in templates map '%s'", name,
			web.templates)
	}
	curTmpl.ExecuteTemplate(w, "base", data)
}

