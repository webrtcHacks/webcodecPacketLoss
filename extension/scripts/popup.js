const statusSpan = document.querySelector('span#status');
const inputRange = document.querySelector(' input[type=range]');

let injectState;

function log(...messages) {
    if (messages.length > 1 || typeof messages[0] === 'object')
        console.log(`🐰 ️${JSON.stringify(...messages)}`);
    else
        console.log(`🐰 ️`, ...messages);
}

let tabId, tabUrl, port;
chrome.tabs.query({active: true, currentWindow: true})
    .then(async tabs => {
        const tab = tabs[0];
        tabId = tab.id;
        tabUrl = tab.url;
        console.log(`popup page open for tab ${tabId} for ${tabUrl}`);

        if (tab.url.includes("chrome://")) {
            log("popup disabled on chrome:// tab")
            inputRange.disabled = true;
            // document.querySelector(".container").classList.add("text-muted");
            return
        }

        port = chrome.tabs.connect(tabId, {name: "vch"});

        port.postMessage({'getState': true});

        port.onDisconnect.addListener(port => {
            if (chrome.runtime.lastError)
                console.log("tab disconnect error. ", chrome.runtime.lastError);
            else
                log("tab disconnected");
        });

        port.onMessage.addListener(msg => {
            if (msg.state) {
                injectState = msg.state;
                console.log(`set injectState to: ${injectState}`);
                if (injectState === 'inactive') {
                    statusSpan.innerText = "Inactive - open a video calling tab";

                } else if (injectState === 'loaded') {
                    statusSpan.innerText = "Waiting for media stream(s)";
                } else if (injectState === 'ready') {
                    statusSpan.innerText = "Stream acquired - start an impairment below";
                }
            }
            if (msg.command) {
                if (msg.command === 'pause')
                    inputRange.value = 3;
                else if (msg.command === 'moderate') {
                    inputRange.value = 2;
                } else if (msg.command === 'severe') {
                    inputRange.value = 1;
                } else {
                    log(`unhandled command: ${msg.command}`)
                }
            } else
                log(`unhandled incoming message from context: `, msg);

        });
    });

/*
btnStart.onclick = async () => {
    port.postMessage({command: 'start'});
    console.log('start click');
    btnStart.disabled = true;
    btnSevere.disabled = false;
    btnStop.disabled = false;
}

btnSevere.onclick = async () => {
    port.postMessage({command: 'severe'});
    console.log('severe click');
    btnStart.disabled = true;
    btnSevere.disabled = true;
    btnStop.disabled = false;
}

btnStop.onclick = async () => {
    port.postMessage({command: 'stop'});
    console.log('stop click');
    btnStart.disabled = false;
    btnSevere.disabled = true;
    btnStop.disabled = true;

}
 */

//console.log(inputRange);
inputRange.onchange = (e) => {
    let command;
    //console.log(e.target.value);
    switch (Number(e.target.value)) {
        case 3:
            command = 'pause';
            break;
        case 2:
            command = 'moderate';
            break;
        case 1:
            command = 'severe';
            break;
        default:
            console.log("invalid selection");
    }
    console.log(`${command} selected`);
    port.postMessage({command});


}
