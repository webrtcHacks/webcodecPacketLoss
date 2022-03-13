'use strict';

const appEnabled = true;
const vchStreams = [];
const vchWorkers = [];
// ToDo: remove these for prod
window.vchStreams = vchStreams;
window.vchWorkers = vchWorkers;

function debug(...messages) {
    console.debug(`vch 💉 `, ...messages);
}

const sleep = ms => new Promise((resolve) => setTimeout(resolve, ms));

// let workerBlob;

function sendMessage(to = 'popup', message, data = {}) {
    debug(`dispatching "${message}" from inject to ${to} with data:`, data)

    if (!message) {
        debug("ERROR: no message in sendMessage request");
    }
    const messageToSend = {
        from: 'inject',
        to: to,
        message: message,
        data: data
    };

    const toContentEvent = new CustomEvent('vch', {detail: messageToSend});
    document.dispatchEvent(toContentEvent);
}

// Handle incoming messages
document.addEventListener('vch', async e => {
    //const {from, to, message, data} = e.detail;
    //debug(`message "${message}" from "${from}"`, e.detail);

    const message = e.detail;

    // Edge catching its own events
    /*
    if (from !== 'popup') {
        return
    }
     */
    // ToDp: message handler here

    if(message === 'start'){

        vchWorkers.forEach(worker=>{
            worker.postMessage({operation: 'impair'});
        });

        debug(`${vchWorkers.length} impairment worker(s) loaded`);

    }
});


if (!window.videoCallHelper) {

    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    async function shimGetUserMedia(constraints) {

        let streamError = false;

        // ToDo: handle separate calls to gUM
        const origStream = await origGetUserMedia(constraints);
        let newStream = new MediaStream();

        debug("gUM requested constraints", constraints);

        origStream.getTracks().forEach(track=>{

            const {kind, id} = track;
            const settings = track.getSettings();

            const generator = new MediaStreamTrackGenerator({kind});
            const writer = generator.writable;

            const processor = new MediaStreamTrackProcessor(track);
            const reader = processor.readable;

            debug(`new ${kind} track: ${id}`, settings);

            /*
            const workerScript = document.querySelector('script#vch_packet_loss_worker');
            const workerBlob = new Blob([workerScript.textContent], {
                type: "text/javascript"
            });
            debug(`worker script size ${workerBlob.size}`);
            // ToDo: error checking
            // workerScript.remove();
            // debug("removed worker script");
            debug(workerScript.innerHTML);

             */

            // note: `workerFunction` didn't always load in time when I loaded this in the beginning

            // note: the below doesn't work on Google Meet:
            // Failed to construct 'Worker': This document requires 'TrustedScriptURL' assignment.
            const workerBlob = new Blob(['(', workerFunction.toString(),')()'], {
                    type: "text/javascript"
                });


            // Tried this https://stackoverflow.com/questions/5408406/web-workers-without-a-separate-javascript-file

            // Note: the below didn't work: Failed to construct 'Worker': Script at 'chrome-extension://bhanoknolaefhhiogpmoghangjkmaicn/scripts/worker.js' cannot be accessed from origin 'https://webrtc.github.io'.
            // const worker = new Worker("chrome-extension://bhanoknolaefhhiogpmoghangjkmaicn/scripts/worker.js")

            // ToDo: the below doesn't work with Google apps - new TrustedScriptUrl Policy
            const worker = new Worker(URL.createObjectURL(workerBlob));
            vchWorkers.push(worker);

            worker.postMessage({operation: 'init', kind: kind, reader, writer, settings }, [reader, writer])
            worker.addEventListener('message', e=> debug(`worker message from ${kind}: `, e), false);
            newStream.addTrack(generator);
        });

        debug(`original stream: ${origStream.id}:`, origStream.getTracks());
        debug(`replacement stream: ${newStream.id}:`, newStream.getTracks());
        vchStreams.push(newStream);

        /* Note: Jitsi uses the track.getSettings for its virtual backgrounds - frameRate, height, etc.
         * These were not available right away. Adding the deplay fixes it
         * ToDo: experiment with delay timing
         */
        await sleep(200);
        if(!streamError){
            sendMessage('popup', 'state', {state: 'ready'})
            return newStream;
        }
        else{
            return origStream;
        }

    }

    navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!appEnabled) {
            return origGetUserMedia(constraints)
        }
        debug("navigator.mediaDevices.getUserMedia called");
        return await shimGetUserMedia(constraints);
    };

    let _webkitGetUserMedia = async function (constraints, onSuccess, onError) {
        if (!appEnabled) {
            return _webkitGetUserMedia(constraints, onSuccess, onError)
        }

        debug("navigator.webkitUserMedia called");
        try {
            debug("navigator.webkitUserMedia called");
            const stream = await shimGetUserMedia(constraints);
            return onSuccess(stream)
        } catch (err) {
            debug("_webkitGetUserMedia error!:", err);
            return onError(err);
        }
    };

    navigator.webkitUserMedia = _webkitGetUserMedia;
    navigator.getUserMedia = _webkitGetUserMedia;
    navigator.mediaDevices.getUserMedia = shimGetUserMedia;

    window.videoCallHelper = true;

    sendMessage('popup', 'state', {state: 'loaded'});

} else {
    debug("shims already loaded")
}

/*
 * debugging
 */

debug("injected");
