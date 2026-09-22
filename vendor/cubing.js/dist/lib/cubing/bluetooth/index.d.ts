import { At as Move, D as PuzzleID, I as MillisecondTimestamp, R as KPattern, c as PuzzleLoader, gt as Alg, s as KeyMapping } from "../index-BXHm_6gm.js";
import { a as OrientationEvent, i as AlgLeafEvent } from "../index-Cvk652Bd.js";

//#region src/cubing/bluetooth/debug.d.ts
declare function enableDebugLogging(enable: boolean): void;
//#endregion
//#region src/cubing/bluetooth/transformer.d.ts
interface StreamTransformer {
  transformAlgLeaf(algLeafEvent: AlgLeafEvent): void;
  transformOrientation(orientationEvent: OrientationEvent): void;
}
//#endregion
//#region src/cubing/bluetooth/smart-puzzle/bluetooth-puzzle.d.ts
/** @category Smart Puzzles */
declare abstract class BluetoothPuzzle extends EventTarget {
  transformers: StreamTransformer[];
  protected listeners: Array<(e: AlgLeafEvent) => void>;
  protected orientationListeners: Array<(e: OrientationEvent) => void>;
  abstract name(): string | undefined;
  abstract disconnect(): void;
  getPattern(): Promise<KPattern>;
  addAlgLeafListener(listener: (e: AlgLeafEvent) => void): void;
  addOrientationListener(listener: (e: OrientationEvent) => void): void;
  experimentalAddBasicRotationTransformer(): void;
  protected dispatchAlgLeaf(algLeaf: AlgLeafEvent): void;
  protected dispatchOrientation(orientationEvent: OrientationEvent): void;
}
//#endregion
//#region src/cubing/bluetooth/keyboard.d.ts
/** @category Keyboard Puzzles */
declare class KeyboardPuzzle extends BluetoothPuzzle {
  private target;
  private keyMappingAndPatternPromise;
  listener: EventListener;
  constructor(target: Element, puzzle?: PuzzleID | PuzzleLoader);
  name(): string | undefined;
  setPuzzleInternal(puzzle: PuzzleID | PuzzleLoader): Promise<[KeyMapping | undefined, KPattern]>;
  disconnect(): void;
  getPattern(): Promise<KPattern>;
  private onKeyDown;
}
/** @category Keyboard Puzzles */
declare function debugKeyboardConnect(target?: any, puzzle?: PuzzleID | PuzzleLoader): Promise<KeyboardPuzzle>;
//#endregion
//#region src/cubing/bluetooth/connect/index.d.ts
/******** connect() ********/
interface BluetoothConnectOptions {
  acceptAllDevices?: boolean;
}
//#endregion
//#region src/cubing/bluetooth/smart-puzzle/connect.d.ts
/** @category Smart Puzzles */
declare function connectSmartPuzzle(options?: BluetoothConnectOptions): Promise<BluetoothPuzzle>;
//#endregion
//#region src/cubing/bluetooth/smart-puzzle/gan.d.ts
/** @category Smart Puzzles */
declare class GanCube extends BluetoothPuzzle {
  private kpuzzle;
  private service;
  private server;
  private physicalStateCharacteristic;
  private lastMoveCounter;
  private aesKey;
  static connect(server: BluetoothRemoteGATTServer): Promise<GanCube>;
  INTERVAL_MS: number;
  private intervalHandle;
  private pattern;
  private cachedFaceletStatus1Characteristic;
  private cachedFaceletStatus2Characteristic;
  private cachedActualAngleAndBatteryCharacteristic;
  private constructor();
  name(): string | undefined;
  disconnect(): void;
  startTrackingMoves(): void;
  stopTrackingMoves(): void;
  intervalHandler(): Promise<void>;
  getBattery(): Promise<number>;
  getPattern(): Promise<KPattern>;
  faceletStatus1Characteristic(): Promise<BluetoothRemoteGATTCharacteristic>;
  faceletStatus2Characteristic(): Promise<BluetoothRemoteGATTCharacteristic>;
  actualAngleAndBatteryCharacteristic(): Promise<BluetoothRemoteGATTCharacteristic>;
  reset(): Promise<void>;
  readFaceletStatus1Characteristic(): Promise<ArrayBufferLike>;
  readFaceletStatus2Characteristic(): Promise<string>;
  readActualAngleAndBatteryCharacteristic(): Promise<ArrayBufferLike>;
}
//#endregion
//#region src/cubing/bluetooth/smart-puzzle/giiker.d.ts
/** @category Smart Puzzles */
declare class GiiKERCube extends BluetoothPuzzle {
  private server;
  private cubeCharacteristic;
  private originalValue?;
  static connect(server: BluetoothRemoteGATTServer): Promise<GiiKERCube>;
  private constructor();
  name(): string | undefined;
  disconnect(): void;
  getPattern(): Promise<KPattern>;
  private getBit;
  private toReid333;
  private onCubeCharacteristicChanged;
  private isRepeatedInitialValue;
}
//#endregion
//#region src/cubing/bluetooth/smart-puzzle/gocube.d.ts
/** @category Smart Puzzles */
declare class GoCube extends BluetoothPuzzle {
  private server;
  goCubeStateCharacteristic: BluetoothRemoteGATTCharacteristic;
  static connect(server: BluetoothRemoteGATTServer): Promise<GoCube>;
  private recorded;
  private homeQuatInverse;
  private lastRawQuat;
  private currentQuat;
  private lastTarget;
  private alg;
  private constructor();
  disconnect(): void;
  reset(): void;
  resetAlg(alg?: Alg): void;
  resetOrientation(): void;
  name(): string | undefined;
  private onCubeCharacteristicChanged;
}
//#endregion
//#region src/cubing/bluetooth/smart-robot/GanRobot.d.ts
interface GanRobotOptions {
  xAngle: boolean;
  singleMoveFixHack: boolean;
  bufferQueue: number;
  postSleep: number;
}
/** @category Robots */
declare class GanRobot extends EventTarget {
  private server;
  private statusCharacteristic;
  private moveCharacteristic;
  experimentalDebugOnSend: ((alg: Alg) => void) | null;
  experimentalDebugLog: typeof console.log;
  experimentalOptions: GanRobotOptions;
  constructor(_service: BluetoothRemoteGATTService, server: BluetoothRemoteGATTServer, device: BluetoothDevice, statusCharacteristic: BluetoothRemoteGATTCharacteristic, moveCharacteristic: BluetoothRemoteGATTCharacteristic);
  static connect(server: BluetoothRemoteGATTServer, device: BluetoothDevice): Promise<GanRobot>;
  name(): string | undefined;
  disconnect(): void;
  onDisconnect(): void;
  private algNodeToNibble;
  private writeNibbles;
  private getStatus;
  locked: boolean;
  processQueue(): void;
  private moveQueue;
  private queueMoves;
  applyMoves(moves: Iterable<Move>): Promise<void>;
}
//#endregion
//#region src/cubing/bluetooth/smart-robot/index.d.ts
/** @category Robots */
type BluetoothRobot = GanRobot;
/** @category Robots */
declare function connectSmartRobot(options?: BluetoothConnectOptions): Promise<BluetoothRobot>;
//#endregion
//#region src/cubing/bluetooth/smart-timer/GanTimer.d.ts
/** @category Timers */
declare class GanTimer extends EventTarget {
  private server;
  private timeCharacteristic;
  private polling;
  private previousDetail;
  constructor(_service: BluetoothRemoteGATTService, server: BluetoothRemoteGATTServer, device: BluetoothDevice, timeCharacteristic: BluetoothRemoteGATTCharacteristic);
  static connect(server: BluetoothRemoteGATTServer, device: BluetoothDevice): Promise<GanTimer>;
  disconnect(): void;
  poll(): Promise<void>;
  onDisconnect(): void;
  getTimeCharacteristic(): Promise<Uint8Array<ArrayBufferLike>>;
  getTime(): Promise<MillisecondTimestamp>;
  decodeTimeMs(bytes: Uint8Array): MillisecondTimestamp;
  startPolling(): void;
  stopPolling(): void;
}
//#endregion
//#region src/cubing/bluetooth/smart-timer/index.d.ts
/** @category Timers */
type BluetoothTimer = GanTimer;
/** @category Timers */
declare function connectSmartTimer(options?: BluetoothConnectOptions): Promise<BluetoothTimer>;
//#endregion
export { type BluetoothPuzzle, type BluetoothRobot, type BluetoothTimer, GanCube, GiiKERCube, GoCube, KeyboardPuzzle, type AlgLeafEvent as MoveEvent, type OrientationEvent, connectSmartPuzzle, connectSmartRobot, connectSmartTimer, debugKeyboardConnect, enableDebugLogging };