async function workerFunction(){

    'use strict';

    console.log("I am a worker");

    let stopped = false;
    let videoFrameCounter = 0;
    let manualSendKeyFrame = false;
    let keyFrameRate = 30;
    let videoController, audioController;
    let delayMs = 500; // delay in ms
    let impair = false;

    const sleep = ms => new Promise((resolve) => setTimeout(resolve, ms));

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

    function addPacketLoss(chunk, type, loss, payloadSize) {
        let chunkWithLoss = new Uint8Array(chunk.byteLength);
        chunk.copyTo(chunkWithLoss);

        for (let n = 16; n <= chunkWithLoss.byteLength; n += payloadSize) {
            if (Math.random() <= loss)
                chunkWithLoss.fill(0, n, n + payloadSize);
        }
        const chunkObj = {
            timestamp: chunk.timestamp,
            type: chunk.type,
            data: chunkWithLoss
        };

        if (type === 'video')
            return new EncodedVideoChunk(chunkObj);
        else if (type === 'audio')
            return new EncodedAudioChunk(chunkObj);
    }


    // Decoders
    const videoDecoder = new VideoDecoder({
        output: async frame => {
            if (!stopped)
                await videoController.enqueue(frame);
            frame.close();
        },
        error: e => console.error(e.message)
    });
    videoDecoder.configure(videoConfig);

    const audioDecoder = new AudioDecoder({
        output: async frame => {
            if (!stopped)
                await audioController.enqueue(frame);
            frame.close();
        },
        error: e => console.error(e.message)
    });
    audioDecoder.configure(audioConfig);


    // Encoders
    const videoEncoder = new VideoEncoder({
        output: async (chunk, metadata) => {
            if (metadata.decoderConfig) {
                console.log("video metadata", metadata)
            }
            const modifiedChunk = addPacketLoss(chunk, 'video', 0.005, 90);
            await sleep(delayMs);
            videoDecoder.decode(modifiedChunk);
        },
        error: e => console.error(e.message)
    });
    videoEncoder.configure(videoConfig);

    const audioEncoder = new AudioEncoder({
        output: async (chunk, metadata) => {
            if (metadata.decoderConfig) {
                console.log("video metadata", metadata)
            }
            const modifiedChunk = addPacketLoss(chunk, 'audio', 0.4, 200);
            await sleep(delayMs);
            audioDecoder.decode(modifiedChunk);
        },
        error: e => console.error(e.message)
    });
    audioEncoder.configure(audioConfig);

    // Message handler
    onmessage = async (event) => {
        const {operation, kind, reader, writer, settings} = event.data;
        // ToDo: settings

        if (operation === 'impair')
            impair = true;
        else if (operation === 'normal'){
            impair = false;
        }
        else if (operation === 'init') {
            if (kind === 'video') {
                console.log("processing video");

                // ToDo: error check these
                videoConfig.height = settings.height;
                videoConfig.width = settings.width;
                videoConfig.framerate = settings.frameRate;     // Note: different camelCase :(
                // ToDo: make sure to use the same codec - get encoding params

                await reader
                    // .pipeThrough(new TransformStream({transform}))
                    .pipeThrough(new TransformStream({
                        start: controller => videoController = controller,
                        transform: async (frame) => {
                            if (stopped) {
                                frame.close();
                                videoEncoder.flush();
                                videoEncoder.close();
                            } else if (videoEncoder.encodeQueueSize > 2) {
                                console.log("video encoder overwhelmed, dropping frame", frame)
                                frame.close();
                            } else {
                                const keyFrame = videoFrameCounter % keyFrameRate === 0 || manualSendKeyFrame;

                                if (manualSendKeyFrame) {
                                    console.log(`set ${videoFrameCounter} to keyframe`);
                                    manualSendKeyFrame = false;
                                    manualSendKeyFrame.disabled = false;
                                }
                                videoFrameCounter++;

                                if(impair)
                                    await videoEncoder.encode(frame, {keyFrame});
                                else
                                    await videoController.enqueue(frame);
                                frame.close();
                            }
                        },
                        flush: (controller) => {
                            controller.terminate();
                        }
                    }))
                    .pipeTo(writer);
            } else if (kind === 'audio') {
                console.log("processing audio");
                
                /*
                channelCount: 1
                deviceId: "bd2f9335-5039-4034-8c80-06c8ef25f6ea"
                latency: 0.01
                sampleRate: 48000
                sampleSize: 16
                 */
                
                audioConfig.numberOfChannels = settings.channelCount;
                audioConfig.sampleRate = settings.sampleRate;
                
                await reader
                    .pipeThrough(new TransformStream({
                        start: controller => audioController = controller,
                        transform: async (frame) => {

                            if (stopped) {
                                frame.close();
                                audioEncoder.flush();
                                audioEncoder.close();
                            } else if (audioEncoder.encodeQueueSize > 2) {
                                console.log("audio encoder overwhelmed, dropping frame", frame)
                                frame.close();
                            } else {
                                if(impair)
                                    await audioEncoder.encode(frame);
                                else
                                    await audioController.enqueue(frame);
                                // audioFrameCounter++;
                                frame.close();
                            }
                        },
                        flush: (controller) => {
                            // console.log("stream cancelled", controller);
                            controller.terminate();
                        }
                    }))
                    .pipeTo(writer);
            }
        } else if (operation === 'stop') {
            console.log("stopping stream");
            stopped = true;
            // await videoReader.cancel(); // no cancel method
        } else {
            console.error(`Unknown operation ${operation}`);
        }
    };


}
