function debug(...messages) {
    // console.debug(`bcs 🕵️‍ `, ...messages);
}

let injectState = "uninitialized";
let sliderState = "unknown"
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

let popupPort;
const PORT_NAME = "bad_connection_simulator";

chrome.runtime.onConnect.addListener((port)=> {

    if(port.name !== PORT_NAME)
        return;
    popupPort = port;
    popupOpen = true;

    port.onMessage.addListener((msg)=> {

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
    const toInjectEvent = new CustomEvent(PORT_NAME, {detail: message});
    document.dispatchEvent(toInjectEvent);
};

// Messages from inject
document.addEventListener(PORT_NAME, async e => {
    const {to, from, message, data} = e.detail;

    // stop inject for echoing back
    if (from !== 'inject')
        return;

    // await sendMessage(to, from, message, data);
    debug(`document.eventListener message from ${from}`, e.detail);

    if (!e.detail) {
        return
    }

    if(message === 'state'){
        injectState = data.state;
        debug(`state from inject: ${injectState}`);
        if(popupOpen)
            popupPort.postMessage({injectState});
    }
});
