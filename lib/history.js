"use strict";
const retiredRequests = new Map();

function addHistory (requestID, request) {
  retiredRequests.set(requestID, request);
}
function findFromHistory (requestID) {
  return retiredRequests.get(requestID);
}

function clearHistory () {
  retiredRequests.clear();
}

module.exports = {
  addHistory,
  findFromHistory,
  clearHistory
};
