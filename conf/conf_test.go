package conf

import "testing"

func TestReadTemplateConfig(t *testing.T) {
	conf, err := ReadConfig("watney-templ.ini")
	if nil != err {
		t.Error(err)
	}
	if nil == conf || nil == &conf.Mail || nil == &conf.Web {
		t.Error("Either the parsed config is null or some subsection")
	}
}
