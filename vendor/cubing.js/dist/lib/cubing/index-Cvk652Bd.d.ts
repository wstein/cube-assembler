import { Ct as AlgLeaf, R as KPattern } from "./index-BXHm_6gm.js";

//#region src/cubing/stream/events.d.ts
/** @category Smart Puzzles */
interface AlgLeafEvent {
  latestAlgLeaf: AlgLeaf;
  timeStamp: number;
  debug?: Record<string, unknown>;
  pattern?: KPattern;
  quaternion?: any;
}
/** @category Smart Puzzles */
interface OrientationEvent {
  quaternion: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  timeStamp: number;
  debug?: Record<string, unknown>;
}
interface ProxyMoveEvent {
  event: "move";
  data: AlgLeafEvent;
}
interface ProxyOrientationEvent {
  event: "orientation";
  data: OrientationEvent;
}
interface ProxyResetEvent {
  event: "reset";
}
type ProxyEvent = ProxyMoveEvent | ProxyOrientationEvent | ProxyResetEvent;
//#endregion
//#region src/cubing/stream/twizzle/TwizzleStream.d.ts
declare class TwizzleStream extends EventTarget {
  socket: WebSocket;
  constructor(url: string);
  onMessage(msg: MessageEvent): void;
}
type StreamsField = {
  streamID: string;
  senders: {
    name: string;
    twizzleUserID: string;
    wcaID: string | null;
  }[];
}[];
declare class TwizzleStreamServer {
  streams(): Promise<StreamsField>;
  connect(streamID: string): TwizzleStream;
}
//#endregion
//#region src/cubing/stream/websocket-proxy.d.ts
declare class WebSocketProxySender {
  protected websocket: WebSocket;
  constructor(url: string);
  sendMoveEvent(e: AlgLeafEvent): void;
  sendOrientationEvent(e: OrientationEvent): void;
  sendResetEvent(): void;
  protected sendProxyEvent(proxyEvent: ProxyEvent): void;
  protected onopen(): void;
  protected onerror(error: any): void;
  protected onmessage(_e: MessageEvent): void;
}
declare abstract class WebSocketProxyReceiver {
  protected websocket?: WebSocket;
  constructor(url: string, socketOrigin?: string);
  protected onopen(): void;
  protected onerror(error: any): void;
  protected onmessage(e: MessageEvent): void;
  abstract onProxyEvent(e: ProxyEvent): void;
}
//#endregion
export { OrientationEvent as a, ProxyOrientationEvent as c, AlgLeafEvent as i, ProxyResetEvent as l, WebSocketProxySender as n, ProxyEvent as o, TwizzleStreamServer as r, ProxyMoveEvent as s, WebSocketProxyReceiver as t };