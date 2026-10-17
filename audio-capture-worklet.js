// Captures microphone audio, resamples it to 16 kHz mono and posts 16-bit PCM
// chunks (~64 ms each) plus an RMS level to the main thread.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.chunk = new Int16Array(1024);
    this.filled = 0;
    this.pos = 0; // fractional read position into the incoming stream
    this.prev = 0;
    this.sumSq = 0;
    this.count = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    // Linear interpolation resampler that carries its position across blocks.
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : ch[i];
      const s = a + (b - a) * frac;
      const clamped = Math.max(-1, Math.min(1, s));
      this.chunk[this.filled++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.sumSq += clamped * clamped;
      this.count++;
      if (this.filled === this.chunk.length) {
        const out = this.chunk.slice(0);
        this.port.postMessage({ pcm: out.buffer, level: Math.sqrt(this.sumSq / this.count) }, [out.buffer]);
        this.filled = 0;
        this.sumSq = 0;
        this.count = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    this.prev = ch[ch.length - 1];
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
