/*
 * Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { parse as WebIDL2_parse, IDLArgument, IDLType, IDLInterface, IDLAttribute, IDLOperation, IDLCallback, IDLElement, asdfasd } from 'webidl2';

type ClassOrFunctionName = string[] | string;

const PtrSize = 4;

type VarInformation = IDLArgument | {name: string; idlType: IDLType;};

const enum MemoryType {
  Uint8,
  Int8,
  Uint16,
  Int16,
  Uint32,
  Int32,
  Float,
  Double,
  String,
  Ptr
}

const enum KnownTypeKind {
  Unknown,
  Builtin,
  Interface,
  String,
  Callback
}

interface GetValueParams {
  memory: MemoryType;
  wrapper?: string;
  cast?: string;
}

interface KnownType {
  kind: KnownTypeKind;
  cxxType: string;
  size: number;
  getValue: GetValueParams;
  cxxAlignedType: string;
}

interface SerializeCallArgumentsInfo {
  callArgs: string[];
  callArgsTypes: string[];
  size: number;
  inStatements: string[];
  outStatements: string[];
}

interface SerializeCallbackArgumentsInfo {
  cxxStructureItems: string[];
  cxxStructureTypes: string[];
  cxxInStatements: string[];
  cxxOutStatements: string[];
  inStatements: string[];
  outStatements: string[];
}

var BuiltinTypes: {name: string; cxxType: string; size: number; getValue: GetValueParams; cxxAlignedType: string;}[] = [
  { name: 'octet', cxxType: 'unsigned char', size: 4, getValue: {memory: MemoryType.Uint8}, cxxAlignedType: 'unsigned int'},
  { name: 'byte', cxxType: 'signed char', size: 4, getValue: {memory: MemoryType.Int8}, cxxAlignedType: 'int'},
  { name: 'boolean', cxxType: 'bool', size: 4, getValue: {memory: MemoryType.Uint8, wrapper: "!!($)", cast: "$?1:0"}, cxxAlignedType: 'unsigned int'},
  { name: 'short', cxxType: 'short', size: 4, getValue: {memory: MemoryType.Int16}, cxxAlignedType: 'int'},
  { name: 'unsigned short', cxxType: 'unsigned short', size: 4, getValue: {memory: MemoryType.Uint16}, cxxAlignedType: 'unsigned int'},
  { name: 'long', cxxType: 'int', size: 4, getValue: {memory: MemoryType.Int32}, cxxAlignedType: 'int'},
  { name: 'unsigned long', cxxType: 'unsigned int', size: 4, getValue: {memory: MemoryType.Uint32}, cxxAlignedType: 'unsigned int'},
  { name: 'float', cxxType: 'float', size: 4, getValue: {memory: MemoryType.Float}, cxxAlignedType: 'float'},
  { name: 'double', cxxType: 'double', size: 8, getValue: {memory: MemoryType.Double}, cxxAlignedType: 'double'}
];

function mangleNamePart(cxxName: string, subst: {map: any, nextId: number}, notsubst: number = 0): string {
  switch (cxxName) {
    case 'unsigned char': return 'h';
    case 'signed char': return 'a';
    case 'bool': return 'b';
    case 'short': return 's';
    case 'unsigned short': return 't';
    case 'int': return 'i';
    case 'unsigned int': return 'j';
    case 'float': return 'f';
    case 'double': return 'd';
  }
  if (notsubst == 0 && subst.map[cxxName])
    return subst.map[cxxName];
  var parts = cxxName.split(/::/g), i = parts.length - 1 - notsubst;
  while (i > 0 && !subst.map[parts.slice(0, i).join('::')]) i--;
  var result = ['N'];
  if (i > 0) {
    result.push(subst.map[parts.slice(0, i).join('::')]);
  }
  while (i < parts.length - notsubst) {
    result.push(parts[i].length + parts[i]);
    var id = 'S' + (subst.nextId < 0 ? '' : subst.nextId.toString(36).toUpperCase()) + '_';
    subst.nextId++;
    i++;
    subst.map[parts.slice(0, i).join('::')] = id;
  }
  while (i < parts.length) {
    result.push(parts[i].length + parts[i]);
    i++;
  }
  result.push('E');
  return result.join('');
}

export class WebIDLWasmGen {
  private _moduleName: string;
  private _filePrefix: string;
  private _jsText: string[];
  private _hText: string[];
  private _cxxText: string[];
  private _exports: {[key:string]:boolean;};
  private _knownTypes: {[key:string]:KnownType;};

  public constructor(moduleName: string, filePrefix: string) {
    this._moduleName = moduleName;
    this._filePrefix = filePrefix;
    this.initTypes();
  }

  private initTypes() {
    this._knownTypes = Object.create(null);
    BuiltinTypes.forEach(t => {
      this._knownTypes[t.name] = {
        kind: KnownTypeKind.Builtin,
        cxxType: t.cxxType,
        size: t.size,
        getValue: t.getValue,
        cxxAlignedType: t.cxxAlignedType
      };
    });
    this._knownTypes['DOMString'] = {
        kind: KnownTypeKind.String,
        cxxType: 'wasmbase::StringBox',
        size: 8,
        getValue: {memory: MemoryType.String},
        cxxAlignedType: 'wasmbase::StringBox'
    };
  }

  private initResults() {
    this._exports = Object.create(null);
    this._jsText = [];
    this._jsText.push(`// This file is autogenerated.
var wasmbase = require('wasmbase');

function invokeCallback(p, args) {
  var callback = _callbacks[p];
  return callback(args);
}
function registerObject(p, typeid) {
  _objects[p] = {type: typeid, obj: null};
}
function unregisterObject(p, typeid) {
  delete _objects[p];
}
function ptrOrNull(obj) {
  return obj === null ? NullPtr : obj._ptr;
}
function stackPush(size) {
  return _memory.malloc(size);
}
function stackPop(size, p) {
  _memory.free(p);
}

var _module;
exports.ready = wasmbase.ready.then(function () {
  return wasmbase.fetchModule('${this._filePrefix}.wasm', __dirname);
}).then(function (module) {
  return wasmbase.getInstance(module, {
    _registerObject: registerObject,
    _unregisterObject: unregisterObject,
    _invokeCallback: invokeCallback,
  });
}).then(function (instance) {
  _module = instance;
})

var _memory = wasmbase.Memory;
var _callbacks = Object.create(null);
var _objects = Object.create(null);
const NullPtr = 0;
`);

    this._hText = [];
    this._hText.push(`#ifndef __${this._moduleName.toUpperCase()}_H
#define __${this._moduleName.toUpperCase()}_H

#include <wasmbase.h>

namespace ${this._moduleName} {`);

    this._cxxText = [];
    this._cxxText.push(`#include <cstddef>
#include "${this._filePrefix}.h"

extern "C" {
  bool invokeCallback(void*, void*);
  void registerObject(void*, int);
  void unregisterObject(void*, int);
}

using namespace ${this._moduleName};`);
  }

  private finalizeResults() {
    this._jsText.push('');
    this._hText.push(`#endif // __${this._moduleName.toUpperCase()}_H`);
    this._cxxText.push(`} // namespace ${this._moduleName}`);
  }

  private mangleName(name: ClassOrFunctionName, fnArgs?): string {
    // https://refspecs.linuxbase.org/cxxabi-1.75.html#mangling-type
    var subst = {map: Object.create(null), nextId: -1};
    var fullname = this._moduleName + '::' +
      (Array.isArray(name) ? name.join('::') : name);
    var buf = ['__Z', mangleNamePart(fullname, subst, 1)];
    if (Array.isArray(fnArgs)) {
      if (fnArgs.length == 0) {
        buf.push('v'); // void
      } else {
        fnArgs.forEach(arg => {
          var j = arg.length;
          while (arg[j - 1] === '*' || arg[j - 1] === '&') {
            buf.push(arg[j - 1] === '*' ? 'P' : 'R');
            j--;
          }
          arg = arg.substring(0, j);
          if (arg.indexOf('const ') == 0) {
            arg = arg.substring('const '.length);
            buf.push('K');
          }
          var type = this._knownTypes[arg];
          if (type.kind === KnownTypeKind.String) {
            buf.push(mangleNamePart('wasmbase::StringBox', subst));
          } else if (type.kind !== KnownTypeKind.Builtin) {
            buf.push(mangleNamePart(this._moduleName + '::' + arg, subst));
          } else {
            buf.push(mangleNamePart(type.cxxType, subst));
          }
        });
      }
    }
    var s = buf.join('');
    this._exports[s] = true;
    return '_module.exports.' + s;
  }

  private typeSize(type: IDLType): number {
    return this._knownTypes[type.idlType].size;
  }

  private getTypedValue(type: IDLType, offset: string): string {
    var t = this._knownTypes[type.idlType];
    var s: string;
    switch (t.getValue.memory) {
      case MemoryType.Uint8:
        s = `_data.getUint8(${offset})`;
        break;
      case MemoryType.Int8:
        s = `_data.getInt8(${offset})`;
        break;
      case MemoryType.Uint16:
        s = `_data.getUint16(${offset}, true)`;
        break;
      case MemoryType.Int16:
        s = `_data.getInt16(${offset}, true)`;
        break;
      case MemoryType.Uint32:
        s = `_data.getUint32(${offset}, true)`;
        break;
      case MemoryType.Int32:
      case MemoryType.Ptr:
        s = `_data.getInt32(${offset}, true)`;
        break;
      case MemoryType.Float:
        s = `_data.getFloat32(${offset})`;
        break;
      case MemoryType.Double:
        s = `_data.getFloat64(${offset})`;
        break;
      case MemoryType.String:
        s = `wasmbase.StringBox.get(${offset})`;
        break;
      default:
        throw new Error('Unknown MemoryType');
    }
    if (t.getValue.wrapper) {
      s = t.getValue.wrapper.replace('$', s);
    }
    return s;
  }

  private setTypedValue(type: IDLType, offset: string, value: string): string {
    var t = this._knownTypes[type.idlType];
    var s: string = 'value';
    if (t.getValue.cast) {
      s = t.getValue.cast.replace('$', s);
    }
    switch (t.getValue.memory) {
      case MemoryType.Uint8:
        s = `_data.setUint8(${offset}, ${s})`;
        break;
      case MemoryType.Int8:
        s = `_data.setInt8(${offset}, ${s})`;
        break;
      case MemoryType.Uint16:
        s = `_data.setUint16(${offset}, ${s}, true)`;
        break;
      case MemoryType.Int16:
        s = `_data.setInt16(${offset}, ${s}, true)`;
        break;
      case MemoryType.Uint32:
        s = `_data.setUint32(${offset}, ${s}, true)`;
        break;
      case MemoryType.Int32:
      case MemoryType.Ptr:
        s = `_data.setInt32(${offset}, ${s}, true)`;
        break;
      case MemoryType.Float:
        s = `_data.setFloat32(${offset}, ${s})`;
        break;
      case MemoryType.Double:
        s = `_data.setFloat64(${offset}, ${s})`;
        break;
      case MemoryType.String:
        s = `wasmbase.StringBox.set(${offset}, ${s})`;
        break;
      default:
        throw new Error('Unknown MemoryType');
    }
    return s;
  }

  private getCxxType(type: IDLType): string {
    return this._knownTypes[type.idlType].cxxType;
  }

  private getTypeKind(type: IDLType) : KnownTypeKind {
    return this._knownTypes[type.idlType].kind;
  }

  private serializeCallArguments(inVars: VarInformation[], outVars: VarInformation[], isStatic: boolean, blobName: string): SerializeCallArgumentsInfo {
    var size = 0;
    var callArgs = [];
    var callArgsTypes = [];
    var inStatements = [];
    var outStatements = [];
    if (!isStatic) {
      callArgs.push('this._ptr');
    }
    if (inVars) {
      inVars.forEach((v, i) => {
        switch (this.getTypeKind(v.idlType)) {
          case KnownTypeKind.Interface:
            callArgs.push(`ptrOrNull(${v.name})`);
            callArgsTypes.push(v.idlType.idlType + '*');
            break;
          case KnownTypeKind.Callback:
            inStatements.push(`var c${i} = ${this.mangleName([v.idlType.idlType, 'Create'], [])}();`);
            inStatements.push(`regCallback_${v.idlType.idlType}(c${i}, ${v.name});`);
            callArgs.push(`c${i}`);
            callArgsTypes.push(v.idlType.idlType + '*');
            outStatements.push(`unregCallback_${v.idlType.idlType}(c${i}, ${v.name});`);
            outStatements.push(`${this.mangleName([v.idlType.idlType, 'Destroy'], [])}();`);
            break;
          case KnownTypeKind.String:
            var offset = `${blobName} + ${size}`;
            size += 8;
            inStatements.push(`wasmbase.StringBox.init(${offset}, ${v.name});`);
            outStatements.push(`wasmbase.StringBox.destroy(${offset});`)
            callArgs.push(offset);
            callArgsTypes.push(`const DOMString&`);
            break;
          default:
            callArgs.push(v.name);
            callArgsTypes.push(v.idlType.idlType);
            break;
        }
      });
    }
    if (outVars) {
      outVars.forEach((v, i) => {
        var offset = `${blobName} + ${size}`;
        callArgs.push(offset);
        var cleanup = null;
        switch (this.getTypeKind(v.idlType)) {
          case KnownTypeKind.Interface:
          case KnownTypeKind.Callback:
            size += PtrSize;
            callArgsTypes.push(v.idlType.idlType + '**');
            break;
          case KnownTypeKind.String:
            size += 8;
            inStatements.push(`wasmbase.StringBox.init(${offset});`);
            cleanup = `wasmbase.StringBox.destroy(${offset});`;
            callArgsTypes.push(`DOMString*`);
            break;
          default:
            size += this.typeSize(v.idlType);
            callArgsTypes.push(v.idlType.idlType + '*');
            break;
        }
        outStatements.push(`var ${v.name} = ${this.getTypedValue(v.idlType, offset)};`);
        if (cleanup) {
          outStatements.push(cleanup);
          cleanup = null;
        }
      });
    }
    return {
      callArgs: callArgs,
      callArgsTypes: callArgsTypes,
      size: size,
      inStatements: inStatements,
      outStatements: outStatements
    };
  }

  private serializeCallbackArguments(inVars: VarInformation[], outVars: VarInformation[], blobName: string) : SerializeCallbackArgumentsInfo {
    var size = 0;
    var cxxStructureItems = [];
    var cxxStructureTypes = [];
    var cxxInStatements = [];
    var cxxOutStatements = [];
    var inStatements = [];
    var outStatements = [];
    if (inVars) {
      inVars.forEach((v, i) => {
        var offset = `${blobName} + ${size}`;
        cxxStructureItems.push(v.name);
        cxxStructureTypes.push(this._knownTypes[v.idlType.idlType].cxxAlignedType);
        cxxInStatements.push(`${this.getCxxType(v.idlType)} ${v.name} = ${blobName}.${v.name};`);
        switch (this.getTypeKind(v.idlType)) {
          case KnownTypeKind.Interface:
            size += PtrSize;
            break;
          case KnownTypeKind.Callback:
            throw new Error('Not implemented.');
          default:
            size += this.typeSize(v.idlType);
            break;
        }
        inStatements.push(`${this.setTypedValue(v.idlType, offset, v.name)};`);
      });
    }
    if (outVars) {
      outVars.forEach((v, i) => {
        var offset = `${blobName} + ${size}`;
        cxxStructureItems.push(v.name);
        cxxStructureTypes.push(this._knownTypes[v.idlType.idlType].cxxAlignedType);
        cxxOutStatements.push(`${blobName}.${v.name} = ${v.name};`);
        switch (this.getTypeKind(v.idlType)) {
          case KnownTypeKind.Interface:
          case KnownTypeKind.Callback:
            size += PtrSize;
            break;
          default:
            size += this.typeSize(v.idlType);
            break;
        }
        outStatements.push(`var ${v.name} = ${this.getTypedValue(v.idlType, offset)};`);
      });
    }
    return {
      cxxStructureItems: cxxStructureItems,
      cxxStructureTypes: cxxStructureTypes,
      cxxInStatements: cxxInStatements,
      cxxOutStatements: cxxOutStatements,
      inStatements: inStatements,
      outStatements: outStatements
    };
  }

  private parseInterface(interface_: IDLInterface, typeid: number): void {
    function writePreCall(gen: WebIDLWasmGen, inVars: VarInformation[], outVars: VarInformation[], isStatic: boolean): SerializeCallArgumentsInfo {
      var p = gen.serializeCallArguments(inVars, outVars, isStatic, '_stack');
      if (p.size > 0) {
        jsText.push(`    var _data = new DataView(_memory.buffer, 0);`);
        jsText.push(`    var _stack = stackPush(${p.size});`);
      }
      p.inStatements.forEach(s => jsText.push("    " + s));
      return p;
    }
    function writePostCall(p: SerializeCallArgumentsInfo): void {
      p.outStatements.forEach(s => jsText.push("    " + s));
      if (p.size > 0)
        jsText.push(`    stackPop(${p.size}, _stack);`);
    }

    var jsText = this._jsText, cxxText = this._cxxText, hText = this._hText;
    jsText.push(`// ${interface_.name} class wrapper`);
    hText.push(`// ${interface_.name} class definition`);
    cxxText.push(`// ${interface_.name} class members`);

    var constructors = interface_.extAttrs.filter(i => i.name === "Constructor");
    jsText.push(`class ${interface_.name} {
  static get _typeid() { return ${typeid}; }`);

    hText.push(`class ${interface_.name}
{
    static int _typeid;
  public:
    ${interface_.name}();
    ~${interface_.name}();`);

      cxxText.push(`
int ${interface_.name}::_typeid = ${typeid};

${interface_.name}::${interface_.name}()
{
  registerObject(this, _typeid);
}

${interface_.name}::~${interface_.name}()
{
  unregisterObject(this, _typeid);
}`);

    if (constructors.length > 0) {
      jsText.push(`  constructor() {
    this._ptr = ${this.mangleName([interface_.name, 'Create'], [])}();
    if (!this._ptr) throw new Error("new ${interface_.name}");
    _objects[this._ptr].obj = this;
  }`);
      hText.push(`    static ${interface_.name}* Create();`);
      cxxText.push(`
${interface_.name}* ${interface_.name}::Create()
{
  return new ${interface_.name}();
}`);
    }
    hText.push("    void Destroy();");
    cxxText.push(`
void ${interface_.name}::Destroy()
{
  delete this;
}`);

    interface_.members.forEach(m => {
      switch (m.type) {
        case 'attribute':
          var attr = <IDLAttribute>m;
          var staticStr = attr.static ? 'static ' : '';
          jsText.push(`  ${staticStr}get ${attr.name}() {`);
          var p = writePreCall(this, null, [{name: 'result', idlType: attr.idlType}], attr.static);
          jsText.push(`    var success = ${this.mangleName([interface_.name, attr.name], p.callArgsTypes)}(${p.callArgs.join(', ')});`);
          writePostCall(p);
          jsText.push(`    if (!success)
      throw new Error("get ${interface_.name} ${m.name}");
    return result;
  }`);

          hText.push(`    bool ${m.name}(${this.getCxxType(m.idlType)}* result);`);
          cxxText.push(`
bool ${interface_.name}::${m.name}(${this.getCxxType(m.idlType)}* result)
{
  return false;
}`);

          if (!attr.readonly) {
            jsText.push(`  ${staticStr}set ${m.name}(value) {`);
            var p = writePreCall(this, [{name: 'value', idlType: attr.idlType}], null, attr.static);
            jsText.push(`    var success = ${this.mangleName([interface_.name, 'set_' + attr.name], p.callArgsTypes)}(${p.callArgs.join(', ')});`);
            writePostCall(p);
            jsText.push(`    if (!success)
      throw new Error("set ${interface_.name} ${m.name}");
  }`);

            hText.push(`    bool set_${m.name}(${this.getCxxType(attr.idlType)} value);`);
            cxxText.push(`
bool ${interface_.name}::set_${m.name}(${this.getCxxType(attr.idlType)} value)
{
  return false;
}`);
          }
          break;
        case 'operation':
          var op = <IDLOperation>m;
          var staticStr = op.static ? 'static ' : '';
          var argsJS = [], argsCxx = [];
          op.arguments.forEach(a => {
            argsJS.push(a.name);
            var type = this.getCxxType(a.idlType);
            if (type == 'wasmbase::StringBox') type = 'const wasmbase::StringBox&';
            argsCxx.push(`${type} ${a.name}`);
          });
          var result = m.idlType.idlType !== "void" ? [{name: 'result', idlType: m.idlType}] : null;
          if (result) {
            argsCxx.push(`${this.getCxxType(m.idlType)}* result`);
          }
          jsText.push(`  ${staticStr}${op.name}(${argsJS.join(', ')}) {`)
          var p = writePreCall(this, op.arguments, result, op.static);
          jsText.push(`    var success = ${this.mangleName([interface_.name, op.name], p.callArgsTypes)}(${p.callArgs.join(', ')});`);
          writePostCall(p);
          jsText.push(`    if (!success)
      throw new Error("call ${interface_.name} ${m.name}");`);
          if (result)
            jsText.push("    return result;");
          jsText.push("  }");

          hText.push(`    ${staticStr}bool ${op.name}(${argsCxx.join(', ')});`);
          cxxText.push(`
${op.static ? '/* static */ ' : ''}bool ${interface_.name}::${op.name}(${argsCxx.join(', ')})
{
  return false;
}`);
          break;
      }
    });

    jsText.push(`}
