export type NoiseMode = "off" | "white" | "pink" | "brown";

interface Controller {
  start: (mode: NoiseMode) => void;
  stop: () => void;
  setVolume: (v: number) => void;
  dispose: () => void;
}

export function createAmbientNoise(): Controller {
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let volume = 0.2;

  const ensureContext = () => {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  const buildBuffer = (audioCtx: AudioContext, mode: NoiseMode): AudioBuffer => {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * 4;
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (mode === "white") {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } else if (mode === "pink") {
      // Paul Kellet's refined pink noise filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      // Brown (integrated white)
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    return buffer;
  };

  const stop = () => {
    if (source) {
      try {
        source.stop();
      } catch {
        // ignore: may already be stopped
      }
      source.disconnect();
      source = null;
    }
  };

  const start = (mode: NoiseMode) => {
    if (mode === "off") {
      stop();
      return;
    }
    const audioCtx = ensureContext();
    stop();
    const buffer = buildBuffer(audioCtx, mode);
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (!gain) {
      gain = audioCtx.createGain();
      gain.gain.value = volume;
      gain.connect(audioCtx.destination);
    }
    source.connect(gain);
    source.start();
  };

  const setVolume = (v: number) => {
    volume = Math.max(0, Math.min(1, v));
    if (gain) gain.gain.value = volume;
  };

  const dispose = () => {
    stop();
    if (gain) {
      gain.disconnect();
      gain = null;
    }
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
  };

  return { start, stop, setVolume, dispose };
}
