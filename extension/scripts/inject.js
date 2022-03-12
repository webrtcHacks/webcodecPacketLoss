'use strict';

const appEnabled = true;
const vchStreams = [];
// ToDo: remove
window.vchStreams = vchStreams;

function debug(...messages) {
    console.debug(`vch 💉 `, ...messages);
}

const sleep = ms => new Promise((resolve) => setTimeout(resolve, ms));

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
    const {from, to, message, data} = e.detail;

    // Edge catching its own events
    if (from !== 'popup') {
        return
    }
    debug(`message "${message}" from "${from}"`, e.detail);
    // ToDp: message handler here

    // debug(`some other message:`, e.detail);
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

            // todo: spawn worker
            reader.pipeThrough(new TransformStream({
                //start: controller => this.controller = controller;
                transform: async (frame, controller) => {
                    // ToDo: logic here
                    controller.enqueue(frame);
                }
            }))
                .pipeTo(writer)
                .catch(err=>{
                    debug("failed to add insertable stream", err);
                    streamError = true;
                });
            // reader.pipeTo(writer);
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
