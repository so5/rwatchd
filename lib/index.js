"use strict";
const debug = require("debug")("rwatchd:api");
const Ajv = require("ajv");
const { addWatcher, getWatcherByRequestID, clearAllWatchers } = require("./watcher.js");
const { findFromHistory, clearHistory } = require("./history.js");

/**
 * request object definition
 * @param {Object} request
 * @param {string} request.cmd - command
 * @param {string} request.delimiter - delimiter between each arguments default " "
 * @param {number} request.interval - interval time between commands executed on the same host
 * @param {string} request.argment - argument of command
 * @param {string} request.re - end determination regexp string
 * @param {boolean} request.until - flag it flip re.test result
 * @param {Object} request.hostInfo - host info object of ssh-client-wrapper
 * @param {string} request.finishedHook.cmd - command which executed once after finished event
 * @param {string} request.finishedLocalHook.cmd - command which executed once on localhost after finished event
 * @param {string} request.failedHook.cmd - command which executed once after failed event
 * @param {string} request.failedLocalHook.cmd - command which executed once on localhost after failed event
 * @param {string} request.doneHook.cmd - command which executed once after done event
 * @param {string} request.doneLocalHook.cmd - command which executed once on localhost after done event
 *
 * following member will be add by library
 * @param {string} request.id - identify string generated in uuidv4 format
 * @param {Object} request.event - EventEmitter object it emit "stopped", "checked" and "finished" event
 * @param {number} request.checkCount - how many times cmd was executed
 * @param {string} request.lastOutput - output from cmd when it was last executed
 *
 * cmd will be executed repeatedly while its output match re if until is not set or falsy value
 *
 * For details on hostInfo, see following URL
 * https://github.com/so5/ssh-client-wrapper/blob/main/lib/index.js
 *
 * all request which has same cmd will be integrated and issued at the same time
 * ex. if you add Request following 2 request respectively
 * {cmd: "ps -p", delimiter: ",", argsment:"10"}
 * {cmd: "ps -p",  delimiter: ",", argment:"2"}
 * ps -p 10,2 will be issued on remotehost
 *
 * please note that re (string) will be replaced by RegExp object
 *
 * hook cmd's rt and output will go to hook.rt and hook.output respectively see also hook object definition
 *
 */

/**
 * @param {Object} hook
 * @param {String} hook.cmd - cmd to be executed
 * following member will be overwrited by execute{Remote|Local}Hook function
 * @param {String} hook.rt- return code of hook cmd
 * @param {String} hook.output - output from hook cmd
 * @param {boolean} hook.withArgument - execute hook command with original argument
 */

const ajv = new Ajv({
  allErrors: true,
  coerceTypes: true,
  logger: {
    log: debug,
    warn: debug,
    error: debug
  }
});
require("ajv-keywords")(ajv, "transform");
const requestSchema = {
  type: "object",
  properties: {
    cmd: { type: "string", pattern: "\\S+", transform: ["trim"] },
    delimiter: { type: "string", pattern: "\\S+", transform: ["trim"] },
    argument: { type: "string", pattern: "\\S+", transform: ["trim"] },
    re: { type: "string", pattern: "\\S+", transform: ["trim"] },
    interval: { type: "number", minimum: 0 },
    until: { type: "boolean" },
    maxCount: { type: "number", minimum: 1 },
    hostInfo: {
      type: "object",
      properties: {
        host: { type: "string", pattern: "\\S+", transform: ["trim"] },
        user: { type: "string", pattern: "\\S+", transform: ["trim"] },
        port: { type: "number", minimum: 0, maximum: 65535 }
      },
      required: ["host"]
    }
  },
  required: ["hostInfo", "cmd", "argument"]
};

const validate = ajv.compile(requestSchema);
/**
 * add watch request
 * @param {Object} request - request object
 * @return {string} - id string
 */
function addRequest (request) {
  validate(request);
  if (validate !== null && Array.isArray(validate.errors)) {
    for (const e of validate.errors) {
      const prop = e.instancePath.replace(/^\//, "");
      if (e.keyword === "required") {
        throw new Error(`${e.params.missingProperty} is required`);
      }
      if (prop === "cmd") {
        if (request.cmd === "") {
          throw new Error("empty cmd is not allowed");
        }
        const err = new Error("invalid cmd specified");
        err.request = request;
        err.validationError = e;
        throw err;
      }
    }
  }
  const watcher = addWatcher(request);
  return watcher.addRequest(request);
}

/**
 * delete watch request and stop watching
 * @param {string} id - id string which returnd by addRequest
 * @return {Boolean} - successufully removed or not
 */
function delRequest (id) {
  const watcher = getWatcherByRequestID(id);
  if (watcher) {
    watcher.deleteRequest(id);
    return true;
  }
  return false;
}

/**
 * get detailed information of request
 * @param {string} id - id string which returnd by addRequest
 * @return {request}
 */
function getRequest (id) {
  const watcher = getWatcherByRequestID(id);
  return watcher ? watcher.getRequest(id) : findFromHistory(id);
}

/**
 * dstroy all resources
 */
async function clearAll () {
  clearHistory();
  return clearAllWatchers();
}

module.exports = {
  addRequest,
  delRequest,
  getRequest,
  clearAll
};
