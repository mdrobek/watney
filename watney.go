/*

*/
package main

import (
	"mdrobek/watney/conf"
	"mdrobek/watney/web"
	"flag"
	"os"
	"fmt"
	"os/signal"
	"syscall"
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

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	signal.Notify(c, syscall.SIGTERM)
	go func() {
		sig := <-c
		fmt.Printf("[watney] Received Signal %s\n", sig.String())
		web.Close()
		os.Exit(1)
	}()

	web.Start(conf.Web.Port)
}
