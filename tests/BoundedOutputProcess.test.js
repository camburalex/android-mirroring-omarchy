const assert = require("assert");
const cp = require("child_process");
const BoundedOutput = require("../qml/BoundedOutput.js");

const TEST_CAP = 512;

function run() {
    // Synthetic process that deliberately emits more output than the cap.
    // This is a harmless Python one-liner that prints many 'x' blocks and then
    // waits so the parent has a chance to stop it before it exits on its own.
    const child = cp.spawn("python3", [
        "-c",
        "import sys; " +
        "[sys.stdout.write('x' * 64) for _ in range(0, 64)]; " +
        "sys.stdout.flush(); " +
        "sys.stdin.read()"
    ]);

    const capture = BoundedOutput.create(TEST_CAP);
    let sawData = false;

    child.stdout.on("data", (chunk) => {
        sawData = true;
        const text = chunk.toString();
        if (!BoundedOutput.append(capture, text)) {
            if (BoundedOutput.isOverflow(capture)) {
                child.kill("SIGTERM");
            }
        }
    });

    // stderr is ignored for this fixture, but we still drain it so the pipe
    // cannot block. This mirrors the real QML pattern of attaching a parser.
    child.stderr.on("data", () => {});

    child.on("exit", (code, signal) => {
        assert.strictEqual(sawData, true, "child produced output");
        assert.strictEqual(BoundedOutput.isOverflow(capture), true, "overflow detected");
        assert.strictEqual(BoundedOutput.value(capture).length, TEST_CAP,
            "retained output is exactly the cap, never larger");
        assert.ok(BoundedOutput.codeUnitsSeen(capture) > TEST_CAP,
            "child emitted more code units than the cap");

        // The process must have been stopped by the overflow path (SIGTERM) or
        // terminated for some other reason, not be left running. We do not
        // require a specific exit code because the signal and timing vary.
        assert.ok(code !== undefined || signal !== undefined,
            "child process is no longer running");

        console.log("BoundedOutput process fixture passed.");
    });

    child.on("error", (err) => {
        throw new Error("Failed to spawn synthetic process: " + err.message);
    });
}

run();
