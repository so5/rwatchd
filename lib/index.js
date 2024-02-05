"use strict";
const debug = require("debug")("rwatch:interface");
const Ajv = require("ajv");
const { addWatcher, getWatcherByRequestID } = require("./watcher.js");

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
 *
 * following member will be add by library
 * @param {string} request.id - identify string generated in uuidv4 format
 * @param {Object} request.ee - EventEmitter object it emit "stopped", "checked" and "finished" event
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
 * please note re will be replaced by RegExp object
 *
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
  return watcher ? watcher.getRequest(id) : null;
}

module.exports = {
  addRequest,
  delRequest,
  getRequest
};
