const retiredRequests = new Map();

export function addHistory (requestID, request) {
  retiredRequests.set(requestID, request);
}
export function findFromHistory (requestID) {
  return retiredRequests.get(requestID);
}

export function clearHistory () {
  retiredRequests.clear();
}
