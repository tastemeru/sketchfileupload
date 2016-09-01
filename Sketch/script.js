// сделать добавления ключа в менюшку и сохранение это в джэйсон
// При запросе, делаем поиск по джэйсону, если находим проект, то отсылаем это для сверки на сервак, если нет, то ошибка
// Если сверка прошла успешно, отсылаем все картинки на сервак, где и обновляем их


var endpoint    = "https://artdir.club",
    tempDir     = NSTemporaryDirectory();

// var endpoint    = "http://localhost:3000",
//     tempDir     = NSTemporaryDirectory();
    


var onRun = function(context){
    var doc = context.document;
    var selection = context.selection;
    var documentId  = String(context.document.documentData().objectID());
    var currentObject = JSON.parse( getTokens(context) );

    if (!currentObject[documentId]) {
        createModal(context)
    }
    var checkingResult = checkToken(currentObject[documentId]);
    
    //Checking if we have a token and auth
    if (checkingResult.auth == 1){
        //Check if selected artboard
        if ( selection.count() > 0 ){
            log('DONE')
            getSelectedPages(context, currentObject[documentId]);
        } else {
            getAllPages(context, currentObject[documentId]);
        }
    } else {
        createModal(context)
    }
}


var changeTokens = function(context){
    var doc = context.document;
    var selection = context.selection;
    var documentId  = String(context.document.documentData().objectID());
    var currentObject = JSON.parse( getTokens(context) );
    createModal(context)
}

function getAllPages(context, token){

    var doc = context.document;
    doc.showMessage("Uploading All Artboards... (Spinning beachball is normal)");

    /*
     * Set up initial variables
     */
    var pages       = doc.pages(),
        pageCount   = pages.count();


    //Loop through the all pages
    for (index = 0; index < pageCount; ++index) {
        var page = pages[index];

        /*
         * We have to set the current page of the document otherwise the png for the artboard will export empty
         */
        if(page.name() != 'Symbols') { doc.setCurrentPage(page); }
        var artboards = page.artboards();
        var artboardsCount = artboards.count();
        if (artboardsCount >= 1 && page.name() != 'Symbols'){
            for (i = 0; i < artboardsCount; ++i) {
                doc.showMessage( "Uploading artboard " + (i+1) + " of " + artboardsCount );
                var artboard = artboards[i];
                resizeAndPost(doc, artboard, token)
            }
        }
        
    }

}

function getSelectedPages(context, token){

    var doc             = context.document,
        artboards       = context.selection,
        artboardsCount  = artboards.count();

    doc.showMessage("Uploading Selected Artboards... (Spinning beachball is normal)");

    if (artboardsCount >= 1){
        for (i = 0; i < artboardsCount; ++i) {
            doc.showMessage("Uploading artboard " + (i+1) + " of " + artboardsCount);
            var artboard = artboards[i];
            if ( isArtboard(artboard) ){
                resizeAndPost(doc, artboard, token)
            } else {
                doc.showMessage("You can't share layers. Select an artboard or deselect all to upload all artboards");
            }
        }

    }
}

function resizeAndPost (doc, artboard, token) {
    //Set the name
    var filename = token.projectId + "__" + safeName(artboard.name()) + ".png";
    var filenameThubm = token.projectId + "__thumb__" + safeName(artboard.name()) + ".png";
    //Set the path
    var path = tempDir + filename;
    var pathThumb = tempDir + filenameThubm;

    //Making a thumb
    var rect = [MSSliceTrimming trimmedRectForSlice:artboard],
        slice = [MSExportRequest requestWithRect:rect scale:1]
    var width = slice.rect().size.width;
    var height = slice.rect().size.height;
    var scale = 600/width
    if (scale > 1) scale = 1
    [slice setScale:scale]
    var widthThumb = Math.round(width*scale);
    var heightThumb = Math.round(height*scale);

    //Save to file
    [doc saveArtboardOrSlice:artboard toFile:path]                
    [doc saveArtboardOrSlice:slice toFile:pathThumb]        
    //Post to server
    var result = post(path, filename, pathThumb, filenameThubm, width, height, token, widthThumb, heightThumb);

}




