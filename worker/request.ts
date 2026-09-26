/** Parse a JSON request without buffering an unbounded body. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw new Error("request-too-large");
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let content = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("request-too-large");
    }
    content += decoder.decode(value, { stream: true });
  }
  return JSON.parse(content + decoder.decode());
}
