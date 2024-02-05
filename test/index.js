"use strict";
process.on("unhandledRejection", console.dir); // eslint-disable-line no-console
Error.traceLimit = 100000;

// setup test framework
const chai = require("chai");
const { expect } = chai;
const sinon = require("sinon");
chai.use(require("sinon-chai"));

// helper
const hostInfo = require("./testUtil/hostInfo.js");

// testee
const {
  addRequest,
  delRequest,
  getRequest,
  clearAll
} = require("../lib/index.js");

describe("e2e test for rwatch core lib", function () {
  this.timeout(20000);
  const arg = {
    cmd: "date +%S;sleep 1",
    argument: " ",
    re: "0",
    hostInfo
  };
  afterEach(async () => {
    await clearAll();
  });
  describe("test for addRequest", () => {
    it("should add request and get id string", () => {
      const id = addRequest(arg);
      expect(id).to.be.a("string");
    });
    it("allow multiple call with same id ", () => {
      const arg2 = structuredClone(arg);
      arg2.maxCount = 2;
      delete arg2.re;
      const arg3 = structuredClone(arg2);
      const id = addRequest(arg2);
      arg3.id = id;
      const id2 = addRequest(arg3);
      const id3 = addRequest(arg3);
      expect(id).to.be.a("string");
      expect(id2).to.equal(id);
      expect(id3).to.equal(id);
    });
    it("should reject if arg does not have cmd", () => {
      const arg2 = structuredClone(arg);
      delete arg2.cmd;
      expect(() => { addRequest(arg2); }).to.throw("cmd is required");
    });
    it("should reject if arg does not have argument", () => {
      const arg2 = structuredClone(arg);
      delete arg2.argument;
      expect(() => { addRequest(arg2); }).to.throw("argument is required");
    });
    it("should reject if arg does not have hostInfo", () => {
      const arg2 = structuredClone(arg);
      delete arg2.hostInfo;
      expect(() => { addRequest(arg2); }).to.throw("hostInfo is required");
    });
    it("should reject if arg does not have hostInfo.host", () => {
      const arg2 = structuredClone(arg);
      delete arg2.hostInfo.host;
      expect(() => { addRequest(arg2); }).to.throw("host is required");
    });
    it("should reject if cmd is empty string", () => {
      const arg2 = structuredClone(arg);
      arg2.cmd = "   ";
      expect(() => { addRequest(arg2); }).to.throw("empty cmd is not allowed");
    });
    it("should reject if cmd is object", () => {
      const arg2 = structuredClone(arg);
      arg2.cmd = {};
      expect(() => { addRequest(arg2); }).to.throw("invalid cmd specified");
    });
  });
  describe("test for delRequest", () => {
    let id;
    beforeEach(() => {
      id = addRequest(arg);
    });
    it("should return true", () => {
      expect(delRequest(id)).to.be.true;
    });
    it("should return false if request ID is not existing request's id", () => {
      expect(delRequest("hoge")).to.be.false;
    });
    it("should return false when you try to delete retired request", (done) => {
      const req = getRequest(id);
      req.event.on("done", () => {
        expect(delRequest(id)).to.be.false;
        done();
      });
    });
  });
  describe("test for getRequest", () => {
    let id;
    beforeEach(() => {
      id = addRequest(arg);
    });
    it("should get request object", () => {
      expect(getRequest(id)).to.own.include({ argument: arg.argument, checkCount: 0 });
    });
    it("should get undefined if request ID is not existing request's id", () => {
      expect(getRequest("hoge")).to.be.undefined;
    });
    it("should get distilled request object if it is retired", (done) => {
      const req = getRequest(id);
      req.event.on("done", () => {
        const result = getRequest(id);
        expect(result.id).to.equal(id);
        expect(result.argument).to.equal("");
        expect(result.checkCount).to.be.a("number");
        expect(result.lastOutput).to.have.string("\n");
        expect(result.re).to.equal(arg.re);
        expect(result.cmd).to.equal(arg.cmd);
        expect(result.hostInfo.host).to.equal(hostInfo.host);
        expect(result.hostInfo.user).to.equal(hostInfo.user);
        expect(result.hostInfo.port).to.equal(hostInfo.port);
        expect(result.hostInfo.password).to.equal(hostInfo.password);
        expect(result.hostInfo.noStrictHostkeyChecking).to.equal(hostInfo.noStrictHostkeyChecking);
        done();
      });
    });
  });
  describe("test about actual rwatch behavier", () => {
    const finishedCb = sinon.stub();
    const checkedCb = sinon.stub();
    const failedCb = sinon.stub();
    let arg2;
    beforeEach(() => {
      finishedCb.reset();
      checkedCb.reset();
      failedCb.reset();
      arg2 = structuredClone(arg);
    });
    it("should emit 'failed' when max count exceeded", (done) => {
      arg2.re = "[0-5]";
      arg2.maxCount = 1;
      const id = addRequest(arg2);
      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("checked", checkedCb);
      request.event.on("failed", failedCb);
      // we expect call back will be executed in order of registering
      request.event.on("done", () => {
        expect(finishedCb).not.to.be.called;
        expect(checkedCb).to.be.calledOnce;
        expect(failedCb).to.be.calledOnce;
      });
      request.event.on("done", () => {
        done();
      });
    });
    it("should emit 'failed' if until is set and re never match", (done) => {
      arg2.re = "hoge";
      arg2.maxCount = 1;
      arg2.until = true;
      const id = addRequest(arg2);
      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("checked", checkedCb);
      request.event.on("failed", failedCb);

      request.event.on("done", () => {
        expect(finishedCb).not.to.be.called;
        expect(checkedCb).to.be.calledOnce;
        expect(failedCb).to.be.calledOnce;
      });
      request.event.on("done", () => {
        done();
      });
    });
  });
});
