[![npm version](https://badge.fury.io/js/rwatchd.svg)](https://badge.fury.io/js/rwatchd)
[![Known Vulnerabilities](https://snyk.io/test/github/so5/rwatchd/badge.svg)](https://snyk.io/test/github/so5/rwatchd)
[![Test Coverage](https://api.codeclimate.com/v1/badges/f10b4f803fe1b775a028/test_coverage)](https://codeclimate.com/github/so5/rwatchd/test_coverage)
[![Maintainability](https://api.codeclimate.com/v1/badges/f10b4f803fe1b775a028/maintainability)](https://codeclimate.com/github/so5/rwatchd/maintainability)

# rwatchd
Remote WATCH Daemon

## Installation
```bash
npm install rwatchd
```

## Usage
Here is a simple example of how to use `rwatchd` to watch for a file named `foo` to appear in the home directory on a remote server.

```javascript
import { addRequest, getRequest, clearAll } from "rwatchd";

// 1. Define the connection information for the remote host.
// This object is passed to ssh-client-wrapper.
// see https://github.com/so5/ssh-client-wrapper for more details.
const hostInfo = {
  host: "your-remote-host",
  user: "your-username",
  keyFile: "/path/to/your/private/key"
};

// 2. Create a request object.
const request = {
  // The command to execute on the remote host.
  cmd: "ls",
  // The argument for the command.
  // In this case, we are looking for a file named "foo".
  argument: "foo",
  // A regular expression to match against the output of the command.
  re: "foo",
  // The `until` flag means the watch will stop when the regex matches.
  // If `until` is false or not set, it stops when the regex does not match.
  until: true,
  // Information about the remote host.
  hostInfo: hostInfo,
  // Interval between checks (in milliseconds).
  interval: 5000
};

// 3. Add the request to the watcher.
// This returns an ID for the request.
const id = addRequest(request);
console.log(`Watching for 'foo' with request ID: ${id}`);

// 4. Get the request object to access its event emitter.
const managedRequest = getRequest(id);

// 5. Listen for events.
managedRequest.event.on("checked", (req) => {
  console.log(`[${new Date().toISOString()}] Checked #${req.checkCount}: 'foo' not found yet. Output was:\n${req.lastOutput}`);
});

managedRequest.event.on("finished", (req) => {
  console.log(`[${new Date().toISOString()}] Finished: 'foo' has been found!`);
  console.log("Request details:", req);
  // Clean up all watchers and connections
  clearAll();
});

managedRequest.event.on("failed", (req, err) => {
  console.error(`[${new Date().toISOString()}] Failed: Something went wrong.`, err);
  console.error("Request details:", req);
  // Clean up all watchers and connections
  clearAll();
});

managedRequest.event.on("done", (req) => {
  console.log(`[${new Date().toISOString()}] Done: Watch for request ${req.id} is now complete.`);
});

```

## API Reference

### Functions

#### `addRequest(request)`
Adds a new watch request. This is the main entry point for the library.
*   **`request`** (`Object`): The request object that defines what to watch. See the "Request Object" section for details.
*   **Returns**: `string` - A unique ID for the request.

#### `delRequest(id)`
Deletes an active watch request. This will stop the watcher if it's the last request for that watcher.
*   **`id`** (`string`): The ID of the request to delete, as returned by `addRequest`.
*   **Returns**: `boolean` - `true` if the request was found and deleted, `false` otherwise.

#### `getRequest(id)`
Retrieves the request object associated with an ID. This is useful for accessing the `event` emitter and the current state of the request.
*   **`id`** (`string`): The ID of the request to retrieve.
*   **Returns**: `Object` | `undefined` - The request object, or `undefined` if not found.

#### `replaceCmd(id, cmd)`
Replaces the command for all requests managed by the same watcher as the request with the given ID.
*   **`id`** (`string`): The ID of a request.
*   **`cmd`** (`string`): The new command to execute.
*   **Returns**: `boolean` - `true` if the watcher was found and the command was replaced, `false` otherwise.

#### `clearAll()`
Stops all watchers, closes all remote connections, and clears all internal states.
*   **Returns**: `Promise<void>`

---

### The Request Object
The `request` object is a plain JavaScript object that configures a watch.

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `cmd` | `string` | Yes | The command to be executed on the remote host. |
| `argument` | `string` | Yes | The argument(s) for the `cmd`. Multiple requests for the same `cmd` and `hostInfo` will have their arguments concatenated. |
| `hostInfo` | `Object` | Yes | An object with connection details for the remote host. See below. |
| `delimiter` | `string` | No | Delimiter to use when concatenating arguments from multiple requests. Defaults to a single space. |
| `interval` | `number` | No | The interval in milliseconds between command executions. |
| `re` | `string` | No | A regular expression string to test against the command's output. |
| `until` | `boolean`| No | If `true`, the watch stops when `re` matches the output. If `false` (default), it stops when `re` *does not* match. |
| `maxCount` | `number` | No | The maximum number of times to execute the command before giving up. |
| `withoutArgument` | `boolean` | No | If `true`, the command will be executed without any arguments. |
| `allowEmptyOutput`|`boolean`| No | If `true`, the watcher will continue even if the command produces empty output. |
| `numAllowFirstFewEmptyOutput`|`number`| No | Allows the first few command executions to return empty output without stopping the watch. |
| `finishedHook`| `Object` | No | A hook to execute on the remote host when the request finishes successfully. See "Hook Object". |
| `finishedLocalHook`| `Object` | No | A hook to execute on the local machine when the request finishes successfully. |
| `failedHook`| `Object` | No | A hook to execute on the remote host when the request fails. |
| `failedLocalHook`| `Object` | No | A hook to execute on the local machine when the request fails. |
| `doneHook`| `Object` | No | A hook to execute on the remote host when the request is done (either finished or failed). |
| `doneLocalHook`| `Object` | No | A hook to execute on the local machine when the request is done. |

### The `hostInfo` Object
This object is passed to `ssh-client-wrapper`. For full details, please refer to its [documentation](https://github.com/so5/ssh-client-wrapper).

| Key | Type | Description |
| --- | --- | --- |
| `host` | `string` | The hostname or IP address of the remote server. |
| `user` | `string` | The username for the SSH connection. |
| `port` | `number` | The port for the SSH connection. Defaults to 22. |
| `keyFile`| `string` | Path to the private key for authentication. |
| `...` | | Other options supported by `ssh-client-wrapper`. |

### The Hook Object
A hook object defines a command to be executed at a certain point in the request lifecycle.

| Key | Type | Description |
| --- | --- | --- |
| `cmd` | `string` | The command to execute. |
| `withArgument`|`boolean`| If `true`, the original request's `argument` is passed to the hook command. |

---

## Events
Each request object returned by `getRequest(id)` has an `event` property which is an instance of `EventEmitter`. You can listen for the following events:

#### `event: 'checked'`
*   **Callback**: `(request) => {}`
*   Emitted each time the command is executed and the finish condition (`re` and `until`) is not met. The watch will continue.
*   The `request` object passed to the callback contains the latest status, including `checkCount`, `rt` (return code), and `lastOutput`.

#### `event: 'finished'`
*   **Callback**: `(request) => {}`
*   Emitted when the finish condition is met. This signals the successful completion of the watch.

#### `event: 'failed'`
*   **Callback**: `(request, error) => {}`
*   Emitted in the following cases:
    *   The `maxCount` is reached before the finish condition is met.
    *   An error occurs during the execution of a hook.
*   The `error` argument may contain details about the hook execution failure.

#### `event: 'done'`
*   **Callback**: `(request) => {}`
*   Emitted when the request is considered complete, for any reason. It is emitted immediately after `finished` or `failed`. This is a good place to perform final cleanup for a specific request.
