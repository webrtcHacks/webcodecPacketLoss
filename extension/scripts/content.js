function debug(...messages) {
    console.debug(`vch 🕵️‍ `, ...messages);
}

let injectState = "uninitialized";
let sliderState = "unknown"
let popupOpen;

// ToDo: testing - doesn't work
// const worker = new Worker("chrome-extension://bhanoknolaefhhiogpmoghangjkmaicn/scripts/worker.js")

debug(`content.js loaded on ${window.location.href}`);


// Add the worker script as a script tag

/*
const workerScript = document.createElement("script");
workerScript.id = "vch_packet_loss_worker";
workerScript.src = chrome.runtime.getURL('/scripts/worker.js');
(document.head || document.documentElement).appendChild(workerScript);
 */

// inject inject script
function addScript(path) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(path);
    script.onload = () => this.remove;
    (document.head || document.documentElement).appendChild(script);
}

// addScript('/scripts/impairment.js')
addScript('/scripts/inject.js');
debug("inject injected");


/*
 * Communicate with the popup
 */

let popupPort;

chrome.runtime.onConnect.addListener((port)=> {

    if(port.name !== "vch")
        return;
    popupPort = port;
    popupOpen = true;


    port.onMessage.addListener((msg)=> {
        // debug(`incoming message from popup:`, msg);

        // message handler
        if(msg.getState){
            debug(`new runtime connection. state ${injectState}, command ${sliderState}. Port: `, port);
            port.postMessage({state: injectState, command: sliderState});
        }
        else if(msg.command){
            sliderState = msg.command
            sendToInject(sliderState)
        }

    });

    port.onDisconnect.addListener((msg)=>{
        const ignoreError = chrome.runtime.lastError;
        debug("popup disconnected", msg);
        popupOpen = false;
    })

});

/*
 * Communicate with the injected content
 */

const sendToInject = message => {
    debug("sending this to inject.js: ", message);
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

    // ToDo: other message handlers?

    if(message === 'state'){
        injectState = data.state;
        debug(`state from inject: ${injectState}`);
        if(popupOpen)
            popupPort.postMessage({injectState});
    }

});

/*
// using an onbeforeunload here was making a "are you sure you want to close" message
onunload = async () => {
    state = "closing";
    if(popupOpen)
        await popupPort.postMessage({state})
            .catch(err=>debug(err));
}
 */
