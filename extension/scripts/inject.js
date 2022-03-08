'use strict';

// ToDo: build process to import message module

const appEnabled = true;

function debug(...messages) {
    console.debug(`vch 💉 `, ...messages);
}

function sendMessage(to = 'all', message, data = {}) {
    debug(`dispatching "${message}" from inject to ${to} with data:`, data)

    if (!message) {
        debug("ERROR: no message in sendMessage request");
    }
    const messageToSend = {
        from: 'tab',
        to: to,
        message: message,
        data: data
    };

    const toContentEvent = new CustomEvent('vch', {detail: messageToSend});
    document.dispatchEvent(toContentEvent);
}

document.addEventListener('vch', async e => {
    const {from, to, message, data} = e.detail;

    // Edge catching its own events
    if (from === 'tab' || to !== 'tab') {
        return
    }
});


if (!window.videoCallHelper) {

    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    async function shimGetUserMedia(constraints) {

        // ToDo: don't copy the track if we end it changing it
        /*
        if(gumStream?.active)
            gumStream.getVideoTracks()[0].stop();
        const origStream = await origGetUserMedia(constraints);
        const trackCopy = origStream.getVideoTracks()[0].clone();
        gumStream = new MediaStream([trackCopy]);
        debug("got stream. Video track info: ", gumStream.getVideoTracks()[0].getSettings());
        sendMessage('all', "gum_stream_start");
        window.vchStreams.push(origStream); // for testing
        return origStream
                 */
        const stream = await origGetUserMedia(constraints);
        debug("got stream", stream);
        return stream
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

} else {
    debug("shims already loaded")
}

/*
 * debugging
 */

debug("injected");
