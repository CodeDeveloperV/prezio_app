// Jest manual mock — react-native-config's real module reads NativeModules
// at import time, which doesn't exist in the Jest environment.
module.exports = {};
