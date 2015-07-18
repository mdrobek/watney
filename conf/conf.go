package conf

import (
	"code.google.com/p/gcfg"
)

type WatneyConf struct {
	// The web server port to listen on
	Web WebConf
	// Config for the mail server to connect to
	Mail MailConf
}

type MailConf struct {
	// Protocol of the mail server (currently only IMAP)
	Protocol string
	// host mail server address
	Hostname string
	// port to connect to the mail server
	Port int
	// the name of the mailbox
	Mailbox string
	// additional config options for TLS (e.g., skip certificate verification for self-signed certs)
	SkipCertificateVerification bool
	// verbose output
	Verbose bool
	// SMTP Host address
	SMTPAddress string
	// SMTP Host port
	SMTPPort int
}

type WebConf struct {
	Port int
	Debug bool
}

func ReadConfig(configFile string) (*WatneyConf, error) {
	var cfg WatneyConf
	err := gcfg.ReadFileInto(&cfg, configFile)
	return &cfg, err
}