function checkToken(token){
    var task = NSTask.alloc().init()
    task.setLaunchPath("/usr/bin/curl");
    var args = NSArray.arrayWithObjects(
        "-v",
        "-X", "GET",
        "--header", "User-Agent: Sketch",
        "--form", "projectId=" + token.projectId,
        "--form", "projectToken=" + token.projectToken,
        endpoint + "/api/check", nil);
    task.setArguments(args);

    var outputPipe = [NSPipe pipe];
    [task setStandardOutput:outputPipe];

    task.launch();

    var outputData = [[outputPipe fileHandleForReading] readDataToEndOfFile];
    var outputString = [[[NSString alloc] initWithData:outputData encoding:NSUTF8StringEncoding]];
    log('CheckToken ' +  outputString)
    return JSON.parse(outputString);
}

function post(path, filename, pathThumb, filenameThubm, width, height, token, widthThumb, heightThumb){
    
    var task = NSTask.alloc().init()
    task.setLaunchPath("/usr/bin/curl");
    
    var args = NSArray.arrayWithObjects(
        "-v",
        "-X", "POST",
        "--header", "User-Agent: Sketch",
        "Content-Disposition: form-data; name=sketchartboard; Content-Type=image/png;",
        "--form", "sketchartboard=@" + path + ";type=image/png;",
        "--form", "filename=" + filename,
        "--form", "sketchartboardThumb=@" + pathThumb,
        "--form", "filenameThumb=" + filenameThubm,
        "--form", "projectId=" + token.projectId,
        "--form", "projectToken=" + token.projectToken,
        "--form", "width=" + width,
        "--form", "height=" + height,
        "--form", "widthThumb=" + widthThumb,
        "--form", "heightThumb=" + heightThumb,
        endpoint + "/api", nil);


    task.setArguments(args);
    var outputPipe = [NSPipe pipe];
    [task setStandardOutput:outputPipe];
    task.launch();
    var outputData = [[outputPipe fileHandleForReading] readDataToEndOfFile];
    var outputString = [[[NSString alloc] initWithData:outputData encoding:NSUTF8StringEncoding]]; // Autorelease optional, depending on usage.
    // log('outputString ' + outputString)
    return JSON.parse(outputString);
}



function createModal(context) {
    // create the enclosing window
    var win     = NSWindow.alloc().init();
    [win setFrame:NSMakeRect(0, 0, 360, 200) display:false]
    [win setBackgroundColor:[NSColor colorWithCalibratedRed:(230/255) green:(230/255) blue:(230/255) alpha:1]]

    // create the title
    var projectIdTitle = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 135, 360, 30)]
    [projectIdTitle setEditable:false]
    [projectIdTitle setBordered:false]
    [projectIdTitle setTextColor:[NSColor colorWithCalibratedRed:(50/255) green:(50/255) blue:(50/255) alpha:1]]
    [projectIdTitle setDrawsBackground:false]
    [projectIdTitle setFont:[NSFont boldSystemFontOfSize:13]];
    [projectIdTitle setStringValue:"Project ID"]
    [[win contentView] addSubview:projectIdTitle]


    // create the textinput
    var inputProject = NSTextField.alloc().initWithFrame(NSMakeRect(22, 120, 300, 25))
    inputProject.setEditable(true)
    [[win contentView] addSubview:inputProject]


    // create the title
    var projectTokenTitle = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 80, 360, 30)]
    [projectTokenTitle setEditable:false]
    [projectTokenTitle setBordered:false]
    [projectTokenTitle setTextColor:[NSColor colorWithCalibratedRed:(50/255) green:(50/255) blue:(50/255) alpha:1]]
    [projectTokenTitle setDrawsBackground:false]
    [projectTokenTitle setFont:[NSFont boldSystemFontOfSize:13]];
    [projectTokenTitle setStringValue:"Project Token"]
    [[win contentView] addSubview:projectTokenTitle]


    // create the textinput
    var inputToken = NSTextField.alloc().initWithFrame(NSMakeRect(22, 65, 300, 25))
    inputProject.setEditable(true)
    [[win contentView] addSubview:inputToken]

    // create the buttons wrapper
    var buttonWrapper = [[NSView alloc] initWithFrame:NSMakeRect(0, 10, 300, 100)];
    buttonWrapper.setWantsLayer(true);
    [[win contentView] addSubview:buttonWrapper];



    // create the done button
    var doneButton = [[NSButton alloc] initWithFrame:NSMakeRect(16, 0, 92, 32)]
    [doneButton setTitle:"Save"]
    [doneButton setBezelStyle:NSRoundedBezelStyle]
    [doneButton setCOSJSTargetFunction:function(sender) {
        [win orderOut:nil]
        [NSApp stopModal]
    }];
    [doneButton setAction:"callAction:"]
    [buttonWrapper addSubview:doneButton]

    [NSApp runModalForWindow:win]
    var projectId = String(context.document.documentData().objectID());
    var currentObject = JSON.parse( getTokens(context) );
    currentObject[projectId] = {"projectId": String(inputProject.stringValue()), "projectToken": String(inputToken.stringValue()) }
    saveTokens(JSON.stringify(currentObject),context)
}


