/*

*/
package main

import (
	"mdrobek/watney/conf"
	"mdrobek/watney/web"
	"flag"
	"os"
	"fmt"
)

func main() {
	var configFilePath *string = flag.String("c", "", "The config file name for Watney")
	flag.Parse()
	fmt.Printf("Read config file is: %s\n", *configFilePath)
	if _, err := os.Stat(*configFilePath); os.IsNotExist(err) {
		fmt.Printf("Config file '%s' couldn't be found!\n", *configFilePath)
		os.Exit(-1)
	}

	conf, err := conf.ReadConfig(*configFilePath)
	if nil != err {
		panic(err)
	}

	web := web.NewWeb(&conf.Mail, conf.Web.Debug)
	defer web.Close()

	web.Start(conf.Web.Port)
}
