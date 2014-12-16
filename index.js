'use strict';

var S = require('string');
var os = require('os');
var exec = require('child_process').exec;
var p4options = require('./p4options');

function optionBuilder(options) {
  options = options || {};

  var results = {stdin: [], args: [], files: []};
  Object.keys(options).map(function (option) {
    var p4option = p4options[option];
    if (!p4option) return;
    if (p4option.category !== 'unary') {
      if ((options[option] || {}).constructor !== p4option.type) return;
    }
    if (p4option.category === 'stdin') {
      results.stdin.push(p4option.cmd + options[option]);
      if (results.args.indexOf('-i') < 0) results.args.push('-i');
    } else if (p4option.cmd) {
      results.args.push(p4option.cmd);
      if (p4option.category === 'mixed') results.args.push(options[option]);
    } else {
      results.files = results.files.concat(options[option]);
    }
  });
  return results;
}

function execP4(p4cmd, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  var ob = optionBuilder(options);
  var cmd = ['p4', p4cmd, ob.args.join(' '), ob.files.join(' ')];
  var child = exec(cmd.join(' '), function (err, stdout, stderr) {
    if (err) return callback(err);
    if (stderr) return callback(new Error(stderr));
    return callback(null, stdout);
  });
  if (ob.stdin.length > 0) {
    ob.stdin.forEach(function (line) {
      child.stdin.write(line + '\n');
    });
    child.stdin.emit('end');
  }
}

function NodeP4() {}

NodeP4.prototype.changelist = {
  create: function (options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    var newOptions = {
      _change: 'new',
      description: options.description || '<saved by node-perforce>'
    };
    execP4('change', newOptions, function (err, stdout) {
      if (err) return callback(err);
      var matched = stdout.match(/([0-9]+)/g);
      if (matched.length > 0) return callback(null, parseInt(matched[0], 10));
      else return callback(new Error('Unknown error'));
    });
  },
  edit: function (options, callback) {
    callback = callback || function(){};
    if (!options || !options.changelist) return callback(new Error('Missing parameter/argument'));
    if (!options.description) return callback();
    var newOptions = {
      _change: options.changelist.toString(),
      description: options.description
    };
    execP4('change', newOptions, function (err) {
      if (err) return callback(err);
      return callback();
    });
  },
  delete: function (options, callback) {
    callback = callback || function(){};
    if (!options || !options.changelist) return callback(new Error('Missing parameter/argument'));
    execP4('change', {_delete: options.changelist}, function (err) {
      if (err) return callback(err);
      return callback();
    });
  },
  view: function (options, callback) {
    if (!options || !options.changelist) return callback(new Error('Missing parameter/argument'));
    execP4('change', {_output: options.changelist}, function (err, stdout) {
      if (err) return callback(err);

      // preprocessing file status
      stdout = stdout.replace(/(\t)+#(.)*/g, function (match) {
        return '@@@' + match.substring(3);
      });

      var result = {};
      var lines = stdout.replace(/#(.)*\n/g, '').split(os.EOL + os.EOL);
      lines.forEach(function (line) {
        var key = S(line.split(':')[0].toLowerCase()).trim().camelize().s;
        if (key) {
          result[key] = S(line).between(':').trim().s;
        }
      });

      if (result.files) {
        result.files = result.files.split('\n').map(function (file) {
          var file = file.replace(/\t*/g, '').split('@@@');
          return {file: file[0], action: file[1]};
        });
      } else {
        result.files = [];
      }
      return callback(null, result);
    });
  }
};

NodeP4.prototype.info = function (callback) {
  execP4('info', function (err, stdout) {
    if (err) return callback(err);

    var result = {};
    S(stdout).lines().forEach(function (line) {
      if (!line) return;
      var key = S((line.split(':')[0]).toLowerCase()).camelize().s;
      result[key] = S(line).between(':').trim().s;

    });
    callback(null, result);
  });
};

var commonCommands = ['add', 'delete', 'edit', 'revert'];
commonCommands.forEach(function (command) {
  NodeP4.prototype[command] = function (options, callback) {
    execP4(command, options, callback);
  };
});

module.exports = new NodeP4();
