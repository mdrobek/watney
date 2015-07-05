# watney
Watney is a small Mail-Server frontend for IMAP Mail-Servers written in Go


### Compiling the soy templates into JS files
cd $WATNEY
java -jar ./static/resources/soy/SoyToJsSrcCompiler.jar \
    --outputPathFormat ./static/resources/js/soy-templates.js \
    --shouldProvideRequireSoyNamespaces \
    --srcs ./static/resources/soy/mailOverview.soy