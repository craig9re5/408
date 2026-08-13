/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleApi } from "./api";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type WorkerEnv = Env & {
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
};

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") ?? "";
    if (url.pathname === "/" || contentType.includes("text/html") || contentType.includes("text/x-component")) {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store, max-age=0");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

export default worker;
