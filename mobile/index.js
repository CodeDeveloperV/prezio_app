/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// react-native-vision-camera's CameraX torch control cancels in-flight enableTorch()
// calls when the camera reconfigures (e.g. focus/blur transitions), which the native
// module never catches. Filter that known-benign rejection out of the dev-only
// unhandled promise rejection tracker instead of letting it spam the console.
if (__DEV__ && global.HermesInternal?.enablePromiseRejectionTracker) {
  const IGNORED_REJECTION_PATTERNS = [/CameraControl\$OperationCanceledException/];

  global.HermesInternal.enablePromiseRejectionTracker({
    allRejections: true,
    onHandled: (id) => {
      console.warn(`Promise rejection handled (id: ${id})`);
    },
    onUnhandled: (id, rejection) => {
      const message = rejection instanceof Error ? rejection.message : String(rejection);
      if (IGNORED_REJECTION_PATTERNS.some((pattern) => pattern.test(message))) {
        return;
      }
      console.error(`Uncaught (in promise, id: ${id}):`, rejection);
    },
  });
}

AppRegistry.registerComponent(appName, () => App);
