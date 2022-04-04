const statusSpan = document.querySelector('span#status');
const inputRange = document.querySelector(' input[type=range]');
const moreInfoDiv = document.querySelector('div#more_info');
const infoBtn = document.querySelector('button#info');

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

infoBtn.onclick = ()=> moreInfoDiv.hidden = !moreInfoDiv.hidden;

// Todo: open an options page or the extension page
// can't open a chrome://extension page from the pop-up directly; could send ot the webstore page
// https://stackoverflow.com/questions/22761819/how-to-open-chrome-extension-page-programmatically
/*
document.querySelector('button#options').onclick = () => {
    window.open("chrome://extensions/?id=bhanoknolaefhhiogpmoghangjkmaicn")
}
 */

