// Jest manual mock — the real module registers a native Nitro Turbo module at import time,
// which isn't available outside a built app and throws in the Jest environment.
module.exports = {
  Camera: () => null,
  useCameraDevice: () => undefined,
  useCameraPermission: () => ({ hasPermission: true, requestPermission: jest.fn() }),
};
