#!/usr/bin/env node
/*
 * Copyright 2017 Mozilla Foundation
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

import * as fs from 'fs';
import * as path from 'path';

import { WebIDLWasmGen } from './idl';

function updateHFile(hFilePath: string, gen: WebIDLWasmGen) {
  if (!fs.existsSync(hFilePath)) {
    fs.writeFileSync(hFilePath, gen.getHCode());
    return;
  }
  var old = fs.readFileSync(hFilePath).toString();
  fs.writeFileSync(hFilePath + '.bak', old);
  var combined = gen.updateHCode(old);
  fs.writeFileSync(hFilePath, combined);
}

function updateCxxFile(cxxFilePath: string, gen: WebIDLWasmGen) {
  if (!fs.existsSync(cxxFilePath)) {
    fs.writeFileSync(cxxFilePath, gen.getCxxCode());
    return;
  }
  var old = fs.readFileSync(cxxFilePath).toString();
  fs.writeFileSync(cxxFilePath + '.bak', old);
  var combined = gen.updateCxxCode(old);
  fs.writeFileSync(cxxFilePath, combined);
}

function parseIdl(idlPath: string, outputDir: string, prefix?: string, namespace?: string) {
  var basename = path.basename(idlPath, path.extname(idlPath));
  try {
    fs.accessSync(outputDir);
  } catch (_) {
    fs.mkdirSync(outputDir);
  }
  var fileprefix = prefix || basename;
  namespace = namespace || (fileprefix[0].toUpperCase() + fileprefix.slice(1));
  if (!/^\w+$/.test(namespace)) throw new Error('Invalid C++ namespace: ' + namespace);

  var gen = new WebIDLWasmGen(namespace, fileprefix);
  var idlContent = fs.readFileSync(idlPath).toString();
  gen.parse(idlContent);
  fs.writeFileSync(path.join(outputDir, fileprefix + '.js'), gen.getJSCode());
  fs.writeFileSync(path.join(outputDir, fileprefix + '.json'), gen.getJsonCode());
  updateHFile(path.join(outputDir, fileprefix + '.h'), gen);
  updateCxxFile(path.join(outputDir, fileprefix + '.cpp'), gen);
}

function printUsage() {
  console.log(`Usage: node ${process.argv[1]} [--prefix <file_prefix>] [--namespace <cxx_namespace>] <idl_file> <output_dir>`);
}

var args = [], outputDir, prefix, namespace;
for (var i = 2; i < process.argv.length; i++) {
  switch (process.argv[i]) {
    case '--prefix':
      prefix = process.argv[++i];
      break;
    case '--namespace':
      namespace = process.argv[++i];
      break;
    case '--help':
      printUsage();
      process.exit(0);
    default:
      if (process.argv[i][0] == '-') {
        console.error(`Invalid options: ${process.argv[i]}`);
        printUsage();
        process.exit(1);
      }
      args.push(process.argv[i]);
      break;
  }
}
if (args.length != 2) {
  console.error('Invalid amount of arguments');
  printUsage();
  process.exit(1);
}

parseIdl(args[0], args[1], prefix, namespace);
