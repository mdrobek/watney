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

/**
 * This type is only used to run tests concerning the IMAP mail connection.
 * In all other cases, 'WatneyConf' has to be used.
 */
type WatneyTestConf struct {
	WatneyConf
	// Test user
	TestUser struct {
		Username string
		Password string
	}
}

type MailConf struct {
	// Protocol of the mail server (currently only IMAP)
	Protocol string
	// host mail server address
	Hostname string
	// port to connect to the mail server
	Port int
	// additional config options for TLS (e.g., skip certificate verification for self-signed certs)
	SkipCertificateVerification bool
	// verbose output
	Verbose bool
	// SMTP Host address
	SMTPAddress string
	// SMTP Host port
	SMTPPort int
	// Whether the IMAP protocol output should be logged or not
	ImapLog bool
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


func ReadTestConfig(testConfigFile string) (*WatneyTestConf, error) {
	var cfg WatneyTestConf
	err := gcfg.ReadFileInto(&cfg, testConfigFile)
	return &cfg, err
}
