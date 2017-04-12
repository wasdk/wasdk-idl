var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var tests = fs.readdirSync(path.join(__dirname, 'tests')).map(function (name) {
    return path.join(__dirname, 'tests', name);
}).filter(function (path) {
   return fs.lstatSync(path).isDirectory();
});

var cliPath = require.resolve('./dist/cli.js');
var nodePath = 'node';

var runTests = 0, failedTests = 0;

function runTest(testPath) {
  runTests++;
  var idlName = path.basename(testPath) + '.idl';
  var idlPath = path.join(testPath, idlName);
  var runOut = path.join(testPath, 'run');
  spawnSync('rm', ['-rf', runOut], {shell: true});
  var result;
  result = spawnSync(nodePath, [cliPath, idlPath, runOut], {shell: true});
  if (result.status != 0) {
    failedTests++;
    console.error('Test ' + testPath + ' failed: error during transform.');
    console.error(result.stderr.toString());
    return;
  }
  var expected = path.join(testPath, 'out');
  result = spawnSync('diff', ['-r', '-U', 3, expected, runOut], {shell: true});
  if (result.status != 0) {
    failedTests++;
    console.error('Test ' + testPath + ' failed:');
    console.error(result.stdout.toString());
    return;      
  }
}

tests.forEach(runTest);
if (runTests === 0) {
  console.log('No tests were found.');
  process.exit(1);
}
console.log('Run ' + runTests + ' test(s).');
if (failedTests === 0) {
  console.log('Success.');
  process.exit(0);
}
console.log('Failed ' + failedTests + ' test(s).');
process.exit(2);
