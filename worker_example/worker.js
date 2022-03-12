'use strict';

console.log("I am a worker");

let stopped = false;
let videoFrameCounter = 0;
let manualSendKeyFrame = false;
let keyFrameRate = 30;
let videoController, audioController;
let delayMs = 500; // delay in ms

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


// reference: https://github.com/webrtc/samples/blob/gh-pages/src/content/insertable-streams/video-crop/js/worker.js

// Message handler
onmessage = async (event) => {
    const {operation} = event.data;

    if (operation === 'video') {
        console.log("processing video");
        const {videoReader, videoWriter} = event.data;
        await videoReader
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

                        /*
                        if(keyFrame){
                            console.log("sent keyframe", frame);
                        }
                         */

                        if (manualSendKeyFrame) {
                            console.log(`set ${videoFrameCounter} to keyframe`);
                            manualSendKeyFrame = false;
                            manualSendKeyFrame.disabled = false;
                        }
                        videoFrameCounter++;
                        await videoEncoder.encode(frame, {keyFrame});
                        frame.close();
                    }
                },
                flush: (controller) => {
                    // console.log("stream cancelled", controller, videoReader);
                    controller.terminate();
                    // note: these crash Chrome
                    // videoReader.close();
                    // videoReader.releaseLock()
                }
            }))
            .pipeTo(videoWriter);
    }
    else if (operation === 'audio') {
        console.log("processing audio");
        const {audioReader, audioWriter} = event.data;
        await audioReader
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
                        await audioEncoder.encode(frame);
                        // audioFrameCounter++;
                        frame.close();
                    }
                },
                flush: (controller) => {
                    // console.log("stream cancelled", controller);
                    controller.terminate();
                }
            }))
            .pipeTo(audioWriter);
    } else if (operation === 'stop') {
        console.log("stopping stream");
        stopped = true;
        // await videoReader.cancel(); // no cancel method
    } else {
        console.error(`Unknown operation ${operation}`);
    }
};