exports.${interface_.name} = ${interface_.name};`);
    jsText.push(`function lookupObject_${interface_.name}(p) {
  if (p === NullPtr) return null;
  var entry = _objects[p];
  if (!entry.obj) {
    entry.obj = new ${interface_.name}();
    entry.obj._ptr = p;
  }
  return entry.obj;
}`);
    hText.push(`// additional ${interface_.name} members
  private:
};`);

    jsText.push(`// end of ${interface_.name} class wrapper`);
    hText.push(`// end of ${interface_.name} class definition`);
    cxxText.push(`// end of ${interface_.name} class members`);
  }

  private parseCallback(callback: IDLCallback): void {
    var argsJS = [], argsCxx = [];
    callback.arguments.forEach(a => {
      argsJS.push(a.name);
      argsCxx.push(`${this.getCxxType(a.idlType)} ${a.name}`);
    });
    var result = callback.idlType.idlType !== "void" ? [{name: 'result', idlType: callback.idlType}] : null;
    if (result) {
      argsCxx.push(`${this.getCxxType(callback.idlType)}* result`);
    }

    var jsText = this._jsText, cxxText = this._cxxText, hText = this._hText;
    jsText.push(`// ${callback.name} callback wrapper`);
    hText.push(`// ${callback.name} callback definition`);
    cxxText.push(`// ${callback.name} callback members`);

    jsText.push(`function regCallback_${callback.name}(p, callback) {
  _callbacks[p] = function (args) {`);
    var p = this.serializeCallbackArguments(result, callback.arguments, 'args');
    p.outStatements.forEach(s => jsText.push("    " + s));
    jsText.push(`    var result = callback(${argsJS.join(', ')});`);
    p.inStatements.forEach(s => jsText.push("    " + s));
    jsText.push(`    return true;
  };
  _callbacks[p]._callback = callback;
}
function unregCallback_${callback.name}(p, callback) {
  delete _callbacks[p];
}
function lookupObject_${callback.name}(p, callback) {
  return p !== NullPtr ? _callbacks[p]._callback : null;
}`);

    hText.push(`class ${callback.name}
{
  public:
    ${callback.name}();
    ~${callback.name}();
    static ${callback.name}* Create();
    void Destroy();

    bool Call(${argsCxx.join(', ')});
// additional ${callback.name} members
  private:
};`);
    cxxText.push(`
${callback.name}::${callback.name}()
{}

${callback.name}::~${callback.name}()
{}

${callback.name}* ${callback.name}::Create()
{
  return new ${callback.name}();
}

void ${callback.name}::Destroy()
{
  delete this;
}

struct ${callback.name}Arguments
{`);
    p.cxxStructureItems.forEach((i, index) => cxxText.push(`    ${p.cxxStructureTypes[index]} ${i};`));

    cxxText.push(`};

bool ${callback.name}::Call(${argsCxx.join(', ')})
{
  ${callback.name}Arguments args;`);
    p.cxxOutStatements.forEach(s => cxxText.push('  ' + s));
    cxxText.push('  bool success = invokeCallback(this, &args);')
    p.cxxInStatements.forEach(s => cxxText.push('  ' + s));
    cxxText.push(`  return success;
}
`);

    jsText.push(`// end of ${callback.name} callback wrapper`);
    hText.push(`// end of ${callback.name} callback definition`);
    cxxText.push(`// end of ${callback.name} callback members`);
  }

  private parseWebIDL(tree: IDLElement[]) {
    tree.forEach(i => {
      switch (i.type) {
        case 'interface':
          var interface_ = <IDLInterface>i;
          this._knownTypes[interface_.name] = {
            kind: KnownTypeKind.Interface,
            cxxType: interface_.name + '*',
            size: PtrSize,
            getValue: {memory: MemoryType.Ptr, wrapper: `lookupObject_${interface_.name}($)`, cast: `ptrOrNull($)`},
            cxxAlignedType: 'void*'
          };
          this._hText.push(`class ${interface_.name};`);
          break;
        case 'callback':
          var callback = <IDLCallback>i;
          this._knownTypes[callback.name] = {
            kind: KnownTypeKind.Callback,
            cxxType: callback.name + '*',
            size: PtrSize,
            getValue: {memory: MemoryType.Ptr, wrapper: `lookupObject_${callback.name}($)`},
            cxxAlignedType: 'void*'
          };
          this._hText.push(`class ${callback.name};`);
          break;
      }
    });

    tree.forEach((i, typeid) => {
      switch (i.type) {
        case 'interface':
          this.parseInterface(<IDLInterface>i, typeid);
          break;
        case 'callback':
          this.parseCallback(<IDLCallback>i);
          break;
      }
    });
  }

  public parse(s: string): void {
    this.initResults();
    var tree = WebIDL2_parse(s);
    this.parseWebIDL(tree);
    this.finalizeResults();
  }

  public getJSCode(): string {
    return this._jsText.join('\n');
  }

  public getHCode(): string {
    return this._hText.join('\n');
  }

  public getCxxCode(): string {
    return this._cxxText.join('\n');
  }

  public getJsonCode(): string {
    return `{
    "compilerOptions": {

    },
    "output": "${this._filePrefix}.wasm",
    "dependencies": [
        "wasmbase"
    ],
    "files": [
        "${this._filePrefix}.cpp"
    ],
    "options": {
        "EXPORTED_RUNTIME_METHODS": [],
        "EXPORTED_FUNCTIONS": ${JSON.stringify(Object.keys(this._exports))}
    }
}`
  }

  public updateHCode(content: string): string {
    var combined = this.getHCode();
    // getting all content between "additional members"-comment and ends of the class
    var m1, re1 = new RegExp(`\n// additional (\\w+) members([^\\n]|\\n(?!\\};))+`, "g");
    while ((m1 = re1.exec(content))) {
      var re2 = new RegExp(`\n// additional ${m1[1]} members([^\\n]|\\n(?!\\};))+`);
      // ... and placing that into new generated code in the same spot
      combined = combined.replace(re2, m1[0].split('$').join('$$'));
    }
    return combined;
  }
  
  public updateCxxCode(content: string): string {
    var combined = content;
    var updated = this.getCxxCode();
    // replace all static typeid's
    var re1 = new RegExp(`int (\\w+)::_typeid = (\\d+);`, "g");
    combined = combined.replace(re1, (all, name, id) => {
      var m = new RegExp(`int ${name}::_typeid = (\\d+);`).exec(updated);
      return m ? m[0] : all;
    });
    // find all new blocks
    var m2, re2 = new RegExp(`\n// (\\w+) (class|callback) members([^\\n]|\\n(?!// end of};))+// end of \\1 \\2 members`, "g");
    while ((m2 = re2.exec(updated))) {
      var found = false;
      var updatedBlock = m2[0];
      var isCallback = m2[2] == 'callback';
      var re3 = new RegExp(`\n// ${m2[1]} ${m2[2]} members([^\\n]|\\n(?!// end of};))+// end of ${m2[1]} ${m2[2]} members`);
      // ... and try to update existing
      combined = combined.replace(re3, (combinedBlock: string) => {
        found = true;
        if (isCallback) {
          return updatedBlock;
        }
        // we don't interested in constructors, replacing methods bodies
        var m4, re4 = new RegExp(`(\\n(((unsigned|signed)\\s)?\\w+)\\s+${m2[1]}::(\\w+)\\(([^\\)]*)\\)\\s+\\{)(([^\\n]|\\n(?!\\}))*\\n)\\}`, "g");
        while ((m4 = re4.exec(updatedBlock))) {
          var updatedMethod = m4[0];
          var prefix = m4[1];
          var name = m4[5];
          var methodFound = false;
          // replacing method outer signature
          var re5 = new RegExp(`(\n(((unsigned|signed)\\s)?\\w+)\\s+${m2[1]}::(${name})\\(([^\\)]*)\\)\\s+\\{)(([^\\n]|\\n(?!\\}))*\\n)\\}`);
          combinedBlock = combinedBlock.replace(re5, (all, _1, _2, _3, _4, _5, _6, body) => {
            methodFound = true;
            return prefix + body + '}';
          });
          if (!methodFound) {
            // .. or add at the end
            var i = combinedBlock.lastIndexOf('\n// end of');
            combinedBlock = combinedBlock.substring(0, i) + updatedMethod + combinedBlock.substring(i);
          }
        }
        return combinedBlock;
      });
      if (!found) {
        // .. or add at the end
        var i = combined.indexOf('\n} // namespace ');
        combined = combined.substring(0, i) + updatedBlock + combined.substring(i);
      }
    }
    return combined;
  }
}

// For wasdk legacy logic
export function parseModuleOperations(s: string): string[] {
  let moduleInterface: IDLInterface =
    WebIDL2_parse(s).find(i => i.type === 'interface' && i.name === 'Module');
  if (!moduleInterface)
    return null;
  let members = moduleInterface.members.filter(m => m.type === "operation").map(m => m.name);
  return members;
}