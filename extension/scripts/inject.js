'use strict';
(function () {

    /*
     * Class that sets up a transform stream that can add an impairment
     * The constructor and takes a track settings object and an  impairment config object
     *  and returns a Transform Stream object set to `passthrough`
     * The Encoder/Decoder with impairment is invoked of the operation = `impair`
     * 'passthrough' just pushes the frame through without modification
     * The start function changes the operation to 'impair'
     * The config setter applies an impairment configuration
     * Static clesses are included for a moderation and severe impairment
     */
    class Impairment {
        #controller;
        operation = 'passthrough';
        #encoder;
        #decoder;
        #frameCounter = 0;
        #forceKeyFrame = false;

        kind;
        codecConfig;
        impairmentConfig;
        id;
        track;
        trackSettings;

        static moderateImpairmentConfig = {
            audio: {
                loss: 0.25,
                payloadSize: 400,
                delayMs: 500,
                // codec config
                bitrate: 10_000
            },
            video: {
                loss: 0.0025,
                payloadSize: 90,
                keyFrameInterval: 30,
                delayMs: 250,
                // codec config
                widthFactor: 2,
                heightFactor: 2,
                bitrate: 750_000,
                framerateFactor: 2
            }
        }

        static severeImpairmentConfig = {
            audio: {
                loss: 0.50,
                payloadSize: 400,
                delayMs: 700,
                // codec config
                bitrate: 6_000
            },
            video: {
                loss: 0.05,
                payloadSize: 90,
                keyFrameInterval: 15,
                delayMs: 500,
                // codec config
                widthFactor: 4,
                heightFactor: 4,
                bitrate: 300_000,
                framerateFactor: 4
            }
        }

        // Placeholder impairment values
        loss = 0.005;
        payloadSize = 90;
        keyFrameInterval = 100;
        delayMs = 200;

        // ToDo: apply the impairment to the track settings
        constructor(track, impairmentConfig = Impairment.moderateImpairmentConfig) {

            this.track = track;
            this.kind = track.kind;
            this.id = track.id;
            this.trackSettings = track.getSettings();// trackSettings;
            this.impairmentConfig = impairmentConfig;

            this.#loadConfig();
            this.#setupCodec();
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

            // getStats analysis showed the headers are ~30 bytes on video;
            // could do the math based on details here: https://datatracker.ietf.org/doc/html/rfc6386#section-9.1
            // errors return if the video header isn't included
            // audio works fine without any header - including it includes some audio information, so ruins the effect
            for (let n = this.kind === 'audio' ? 0 : 16; n <= chunkWithLoss.byteLength; n += this.payloadSize) {
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
        #setupCodec() {
            const handleDecodedFrame = frame => {
                if (this.operation === 'kill') {
                    frame.close();
                } else {
                    try {
                        this.#controller.enqueue(frame)
                    } catch (err) {
                        Impairment.#debug("controller enqueue error", err);
                    }
                }
            }

            const handleEncodedFrame = async (chunk, metadata) => {
                if (metadata.decoderConfig) {
                    Impairment.#debug(`${this.kind} metadata: `, metadata);
                }
                const modifiedChunk = this.#addPacketLoss(chunk, this.kind);
                await this.#sleep(this.delayMs);

                // this.#decoder.decode(modifiedChunk)

                // ToDo: figure out how to make sure this has a keyframe after configure
                // hypothesis: packets caught in sleep function
                // add something like if(this.#frameIgnore
                try {
                    this.#decoder.decode(modifiedChunk)
                } catch (err) {
                    Impairment.#debug(`frame ${this.#frameCounter}`, err)
                }
            }

            if (this.kind === 'video') {
                // Video decode
                this.#decoder = new VideoDecoder({output: handleDecodedFrame, error: debug});
                this.#decoder.configure(this.codecConfig);
                // Video encode
                this.#encoder = new VideoEncoder({output: handleEncodedFrame, error: debug});
                this.#encoder.configure(this.codecConfig);
            } else if (this.kind === 'audio') {
                // Audio decode
                this.#decoder = new AudioDecoder({output: handleDecodedFrame, error: debug});
                this.#decoder.configure(this.codecConfig);
                // Audio encode
                this.#encoder = new AudioEncoder({output: handleEncodedFrame, error: debug});
                this.#encoder.configure(this.codecConfig);
            }
        }

        #loadConfig() {
            if (this.kind === 'video') {
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
            } else if (this.kind === 'audio') {
                // Configure the codec
                const {channelCount, sampleRate} = this.trackSettings;
                const {loss, payloadSize, delayMs, bitrate} = this.impairmentConfig.audio;

                this.codecConfig = {
                    codec: 'opus',
                    numberOfChannels: channelCount || 1,
                    sampleRate: sampleRate,
                    bitrate: Math.max(bitrate || 10_000, 6_000)
                }

                // Set up the impairment
                this.loss = loss || 0;
                this.payloadSize = payloadSize || 400;
                this.delayMs = delayMs || 10;
            }

        }

        get transformStream() {
            return new TransformStream({
                start: (controller) => this.#controller = controller,
                transform: async (frame) => {
                    if (this.operation === 'kill' || this.track.readyState === 'ended') {
                        this.#encoder.flush();
                        this.#encoder.close();
                        this.#decoder.flush();
                        this.#decoder.close();
                        debug(`this impairment track ${this.id} closed`);
                    } else if (this.#encoder.encodeQueueSize > 2) {
                        Impairment.#debug(`${this.kind} encoder overwhelmed, dropping frame`, frame)
                        frame.close();
                    } else {
                        // Start webcodecs for impairment
                        if (this.operation === 'impair') {
                            const keyFrame = this.#frameCounter % this.keyFrameInterval === 0 || this.#forceKeyFrame;
                            if (this.#forceKeyFrame) {
                                Impairment.#debug(`set ${this.#frameCounter} to keyframe`);
                                this.#forceKeyFrame = false;
                            }
                            this.#frameCounter++;
                            await this.#encoder.encode(frame, this.kind === 'video' ? {keyFrame} : null);
                        }
                        // Do nothing and re-enqueue the frame
                        else if (this.operation === 'passthrough') {
                            await this.#controller.enqueue(frame);
                        }
                        // Drop the frame
                        else if (this.operation === 'skip') {
                            // ToDo: skip in the case of track.readyState === 'live' and track.enabled = false indicating muted status?
                            // Impairment.#debug("skipping frame");
                        }
                        // Something went wrong
                        else {
                            Impairment.#debug(`invalid operation: ${this.operation}`);
                        }
                        frame.close();
                    }
                },
                flush: (controller) => {
                    // from https://streams.spec.whatwg.org/#transformstream: (Note that there is no need to call
                    // controller.terminate() inside flush(); the stream is already in the process of successfully closing
                    // down, and terminating it would be counterproductive.)
                    // controller.terminate();
                }
            })
        }

        set config(config) {
            this.impairmentConfig = config;

            this.#encoder.flush().then(() => {
                this.#loadConfig();
                this.#encoder.configure(this.codecConfig);
                this.#decoder.configure(this.codecConfig);
                this.#forceKeyFrame = true;
                this.#decoder.flush();
            }).catch(err => Impairment.#debug(`codec config error at frame ${this.#frameCounter}`, err))

            Impairment.#debug(`New configuration. Operation state: ${this.operation}. Config: `, config)
        }

        start() {
            this.operation = "impair";
            Impairment.#debug(`start: processing ${this.kind} ${this.id}`);
        }

        pause() {
            this.operation = "passthrough";
            Impairment.#debug(`passthrough: removing impairment on ${this.kind} ${this.id}`);
        }

        async stop() {
            this.operation = "kill";
            await this.#sleep(100); // give some time to finalize the last frames
            Impairment.#debug(`kill: stopped ${this.kind} ${this.id}`);
        }
    }

    const appEnabled = true;
    const vchStreams = [];
    const vchImpairments = [];
// ToDo: remove these for prod
// window.vchStreams = vchStreams;
    window.vchTransforms = vchImpairments;

    let sliderState = "uninitialized";

    function debug(...messages) {
        console.debug(`vch 💉 `, ...messages);
    }

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
        debug('vch event listener', e.detail);

        // Don't react to inject's own events
        if (e.detail?.from === 'inject') {
            return
        }
        const message = e.detail;

        // Message handler
        if (!['pause', 'moderate', 'severe'].includes(message)) {
            debug(`unhandled vch message:`, message);
            return
        }
        sliderState = message;

        vchImpairments.forEach(impairment => {
            // skip inactive impairments
            if (impairment.track.readyState === 'ended') {
                impairment.operation = 'kill';
                debug(`track ${this?.id} no longer active`);
                return;
            }

            if (message === 'moderate') {
                impairment.config = Impairment.moderateImpairmentConfig;
                if (impairment.operation === 'passthrough') {
                    debug(`moderate impairment from ${impairment.operation} to "start"`);
                    impairment.start();
                } else {
                    debug(`moderate impairment set on stream `);
                }
            } else if (message === 'severe') {
                impairment.config = Impairment.severeImpairmentConfig;
                if (impairment.operation === 'passthrough') {
                    debug(`severe impairment from ${impairment.operation} to "start"`);
                    impairment.start();
                } else {
                    debug(`moderate impairment set on stream`);
                }
            } else if (message === 'pause') {
                impairment.pause();
                debug(`impairment paused on stream`);
            }
        });
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

                const generator = new MediaStreamTrackGenerator({kind: track.kind});
                const writer = generator.writable;

                const processor = new MediaStreamTrackProcessor(track);
                const reader = processor.readable;

                let impairmentConfig;
                if (sliderState === 'severe')
                    impairmentConfig = Impairment.severeImpairmentConfig;
                else
                    impairmentConfig = Impairment.moderateImpairmentConfig;
                const impairment = new Impairment(track, impairmentConfig);

                if (sliderState === 'moderate' || sliderState === 'severe')
                    impairment.start();

                vchImpairments.push(impairment);

                // ToDo: these track ended events aren't working - need to handle stopped tracks better
                /*
                track.onended = async () => {
                    const idx = vchStreams.findIndex(impairment => impairment.id === id);
                    await vchStreams[idx].stop();
                    if (idx > -1)
                        vchStreams.splice(idx, 1);
                    debug(`stream ${id} ended and impairment removed.`);
                }
                */

                track.addEventListener('ended', () => {
                    debug(`'ended' event: ${track.kind} track ${track.id}`)
                });

                newStream.addTrack(generator);
                debug(`new ${track.kind} track: ${track.id}`);

                reader
                    .pipeThrough(impairment.transformStream)
                    .pipeTo(writer)
                    .catch(async err => {
                        // ToDo: still seeing situations when the source stream should be closed and the impairment track exists
                        if (generator.readyState === 'ended') {
                            await reader.cancel("track ended");
                            debug(`${generator.kind} track ${generator.id} ended`);

                            const impairmentIdx = vchImpairments.findIndex(imp => imp.id === track.id);
                            if (impairmentIdx > -1)
                                vchImpairments.splice(impairmentIdx, 1);
                            else
                                debug(`ERROR: unable to remove impairment on track ${track.id} on stream ${newStream.id}`);
                        } else {
                            debug(`Insertable stream error on stream ${newStream.id}`, err);
                            // Extra debugging
                            // debug(newStream);
                            // newStream.getTracks().forEach(track => debug(`track ${track.id} status is ${track.readyState}`, track));
                        }
                    });

            });

            // debug(`original stream: ${origStream.id}:`, origStream.getTracks());
            // debug(`replacement stream: ${newStream.id}:`, newStream.getTracks());
            vchStreams.push(newStream);

            /* Note: Jitsi uses the track.getSettings for its virtual backgrounds - frameRate, height, etc.
             * These were not available right away. Adding the delay fixes it
             * ToDo: experiment with delay timing
             */
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (!streamError) {
                sendMessage('popup', 'state', {state: 'ready'})
                return newStream;
            } else {
                // ToDo: error handler
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

}());
