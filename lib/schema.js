"use strict";
const hookSchema = {
  type: "object",
  properties: {
    cmd: { type: "string", pattern: "\\S+", transform: ["trim"] },
    withArgument: { type: "boolean" }
  },
  required: ["cmd"]
};

// copy from ssh-client-wrapper
// it should be exported from it
const hostInfoSchema = {
  type: "object",
  properties: {
    host: { type: "string", pattern: "\\S+", transform: ["trim"] },
    user: { type: "string", pattern: "\\S+", transform: ["trim"] },
    port: { type: "number", minimum: 0, maximum: 65535 },
    keyFile: { type: "string", pattern: "\\S+", transform: ["trim"] },
    noStrictHostkeyChecking: { type: "boolean" },
    ControlPersist: { type: "number", minimum: 0 },
    ConnectTimeout: { type: "number", minimum: 0 },
    maxRetry: { type: "number", minimum: 0 },
    retryMinTimeout: { type: "number", minimum: 0 },
    retryMaxTimeout: { type: "number", minimum: 0 },
    sshOpt: { type: "array", minItems: 1, items: { type: "string", pattern: "\\S+", transform: ["trim"] } }
  },
  required: ["host"]
};

const requestSchema = {
  type: "object",
  properties: {
    cmd: { type: "string", pattern: "\\S+", transform: ["trim"] },
    delimiter: { type: "string", pattern: "\\S+", transform: ["trim"] },
    argument: { type: "string", pattern: "\\S+", transform: ["trim"] },
    withoutArgument: { type: "boolean" },
    re: { type: "string", pattern: "\\S+", transform: ["trim"] },
    interval: { type: "number", minimum: 0 },
    until: { type: "boolean" },
    allowEmptyOutput: { type: "boolean" },
    numAllowFirstFewEmptyOutput: { type: "number" },
    maxCount: { type: "number", minimum: 1 },
    hostInfo: hostInfoSchema,
    finishedHook: hookSchema,
    finishedLocalHook: hookSchema,
    failedHook: hookSchema,
    failedLocalHook: hookSchema,
    doneHook: hookSchema,
    doneLocalHook: hookSchema
  },
  required: ["hostInfo", "cmd", "argument"]
};

module.exports = {
  requestSchema,
  hostInfoSchema,
  hookSchema
};
