import { R as KPattern } from "../index-BXHm_6gm.js";

//#region src/cubing/protocol/binary/binary3x3x3.d.ts
type Binary3x3x3Pattern = Uint8Array;
interface Binary3x3x3Components {
  epLex: number;
  eoMask: number;
  cpLex: number;
  coMask: number;
  poIdxU: number;
  poIdxL: number;
  moSupport: number;
  moMask: number;
}
/** @category Binary 3x3x3 Format */
declare function reid3x3x3ToTwizzleBinary(pattern: KPattern): Binary3x3x3Pattern;
/** @category Binary 3x3x3 Format */
declare function twizzleBinaryToBinaryComponents(buffer: ArrayBuffer | Uint8Array): Binary3x3x3Components;
/** @category Binary 3x3x3 Format */
declare function binaryComponentsToReid3x3x3(components: Binary3x3x3Components): KPattern;
/** @category Binary 3x3x3 Format */
declare function twizzleBinaryToReid3x3x3(buffy: ArrayBuffer | Uint8Array): KPattern;
//#endregion
//#region src/cubing/protocol/binary/hex.d.ts
declare function bufferToSpacedHex(buffer: ArrayBuffer | Uint8Array): string;
declare function spacedHexToBuffer(hex: string): Uint8Array;
//#endregion
export { binaryComponentsToReid3x3x3 as experimentalBinaryComponentsToReid3x3x3, bufferToSpacedHex as experimentalBufferToSpacedHex, reid3x3x3ToTwizzleBinary as experimentalReid3x3x3ToTwizzleBinary, spacedHexToBuffer as experimentalSpacedHexToBuffer, twizzleBinaryToBinaryComponents as experimentalTwizzleBinaryToBinaryComponents, twizzleBinaryToReid3x3x3 as experimentalTwizzleBinaryToReid3x3x3 };