/* globals
canvas,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */




/**
 * Basic queue class
 */
class Queue {
  #items = [];
  enqueue(item) { this.#items.push(item); }
  dequeue()     { return this.#items.shift(); }
  get size()    { return this.#items.length; }
}


/**
 * Async queue class.
 * Every time something is queued, dequeue is invoked.
 * Dequeue awaits the task. When completed (or errored out), next task in the queue is awaited.
 * From https://stackoverflow.com/questions/53540348/js-async-await-tasks-queue
 */
class AsyncQueue extends Queue {
  #pendingPromise = false;

  enqueue(action) {
    return new Promise((resolve, reject) => {
      super.enqueue({ action, resolve, reject });
      this.dequeue();
    });
  }

  async dequeue() {
    if (this.#pendingPromise) return false;
    const item = super.dequeue();
    if (!item) return false;
    try {
      this.#pendingPromise = true;
      const payload = await item.action(); // Or item.action(this) ?
      this.#pendingPromise = false;
      item.resolve(payload);
    } catch (e) {
      this.#pendingPromise = false;
      item.reject(e);
    } finally {
      this.dequeue();
    }
    return true;
  }

  /**
   * Create a queue object.
   * @param {object} [opts]   Options used for the queue object structure
   * @param {function} [opts.action]    Function or async function
   * @param {function} [opts.resolve]   Function to handle the return of the action function
   * @param {function} [opts.reject]    Function to handle errors with the action function
   * @param {...} [...] Object properties for the queue object
   * @returns {AsyncQueueObject}
   */
  static createQueueObject({ action, resolve, reject, ...properties } = {}) {
    action ??= () => true;
    action.resolve = resolve ?? (() => true);
    action.reject = reject ?? ((e) => console.log(e));
    for ( const [key, value] of Object.entries(properties) ) action[key] = value;
    return action;
  }
}


/


// item = {
//   token: _token,
//   action: async function() { console.log(this.token); }
// }

/* Test
// Helper function for 'fake' tasks
// Returned Promise is wrapped! (tasks should not run right after initialization)
let _ = ({ ms, ...foo } = {}) => () => new Promise(resolve => setTimeout(resolve, ms, foo));
// ... create some fake tasks
let p1 = _({ ms: 50, url: '❪𝟭❫', data: { w: 1 } });
let p2 = _({ ms: 20, url: '❪𝟮❫', data: { x: 2 } });
let p3 = _({ ms: 70, url: '❪𝟯❫', data: { y: 3 } });
let p4 = _({ ms: 30, url: '❪𝟰❫', data: { z: 4 } });

aQueue = new AsyncQueue();
start = performance.now();

aQueue.enqueue(p1).then(({ url, data }) => console.log('%s DONE %fms', url, performance.now() - start)); //          = 50
aQueue.enqueue(p2).then(({ url, data }) => console.log('%s DONE %fms', url, performance.now() - start)); // 50 + 20  = 70
aQueue.enqueue(p3).then(({ url, data }) => console.log('%s DONE %fms', url, performance.now() - start)); // 70 + 70  = 140
aQueue.enqueue(p4).then(({ url, data }) => console.log('%s DONE %fms', url, performance.now() - start)); // 140 + 30 = 170

*/

/* Test object creation
  queueObj = AsyncQueue.createQueueObject({
    action: async function() { console.log(this.token.name); },
    token: _token
  })
  aQueue.enqueue(queueObj)


*/