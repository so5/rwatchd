"use strict";
const debug = require("debug")("rwatchd:engine");
const SBS = require("simple-batch-system");
const { spawn } = require("node:child_process");
const { split } = require("shlex");

/**
 * execute given command on localhost
 * @param {String} cmd - command to be executed
 * @param {String[]} outputStrings - output from command will be pushed to this array
 */
function localExec (cmd, outputStrings) {
  return new Promise((resolve, reject) => {
    const args = split(cmd);
    const exec = args.shift();
    const cp = spawn(exec, args, { shell: true });
    cp.stdout.on("data", (data) => {
      outputStrings.push(data.toString());
    });
    cp.stderr.on("data", (data) => {
      outputStrings.push(data.toString());
    });
    cp.on("close", (code) => {
      resolve(code);
    });
    cp.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * execute hook cmd on remotehost
 * @param {object} watcher
 * @param {hook} hook
 * @return {Promise} - changed to return code after fullfilled
 */
async function executeRemoteHook (watcher, hook, argument) {
  if (!hook) {
    return false;
  }
  if (typeof hook.output !== "string") {
    hook.output = "";
  }
  const cmd = hook.withArgument ? `${hook.cmd} ${argument}` : hook.cmd;
  hook.rt = await watcher.ssh.exec(cmd, 10, (output) => { hook.output += output; });
  return true;
}

/**
 * execute hook cmd on localhost
 * @param {hook} hook
 * @return {Promise} - changed to return code after fullfilled
 */
async function executeLocalHook (hook, argument) {
  if (!hook) {
    return false;
  }
  const output = [];
  const cmd = hook.withArgument ? `${hook.cmd} ${argument}` : hook.cmd;
  hook.rt = await localExec(cmd, output);
  hook.output = output.join("\n").trim();
  return true;
}

function hookHandler (watcher, remoteHook1, localHook1, remoteHook2, localHook2, argument) {
  return Promise.all([
    executeRemoteHook(watcher, remoteHook1, argument),
    executeLocalHook(localHook1, argument),
    executeRemoteHook(watcher, remoteHook2, argument),
    executeLocalHook(localHook2, argument)
  ]);
}

const sbs = new SBS({
  name: "rwatch",
  exec: async (watcher) => {
    if (watcher.size() === 0) {
      debug("all requests done:", watcher.name);
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
      .reduce((a, c) => { return `${a}${watcher.delimiter || " "}${c}`; });

    const cmd = `${watcher.cmd} ${argumentString}`.trim();
    let outputString = "";
    let rt = 0;
    if (watcher.onLocalhost) {
      debug("exec on loacalhost:", cmd);
      const output = [];
      rt = await localExec(cmd, output);
      outputString = output.join("\n");
    } else {
      debug("exec:", cmd);
      rt = await watcher.ssh.exec(cmd, 10, (output) => { outputString += output; });
    }

    const requestPromise = [];
    for (const [key, request] of watcher.requests) {
      ++request.checkCount;
      request.lastOutput = outputString;
      request.rt = rt;
      debug("output:", outputString.trim());
      if (request.re && request.re.test(outputString) === Boolean(request.until)) {
        debug(`${watcher.cmd} ${request.argument} finished`);
        watcher.requests.delete(key);
        requestPromise.push(
          hookHandler(watcher, request.finishedHook, request.finishedLocalHook, request.doneHook, request.doneLocalHook, request.argument)
            .then((e) => {
              request.event.emit("finished", request);
            }).catch((err) => {
              request.event.emit("failed", request, err);
            }).finally(() => {
              request.event.emit("done", request);
            }));
      } else if (typeof request.maxCount === "number" &&
      request.maxCount < request.checkCount) {
        debug(`${watcher.cmd} ${request.argument} failed due to max count exceeded`);
        watcher.requests.delete(key);
        requestPromise.push(
          hookHandler(watcher, request.failedHook, request.failedLocalHook, request.doneHook, request.doneLocalHook, request.argument)
            .then(() => {
              request.event.emit("failed", request);
              request.event.emit("done", request);
            }));
      } else {
        request.event.emit("checked", request);
      }
    }
    await Promise.all(requestPromise);
    const now = new Date();
    watcher.lastExecuted = now.getTime();
    if (watcher.size() > 0) {
      debug(`${watcher.size()} request remain`);
      const err = new Error("request remaining");
      err.needRetry = true;
      throw err;
    }

    return true;
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
