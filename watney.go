/*

*/
package main

import (
	"fmt"
	"log"
	"mdrobek/watney/conf"
	"mdrobek/watney/web"
	"net/http"
)

func main() {
	conf, err := conf.ReadConfig("src/mdrobek/watney/conf/unionwork.ini")
	if nil != err {
		panic(err)
	}

	web := web.NewWeb(&conf.Mail)
	defer web.Close()

	// Handler definitions
	http.HandleFunc("/", web.Root)
	libHandler := http.FileServer(http.Dir("src/mdrobek/watney/static/resources/libs/"))
	http.Handle("/libs/", http.StripPrefix("/libs/", libHandler))
	jsHandler := http.FileServer(http.Dir("src/mdrobek/watney/static/resources/js/"))
	http.Handle("/js/", http.StripPrefix("/js/", jsHandler))
	cssHandler := http.FileServer(http.Dir("src/mdrobek/watney/static/resources/css/"))
	http.Handle("/css/", http.StripPrefix("/css/", cssHandler))
	http.HandleFunc("/mails", web.Mails)
	http.HandleFunc("/headers", web.Headers)

	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", conf.Web.Port), nil))
}
