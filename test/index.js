"use strict";
process.on("unhandledRejection", console.dir); // eslint-disable-line no-console
Error.traceLimit = 100000;
const os = require("os");

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
    it("should return false when you try to delete retired request", async () => {
      const request = getRequest(id);
      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
      expect(delRequest(id)).to.be.false;
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
    it("should get distilled request object if it is retired", async () => {
      const request = getRequest(id);
      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
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
    it("should emit 'failed' when max count exceeded", async () => {
      arg2.re = "[0-5]";
      arg2.maxCount = 1;
      const id = addRequest(arg2);
      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("checked", checkedCb);
      request.event.on("failed", failedCb);
      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
      expect(finishedCb).not.to.be.called;
      expect(checkedCb).to.be.calledOnce;
      expect(failedCb).to.be.calledOnce;
    });
    it("should emit 'failed' if until is set and re never match", async () => {
      arg2.re = "hoge";
      arg2.maxCount = 1;
      arg2.until = true;
      const id = addRequest(arg2);
      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("checked", checkedCb);
      request.event.on("failed", failedCb);

      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
      expect(finishedCb).not.to.be.called;
      expect(checkedCb).to.be.calledOnce;
      expect(failedCb).to.be.calledOnce;
    });
    it("should consolidate arguments for same command on same host", async () => {
      arg2.cmd = "echo";
      arg2.re = "5";
      arg2.argument = 1;
      arg2.until = true;
      const id = addRequest(arg2);
      for (let i = 2; i < 6; i++) {
        arg2.argument = i;
        addRequest(arg2);
      }

      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("failed", failedCb);

      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
      expect(finishedCb).to.be.calledOnce;
      expect(failedCb).not.to.be.called;
      expect(request.lastOutput).to.be.equal("1 2 3 4 5\n");
    });
    it("should issue command directory on localhost", async () => {
      arg2.cmd = "hostname";
      const hostname = os.hostname();
      arg2.re = hostname;
      arg2.until = true;
      arg2.hostInfo.host = "localhost";
      delete arg2.hostInfo.port;
      delete arg2.hostInfo.user;
      const id = addRequest(arg2);

      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("failed", failedCb);

      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
      expect(finishedCb).to.be.calledOnce;
      expect(failedCb).not.to.be.called;
      expect(request.lastOutput).to.equal(hostname + "\n");
    });
    it("should issue command directory on localhost and get stderr", async () => {
      arg2.cmd = "hostname 1>&2";
      const hostname = os.hostname();
      arg2.re = hostname;
      arg2.until = true;
      arg2.hostInfo.host = "localhost";
      delete arg2.hostInfo.port;
      delete arg2.hostInfo.user;
      const id = addRequest(arg2);

      const request = getRequest(id);
      request.event.on("finished", finishedCb);
      request.event.on("failed", failedCb);

      await new Promise((resolve) => {
        request.event.on("done", resolve);
      });
      expect(finishedCb).to.be.calledOnce;
      expect(failedCb).not.to.be.called;
      expect(request.lastOutput).to.equal(hostname + "\n");
    });
    describe("test about hook", () => {
      const hostname = os.hostname();
      it("should execute finishedHook only once if watch request successfully finished", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "hoge";
        arg2.until = true;
        arg2.finishedHook = { cmd: "echo foo" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(finishedCb).to.be.calledOnce;
        expect(failedCb).not.to.be.called;
        expect(request.finishedHook.rt).to.equal(0);
        expect(request.finishedHook.output).to.equal("foo\n");
        expect(request.failedHook.rt).to.be.undefined;
        expect(request.failedHook.output).to.be.undefined;
      });
      it("should execute failedHook only once if watch request failed", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "huga";
        arg2.until = true;
        arg2.maxCount = 1;
        arg2.finishedHook = { cmd: "echo foo" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(failedCb).to.be.calledOnce;
        expect(finishedCb).not.to.be.called;
        expect(request.failedHook.rt).to.equal(0);
        expect(request.failedHook.output).to.equal("bar\n");
        expect(request.finishedHook.rt).to.be.undefined;
        expect(request.finishedHook.output).to.be.undefined;
      });
      it("should execute doneHook after watch request successfully finished", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "hoge";
        arg2.until = true;
        arg2.doneHook = { cmd: "echo foo" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(finishedCb).to.be.calledOnce;
        expect(failedCb).not.to.be.called;
        expect(request.doneHook.rt).to.equal(0);
        expect(request.doneHook.output).to.equal("foo\n");
        expect(request.failedHook.rt).to.be.undefined;
        expect(request.failedHook.output).to.be.undefined;
      });
      it("should execute doneHook only once even if watch request failed", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "huga";
        arg2.until = true;
        arg2.maxCount = 1;
        arg2.finishedHook = { cmd: "echo foo" };
        arg2.doneHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(failedCb).to.be.calledOnce;
        expect(finishedCb).not.to.be.called;
        expect(request.doneHook.rt).to.equal(0);
        expect(request.doneHook.output).to.equal("bar\n");
        expect(request.finishedHook.rt).to.be.undefined;
        expect(request.finishedHook.output).to.be.undefined;
      });

      it("should execute finished hook on localhost only once if watch request successfully finished", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "hoge";
        arg2.until = true;
        arg2.finishedLocalHook = { cmd: "hostname" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(finishedCb).to.be.calledOnce;
        expect(failedCb).not.to.be.called;
        expect(request.finishedLocalHook.rt).to.equal(0);
        expect(request.finishedLocalHook.output).to.equal(hostname);
        expect(request.failedHook.rt).to.be.undefined;
        expect(request.failedHook.output).to.be.undefined;
      });
      it("should execute failedHook on localhost only once if watch request failed", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "huga";
        arg2.until = true;
        arg2.maxCount = 1;
        arg2.finishedHook = { cmd: "echo foo" };
        arg2.failedLocalHook = { cmd: "hostname" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(failedCb).to.be.calledOnce;
        expect(finishedCb).not.to.be.called;
        expect(request.failedLocalHook.rt).to.equal(0);
        expect(request.failedLocalHook.output).to.equal(hostname);
        expect(request.finishedHook.rt).to.be.undefined;
        expect(request.finishedHook.output).to.be.undefined;
      });
      it("should execute doneHook on localhost after watch request successfully finished", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "hoge";
        arg2.until = true;
        arg2.doneLocalHook = { cmd: "hostname" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(finishedCb).to.be.calledOnce;
        expect(failedCb).not.to.be.called;
        expect(request.doneLocalHook.rt).to.equal(0);
        expect(request.doneLocalHook.output).to.equal(hostname);
        expect(request.failedHook.rt).to.be.undefined;
        expect(request.failedHook.output).to.be.undefined;
      });
      it("should execute doneHook on localhost only once even if watch request failed", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "huga";
        arg2.until = true;
        arg2.maxCount = 1;
        arg2.finishedHook = { cmd: "echo foo" };
        arg2.doneLocalHook = { cmd: "hostname" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(failedCb).to.be.calledOnce;
        expect(finishedCb).not.to.be.called;
        expect(request.doneLocalHook.rt).to.equal(0);
        expect(request.doneLocalHook.output).to.equal(hostname);
        expect(request.finishedHook.rt).to.be.undefined;
        expect(request.finishedHook.output).to.be.undefined;
      });
      it("should fire failed event if hook cause error", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "hoge";
        arg2.hostInfo.host = "localhost";
        delete arg2.hostInfo.port;
        delete arg2.hostInfo.user;
        arg2.until = true;
        arg2.doneHook = { cmd: "hoge" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(finishedCb).not.to.be.called;
        expect(failedCb).to.be.calledOnce;
        expect(request.doneHook.rt).to.be.undefined;
        expect(request.doneHook.output).to.be.a("string").and.empty;
        expect(request.failedHook.rt).to.be.undefined;
        expect(request.failedHook.output).to.be.undefined;
      });
      it.skip("[because we can not make fail localHook] should fire failed event if localHook cause error", async () => {
        arg2.cmd = "echo hoge";
        arg2.re = "hoge";
        arg2.until = true;
        arg2.doneLocalHook = { cmd: "hoge" };
        arg2.failedHook = { cmd: "echo bar" };
        const id = addRequest(arg2);
        const request = getRequest(id);
        request.event.on("finished", finishedCb);
        request.event.on("failed", failedCb);
        await new Promise((resolve) => {
          request.event.on("done", resolve);
        });
        expect(finishedCb).to.be.called;
        expect(failedCb).not.to.be.calledOnce;
        expect(request.doneLocalHook.rt).to.be.undefined;
        expect(request.doneLocalHook.output).to.be.undefined;
        expect(request.finishedHook.rt).to.equal(127);
        expect(request.finishedHook.output).to.be.undefined;
        expect(request.failedHook.rt).to.be.undefined;
        expect(request.failedHook.output).to.be.undefined;
      });
    });
  });
});
