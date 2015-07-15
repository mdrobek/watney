# Watney  
Watney is a a free (as in air to breathe), lightweight, open-source Mail-Client for IMAP Mail-Servers written in Go. It pulls mails from the given IMAP server, displays them in a web app and allows to send mails via SMTP. For everybody who read [The Martian][10] by Andy Weir: Yes, that's the inspiration for the project's name. Let's cross fingers it's as resistant as Mark Watney.

## WHY?
<code>"I mean obviously dude, there's plenty of stuff out there: [horde][7], [webmailLite][8], [mailpile][9]. Just to name a couple of free ones. Not even talking about all the proprietary ones."</code>  

First of all: Because I can.  
Secondly, there's a couple of reasons here:  
* They run on interpreted scripts, such as PHP and Python. Enough said!
* Seriously, they run on scripts such as PHP or Python, which requires your server to have these environments. Older servers might not support the current PHP or Python version. However, Go programs can be compiled to native binaries for a target platform, which prevents this issue (at least to a certain degree).
* It'd be nice to improve on the "just get me my mails" approach to "Can I also see my IMs from various messengers" thing. Basically an information hub, that aggregates all different information channels I'm forced to use.
* Have a "one-side" main application approach to improve performance and user-experience.

## Requirements
You can run watney either by executing the main watney.go file within the Go environment (discouraged), or even better, simply compile a binary for your target platform. I'm currently working on a build script to pull all dependencies (including Google Closure) to do that automatically.

### Compiling the soy templates into JS files  
cd $WATNEY  
java -jar ./static/resources/soy/SoyToJsSrcCompiler.jar \
    --outputPathFormat ./static/resources/js/soy-templates.js \
    --shouldProvideRequireSoyNamespaces \
    --srcs ./static/resources/soy/mailOverview.soy
    
### Creating the JS dependency file for google closure
cd $WATNEY  
./static/resources/libs/closure-library/closure/bin/build/depswriter.py \
    --root_with_prefix="static/resources/js ../../../../js/" \
    --output_file=static/resources/js/watney-deps.js
    
### Compiling all JS files into one final file
cd $WATNEY  
https://developers.google.com/closure/library/docs/closurebuilder
./static/resources/libs/closure-library/closure/bin/build/closurebuilder.py   --root=./static/resources/libs/closure-library/   --root=./static/resources/js/  --namespace="wat.app"   --output_mode=compiled   --compiler_jar=./static/resources/libs/compiler.jar  > ./static/resources/js/watney-compiled.js

## Acknowledgements
Credits to whom credits belong. The following frameworks and code snippets provided a solid basis for watney and simplified the development process:
* [martini][1] Powerful web framework
* [martini-contrib][2] Various plugins for martini, e.g., binding, render, sessionauth and so on
* [goimap][3] IMAP implementation for go by mxk
* [smtp mail][4] Simple wrapper to send mail via SMTP for go by scorredoira
* [google closure][5] Very powerful tools and libraries to imrpove overall web-dev and user experience
* [bootstrap][6] Duh! Obviously.

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
