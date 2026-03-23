/*
 * Vendetta Plugin
 * FakeDeafen - Fake deafens you so you still hear things.
 */

import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
}

const VoiceStateStore = findByProps("getVoiceStatesForChannel", "getCurrentClientVoiceChannelId");
const SelectedChannelStore = findByProps("getVoiceChannelId");

let faking: boolean = false;
let origWS: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;

function log(text: string) {
    console.log(`[FakeDeafen] ${text}`);
}

// Patch the AUDIO_TOGGLE_SELF_DEAF flux action
function patchAudioToggle() {
    // Get the dispatcher to intercept voice state changes
    const Dispatcher = findByProps("dispatch", "subscribe");

    return before("dispatch", Dispatcher, (args) => {
        const action = args[0];

        if (action?.type === "AUDIO_TOGGLE_SELF_DEAF") {
            // Delay to let the UI update
            setTimeout(() => {
                const chanId = SelectedChannelStore.getVoiceChannelId();
                if (!chanId) return;

                const s = VoiceStateStore.getVoiceStateForChannel(chanId) as VoiceState;
                if (!s) return;

                const event = s.deaf || s.selfDeaf ? "undeafen" : "deafen";

                if (event === "deafen") {
                    faking = true;
                    origWS = WebSocket.prototype.send;

                    // Override original websocket prototype
                    WebSocket.prototype.send = function (data) {
                        const dataType = Object.prototype.toString.call(data);

                        switch (dataType) {
                            case "[object String]":
                                let obj: any;
                                try {
                                    obj = JSON.parse(data as string);
                                } catch {
                                    // Not a json!
                                    origWS.apply(this, [data]);
                                    return;
                                }

                                if (obj.d !== undefined && obj.d.self_deaf !== undefined && obj.d.self_deaf === false) {
                                    // Undeafen packet, discard it
                                    return;
                                }
                                break;

                            case "[object ArrayBuffer]":
                                const decoder = new TextDecoder("utf-8");
                                if (decoder.decode(data as ArrayBuffer).includes("self_deafs\x05false")) {
                                    // Undeafen packet, discard it
                                    return;
                                }
                                break;
                        }

                        // Pass data down to original websocket
                        origWS.apply(this, [data]);
                    };

                    showToast({
                        content: "Deafening is now faked. Please undeafen.",
                        duration: 3000,
                    });
                } else {
                    if (faking === true) {
                        faking = false;
                    } else {
                        WebSocket.prototype.send = origWS;

                        showToast({
                            content: "Fake deafen is now disabled.",
                            duration: 3000,
                        });
                    }
                }
            }, 100);
        }
    });
}

export const onLoad = () => {
    log("Loaded");
    origWS = WebSocket.prototype.send;
};

export const onUnload = () => {
    // Restore original WebSocket send if it was patched
    if (faking) {
        WebSocket.prototype.send = origWS;
    }
    log("Unloaded");
};

// Export the patch
export default patchAudioToggle();
