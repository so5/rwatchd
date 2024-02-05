"use strict";
const EventEmitter = require("node:events");
const debug = require("debug")("rwatch:watcher");
const SSH = require("ssh-client-wrapper");
const { randomUUID } = require("node:crypto");
const { sbs } = require("./engine.js");
const watchers = new Map();

sbs.on("complete", (id) => {
  debug(`watcher ${id} complete all request`);
  watchers.delete(id);
});

function getRemotehostLabel (host, user, port) {
  return `${user ? `${user}@` : ""}${host}${port ? `:${port}` : ""}`;
}

function getSameWatcher (cmd, delimiter, host, port, user) {
  for (const watcher of watchers.values()) {
    if (cmd === watcher.cmd &&
      delimiter === watcher.delimiter &&
      host === watcher.hostInfo.host &&
      port === watcher.hostInfo.port &&
      user === watcher.hostInfo.user) {
      return watcher;
    }
  }
  return null;
}

class Watcher {
  constructor (arg) {
    this.requests = new Map();
    this.cmd = arg.cmd;
    this.delimiter = arg.delimiter;
    this.interval = arg.interval;
    this.ssh = new SSH(arg.hostInfo);
    this.hostInfo = structuredClone(arg.hostInfo);

    this.id = randomUUID();
    this.name = `${arg.cmd} on ${getRemotehostLabel(arg.hostInfo.host, arg.hostInfo.user, arg.hostInfo.port)}`;
  }

  addRequest (request) {
    const { argument, re, maxCount, until } = request;
    if (this.requests.has(request.id)) {
      const existingRequest = this.getRequest(request.id);
      if (!existingRequest.ee) {
        existingRequest.ee = new EventEmitter();
      }
      if (typeof re === "string") {
        existingRequest.re = new RegExp(re);
      }
      if (typeof maxCount === "number") {
        existingRequest.maxCount = maxCount;
      }
      return existingRequest.id;
    }

    const id = randomUUID();
    this.requests.set(id, {
      id,
      maxCount,
      argument,
      until,
      checkCount: 0,
      ee: new EventEmitter(),
      re: typeof re === "string" ? new RegExp(re) : undefined
    });
    // if watcher is already in quque
    // qsub will denied by submitHook
    sbs.qsub(this);
    return id;
  }

  /**
   * delete request object
   * @param {string} id - request id
   */
  deleteRequest (id) {
    this.requests.delete(id);
  }

  /**
   * get request object
   * @param {string} id - request id
   */
  getRequest (id) {
    return this.requests.get(id);
  }

  /**
   * return size of requests
   */
  size () {
    return this.requests.size;
  }
}

/**
 * create new watcher or return existing watcher
 */
function addWatcher (arg) {
  const { cmd, delimiter, hostInfo } = arg;
  const { host, port, user } = hostInfo;
  const sameWatcher = getSameWatcher(cmd, delimiter, host, port, user);
  if (sameWatcher !== null) {
    return sameWatcher;
  }
  const watcher = new Watcher(arg);
  watchers.set(watcher.id, watcher);
  return watcher;
}

/**
 * return watcher which have specified request
 * @param {string} requestID - request id
 * @return {Watcher}
 */
function getWatcherByRequestID (requestID) {
  for (const watcher of watchers.values()) {
    if (watcher.requests.has(requestID)) {
      return watcher;
    }
  }
  return null;
}

module.exports = {
  addWatcher,
  getWatcherByRequestID
};
