const statusSpan = document.querySelector('span#gumStatus');
const btn = document.querySelector('button');

function log(...messages) {
    if (messages.length > 1 || typeof messages[0] === 'object')
        console.log(`🐰 ️${JSON.stringify(...messages)}`);
    else
        console.log(`🐰 ️`, ...messages);
}

async function getTabInfo(){
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const id = tab.id;
    const url = tab.url;
    // log(`popup page open for tab ${id} for ${url}`);
    return {id, url}
}

//const {tabId, tabUrl} = await getTabInfo();
let tabId, tabUrl;
getTabInfo().then(
    (tabInfo) => {
        tabId = tabInfo.id;
        tabUrl = tabInfo.url;
        log(`popup page open for tab ${tabId} for ${tabUrl}`);
    }
)

// wrapper
function sendMessage(to, message, data, responseHandler = null) {
    try{
        const messageToSend = {
            from: "popup",
            to: to,
            message: message,
            data: data
        };

        if(to === 'background' || to === 'all')
            chrome.runtime.sendMessage(messageToSend, responseHandler)
        if (to === 'tab' || to === 'all')
            chrome.tabs.query({active: true, currentWindow: true}, tabs => {
                chrome.tabs.sendMessage(tabs[0].id, messageToSend, responseHandler ? responseHandler: null)
            });
    }
    catch (err){
        console.error(err);
    }
}

// ToDo: this doesn't do anything
chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        // log(request);
        log(`DEBUG: from ${sender.tab ? sender.tab.id : "unknown"}`, request, sender);

        const {to, from, message, data} = request;

        if(to === 'popup' || to === 'all'){
            log(`message from ${from}: ${message}`);
        }
        else {

            if(sender.tab)
                log(`unrecognized format from tab ${sender.tab.id} on ${sender.tab ? sender.tab.url : "undefined url"}`, request);
            else
                log(`unrecognized format : `, sender, request);
            return

        }

        // message handlers
        if(message === "gum_stream_start") {
            statusSpan.textContent = "active";
            btn.disabled = false;
        }
        if(message === "gum_stream_stop") {
            statusSpan.textContent = "stopped";
            btn.disabled = true;
        }
        if(message === "unload") {
            statusSpan.textContent = "closed";
            btn.disabled = true;
        }
        else {
            log("unrecognized request: ", request)
            // statusSpan.textContent = "inactive";
            // trainBtn.disabled = true;
        }
   });


// Get state
sendMessage('background', "open", {}, response=> {
    //if (response?.message)
    if(response?.message && response !== ""){
        log("sendMessage response: ", response);
        statusSpan.textContent = response;
    }
});

btn.onclick = ()=>{
    sendMessage('tab', 'click');
    log('click');
}
