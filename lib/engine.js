"use strict";
const debug = require("debug")("rwatch:engine");
const SBS = require("simple-batch-system");
const sbs = new SBS({
  name: "rwatch",
  exec: async (watcher) => {
    if (watcher.size() === 0) {
      debug("all requests done already", watcher.name);
      return true;
    }
    if (watcher.lastExecuted) {
      const now = new Date();
      const wait = watcher.lastExecuted + watcher.interval - now.getTime();
      if (wait > 0) {
        const err = new Error("interval time not reached");
        err.needRetry = true;
        throw err;
      }
    }
    const argumentString = Array.from(watcher.requests.values())
      .map((e) => { return e.argument; })
      .reduce((a, c) => { return `${watcher.delimiter}${c}`; });

    let outputString = "";
    await watcher.ssh.exec(`${watcher.cmd} ${argumentString}`, 10,
      (output) => { outputString += output; });

    watcher.requests.forEach((request, key, map) => {
      ++request.checkCount;
      request.lastOutput = outputString;
      debug("output:", outputString);
      if (request.re && request.re.test(outputString) === Boolean(request.until)) {
        debug(`${watcher.cmd} ${request.argument} finished`);
        request.ee.emit("finished", request);
        request.ee.emit("done", request);
        map.delete(key);
      } else if (typeof request.maxCount === "number" &&
      request.maxCount < request.checkCount) {
        debug(`${watcher.cmd} ${request.argument} failed due to max count exceeded`);
        request.ee.emit("failed", request);
        request.ee.emit("done", request);
        map.delete(key);
      } else {
        request.ee.emit("checked", request);
      }
    });
    const now = new Date();
    watcher.lastExecuted = now.getTime();
    if (watcher.size() > 0) {
      debug(`${watcher.size()} request remain`);
      const err = new Error("request remaining");
      err.needRetry = true;
      throw err;
    }
  },
  retry: (err) => {
    return err.needRetry;
  },
  submitHook: (queue, watcher, urgent) => {
    const { id } = watcher;
    const entry = queue.find((e) => {
      return id === e.id;
    });
    return entry === null;
  },
  retryLater: true,
  interval: 1000
});

module.exports = {
  sbs
};
