'use strict';
/*
 * Class that sets up a transform stream that can add an impairment
 */
class Impairment {
    #controller;
    #operation = 'passthrough';
    #encoder;
    #decoder;
    #frameCounter = 0;

    // Todo: expose a way to set these
    loss = 0.005;
    payloadSize = 90;
    keyFrameInterval = 150;
    delayMs = 500;
    transformStream;

    constructor(kind, id, settings) {

        this.kind = kind;
        this.id = id;           // for debugging
        this.settings = settings;

        // Default configs
        let videoConfig = {
            codec: "vp8",
            width: 640,
            height: 480,
            bitrate: 2_000_000,
            framerate: 30,
        };

        let audioConfig = {
            numberOfChannels: 1,
            sampleRate: 48_000,
            codec: 'opus',
            bitrate: 40_000
        }

        let config = {};
        if (kind === 'video') {
            config = videoConfig;
            config.height = settings.height;                // ToDo: error check these
            config.width = settings.width;
            config.framerate = settings.frameRate;     // Note: different camelCase :(
            // ToDo: make sure to use the same codec - get encoding params
        } else if (kind === "audio") {
            config = audioConfig;
            config.numberOfChannels = settings.channelCount;
            config.sampleRate = settings.sampleRate;
        } else{
            return new Error(`invalid kind. kind needs to be audio or video. set to ${kind}`);
        }

        this.config = config;

        this.#setupCodec(kind, config);

        this.transformStream = new TransformStream({
            start: (controller) => this.#controller = controller,
            transform: async (frame) => {
                if (this.#operation === 'kill') {
                    frame.close();
                    this.#encoder.flush();
                    this.#encoder.close();
                } else if (this.#encoder.encodeQueueSize > 2) {
                    Impairment.#debug(`${kind} encoder overwhelmed, dropping frame`, frame)
                    frame.close();
                } else {
                    const keyFrame = this.#frameCounter % this.keyFrameInterval === 0;
                    this.#frameCounter++;

                    if (this.#operation === 'impair') {
                        await this.#encoder.encode(frame, kind === 'video' ? {keyFrame} : null);
                    } else if (this.#operation === 'passthrough') {
                        await this.#controller.enqueue(frame);
                    } else {
                        Impairment.#debug(`invalid operation: ${this.#operation}, closing`);
                        this.#operation = 'kill';
                    }
                    frame.close();
                }
            },
            flush: (controller) => {
                controller.terminate();
            }
        })

    }

    static #debug(...messages) {
        console.debug(`vch 💉😈 `, ...messages);
    }

    async #sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    #addPacketLoss(chunk, kind) {
        let chunkWithLoss = new Uint8Array(chunk.byteLength);
        chunk.copyTo(chunkWithLoss);

        for (let n = 16; n <= chunkWithLoss.byteLength; n += this.payloadSize) {
            if (Math.random() <= this.loss)
                chunkWithLoss.fill(0, n, n + this.payloadSize);
        }
        const chunkObj = {
            timestamp: chunk.timestamp,
            type: chunk.type,
            data: chunkWithLoss
        };

        if (kind === 'video')
            return new EncodedVideoChunk(chunkObj);
        else if (kind === 'audio')
            return new EncodedAudioChunk(chunkObj);
    }

    // WebCodecs setup
    #setupCodec(kind, codecConfig) {
        const handleDecodedFrame = async frame => {
            if (this.#operation !== 'kill')
                await this.#controller.enqueue(frame);
            frame.close();
        }

        const handleEncodedFrame = async (chunk, metadata) => {
            if (metadata.decoderConfig) {
                debug(`${kind} metadata: `, metadata)
            }
            const modifiedChunk = this.#addPacketLoss(chunk, kind);
            await this.#sleep(this.delayMs);
            this.#decoder.decode(modifiedChunk);
        }

        if (kind === 'video') {
            // Video decode
            this.#decoder = new VideoDecoder({output: handleDecodedFrame, error: debug});
            this.#decoder.configure(codecConfig);
            // Video encode
            this.#encoder = new VideoEncoder({output: handleEncodedFrame, error: debug});
            this.#encoder.configure(codecConfig);
        } else if (kind === 'audio') {
            // Audio decode
            this.#decoder = new AudioDecoder({output: handleDecodedFrame, error: debug});
            this.#decoder.configure(codecConfig);
            // Audio encode
            this.#encoder = new AudioEncoder({output: handleEncodedFrame, error: debug});
            this.#encoder.configure(codecConfig);
        }
    }

    start() {
        this.#operation = "impair";
        Impairment.#debug(`processing ${this.kind} ${this.id}`);
    }

    pause() {
        this.#operation = "passthrough";
        Impairment.#debug(`removing impairment on ${this.kind} ${this.id}`);
    }

    stop() {
        this.#operation = "kill";
        Impairment.#debug(`stopping ${this.kind} ${this.id}`);
    }
}


const appEnabled = true;
const vchStreams = [];
const vchTransforms = [];
// ToDo: remove these for prod
window.vchStreams = vchStreams;
window.vchTransforms = vchTransforms;

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

    if (message === 'start') {
        vchTransforms.forEach(transform => transform.start());
        debug(`impairment started on ${vchTransforms.length} stream(s)`);
    } else if (message === 'stop') {
        vchTransforms.forEach(transform => transform.pause());
        debug(`impairment stopped on ${vchTransforms.length} stream(s)`);
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

        origStream.getTracks().forEach(track => {

            const {kind, id} = track;
            const settings = track.getSettings();

            const generator = new MediaStreamTrackGenerator({kind});
            const writer = generator.writable;

            const processor = new MediaStreamTrackProcessor(track);
            const reader = processor.readable;

            // ToDo: invoke the transform stream without worker here
            debug("settings before, ", settings);
            const impairment = new Impairment(kind, id, settings);
            vchTransforms.push(impairment);

            newStream.addTrack(generator);
            debug(`new ${kind} track: ${id}`, settings);

            reader
                .pipeThrough(impairment.transformStream)
                .pipeTo(writer)
                .catch(err => debug("Insertable stream error:", err));
        });

        // debug(`original stream: ${origStream.id}:`, origStream.getTracks());
        // debug(`replacement stream: ${newStream.id}:`, newStream.getTracks());
        vchStreams.push(newStream);

        /* Note: Jitsi uses the track.getSettings for its virtual backgrounds - frameRate, height, etc.
         * These were not available right away. Adding the delay fixes it
         * ToDo: experiment with delay timing
         */
        await sleep(200);
        if (!streamError) {
            sendMessage('popup', 'state', {state: 'ready'})
            return newStream;
        } else {
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


