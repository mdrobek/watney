# watney  
Watney is a small Mail-Server frontend for IMAP Mail-Servers written in Go  


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