function successWindow(context, viewURL){


    // create the enclosing window
    var win     = NSWindow.alloc().init();
    [win setFrame:NSMakeRect(0, 0, 300, 180) display:false]
    [win setBackgroundColor:[NSColor colorWithCalibratedRed:(230/255) green:(230/255) blue:(230/255) alpha:1]]


    // create the title
    var titleTxt = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 40, 300, 100)]
    [titleTxt setEditable:false]
    [titleTxt setBordered:false]
    [titleTxt setTextColor:[NSColor colorWithCalibratedRed:(50/255) green:(50/255) blue:(50/255) alpha:1]]
    [titleTxt setDrawsBackground:false]
    [titleTxt setFont:[NSFont boldSystemFontOfSize:13]];
    [titleTxt setStringValue:"Sharing Artboards"]
    [[win contentView] addSubview:titleTxt]


    // create the body
    var bodyTxt = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 60, 260, 50)]
    [bodyTxt setEditable:false]
    [bodyTxt setBordered:false]
    [bodyTxt setTextColor:[NSColor colorWithCalibratedRed:(80/255) green:(80/255) blue:(80/255) alpha:1]]
    [bodyTxt setDrawsBackground:false]
    [bodyTxt setFont:[NSFont userFontOfSize:13]];
    [bodyTxt setStringValue:"A link to your artboards has been copied to your clipboard."]
    [[win contentView] addSubview:bodyTxt]


    // create the buttons wrapper
    var buttonWrapper = [[NSView alloc] initWithFrame:NSMakeRect(0, 10, 300, 100)];
    buttonWrapper.setWantsLayer(true);
    [[win contentView] addSubview:buttonWrapper];



    // create the done button
    var doneButton = [[NSButton alloc] initWithFrame:NSMakeRect(16, 0, 92, 32)]
    [doneButton setTitle:"Done"]
    [doneButton setBezelStyle:NSRoundedBezelStyle]
    [doneButton setCOSJSTargetFunction:function(sender) {
        [win orderOut:nil]
        [NSApp stopModal]
    }];
    [doneButton setAction:"callAction:"]
    [buttonWrapper addSubview:doneButton]



    // create the URL button
    var rect = NSMakeRect(110, 0, 180, 32);
    var linkButton = NSButton.alloc().initWithFrame(rect);
    linkButton.setTitle("Click to view link");
    [linkButton setBezelStyle:NSRoundedBezelStyle]
    [linkButton setCOSJSTargetFunction:function(sender) {
        var url = NSURL.URLWithString(String( viewURL ));
        if( ![[NSWorkspace sharedWorkspace] openURL:url] ){
            sketchLog(@"Could not open url:" + [url description])
        }
    }];
    [linkButton setAction:"callAction:"]
    [buttonWrapper addSubview:linkButton]





    [NSApp runModalForWindow:win]
}

function getTokens(context){
    var last = [[NSUserDefaults standardUserDefaults] objectForKey:"designbase"];
    // log("GetToken:" + last)
    if (last) {
        return last;
    } else {
        var tokens = {}
        saveTokens(tokens,context);
        return tokens;
    }
}

function saveTokens(tokens,context){
    [[NSUserDefaults standardUserDefaults] setObject:tokens forKey:"designbase"]
    [[NSUserDefaults standardUserDefaults] synchronize]
}



function safeName(filename){
    return filename.replace(/[^a-zа-яё0-9#№]/gi, '_');
}

function dialog(title,text){
    var app = [NSApplication sharedApplication];
    [app displayDialog:text withTitle:title]
}


function isArtboard(arboard) {
    return [arboard isMemberOfClass:[MSArtboardGroup class] ]
}