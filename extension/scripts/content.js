const streams = [];
let trackInfos = [];
// const trackIds = new Set();

window.vchStreams = streams;
let videoTabId;

function debug(...messages) {
    console.debug(`vch 🕵️‍ `, ...messages);
}

debug(`content.js loaded on ${window.location.href}`);

// inject inject script
function addScript(path) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(path);
    script.onload = () => this.remove;
    (document.head || document.documentElement).appendChild(script);
}

addScript('/scripts/inject.js');
debug("inject injected");

/*
 * Communicate with the background worker context
 */

async function sendMessage(to = 'all', from = 'tab', message, data = {}, responseCallBack = null) {

    if (from === 'tab' && to === 'tab')
        return;

    try {
        // ToDo: response callback
        const messageToSend = {
            from: from,
            to: to,
            message: message,
            data: data
        };

        // ToDo: this is expecting a response
        await chrome.runtime.sendMessage(messageToSend, {});

        // debug(`sent "${message}" from "tab" to ${to} with data ${JSON.stringify(data)}`);
    } catch (err) {
        debug("ERROR", err);
    }
}

// Main message handler
chrome.runtime.onMessage.addListener(
    async (request, sender) => {
        const {to, from, message, data} = request;
        debug(`receiving "${message}" from ${from} to ${to}`, request);

        if (to === 'tab' || to === 'all') {

            const sendTrainingImage = image => sendMessage('training', 'tab', 'training_image', image);
        } else if (to === 'content') {
            // Nothing to do here yet
            debug("message for content.js", request)
        } else {
            if (sender.tab)
                debug(`unrecognized format from tab ${sender.tab.id} on ${sender.tab ? sender.tab.url : "undefined url"}`, request);
            else
                debug(`unrecognized format : `, sender, request);
        }
    }
);


/*
 * Communicate with the injected content
 */

const sendToInject = message => {
    debug("sending this to inject.js", message);
    const toInjectEvent = new CustomEvent('vch', {detail: message});
    document.dispatchEvent(toInjectEvent);
};

// Messages from inject
document.addEventListener('vch', async e => {
    const {to, from, message, data} = e.detail;
    // ToDo: stop inject for echoing back
    if (from === 'content')
        return;

    debug("message from inject", e.detail);

    if (!e.detail) {
        return
    }

});

// Tell background to remove unneeded tabs
window.addEventListener('beforeunload', () => {
    sendMessage('all', 'tab', 'unload')
});

// sendMessage('background', 'content', 'tab_loaded', {url: window.location.href});
