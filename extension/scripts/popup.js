const statusSpan = document.querySelector('span#gumStatus');
const btn = document.querySelector('button');
let injectState;

function log(...messages) {
    if (messages.length > 1 || typeof messages[0] === 'object')
        console.log(`🐰 ️${JSON.stringify(...messages)}`);
    else
        console.log(`🐰 ️`, ...messages);
}

async function getTabInfo() {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    const {id, url} = tab;
    // log(`popup page open for tab ${id} for ${url}`);
    return {id, url}
}

//const {tabId, tabUrl} = await getTabInfo();
let tabId, tabUrl;
getTabInfo().then(
    (tabInfo) => {
        tabId = tabInfo.id;
        tabUrl = tabInfo.url;
        console.log(`popup page open for tab ${tabId} for ${tabUrl}`);
    }
);

// wrapper
async function sendMessage(to, message, data, responseHandler = null) {
    const messageToSend = {
        from: "popup",
        to: to,
        message: message,
        data: data
    };

    await chrome.tabs.query({active: true, currentWindow: true}, async tabs => {
        await chrome.tabs.sendMessage(tabs[0].id, messageToSend, {}, responseHandler)
    });
}

// ToDo: this doesn't do anything
chrome.runtime.onMessage.addListener(
    (request, sender) => {
        log(request);
        // log(`DEBUG: from ${sender.tab ? sender.tab.id : "unknown"}`, request, sender);

        const {to, from, message, data} = request;
        if (to !== 'popup')
            return
        log(message);
        if (message === 'state')
            statusSpan.innerText = data.state;

    });


btn.onclick = async () => {
    await sendMessage('tab', 'click');
    console.log('click');
}
/*
// ToDo: this doesn't do anything
// look at this - needs backround.js: https://stackoverflow.com/questions/39730493/chrome-extension-detect-when-popup-window-closes
onbeforeunload = async ()=>{
    await sendMessage('inject', 'closed');
    alert('I tried');
}

 */


sendMessage('inject', 'open', {}, (response) => {
    injectState = response.state;
    statusSpan.innerText = injectState;
})
    .catch(err => console.error(err));

