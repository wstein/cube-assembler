/* Index.res - Library public API */

// IR
module IR      = CubeIR
module IRUtils = CubeIRUtils

// Notation — unified module (replaces WRG.res + URF.res)
// Usage:
//   Notation.parse(s, ())                          // auto-detect format, WRG alphabet
//   Notation.parse(s, ~alphabet=Notation.kociembaAlphabet, ())
//   Notation.print(cube, ~format=Notation.Cubie, ())
//   Notation.transcode(s, ~from_=Notation.kociembaAlphabet, ~to_=Notation.wrgAlphabet, ())
module Notation = Notation

// cubing.js bridge
module CubingJs = CubingJsBindings
module IRBridge = IRBridge
module WCA      = WCANotation

// Assembly pipeline
module PermGen  = PermGen
module Parity   = Parity
module Assembler = CubeAssembler
