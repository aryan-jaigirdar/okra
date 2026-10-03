const examples = {
  closures: `// A closure remembers the scope where it was born.
fun makeCounter(step) {
  let count = 0;
  return fun() {
    count = count + step;
    return count;
  };
}

let tick = makeCounter(2);
print("a little persistent state:");
print(tick(), tick(), tick());

let other = makeCounter(10);
print("a separate little world:");
print(other(), tick(), other());`,
  collections: `// Functions are values. Pass them around.
let temperatures = [0, 15, 22, 30, -4];

let warm = filter(temperatures, fun(n) {
  return n > 20;
});

let fahrenheit = map(warm, fun(n) {
  return n * 9 / 5 + 32;
});

let total = reduce(temperatures, fun(sum, n) {
  return sum + n;
}, 0);

print("warm days:", warm);
print("in fahrenheit:", fahrenheit);
print("average celsius:", total / len(temperatures));`,
  fibonacci: `// Remember answers so recursion stays cheap.
let cache = {};
fun fib(n) {
  if (n < 2) { return n; }
  let key = str(n);
  if (cache[key] != nil) { return cache[key]; }
  let answer = fib(n - 1) + fib(n - 2);
  cache[key] = answer;
  return answer;
}

print("fib(35) =", fib(35));
print("cached answers:", len(cache));`,
  errors: `// Bounds are checked. Errors point at the source.
let names = ["Ada", "Grace", "Alan"];
print("first:", names[0]);

// Change 3 to 2, then run again.
print("last:", names[3]);`,
  loop: `// This program never finishes.
// Use Stop, or let the 2-second limit stop it.
while (true) {
  let busy = 1 + 1;
}`,
};

const editor = document.querySelector("#source");
const picker = document.querySelector("#examples");
const output = document.querySelector("#output");
const status = document.querySelector("#status");
const timing = document.querySelector("#timing");
const runButton = document.querySelector("#run");
const stopButton = document.querySelector("#stop");
let mode = "run";
let worker = null;
let timeout = null;

function updateLines() {
  const count = editor.value.split("\n").length;
  document.querySelector("#line-numbers").textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
  document.querySelector("#line-count").textContent = `${count} lines`;
}

function finish() {
  clearTimeout(timeout);
  worker?.terminate();
  worker = null;
  runButton.disabled = false;
  stopButton.disabled = true;
  document.querySelector(".workspace").setAttribute("aria-busy", "false");
}

function stop(message = "Stopped. You can edit the program and run again.") {
  if (!worker) return;
  finish();
  status.textContent = "Stopped";
  output.textContent = message;
  output.classList.add("error");
  timing.textContent = "WORKER TERMINATED";
}

function run() {
  finish();
  output.classList.remove("error");
  output.textContent = "Running…";
  status.textContent = "Running";
  timing.textContent = "";
  runButton.disabled = true;
  stopButton.disabled = false;
  document.querySelector(".workspace").setAttribute("aria-busy", "true");
  try {
    worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      output.textContent = data.output;
      output.classList.toggle("error", !data.ok);
      status.textContent = data.ok ? `${data.tokens} tokens · ${data.statements} statements` : "Needs a small fix";
      timing.textContent = `${data.elapsed.toFixed(1)} ms`;
      finish();
    };
    worker.onerror = () => {
      output.textContent = "Could not start the interpreter. Build the project, then serve the playground over HTTP.";
      output.classList.add("error");
      status.textContent = "Interpreter unavailable";
      finish();
    };
    worker.postMessage({ source: editor.value, mode });
    timeout = setTimeout(() => stop("Time limit reached (2 seconds). The worker was stopped.\nTry a smaller input or inspect the tokens and syntax tree."), 2_000);
  } catch (error) {
    output.textContent = error.message;
    status.textContent = "Could not start";
    finish();
  }
}

function loadExample() {
  stop();
  editor.value = examples[picker.value];
  updateLines();
  output.textContent = "Ready when you are.\n\nRun the example, or make it your own.";
  output.classList.remove("error");
  status.textContent = "Ready";
  timing.textContent = "RUNS IN YOUR BROWSER";
}

picker.addEventListener("change", loadExample);
editor.addEventListener("input", updateLines);
editor.addEventListener("scroll", () => { document.querySelector("#line-numbers").scrollTop = editor.scrollTop; });
editor.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); run(); }
});
document.querySelector("#reset").addEventListener("click", loadExample);
runButton.addEventListener("click", run);
stopButton.addEventListener("click", () => stop());
document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    document.querySelectorAll(".mode").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-pressed", String(selected));
    });
    run();
  });
});
loadExample();
