function debug(...messages) {
    console.debug(`vch 🕵️‍ `, ...messages);
}

let state = "uninitialized";
let popupOpen;

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
 * Communicate with the popup
 */

/*
const port = chrome.runtime.connect({name: "vch"});
port.postMessage({state});
port.onMessage.addListener(msg=> {
debug(`incoming message:`, msg);
});
 */

async function sendMessage(to = 'popup', from = 'content', message, data = {}) {

    try {
        // ToDo: response callback
        const messageToSend = {
            from: from,
            to: to,
            message: message,
            data: data
        };

        // ToDo: this is expecting a response
        await chrome.runtime.sendMessage(messageToSend);

        // debug(`sent "${message}" from "tab" to ${to} with data ${JSON.stringify(data)}`);
    } catch (err) {
        console.error(err);
        debug("ERROR", err);
    }
}


// Main message handler
chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
        const {to, from, message, data} = request;
        debug(`receiving "${message}" from ${from} to ${to}`, request);

        // This app only needs popup for now
        if(from !== 'popup')
            return

        if(message === 'open'){
            debug(`sending state: ${state}`);
            popupOpen = true;
            sendResponse({state});
        }

        else {
            sendToInject(request);
            if(sendResponse)
                sendResponse({data: "foo"});
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
    if (from !== 'inject')
        return;

    // await sendMessage(to, from, message, data);
    debug(`document.eventListener message from ${from}`, e.detail);

    if (!e.detail) {
        return
    }

    // ToDo: message handlers

    if(message === 'state'){
        state = data.state;
        debug(`state from inject: ${state}`);
    }



});

