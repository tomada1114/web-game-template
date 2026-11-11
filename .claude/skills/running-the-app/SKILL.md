---
name: running-the-app
description: >
  Use when asked to run the game or the page, try a change against a live server, check
  what the built site serves, or put observed output in a pull request, and no test
  shows the behavior. Covers starting a Vite dev server, or a vite preview of the build,
  on a free port with --strictPort, capturing curl output of index.html and its ./
  assets as evidence, and stopping it before the turn ends, without touching the
  developer's own pnpm dev (port 5173).
---

# Running the App

**Owns:** how an agent observes the running game: which evidence first, how to start and
stop a server of its own, and what the evidence looks like in a pull request. **Does not
own:** writing the test that would show the same thing (`tdd`); the pull request's
mechanics (`create-pr`).

## Evidence, cheapest first

Stop at the first tier that shows what the change does.

1. **A test.** It exercises the same code as a live page and its result outlives the
   turn. If a lasting assertion would show the behavior, write one.
2. **`pnpm test:e2e`,** for what only a browser shows on the built page. It builds,
   serves on `E2E_PORT` (default 4173) with `strictPort`, and fails when the port is
   taken. Set a distinct `E2E_PORT` per worktree, and never stop what holds the port.
   The evidence is the test's own output.
3. **A server of your own, then `curl`,** for what only a listening process shows.
   - Vite's dev server serves the page from source: that the entry resolves and
     transforms, and what the page's markup is.
   - `vite preview` serves the build in `apps/web/dist`, which is what a portal
     receives: that `index.html` names its files by `./` URLs and each one is served.

`curl` fetches bytes; it runs no script. What the page renders after its module loads
needs a browser. When no browser observed it, say so instead of inferring it from the
response.

## The developer's server is not yours

- The developer's `pnpm dev` (Vite's default port, 5173) is theirs: never start, stop,
  or restart it, and never send it a request.
- **Always pass `--port` and `--strictPort`.** Without `--strictPort`, Vite moves to the
  next free port when the one it was given is taken, and your requests then go to a
  server that is not yours. With it, a taken port fails the start.
- **Let the OS pick the port** (bind to port 0), then check that nothing accepts
  connections on it. If something does, or the check itself fails, abort: start nothing
  and send nothing. A sibling worktree's server may hold any port.
- **Send requests only to a server you just started** from this checkout, in this
  command, after its log shows its URL on that port. Never reuse a server that is
  already answering, even one that looks like this game.
- **Stop only the process you launched**, by the pid `$!` gave you, before the turn
  ends, including when a step failed. Never by name (`pkill -f vite`), and never
  "whatever listens on the port": if a listener remains after your own process has
  stopped, report it and stop; do not kill it.
- **Loopback only.** Pass `--host 127.0.0.1`; never `--host 0.0.0.0` or a bare `--host`.
- **Keep logs outside the checkout** (`mktemp`), so the tree the gate judges holds only
  the change.

## Running a server of your own

Run the server's whole life as one foreground shell command: pick a port, check it,
start, wait, request, stop, check again. The `trap` stops the server even when the
command is interrupted part way; do not use `set -e`, so a failed `curl` still reaches
the stop. The script runs under bash and zsh (zsh reserves `status` and `path`, hence
`rc` and `rel`).

```bash
probe='const socket = require("node:net").connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
socket.setTimeout(1000);
socket.on("connect", () => process.exit(0));
socket.on("timeout", () => process.exit(2));
socket.on("error", (error) => process.exit(error.code === "ECONNREFUSED" ? 1 : 2));'
ready='const fs = require("node:fs");
const [log, port, pid] = process.argv.slice(1);
const alive = () => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
let tries = 0;
setInterval(() => {
  const text = fs.readFileSync(log, "utf8");
  if (text.includes(`http://127.0.0.1:${port}/`)) process.exit(0);
  if (!alive() || ++tries > 300) process.exit(1);
}, 100);'
mode=  # empty for the dev server; "preview" for the build
port=$(node -e 'const server = require("node:net").createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });')
log=$(mktemp)
node -e "$probe" "$port"; rc=$?
if [ "$rc" = 1 ]; then
  (cd apps/web && exec node node_modules/vite/bin/vite.js $mode --host 127.0.0.1 --port "$port" --strictPort) >"$log" 2>&1 &
  pid=$!
  trap 'kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null' EXIT
  if node -e "$ready" "$log" "$port" "$pid" && kill -0 "$pid" 2>/dev/null; then
    page=$(curl -sS "http://127.0.0.1:$port/index.html")
    printf '%s\n' "$page"
    for asset in $(printf '%s\n' "$page" | grep -oE '(src|href)="[^"]+"' | cut -d'"' -f2); do
      rel=${asset#./}
      curl -sS -o /dev/null -w "%{http_code} %{content_type} $asset\n" "http://127.0.0.1:$port/${rel#/}"
    done
  else
    echo "the server did not start; nothing was sent"
  fi
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; trap - EXIT
  node -e "$probe" "$port"; rc=$?
  case "$rc" in
    1) echo "nothing listening on $port" ;;
    0) echo "something still listens on $port: report it, do not kill it" ;;
    *) echo "could not check port $port (status $rc)" ;;
  esac
  grep -E "Local:|error" "$log"
else
  echo "port $port is taken or could not be checked (status $rc): nothing started"
fi
```

- **The build instead of the source.** Run `pnpm build` first, then set `mode=preview`.
  Everything else in the script stays.
- **The port check** is a Node probe, which the repository needs anyway, rather than
  `lsof` or `ss`, which a host may lack. Exit 1 means nothing accepts connections; 0
  means something does; anything else means the check failed, and only exit 1 counts as
  proof.
- **Waiting** reads the server's own log for the URL Vite prints once it listens, so no
  request goes out before your server holds the port. It gives up after 30 seconds, or
  as soon as the server process has exited (a taken port, a broken config), so a
  harmless log line that mentions an error does not abort a healthy start.
- **Stopping.** Vite's own binary is started with `node`, and the subshell `exec`s it,
  so `$!` is Vite itself. Started through `pnpm exec`, `$!` would be the pnpm wrapper,
  and a Vite it failed to pass the signal to would keep the port.
- **A host that runs long commands in the background** follows the same steps; the stop
  and the final check still happen before the turn ends.

What the build printed here, under bash and zsh (the port and the file's hash vary):

```console
    <script type="module" crossorigin src="./assets/index-CcxqugBG.js"></script>
200 text/javascript ./assets/index-CcxqugBG.js
nothing listening on 56939
  ➜  Local:   http://127.0.0.1:56939/
```

The dev server rewrites the same page to load `/@vite/client` and `/src/main.ts` from
the server root, so the relative URLs a portal depends on are visible only in the build.

## The evidence a pull request carries

Under the pull request's Test Plan, for each behavior observed rather than asserted:

- the exact command or request, as run;
- the lines of output that show the behavior (the status, the content type, the markup),
  not the whole log;
- where it ran: your own dev server, or your own preview of the build, from this
  checkout.

Redact before pasting: a home directory becomes `~/…`, a temporary path a placeholder.

## Before the turn ends

- [ ] The final port check printed "nothing listening" for every port you used, or you
      reported the listener that remained, untouched.
- [ ] The developer's server, if one was running, was never touched, and nothing was
      sent to port 5173.
- [ ] `git status --porcelain` shows only the change: logs live outside the checkout.
