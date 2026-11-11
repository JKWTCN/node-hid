// Usage: node src/test-input-report.js [device-path report-id report-length]
// Hardware checks require firmware supporting GET_REPORT for the selected INPUT report.
const assert = require('assert');
const path = require('path');
const HID = require('..');

const options = Object.assign({}, require('../binding-options'));
if (process.platform === 'linux') {
    options.name = 'HID_hidraw';
}
const binding = require('pkg-prebuilds/bindings')(path.join(__dirname, '..'), options);
for (const ctor of [binding.HID, binding.HIDAsync]) {
    const method = Object.getOwnPropertyDescriptor(ctor.prototype, 'getInputReport');
    assert(method && method.enumerable, 'getInputReport must be exposed to the JS wrapper');
}

const invalidArgs = [
    [], [1], [1, 64, 0], ['1', 64], [1, '64'], [null, 64], [1, null],
    [-1, 64], [256, 64], [1.5, 64], [NaN, 64], [Infinity, 64], [-Infinity, 64],
    [0x100000001, 64], [1, -1], [1, 0], [1, 1.5], [1, NaN],
    [1, Infinity], [1, 65536], [1, 0x100000001], [1, Number.MAX_SAFE_INTEGER]
];

async function main() {
    if (process.argv.length === 2) {
        console.log('test-input-report: Bindings OK; hardware checks skipped (no device path supplied)');
        return;
    }
    assert.strictEqual(process.argv.length, 5, 'Expected device path, Report ID and report length');
    const devicePath = process.argv[2];
    const reportId = Number(process.argv[3]);
    const reportLength = Number(process.argv[4]);

    const device = new HID.HID(devicePath);
    try {
        for (const args of invalidArgs) {
            assert.throws(() => device.getInputReport(...args), TypeError);
        }
        const data = device.getInputReport(reportId, reportLength);
        assert(Array.isArray(data));
        assert(data.length > 0 && data.length <= reportLength);
        assert.strictEqual(data[0], reportId);
        console.log('Sync INPUT report:', data);
    } finally {
        device.close();
    }
    assert.throws(() => device.getInputReport(reportId, reportLength), /closed device/);

    const asyncDevice = await HID.HIDAsync.open(devicePath);
    let closePromise;
    try {
        for (const args of invalidArgs) {
            await assert.rejects(asyncDevice.getInputReport(...args), TypeError);
        }
        const reports = [
            asyncDevice.getInputReport(reportId, reportLength),
            asyncDevice.getInputReport(reportId, reportLength)
        ];
        closePromise = asyncDevice.close();
        const rejectedAfterClose = assert.rejects(asyncDevice.getInputReport(reportId, reportLength), /closed/);
        const results = await Promise.all(reports.concat(closePromise, rejectedAfterClose));
        for (const data of results.slice(0, 2)) {
            assert(Buffer.isBuffer(data));
            assert(data.length > 0 && data.length <= reportLength);
            assert.strictEqual(data[0], reportId);
            console.log('Async INPUT report:', data);
        }
    } finally {
        await (closePromise || asyncDevice.close());
    }
    console.log('test-input-report: Device checks OK');
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
