// All sound is synthesized live with WebAudio: an engine drone tied to the
// throttle, wind tied to airspeed, and little chimes for rings and landings.
// No audio files, no network. Silent until the first user gesture.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
    } catch {
      return false;
    }
    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 62;
    engineOsc2 = context.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 93;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(context.destination);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise through a band-pass, louder and brighter with speed.
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = context.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(context.destination);
    windSource.start();
    return true;
  }

  function tone(frequency, startAt, duration, type, volume) {
    if (!context) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(volume, context.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startAt + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(context.currentTime + startAt);
    osc.stop(context.currentTime + startAt + duration + 0.05);
  }

  return {
    /** Call from a click or keypress; does nothing in screenshot mode. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    /** Continuous engine + wind, called every frame while flying. */
    update(throttle, speed, flying) {
      if (!context || !engineGain) return;
      const target = flying ? 0.045 + throttle * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(58 + throttle * 66, context.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(87 + throttle * 99, context.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.16, speed * 0.0016) : 0, context.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(320 + speed * 9, context.currentTime, 0.15);
    },
    ring() {
      tone(880, 0, 0.35, 'sine', 0.16);
      tone(1318, 0.09, 0.4, 'sine', 0.14);
    },
    crash() {
      if (!context) return;
      const noise = context.createBufferSource();
      const length = context.sampleRate * 0.5;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      noise.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = 0.3;
      noise.connect(gain);
      gain.connect(context.destination);
      noise.start();
      tone(70, 0, 0.5, 'sine', 0.25);
    },
    land() {
      tone(523, 0, 0.3, 'triangle', 0.16);
      tone(659, 0.12, 0.3, 'triangle', 0.16);
      tone(784, 0.24, 0.5, 'triangle', 0.18);
    },
  };
}
