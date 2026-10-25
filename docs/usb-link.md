# USB link: the town page as the board's network

The board has no Wi-Fi in some places; the computer next to it does. The town page (desktop Chrome/Edge, Web Serial) opens the board's USB serial port and forwards the board's signed trip requests to the trip API. The board keeps its identity and signs every request itself (the secret never leaves it); the page only moves bytes. Starting and recalling a trip stay on the board's own screen.

This document is the same in both repositories (`pixel-pet/docs/usb-link.md`, `pixel-pet-city/docs/usb-link.md`). Codecs: `common/usblink.c` (C, host-tested in `tests/test_usblink.c`) and `src/usblink.js` (JS, `tests/usblink.test.js`). Both tests decode and re-encode the vectors below, so the two sides are proven compatible.

## Frames

The port also carries the board's console logs. A frame is one text line that starts with `@pp1 `; every other line is a log (or a console command) and is ignored. A frame is whole on one line, written in one piece, so it never interleaves with a log line.

```
@pp1 <type> <field> ... <crc>\n
```

- Fields are separated by one space and contain no spaces. `-` stands for an empty field.
- `crc` is 8 lower-case hex digits: CRC-32 (zlib/PNG: poly 0xEDB88320, init and final xor 0xFFFFFFFF) of the line from `@` to the last character before the space that precedes the crc.
- A trailing `\r` is ignored. A frame with a bad crc, a bad field, a wrong field count or a line over 11520 characters is dropped (never half-applied).
- Bodies are base64 (standard alphabet, padding) of at most 8448 raw bytes (`WEB_REQ_MAX` / `WEB_RESP_MAX` of `common/webtrip.h`).

| type | direction | fields | meaning |
|------|-----------|--------|---------|
| `H` | page -> board | `<unix>` | hello: the page's Unix time in seconds. Sent on connect and every 2 s until the board answers `B`. |
| `B` | board -> page | `<device> <fw> <state>` | the board's answer: device id (32 hex digits), firmware version, trip state (`home`, `packing`, `waiting_pair`, `away`). Sent for every `H`, and for the first `K` after a boot. |
| `K` | page -> board | `<unix>` | keepalive, every 2 s once the board answered. The board treats the page as present for 5 s after the last `H` or `K`. |
| `Q` | board -> page | `<id> <action> <device> <ts> <sig> <body>` | one trip request. `id`: decimal, chosen by the board. `action`: the API function (`trip-start`, ...). `device`, `ts`, `sig` are the headers `x-device-id`, `x-timestamp`, `x-signature` (`-` for `device-register`, which is unsigned). `body`: base64 of the JSON body. |
| `R` | page -> board | `<id> <status> <body>` | the answer to request `id`: the HTTP status, or `0` when there was none (network failure); `body` is base64 of the answer (`-` when empty). |

The page sends `POST <trip API base>/<action>` with exactly the headers the board gave plus `content-type: application/json`, and returns the status and body untouched. The board uses the cable instead of Wi-Fi while the page is present; one request is in flight at a time. A request with no `R` while the page is gone for more than 5 s fails like "no network".

The board uses the page's time (the last `H`/`K`, plus the time since) when its own clock is not set.

## Opening the port without resetting the board

The ESP32-S3's USB-Serial-JTAG treats the serial control lines like a download-mode circuit: RTS toggled while DTR is set resets the chip, and certain DTR/RTS sequences enter the ROM bootloader. The page therefore calls `port.setSignals({ dataTerminalReady: false, requestToSend: false })` right after `open()`. Whether this is enough on real hardware is checked on the board (see the task document).

## Test vectors

The device id is `000102030405060708090a0b0c0d0e0f`; the signature is the one of the trip API document (secret = bytes 0..31, `trip-recall`, ts 1800000000, body `{"trip_id":1}`).

```
@pp1 H 1793462400 87fa9d32
@pp1 K 1793462402 1e6a2eee
@pp1 B 000102030405060708090a0b0c0d0e0f 0.5.1 away 125828da
@pp1 Q 7 trip-recall 000102030405060708090a0b0c0d0e0f 1800000000 c51de50e0560e0a0b35f34e12a2e7dc45701f40842346aa1144c3e7799506060 eyJ0cmlwX2lkIjoxfQ== e6304339
@pp1 Q 8 device-register - - - eyJkZXZpY2VfaWQiOiJ4In0= a7c27c27
@pp1 R 7 200 eyJyZWNhbGxlZCI6dHJ1ZX0= c0ed9351
@pp1 R 9 0 - c8340515
```
