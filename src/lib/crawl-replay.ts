import captures from "@/data/live-sample.json";
import type { PageRow } from "@/lib/pages";
import type { SiteId } from "@/lib/sites";

export type ReplaySample = {
  id: number;
  status: number;
  responseMs: number;
  htmlBytes: number;
  staticFindingCount: number;
};

export const REPLAY_INTERVAL_MS = 250;
const STREAM_TIMEOUT_MS = 2_500;

export function savedSamples(site: SiteId): ReplaySample[] {
  const rows: Record<string, Omit<ReplaySample, "id">> = site === "rbccm" || site === "rbcits" ? captures[site] : {};
  return Object.entries(rows).map(([id, row]) => ({ id: Number(id), ...row }));
}

export function applySample(page: PageRow, sample: ReplaySample): PageRow {
  const { status, responseMs, htmlBytes, staticFindingCount } = sample;
  return {
    ...page,
    status,
    kind: status >= 500 ? "server" : status >= 400 ? "client" : "ok",
    fetchMs: responseMs,
    note: `Captured · ${(htmlBytes / 1024).toFixed(1)} KiB · ${staticFindingCount} HTML findings`,
    captured: { htmlBytes, staticFindingCount },
  };
}

export type ReplayTransport = "connecting" | "websocket" | "local";

type Tick = { type: "tick"; sequence: number; sample?: ReplaySample };

function readTick(data: unknown): Tick | null {
  if (typeof data !== "string") return null;
  try {
    const tick = JSON.parse(data) as Tick | null;
    if (tick?.type !== "tick" || !Number.isSafeInteger(tick.sequence)) return null;
    const sample = tick.sample;
    if (sample && ![sample.id, sample.status, sample.responseMs, sample.htmlBytes, sample.staticFindingCount].every(Number.isFinite)) {
      return { type: "tick", sequence: tick.sequence };
    }
    return tick;
  } catch {
    return null;
  }
}

// One bounded server connection per active playback session. The local clock
// takes over at the current cursor if the connection drops or reaches its cap.
export function streamReplay(
  site: SiteId,
  tick: (sample?: ReplaySample) => void,
  onTransport: (transport: ReplayTransport) => void,
) {
  let socket: WebSocket | undefined;
  let localClock: ReturnType<typeof setInterval> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let lastSequence = 0;

  function fallback() {
    if (localClock !== undefined) return;
    clearTimeout(watchdog);
    const samples = savedSamples(site);
    localClock = setInterval(() => tick(samples.shift()), REPLAY_INTERVAL_MS);
    socket?.close();
    onTransport("local");
  }

  try {
    const url = new URL("/api/crawl-replay", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("site", site);
    socket = new WebSocket(url);
    onTransport("connecting");
    watchdog = setTimeout(fallback, STREAM_TIMEOUT_MS);
    socket.onmessage = ({ data }) => {
      const frame = readTick(data);
      if (!frame || frame.sequence <= lastSequence || localClock !== undefined) return;
      if (lastSequence === 0) onTransport("websocket");
      lastSequence = frame.sequence;
      clearTimeout(watchdog);
      watchdog = setTimeout(fallback, STREAM_TIMEOUT_MS);
      tick(frame.sample);
    };
    socket.onclose = fallback;
    socket.onerror = fallback;
  } catch {
    fallback();
  }

  return () => {
    clearTimeout(watchdog);
    clearInterval(localClock);
    if (socket) {
      socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  };
}
