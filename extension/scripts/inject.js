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
    kind;
    codecConfig;
    impairmentConfig;
    id;
    trackSettings;

    // Default configs
     #videoCodecConfig = {
        codec: "vp8",
        width: 640,
        height: 480,
        bitrate: 2_000_000,
        framerate: 30,
    };

    #audioCodecConfig = {
        numberOfChannels: 1,
        sampleRate: 48_000,
        codec: 'opus',
        bitrate: 40_000
    }

    // Todo: expose a way to set these
    loss = 0.005;
    payloadSize = 90;
    keyFrameInterval = 100;
    delayMs = 500;


    // ToDo: apply the impairment to the track settings
    constructor(kind, id, trackSettings, impairmentConfig) {

        this.kind = kind;
        this.id = id;           // for debugging
        this.trackSettings = trackSettings;
        this.impairmentConfig = impairmentConfig;

        this.#applyConfig();

        /*
        if (kind === 'video') {
            const {height, width, frameRate} = trackSettings;
            const {widthFactor, heightFactor, framerateFactor} = impairmentConfig.video;

            this.codecConfig = {
                codec: "vp8",
                width: (width / (widthFactor || 1)).toFixed(0),
                height: (height / (heightFactor || 1)).toFixed(0),
                framerate: (frameRate / (framerateFactor || 1)).toFixed(0)
            }

            // debug(this.codecConfig);

            const {loss, payloadSize, keyFrameInterval, delayMs} = impairmentConfig.video;
            this.loss = loss || 0;
            this.payloadSize = payloadSize || 90;
            this.keyFrameInterval = keyFrameInterval || 100;
            this.delayMs = delayMs || 10;

        } else if (kind === "audio") {
            const {channelCount, sampleRate} = trackSettings;
            const {loss, payloadSize, delayMs, bitrate} = impairmentConfig.audio;
            this.codecConfig = {
                codec: 'opus',
                numberOfChannels: channelCount || 1,
                sampleRate: sampleRate,
                bitrate: Math.max(bitrate || 12_000, 6000)
            }

            this.loss = loss || 0;
            this.payloadSize = payloadSize || 400;
            this.delayMs = delayMs || 10;

        } else{
            return new Error(`invalid kind. kind needs to be audio or video. set to ${kind}`);
        }
        // this.config = codecConfig;
        this.#setupCodec(kind, this.codecConfig);

         */

    }

    static #debug(...messages) {
        console.debug(`vch 💉😈 `, ...messages);
    }

    async #sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    // ToDo: update impairment values here
    #addPacketLoss(chunk) {
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

        if (this.kind === 'video')
            return new EncodedVideoChunk(chunkObj);
        else if (this.kind === 'audio')
            return new EncodedAudioChunk(chunkObj);
    }

    // WebCodecs setup
    #setupCodec(codecConfig) {
        const handleDecodedFrame = async frame => {
            if (this.#operation !== 'kill')
                await this.#controller.enqueue(frame);
            frame.close();
        }

        const handleEncodedFrame = async (chunk, metadata) => {
            if (metadata.decoderConfig) {
                debug(`${this.kind} metadata: `, metadata)
            }
            const modifiedChunk = this.#addPacketLoss(chunk, this.kind);
            await this.#sleep(this.delayMs);
            this.#decoder.decode(modifiedChunk);
        }

        if (this.kind === 'video') {
            // Video decode
            this.#decoder = new VideoDecoder({output: handleDecodedFrame, error: debug});
            this.#decoder.configure(codecConfig);
            // Video encode
            this.#encoder = new VideoEncoder({output: handleEncodedFrame, error: debug});
            this.#encoder.configure(codecConfig);
        } else if (this.kind === 'audio') {
            // Audio decode
            this.#decoder = new AudioDecoder({output: handleDecodedFrame, error: debug});
            this.#decoder.configure(codecConfig);
            // Audio encode
            this.#encoder = new AudioEncoder({output: handleEncodedFrame, error: debug});
            this.#encoder.configure(codecConfig);
        }
    }

    #applyConfig(){
        if(this.kind==='video'){
            const {height, width, frameRate} = this.trackSettings;
            const {widthFactor, heightFactor, framerateFactor} = this.impairmentConfig.video;

            // Configure the codec
            this.codecConfig = {
                codec: "vp8",
                width: (width / (widthFactor || 1)).toFixed(0),
                height: (height / (heightFactor || 1)).toFixed(0),
                framerate: (frameRate / (framerateFactor || 1)).toFixed(0)
            }

            // Set up the impairment
            const {loss, payloadSize, keyFrameInterval, delayMs} = this.impairmentConfig.video;
            this.loss = loss || 0;
            this.payloadSize = payloadSize || 90;
            this.keyFrameInterval = keyFrameInterval || 100;
            this.delayMs = delayMs || 10;
        }
        else if(this.kind === 'audio'){
            // Configure the codec
            const {channelCount, sampleRate} = this.trackSettings;
            const {loss, payloadSize, delayMs, bitrate} = this.impairmentConfig.audio;

            this.codecConfig = {
                codec: 'opus',
                numberOfChannels: channelCount || 1,
                sampleRate: sampleRate,
                bitrate: Math.max(bitrate || 10_000, 6000)
            }

            // Set up the impairment
            this.loss = loss || 0;
            this.payloadSize = payloadSize || 400;
            this.delayMs = delayMs || 10;
        }

        this.#setupCodec(this.codecConfig);

    }

    get transformStream(){
        return new TransformStream({
            start: (controller) => this.#controller = controller,
            transform: async (frame) => {
                if (this.#operation === 'kill') {
                    frame.close();
                    this.#encoder.flush();
                    this.#encoder.close();
                } else if (this.#encoder.encodeQueueSize > 2) {
                    Impairment.#debug(`${this.kind} encoder overwhelmed, dropping frame`, frame)
                    frame.close();
                } else {
                    const keyFrame = this.#frameCounter % this.keyFrameInterval === 0;
                    this.#frameCounter++;

                    if (this.#operation === 'impair') {
                        await this.#encoder.encode(frame, this.kind === 'video' ? {keyFrame} : null);
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


    set config(config){
        this.impairmentConfig = config;
        this.#applyConfig();
        this.#decoder.configure(this.codecConfig);
        this.#encoder.configure(this.codecConfig);
    }

    set #configBad(config){
        if(this.kind==='audio'){
            //const

            const {bitrate} = config;
            this.codecConfig.bitrate = bitrate;
        }
        else if(this.kind==='video'){
            const {loss, payloadSize, keyFrameInterval, delayMs} = config;
            this.impairmentConfig.video = {
                loss: loss || this.loss,
                payloadSize: payloadSize || this.payloadSize,
                keyFrameInterval: keyFrameInterval || this.keyFrameInterval,
                delayMs: delayMs || this.delayMs
            }

            const {width, height, bitrate, framerate} = config;
            this.codecConfig = {
                codec: this.codecConfig.codec,
                width: width || this.codecConfig.width,
                height: height || this.codecConfig.height,
                bitrate: bitrate || this.codecConfig.bitrate,
                framerate: framerate || this.codecConfig.framerate
            }

        }
        this.#decoder.configure(this.codecConfig);
        this.#encoder.configure(this.codecConfig);

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
    debug(e.detail);

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
    } else if(message === 'severe'){
        // ToDo:
        const impairmentConfig = {
            audio: {
                loss: 0.40,
                payloadSize: 600,
                delayMs: 600,
                // codec config
                bitrate: 6_000
            },
            video: {
                loss: 0.01,
                payloadSize:  90,
                keyFrameInterval: 15,
                delayMs: 500,
                // codec config
                widthFactor: 4,
                heightFactor: 4,
                bitrate: 350_000,
                framerateFactor: 4
            }
        }
        vchTransforms.forEach(transform => transform.config = impairmentConfig);
        debug(`impairment set to severe on ${vchTransforms.length} stream(s)`);

    }
    else if (message === 'stop') {
        vchTransforms.forEach(transform => transform.pause());
        debug(`impairment stopped on ${vchTransforms.length} stream(s)`);
    }
    else{
        // debug(`unhandled incoming message: ${message}`);
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

            const impairmentConfig = {
                audio: {
                    loss: 0.20,
                    payloadSize: 400,
                    delayMs: 500,
                    // codec config
                    bitrate: 12_000
                },
                video: {
                    loss: 0.005,
                    payloadSize:  90,
                    keyFrameInterval: 30,
                    delayMs: 250,
                    // codec config
                    widthFactor: 2,
                    heightFactor: 2,
                    bitrate: 750_000,
                    framerateFactor: 2
                }
            }

            const impairment = new Impairment(kind, id, settings, impairmentConfig);
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


