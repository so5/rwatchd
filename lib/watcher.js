"use strict";
const EventEmitter = require("node:events");
const { randomUUID } = require("node:crypto");
const debug = require("debug")("rwatchd:watcher");
const Ajv = require("ajv");
const SSH = require("ssh-client-wrapper");
const { sbs } = require("./engine.js");
const watchers = new Map();
const { addHistory } = require("./history.js");
const { hostInfoSchema } = require("./schema.js");

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
hostInfoSchema.additionalProperties = false;
const validate = ajv.compile(hostInfoSchema);

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

function onLocalhost (hostInfo) {
  if (hostInfo.port || hostInfo.user) {
    return false;
  }
  return ["localhost", "127.0.0.1"].includes(hostInfo.host);
}

class Watcher {
  constructor (arg) {
    this.requests = new Map();
    this.cmd = arg.cmd;
    this.delimiter = arg.delimiter;
    this.interval = arg.interval;
    this.withoutArgument = arg.withoutArgument;

    if (onLocalhost(arg.hostInfo)) {
      this.onLocalhost = true;
    } else {
      this.onLocalhost = false;
      this.ssh = new SSH(arg.hostInfo);
    }
    // we do not keep password, passphrase for security reason
    // we also do not keep masterPty it does not make sence.
    const { password, passphrase, masterPty, ...remainings } = arg.hostInfo;
    this.hostInfo = structuredClone(remainings);
    validate(this.hostInfo); // remove additional properties

    this.id = randomUUID();
    this.name = `${arg.cmd} on ${getRemotehostLabel(arg.hostInfo.host, arg.hostInfo.user, arg.hostInfo.port)}`;
    debug(`watcher: ${this.name} created`);
  }

  transform (request) {
    const { re, event, ...distilledRequest } = request;
    distilledRequest.re = re ? re.source : undefined;
    distilledRequest.cmd = this.cmd;
    distilledRequest.delimiter = this.delimiter;
    distilledRequest.interval = this.interval;
    distilledRequest.hostInfo = this.hostInfo;
    return JSON.parse(JSON.stringify(distilledRequest));
  }

  addRequest (argRequest) {
    const { argument, maxCount, until, re, event, ...remaining } = argRequest;
    if (this.requests.has(argRequest.id)) {
      const existingRequest = this.getRequest(argRequest.id);
      if (existingRequest.argument === argument) {
        if (!existingRequest.event) {
          existingRequest.event = new EventEmitter();
        }
        if (typeof re === "string") {
          existingRequest.re = new RegExp(re);
        }
        if (typeof maxCount === "number") {
          existingRequest.maxCount = maxCount;
        }
        if (typeof until !== "undefined") {
          existingRequest.until = until;
        }
        return existingRequest.id;
      }
    }

    const id = randomUUID();
    const request = {
      id,
      maxCount,
      argument,
      until,
      checkCount: 0,
      event: new EventEmitter(),
      re: typeof re === "string" ? new RegExp(re) : undefined,
      ...remaining
    };
    request.event.once("done", (e) => {
      addHistory(e.id, this.transform(e));
    });
    this.requests.set(id, request);
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

  /**
   * close resources
   */
  async close () {
    this.requests.clear();
    if (!this.ssh) {
      return;
    }
    // disconnect is async function
    return this.ssh.disconnect();
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
    debug("watcher already exists", sameWatcher);
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

async function clearAllWatchers () {
  const p = [];
  for (const watcher of watchers.values()) {
    p.push(watcher.close());
  }
  watchers.clear();
  return Promise.all(p);
}

module.exports = {
  addWatcher,
  getWatcherByRequestID,
  clearAllWatchers
};
