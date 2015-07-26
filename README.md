# Watney  
Watney is a a free (as in air to breathe), lightweight, open-source Mail-Client for IMAP
Mail-Servers written in Go. It pulls mails from the given IMAP server, displays them in a web app
and allows to send mails via SMTP. For everybody who read [The Martian][10] by Andy Weir: Yes,
that's the inspiration for the project's name. Let's cross fingers it's as resistant as Mark Watney.

## WHY?
<code>"I mean obviously dude, there's plenty of stuff out there: [horde][7], [webmailLite][8],
[mailpile][9]. Just to name a couple of free ones. Not even talking about all the proprietary
ones."</code>  

First of all: Because I can.  
Secondly, there's a couple of reasons here:  
* Most of them run on interpreted scripts, such as PHP and Python. Enough said!
* Seriously, they run on scripts such as PHP or Python, which requires your server to have these
environments. Older servers might not support the current PHP or Python version. However, Go
programs can be compiled to native binaries for a target platform, which prevents this issue (at
least to a certain degree).
* It'd be nice to improve on the "just get me my mails" approach to "Can I also see my IMs from
various messengers" thing. Basically an information hub, that aggregates all different information
channels I'm forced to use.
* Have a "one-side" main application approach to improve performance and user-experience.

## Requirements
To Build Watney (on your dev machine):
* [Gradle][11] at least version 2.0 (to execute the build script)
* [Python][12] at least version 2.7.9  (to create closure dependency files with the google closure
tools)
* [Java][16] at least version 1.7 (to compile JS files with the google closure tools)
* [Go][13] at least version 1.4.2 (to compile watney into an executable)  
Make sure python, gradle, java and go can be executed on your command line.  
**Note:** Please make sure, that GOPATH is set accordingly, as described [here][14].
  
To Run Watney (on your server):
* IMAP Server to pull your mails
* SMTP Server to send mails
* **No other requirements** (Once Watney is a compiled executable, no additional requirements are
necessary to run it.)

### Get and Build Watney
1) Download the watney sources from github:  
<code>$ go get github.com/mdrobek/watney</code>  
2) Switch to the watney source dir:  
<code>$ cd $GOPATH/src/github.com/mdrobek/watney</code>  
3) Build watney (this takes care of pulling in all dependencies as well):  
<code>$ gradle buildWatney</code>

### Run Watney
Watney requires a configuration file on application start. A template has been provided, which
needs to be copied and filled with your specific information:  
<code>$ cp conf/watney-templ.ini conf/your-conf.ini</code>  

Please adjust the config file accordingly to your specific needs (it should be self-explanatory).

Watney can now be started as follows:  
<code>$ watney -c conf/your-conf.ini</code>

*Note*: There is currently a bug that forces watney to search for template files in the wrong
resource folder!


## Acknowledgements
Credits to whom credits belong. The following frameworks and code snippets provided a solid basis
for watney and simplified the development process:
* [martini][1] Powerful web framework
* [martini-contrib][2] Various plugins for martini, e.g., binding, render, sessionauth and so on
* [goimap][3] IMAP implementation for go by mxk
* [smtp mail][4] Simple wrapper to send mail via SMTP for go by scorredoira
* [godep][15] Extremely helpful tool to download all go dependencies by Keith Rarick
* [google closure][5] Very powerful tools and libraries to improve overall web-dev and user
experience
* [bootstrap][6] Duh! Obviously.
* [gradle][11] Amazing and powerful software management tool (build tool).
* [dafont][17] Provides nice fonts (also the 'Battlestar' font for Watney)

[1]: https://github.com/go-martini/martini
[2]: https://github.com/martini-contrib
[3]: https://github.com/mxk/go-imap
[4]: https://github.com/scorredoira/email
[5]: https://developers.google.com/closure/
[6]: http://getbootstrap.com/
[7]: http://www.horde.org/apps/webmail
[8]: http://www.afterlogic.org/webmail-lite
[9]: https://www.mailpile.is/
[10]: https://en.wikipedia.org/wiki/The_Martian_%28Weir_novel%29
[11]: http://gradle.org/
[12]: https://www.python.org/
[13]: https://golang.org/
[14]: https://golang.org/doc/code.html
[15]: https://github.com/tools/godep
[16]: https://java.com/en/download/
[17]: http://www.dafont.com