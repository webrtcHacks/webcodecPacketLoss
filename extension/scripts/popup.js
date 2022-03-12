const statusSpan = document.querySelector('span#gumStatus');
const btn = document.querySelector('button');
let injectState;

function log(...messages) {
    if (messages.length > 1 || typeof messages[0] === 'object')
        console.log(`🐰 ️${JSON.stringify(...messages)}`);
    else
        console.log(`🐰 ️`, ...messages);
}

let tabId, tabUrl, port;
chrome.tabs.query({active: true, currentWindow: true})
    .then(tabs=>{
        const tab = tabs[0];
        tabId = tab.id;
        tabUrl = tab.url;
        console.log(`popup page open for tab ${tabId} for ${tabUrl}`);

        port = chrome.tabs.connect(tabId, {name: "vch"});
        // port.postMessage({popup: open});
        port.onMessage.addListener(msg=> {
            if(msg.state){
                injectState = msg.state;
                statusSpan.innerText = injectState;
                console.log(`set injectState to: ${injectState}`);
            }
            else
                console.log(`unhandled incoming message from context: `, msg);

        });
    });

btn.onclick = async () => {
    port.postMessage({command: 'start'});
    console.log('click');
}
