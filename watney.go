/*

*/
package main

import (
	"mdrobek/watney/conf"
	"mdrobek/watney/web"
)

func main() {
	conf, err := conf.ReadConfig("src/mdrobek/watney/conf/unionwork.ini")
	if nil != err {
		panic(err)
	}

	web := web.NewWeb(&conf.Mail, conf.Web.Debug)
	defer web.Close()

	web.Start(conf.Web.Port)
}
