
function log(...messages) {
    console.log(`👷 `, ...messages);
}

chrome.runtime.onStartup.addListener(async () => {

});

chrome.runtime.onInstalled.addListener(async () => {

});

/*
 * Inter-script messaging
 *


chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {

        log(`DEBUG: from ${sender.tab ? sender.tab.id : "unknown"}`, request, sender);

        // ToDo: debugging
        if(sendResponse){
            log("sending a response");
            sendResponse(true);
        } else log("no response requested");

        // const tabId = sender?.tab?.id || "not specified";
        const {to, from, message, data} = request;


        // ['background', 'all', 'training'].includes(to)
        log(`message from ${from} ${sender.tab ? sender.tab.id : ""} : ${message}, data:`, data);

        if (from === "popup" && message === "open") {
            log("popup open");
        } else if (message === 'unload') {
            log("tab unloading");
        }
    });

/*
 * Add our injection script new tabs
 *

// Learning: needed vs. file method to give scripts access to window
function inject(...files) {
    files.forEach(file => {
        let script = document.createElement('script');
        script.src = chrome.runtime.getURL(file);
        script.onload = function () {
            document.head.removeChild(this)
        };
        (document.head || document.documentElement).appendChild(script); //prepend
    });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // log(`tab ${tabId} updated`, changeInfo, tab);

    if (tab.url.match(/^chrome-extension:\/\//) && changeInfo.status === 'complete') {
        log(`extension tab opened: ${tab.url}`)
    } else if (changeInfo.status === 'loading' && /^http/.test(tab.url)) { // complete
        log(`${tab.url} loading`);
    }
    else log(`tab ${tabId} updated to ${changeInfo.status}`, tab);

});

log("background.js loaded");

*/
