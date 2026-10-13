// Node does not provide Cloudflare's FixedLengthStream. Runtime integration tests
// separately verify the real implementation with workerd and its R2 binding.
export class TestFixedLengthStream extends TransformStream {
  constructor(length) {
    let received = 0;
    super({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > length) throw new TypeError("Fixed length exceeded");
        controller.enqueue(chunk);
      },
      flush() {
        if (received !== length) throw new TypeError("Fixed length mismatch");
      },
    });
    knownLengths.set(this.readable, length);
  }
}
const knownLengths = new WeakMap();
export function knownStreamLength(stream) { return knownLengths.get(stream); }
globalThis.FixedLengthStream = TestFixedLengthStream;
