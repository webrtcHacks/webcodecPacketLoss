const statusSpan = document.querySelector('span#gumStatus');
const btnStart = document.querySelector('button#start');
const btnSevere= document.querySelector('button#severe');
const btnStop = document.querySelector('button#stop');

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
                if(injectState === 'ready'){
                    btnStart.disabled = false;
                }
            }
            else
                console.log(`unhandled incoming message from context: `, msg);

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
inputRange.onchange = (e)=>{
    let command;
    //console.log(e.target.value);
    switch(Number(e.target.value)){
        case 3:
            command = 'stop';
            break;
        case 2:
            command = 'start';
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
